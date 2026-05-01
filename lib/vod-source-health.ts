import { getDatabase } from "@/lib/db";
import { COLLECTIONS } from "@/lib/constants/db";
import type { VodSource } from "@/types/drama";
import type {
  SourceProbeResult,
  SourcePlaybackMetricEvent,
  VodSourceHealthSnapshot,
} from "@/types/vod-source-health";

interface VodSourceHealthDoc {
  _id?: string;
  key: string;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  sample_count: number;
  total_latency_ms: number;
  average_latency_ms: number;
  last_latency_ms: number;
  last_status_code?: number;
  last_error?: string;
  last_status: "healthy" | "unhealthy";
  first_frame_total_ms?: number;
  first_frame_samples?: number;
  playback_success_count?: number;
  stall_count?: number;
  auto_switch_count?: number;
  retry_count?: number;
  last_checked_at: string;
  updated_at: string;
}

interface SourceMetricEventDoc {
  _id?: string;
  key: string;
  event_type: SourcePlaybackMetricEvent["eventType"];
  value_ms?: number;
  created_at: string;
}

const MAX_CONSECUTIVE_FAILURES = 8;
const HEALTH_RANK_PENALTY_THRESHOLD = 3;

function docToSnapshot(doc: VodSourceHealthDoc): VodSourceHealthSnapshot {
  return {
    key: doc.key,
    successCount: doc.success_count,
    failureCount: doc.failure_count,
    consecutiveFailures: doc.consecutive_failures,
    averageLatencyMs: doc.average_latency_ms,
    lastLatencyMs: doc.last_latency_ms,
    lastStatusCode: doc.last_status_code,
    lastError: doc.last_error,
    lastStatus: doc.last_status,
    lastCheckedAt: doc.last_checked_at,
    updatedAt: doc.updated_at,
  };
}

function clampConsecutiveFailures(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.min(value, MAX_CONSECUTIVE_FAILURES);
}

function calculateHealthScore(snapshot: VodSourceHealthSnapshot): number {
  const total = snapshot.successCount + snapshot.failureCount;
  const successRate = total > 0 ? snapshot.successCount / total : 0.5;
  const latencyBase =
    snapshot.averageLatencyMs > 0 ? snapshot.averageLatencyMs : snapshot.lastLatencyMs;
  const latencyPenalty = Math.min((latencyBase || 2000) / 6000, 1);
  const failPenalty = Math.min(snapshot.consecutiveFailures * 0.12, 0.7);
  const statusBonus = snapshot.lastStatus === "healthy" ? 0.06 : -0.06;
  const sampleBonus = total >= 5 ? 0.04 : 0;

  return (
    successRate * 0.65 +
    (1 - latencyPenalty) * 0.25 +
    (1 - failPenalty) * 0.1 +
    statusBonus +
    sampleBonus
  );
}

export async function recordSourceProbeResults(
  results: SourceProbeResult[]
): Promise<void> {
  if (!results.length) return;

  const now = new Date().toISOString();
  const db = await getDatabase();
  const collection = db.collection<VodSourceHealthDoc>(COLLECTIONS.VOD_SOURCE_HEALTH);

  await Promise.all(
    results.map(async (result) => {
      const existing = await collection.findOne({ key: result.key });
      const nextSuccessCount = (existing?.success_count || 0) + (result.ok ? 1 : 0);
      const nextFailureCount = (existing?.failure_count || 0) + (result.ok ? 0 : 1);
      const nextSampleCount = (existing?.sample_count || 0) + 1;
      const nextTotalLatency =
        (existing?.total_latency_ms || 0) + Math.max(0, result.latencyMs || 0);
      const nextConsecutiveFailures = result.ok
        ? 0
        : clampConsecutiveFailures((existing?.consecutive_failures || 0) + 1);

      await collection.updateOne(
        { key: result.key },
        {
          $set: {
            key: result.key,
            success_count: nextSuccessCount,
            failure_count: nextFailureCount,
            consecutive_failures: nextConsecutiveFailures,
            sample_count: nextSampleCount,
            total_latency_ms: nextTotalLatency,
            average_latency_ms:
              nextSampleCount > 0 ? Math.round(nextTotalLatency / nextSampleCount) : 0,
            last_latency_ms: Math.max(0, result.latencyMs || 0),
            last_status_code: result.statusCode,
            last_error: result.error,
            last_status: result.ok ? "healthy" : "unhealthy",
            last_checked_at: now,
            updated_at: now,
          },
        },
        { upsert: true }
      );
    })
  );
}

export async function getSourceHealthMap(
  sourceKeys: string[]
): Promise<Map<string, VodSourceHealthSnapshot>> {
  if (!sourceKeys.length) return new Map();

  const db = await getDatabase();
  const collection = db.collection<VodSourceHealthDoc>(COLLECTIONS.VOD_SOURCE_HEALTH);
  const docs = await collection.find({ key: { $in: sourceKeys } }).toArray();
  return new Map(docs.map((doc) => [doc.key, docToSnapshot(doc)]));
}

export async function sortVodSourcesByHealth(
  sources: VodSource[]
): Promise<VodSource[]> {
  if (sources.length <= 1) return sources;

  try {
    const healthMap = await getSourceHealthMap(sources.map((source) => source.key));

    return [...sources].sort((a, b) => {
      const healthA = healthMap.get(a.key);
      const healthB = healthMap.get(b.key);

      const dangerA =
        (healthA?.consecutiveFailures || 0) >= HEALTH_RANK_PENALTY_THRESHOLD;
      const dangerB =
        (healthB?.consecutiveFailures || 0) >= HEALTH_RANK_PENALTY_THRESHOLD;

      if (dangerA !== dangerB) {
        return dangerA ? 1 : -1;
      }

      const scoreA = healthA ? calculateHealthScore(healthA) : 0.5;
      const scoreB = healthB ? calculateHealthScore(healthB) : 0.5;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      const priorityA = a.priority ?? 999;
      const priorityB = b.priority ?? 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return a.key.localeCompare(b.key);
    });
  } catch (error) {
    console.warn("按健康度排序视频源失败，回退原始顺序:", error);
    return sources;
  }
}

export async function getLatestSourceHealthSnapshots(
  keys?: string[]
): Promise<VodSourceHealthSnapshot[]> {
  const db = await getDatabase();
  const collection = db.collection<VodSourceHealthDoc>(COLLECTIONS.VOD_SOURCE_HEALTH);
  const docs = await collection
    .find(keys?.length ? { key: { $in: keys } } : {})
    .sort({ updated_at: -1 })
    .toArray();
  return docs.map(docToSnapshot);
}

export async function recordSourcePlaybackMetric(
  events: SourcePlaybackMetricEvent[]
): Promise<void> {
  if (!events.length) return;
  const now = new Date().toISOString();
  const db = await getDatabase();
  const collection = db.collection<VodSourceHealthDoc>(COLLECTIONS.VOD_SOURCE_HEALTH);
  const eventsCollection = db.collection<SourceMetricEventDoc>(
    COLLECTIONS.VOD_SOURCE_METRIC_EVENTS
  );

  await Promise.all(
    events.map(async (event) => {
      const inc: Record<string, number> = {};
      if (event.eventType === "first_frame") {
        inc.first_frame_samples = 1;
        inc.first_frame_total_ms = Math.max(0, Math.round(event.valueMs || 0));
      } else if (event.eventType === "playback_success") {
        inc.playback_success_count = 1;
      } else if (event.eventType === "stall") {
        inc.stall_count = 1;
      } else if (event.eventType === "auto_switch") {
        inc.auto_switch_count = 1;
      } else if (event.eventType === "retry") {
        inc.retry_count = 1;
      }

      await collection.updateOne(
        { key: event.key },
        {
          $setOnInsert: {
            key: event.key,
            success_count: 0,
            failure_count: 0,
            consecutive_failures: 0,
            sample_count: 0,
            total_latency_ms: 0,
            average_latency_ms: 0,
            last_latency_ms: 0,
            last_status: "healthy",
            last_checked_at: now,
          },
          $set: { updated_at: now },
          $inc: inc,
        },
        { upsert: true }
      );

      await eventsCollection.insertOne({
        key: event.key,
        event_type: event.eventType,
        value_ms: Number.isFinite(event.valueMs) ? Number(event.valueMs) : undefined,
        created_at: now,
      });
    })
  );
}

export interface SourceQualityRow {
  key: string;
  successRate: number;
  avgLatencyMs: number;
  avgFirstFrameMs: number;
  playbackSuccessCount: number;
  stallCount: number;
  autoSwitchCount: number;
  retryCount: number;
  updatedAt?: string;
}

export interface SourceQualityTrendPoint {
  date: string;
  firstFrameCount: number;
  playbackSuccessCount: number;
  stallCount: number;
  autoSwitchCount: number;
  retryCount: number;
}

export async function getSourceQualityRows(
  keys?: string[]
): Promise<SourceQualityRow[]> {
  const db = await getDatabase();
  const collection = db.collection<VodSourceHealthDoc>(COLLECTIONS.VOD_SOURCE_HEALTH);
  const docs = await collection
    .find(keys?.length ? { key: { $in: keys } } : {})
    .sort({ updated_at: -1 })
    .toArray();

  return docs.map((doc) => {
    const total = (doc.success_count || 0) + (doc.failure_count || 0);
    const firstFrameSamples = doc.first_frame_samples || 0;
    const firstFrameTotalMs = doc.first_frame_total_ms || 0;
    return {
      key: doc.key,
      successRate: total > 0 ? doc.success_count / total : 0,
      avgLatencyMs: doc.average_latency_ms || 0,
      avgFirstFrameMs:
        firstFrameSamples > 0 ? Math.round(firstFrameTotalMs / firstFrameSamples) : 0,
      playbackSuccessCount: doc.playback_success_count || 0,
      stallCount: doc.stall_count || 0,
      autoSwitchCount: doc.auto_switch_count || 0,
      retryCount: doc.retry_count || 0,
      updatedAt: doc.updated_at,
    };
  });
}

export async function getSourceQualityTrends(
  days: number
): Promise<SourceQualityTrendPoint[]> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const db = await getDatabase();
  const collection = db.collection<SourceMetricEventDoc>(
    COLLECTIONS.VOD_SOURCE_METRIC_EVENTS
  );
  const start = new Date(Date.now() - safeDays * 24 * 3600 * 1000).toISOString();
  const docs = await collection.find({ created_at: { $gte: start } }).toArray();

  const map = new Map<string, SourceQualityTrendPoint>();
  for (const doc of docs) {
    const date = doc.created_at.slice(0, 10);
    const point =
      map.get(date) ||
      {
        date,
        firstFrameCount: 0,
        playbackSuccessCount: 0,
        stallCount: 0,
        autoSwitchCount: 0,
        retryCount: 0,
      };
    if (doc.event_type === "first_frame") point.firstFrameCount += 1;
    if (doc.event_type === "playback_success") point.playbackSuccessCount += 1;
    if (doc.event_type === "stall") point.stallCount += 1;
    if (doc.event_type === "auto_switch") point.autoSwitchCount += 1;
    if (doc.event_type === "retry") point.retryCount += 1;
    map.set(date, point);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function resetSourceQualityMetrics(keys?: string[]): Promise<void> {
  const db = await getDatabase();
  const healthCollection = db.collection<VodSourceHealthDoc>(COLLECTIONS.VOD_SOURCE_HEALTH);
  const eventsCollection = db.collection<SourceMetricEventDoc>(
    COLLECTIONS.VOD_SOURCE_METRIC_EVENTS
  );
  const filter = keys?.length ? { key: { $in: keys } } : {};

  await Promise.all([
    healthCollection.updateMany(filter, {
      $set: {
        first_frame_total_ms: 0,
        first_frame_samples: 0,
        playback_success_count: 0,
        stall_count: 0,
        auto_switch_count: 0,
        retry_count: 0,
        updated_at: new Date().toISOString(),
      },
    }),
    eventsCollection.deleteMany(filter),
  ]);
}
