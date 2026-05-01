"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DramaDetail, VodSource } from "@/types/drama";
import { UnifiedPlayer } from "@/components/player/UnifiedPlayer";
import { SourceSelector } from "@/components/player/SourceSelector";
import { PlayerSettingsPanel } from "@/components/player/PlayerSettingsPanel";
import { DanmakuSelector } from "@/components/player/DanmakuSelector";
import type { DanmakuItem } from "@/lib/player/danmaku-service";
import type { PlayerConfig } from "@/app/api/player-config/route";
import { ArrowLeft, X, ChevronLeft, Heart, ListChecks, Clock3 } from "lucide-react";

interface AvailableSource {
  source_key: string;
  source_name: string;
  vod_id: string | number;
  vod_name: string;
  match_confidence: "high" | "medium" | "low";
  priority?: number;
}

type LibraryType = "favorite" | "follow" | "watch_later";
type SwitchReason = "manual" | "stall";

interface SourceRuntimeMetric {
  successCount: number;
  failCount: number;
  stallCount: number;
  firstFrameTotalMs: number;
  firstFrameSamples: number;
  lastSuccessAt: number;
  lastFailAt: number;
}

interface SourceServerQuality {
  successRatePct: number;
  avgFirstFrameMs: number;
  stallCount: number;
  autoSwitchCount: number;
}

interface SourceLockPrefs {
  globalSourceKey: string;
  dramaLocks: Record<string, string>;
}

const SOURCE_METRICS_KEY = "source_runtime_metrics_v2";
const SOURCE_SWITCH_RESUME_KEY = "source_switch_resume_v2";
const SOURCE_AUTOSWITCH_CONTROL_KEY = "source_autoswitch_control_v1";
const SOURCE_LOCK_PREFS_KEY = "source_lock_prefs_v1";
const INTRO_OUTRO_POINTS_KEY = "intro_outro_points_v1";
const AUTO_SWITCH_COOLDOWN_MS = 3 * 60 * 1000;
const AUTO_SWITCH_MAX_COUNT = 3;

const createDefaultMetric = (): SourceRuntimeMetric => ({
  successCount: 0,
  failCount: 0,
  stallCount: 0,
  firstFrameTotalMs: 0,
  firstFrameSamples: 0,
  lastSuccessAt: 0,
  lastFailAt: 0,
});

const readSourceMetrics = (): Record<string, SourceRuntimeMetric> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SOURCE_METRICS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeSourceMetrics = (metrics: Record<string, SourceRuntimeMetric>) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOURCE_METRICS_KEY, JSON.stringify(metrics));
};

const readSourceLockPrefs = (): SourceLockPrefs => {
  if (typeof window === "undefined") return { globalSourceKey: "", dramaLocks: {} };
  try {
    const raw = localStorage.getItem(SOURCE_LOCK_PREFS_KEY);
    if (!raw) return { globalSourceKey: "", dramaLocks: {} };
    const parsed = JSON.parse(raw);
    return {
      globalSourceKey: String(parsed?.globalSourceKey || ""),
      dramaLocks: parsed?.dramaLocks && typeof parsed.dramaLocks === "object"
        ? parsed.dramaLocks
        : {},
    };
  } catch {
    return { globalSourceKey: "", dramaLocks: {} };
  }
};

const writeSourceLockPrefs = (prefs: SourceLockPrefs) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOURCE_LOCK_PREFS_KEY, JSON.stringify(prefs));
};

const reportSourceMetric = (
  key: string,
  eventType: "first_frame" | "playback_success" | "stall" | "auto_switch" | "retry",
  valueMs?: number
) => {
  if (!key) return;
  fetch("/api/player/source-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [{ key, eventType, valueMs }] }),
    keepalive: true,
  }).catch(() => {
    // ignore metric failures
  });
};

const computeSourceScore = (
  source: AvailableSource,
  metrics: Record<string, SourceRuntimeMetric>,
  serverQuality: Record<string, SourceServerQuality>
) => {
  const confidenceScore = { high: 100, medium: 70, low: 40 }[
    source.match_confidence
  ];
  const priorityScore = 30 - Math.min(source.priority ?? 99, 30);
  const runtime = metrics[source.source_key];
  const playableRate = runtime
    ? runtime.successCount / Math.max(runtime.successCount + runtime.failCount, 1)
    : 0.5;
  const playableScore = Math.round(playableRate * 50);
  const avgFirstFrameMs =
    runtime && runtime.firstFrameSamples > 0
      ? runtime.firstFrameTotalMs / runtime.firstFrameSamples
      : 1800;
  const firstFrameScore = Math.max(0, Math.round((3000 - avgFirstFrameMs) / 80));
  const stabilityPenalty = runtime ? runtime.stallCount * 8 : 0;
  const runtimeScore = playableScore + firstFrameScore - stabilityPenalty;
  const remote = serverQuality[source.source_key];
  const remoteScore = remote
    ? remote.successRatePct * 0.2 -
      Math.min(remote.avgFirstFrameMs / 120, 20) -
      remote.stallCount * 0.8 -
      remote.autoSwitchCount * 0.8
    : 0;
  const recencyBoost =
    runtime?.lastSuccessAt && Date.now() - runtime.lastSuccessAt < 24 * 3600 * 1000
      ? 5
      : 0;
  return confidenceScore + priorityScore + runtimeScore + recencyBoost + remoteScore;
};

interface LibraryStatus {
  favorite: boolean;
  follow: boolean;
  watch_later: boolean;
}

interface IntroOutroPoint {
  opEnd?: number;
  edStart?: number;
}

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dramaId = params.id as string;
  const currentSourceKey = searchParams.get("source");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dramaDetail, setDramaDetail] = useState<DramaDetail | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // 多源相关状态
  const [availableSources, setAvailableSources] = useState<AvailableSource[]>(
    []
  );

  // 视频源数据（从 API 获取）
  const [vodSources, setVodSources] = useState<VodSource[]>([]);
  const [selectedVodSource, setSelectedVodSource] = useState<VodSource | null>(
    null
  );
  const [currentVodSource, setCurrentVodSource] = useState<VodSource | null>(
    null
  );

  // 播放器配置和状态
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const [playerMode, setPlayerMode] = useState<"iframe" | "local">("iframe");
  const [currentIframePlayerIndex, setCurrentIframePlayerIndex] = useState(0);

  // 弹幕状态
  const [danmakuList, setDanmakuList] = useState<DanmakuItem[]>([]);
  const [danmakuCount, setDanmakuCount] = useState(0);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>({
    favorite: false,
    follow: false,
    watch_later: false,
  });
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [initialProgressTime, setInitialProgressTime] = useState(0);
  const [sourceLockPrefs, setSourceLockPrefs] = useState<SourceLockPrefs>({
    globalSourceKey: "",
    dramaLocks: {},
  });
  const [serverQualityMap, setServerQualityMap] = useState<
    Record<string, SourceServerQuality>
  >({});
  const progressInitRef = useRef(false);
  const lastProgressSyncAtRef = useRef(0);
  const actionMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentPlaybackTimeRef = useRef(0);
  const autoSwitchTriedSourcesRef = useRef<Set<string>>(new Set());
  const sourceStableMarkedRef = useRef<string>("");
  const stallRetryTriedRef = useRef<Set<string>>(new Set());
  const sourceBootAtRef = useRef<number>(Date.now());
  const firstFrameMarkedSourceRef = useRef<string>("");
  const rankedSourcesRef = useRef<AvailableSource[]>([]);
  const lastDetailFetchKeyRef = useRef<string>("");
  const detailFetchInFlightRef = useRef(false);
  const localRetryTokenRef = useRef(0);
  const [localRetryToken, setLocalRetryToken] = useState(0);
  const [queueEnabled, setQueueEnabled] = useState(true);
  const [queuedNextIndex, setQueuedNextIndex] = useState<number | null>(null);
  const [introOutroMap, setIntroOutroMap] = useState<Record<string, IntroOutroPoint>>({});

  const rankedSources = useMemo(() => {
    const metrics = readSourceMetrics();
    return [...availableSources].sort(
      (a, b) =>
        computeSourceScore(b, metrics, serverQualityMap) -
        computeSourceScore(a, metrics, serverQualityMap)
    );
  }, [availableSources, serverQualityMap]);

  useEffect(() => {
    rankedSourcesRef.current = rankedSources;
  }, [rankedSources]);

  useEffect(() => {
    setSourceLockPrefs(readSourceLockPrefs());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(INTRO_OUTRO_POINTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setIntroOutroMap(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    progressInitRef.current = false;
    lastProgressSyncAtRef.current = 0;
    setInitialProgressTime(0);
    currentPlaybackTimeRef.current = 0;
    autoSwitchTriedSourcesRef.current.clear();
    stallRetryTriedRef.current.clear();
    sourceStableMarkedRef.current = "";
    sourceBootAtRef.current = Date.now();
    firstFrameMarkedSourceRef.current = "";
  }, [dramaId, currentSourceKey]);

  useEffect(() => {
    sourceBootAtRef.current = Date.now();
    firstFrameMarkedSourceRef.current = "";
  }, [dramaId, currentSourceKey, currentEpisode]);

  const readAutoSwitchControl = () => {
    if (typeof window === "undefined") return { startedAt: Date.now(), count: 0 };
    try {
      const raw = sessionStorage.getItem(SOURCE_AUTOSWITCH_CONTROL_KEY);
      if (!raw) return { startedAt: Date.now(), count: 0 };
      const parsed = JSON.parse(raw);
      return {
        startedAt: Number(parsed.startedAt || Date.now()),
        count: Number(parsed.count || 0),
      };
    } catch {
      return { startedAt: Date.now(), count: 0 };
    }
  };

  const writeAutoSwitchControl = (startedAt: number, count: number) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      SOURCE_AUTOSWITCH_CONTROL_KEY,
      JSON.stringify({ startedAt, count })
    );
  };

  const dramaLockedSourceKey = sourceLockPrefs.dramaLocks[dramaId] || "";
  const globalLockedSourceKey = sourceLockPrefs.globalSourceKey || "";
  const effectiveLockedSourceKey = dramaLockedSourceKey || globalLockedSourceKey;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(SOURCE_SWITCH_RESUME_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        dramaId: string;
        sourceKey: string;
        episodeIndex: number;
        resumeTime: number;
        timestamp: number;
      };
      if (
        payload.dramaId === dramaId &&
        payload.sourceKey === (currentSourceKey || "") &&
        Date.now() - payload.timestamp < 5 * 60 * 1000
      ) {
        setCurrentEpisode(Math.max(0, Number(payload.episodeIndex || 0)));
        setInitialProgressTime(Math.max(0, Number(payload.resumeTime || 0)));
      }
    } catch {
      // ignore
    } finally {
      sessionStorage.removeItem(SOURCE_SWITCH_RESUME_KEY);
    }
  }, [dramaId, currentSourceKey]);

  useEffect(() => {
    return () => {
      if (actionMessageTimerRef.current) {
        clearTimeout(actionMessageTimerRef.current);
        actionMessageTimerRef.current = null;
      }
    };
  }, []);

  // 从 API 获取视频源配置
  useEffect(() => {
    const fetchVodSources = async () => {
      try {
        const response = await fetch("/api/vod-sources");
        if (response.ok) {
          const result = await response.json();
          if (result.code === 200 && result.data) {
            setVodSources(result.data.sources || []);
            setSelectedVodSource(result.data.selected || null);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[VOD Sources Fetch Failed]", error);
        }
      }
    };
    fetchVodSources();
  }, []);

  useEffect(() => {
    if (!availableSources.length) return;
    const keys = availableSources.map((source) => source.source_key);
    fetch("/api/source-quality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((result) => {
        if (result?.code !== 200 || !Array.isArray(result?.data)) return;
        const map: Record<string, SourceServerQuality> = {};
        for (const item of result.data) {
          if (!item?.key) continue;
          map[item.key] = {
            successRatePct: Number(item.successRatePct || 0),
            avgFirstFrameMs: Number(item.avgFirstFrameMs || 0),
            stallCount: Number(item.stallCount || 0),
            autoSwitchCount: Number(item.autoSwitchCount || 0),
          };
        }
        setServerQualityMap(map);
      })
      .catch(() => {
        // ignore server quality failures
      });
  }, [availableSources]);

  // 加载播放器配置
  useEffect(() => {
    const fetchPlayerConfig = async () => {
      try {
        const response = await fetch("/api/player-config");
        const result = await response.json();
        if (result.code === 200 && result.data) {
          setPlayerConfig(result.data);
          // 根据配置决定初始模式 - 与 UnifiedPlayer.tsx 的 selectBestPlayerMode 保持一致
          if (result.data.mode === "auto") {
            // 检查是否有可用的 iframe 播放器
            const hasEnabledIframePlayers = result.data.iframePlayers?.some(
              (p: { enabled: boolean }) => p.enabled
            );
            // 检查是否启用了代理（本地播放器必需）
            const proxyEnabled = result.data.enableProxy;
            // 检查浏览器是否支持 HLS（MediaSource API）
            const supportsHLS =
              typeof window !== "undefined" && "MediaSource" in window;

            // 决策逻辑（与 UnifiedPlayer.tsx 完全一致）：
            // - 如果启用代理且浏览器支持 HLS，优先使用本地播放器
            // - 如果没有启用代理或不支持 HLS，使用 iframe 播放器
            // - 如果 iframe 播放器也没有可用的，降级到本地播放器
            if (proxyEnabled && supportsHLS) {
              setPlayerMode("local");
            } else if (hasEnabledIframePlayers) {
              setPlayerMode("iframe");
            } else {
              setPlayerMode("local");
            }
          } else {
            setPlayerMode(result.data.mode);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[Player Config Fetch Failed]", error);
        }
      }
    };
    fetchPlayerConfig();
  }, []);

  // 加载多源数据
  useEffect(() => {
    try {
      const stored = localStorage.getItem("multi_source_matches");
      if (stored) {
        const data = JSON.parse(stored);
        if (Date.now() - data.timestamp < 30 * 60 * 1000) {
          setAvailableSources(data.matches || []);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Multi-source Data Load Failed]", err);
      }
    }
  }, []);

  // 获取影视详情
  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        let sourceKey = currentSourceKey || effectiveLockedSourceKey;
        if (!sourceKey && rankedSourcesRef.current.length > 0) {
          sourceKey = rankedSourcesRef.current[0].source_key;
        }

        if (!sourceKey && selectedVodSource) {
          sourceKey = selectedVodSource.key;
        }

        const source = sourceKey
          ? vodSources.find((s) => s.key === sourceKey)
          : selectedVodSource;

        if (!source) {
          setError("未配置视频源，请先在后台管理中配置视频源");
          setLoading(false);
          return;
        }

        const fetchKey = `${dramaId}:${source.key}`;
        if (detailFetchInFlightRef.current || fetchKey === lastDetailFetchKeyRef.current) {
          return;
        }
        detailFetchInFlightRef.current = true;
        lastDetailFetchKeyRef.current = fetchKey;

        // 保存当前使用的视频源
        setCurrentVodSource(source);

        // 获取详情 - 查找当前源对应的 vod_name（用于代理搜索）
        // 优先从 availableSources 查找，如果为空则直接从 localStorage 查找
        let vodName: string | undefined;

        // 方法1：从 availableSources 查找
        const matchedSource = availableSources.find(
          (s) => s.source_key === source.key
        );
        vodName = matchedSource?.vod_name;

        // 方法2：如果 availableSources 为空，直接从 localStorage 查找
        if (!vodName) {
          try {
            const stored = localStorage.getItem("multi_source_matches");
            if (stored) {
              const data = JSON.parse(stored);
              if (data.matches && Array.isArray(data.matches)) {
                // 用 vod_id 和 source_key 同时匹配
                const match = data.matches.find(
                  (m: AvailableSource) =>
                    String(m.vod_id) === dramaId && m.source_key === source.key
                );
                vodName = match?.vod_name;
              }
            }
          } catch (e) {
            console.warn("[vodName lookup from localStorage failed]", e);
          }
        }

        if (process.env.NODE_ENV === "development") {
          console.log("📌 Debug - vodName:", vodName);
        }

        const response = await fetch("/api/drama/detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: dramaId,
            source: source,
            vodName: vodName, // 传递 vodName 用于代理搜索
            _t: Date.now(),
          }),
        });

        const result = await response.json();

        if (result.code !== 200) {
          throw new Error(result.msg || "获取影视详情失败");
        }

        const data = result.data;
        if (data && data.episodes && data.episodes.length > 0) {
          setDramaDetail(data);
        } else {
          setError("该影视暂无播放源");
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.error("[Drama Detail Fetch Failed]", err);
        }
        setError("获取影视详情失败，请稍后重试");
      } finally {
        detailFetchInFlightRef.current = false;
        setLoading(false);
      }
    };

    if (dramaId && vodSources.length > 0) {
      fetchDetail();
    }
  }, [
    dramaId,
    currentSourceKey,
    effectiveLockedSourceKey,
    availableSources,
    vodSources,
    selectedVodSource,
  ]);

  // 加载用户收藏状态与云端进度
  useEffect(() => {
    if (!dramaDetail) return;

    const itemId = String(dramaDetail.id);
    const sourceKey = currentVodSource?.key || currentSourceKey || "";
    let mounted = true;

    const loadUserData = async () => {
      try {
        const [statusRes, progressRes] = await Promise.all([
          fetch(`/api/user/library/status?itemId=${encodeURIComponent(itemId)}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/user/progress?dramaId=${encodeURIComponent(itemId)}&sourceKey=${encodeURIComponent(sourceKey)}`,
            { cache: "no-store" }
          ),
        ]);

        if (!mounted) return;

        const [statusJson, progressJson] = await Promise.all([
          statusRes.json(),
          progressRes.json(),
        ]);

        if (statusRes.ok && statusJson?.code === 200 && statusJson?.data?.status) {
          setLibraryStatus({
            favorite: !!statusJson.data.status.favorite,
            follow: !!statusJson.data.status.follow,
            watch_later: !!statusJson.data.status.watch_later,
          });
        }

        const progressItem = progressJson?.data?.item;
        if (
          progressRes.ok &&
          progressJson?.code === 200 &&
          progressItem &&
          !progressInitRef.current
        ) {
          const episodeIndex = Number(progressItem.episodeIndex || 0);
          const safeEpisodeIndex =
            episodeIndex >= 0 && episodeIndex < dramaDetail.episodes.length
              ? episodeIndex
              : 0;
          const savedPosition = Number(progressItem.positionSeconds || 0);

          setCurrentEpisode(safeEpisodeIndex);
          setInitialProgressTime(savedPosition > 0 ? savedPosition : 0);
          progressInitRef.current = true;
        }
      } catch {
        // 用户数据加载失败不影响播放
      }
    };

    loadUserData();
    return () => {
      mounted = false;
    };
  }, [dramaDetail, currentVodSource?.key, currentSourceKey]);

  const showActionMessage = useCallback((message: string) => {
    if (actionMessageTimerRef.current) {
      clearTimeout(actionMessageTimerRef.current);
    }
    setActionMessage(message);
    actionMessageTimerRef.current = setTimeout(() => {
      setActionMessage("");
      actionMessageTimerRef.current = null;
    }, 1500);
  }, []);

  const toggleLibrary = useCallback(
    async (listType: LibraryType) => {
      if (!dramaDetail || libraryLoading) return;

      const itemId = String(dramaDetail.id);
      const enabled = libraryStatus[listType];
      setLibraryLoading(true);
      try {
        const response = await fetch("/api/user/library", {
          method: enabled ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            enabled
              ? { listType, itemId }
              : {
                  listType,
                  itemId,
                  title: dramaDetail.name,
                  cover: dramaDetail.pic || "",
                  mediaType: dramaDetail.type || "",
                  sourceKey: currentVodSource?.key || currentSourceKey || "",
                  sourceName: currentVodSource?.name || "",
                }
          ),
        });
        const result = await response.json();
        if (!response.ok || result.code !== 200) {
          throw new Error(result.message || "操作失败");
        }

        setLibraryStatus((prev) => ({ ...prev, [listType]: !enabled }));
        showActionMessage(enabled ? "已移出清单" : "已加入清单");
      } catch (error) {
        showActionMessage(error instanceof Error ? error.message : "操作失败");
      } finally {
        setLibraryLoading(false);
      }
    },
    [
      dramaDetail,
      libraryLoading,
      libraryStatus,
      currentVodSource?.key,
      currentVodSource?.name,
      currentSourceKey,
      showActionMessage,
    ]
  );

  const syncCloudProgress = useCallback(
    async (positionSeconds: number) => {
      if (!dramaDetail) return;

      const now = Date.now();
      if (now - lastProgressSyncAtRef.current < 10_000) return;
      lastProgressSyncAtRef.current = now;

      try {
        await fetch("/api/user/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dramaId: String(dramaDetail.id),
            dramaName: dramaDetail.name,
            cover: dramaDetail.pic || "",
            sourceKey: currentVodSource?.key || currentSourceKey || "",
            sourceName: currentVodSource?.name || "",
            episodeIndex: currentEpisode,
            episodeName: dramaDetail.episodes[currentEpisode]?.name || "",
            positionSeconds: Number.isFinite(positionSeconds) ? positionSeconds : 0,
          }),
        });
      } catch {
        // 云同步失败时静默降级
      }
    },
    [dramaDetail, currentVodSource?.key, currentVodSource?.name, currentSourceKey, currentEpisode]
  );

  useEffect(() => {
    if (!dramaDetail?.id) return;
    syncCloudProgress(0);
  }, [dramaDetail?.id, currentEpisode, currentVodSource?.key, syncCloudProgress]);

  // 切换视频源
  const switchSource = useCallback(
    (
      newSourceKey: string,
      newVodId: string | number,
      reason: SwitchReason = "manual",
      options?: { episodeIndex?: number; resumeTime?: number }
    ) => {
      if (typeof window !== "undefined") {
        const metrics = readSourceMetrics();
        const currentKey = currentVodSource?.key || currentSourceKey || "";
        if (currentKey) {
          const runtime = metrics[currentKey] || createDefaultMetric();
          if (reason === "stall") {
            runtime.stallCount += 1;
            runtime.failCount += 1;
            runtime.lastFailAt = Date.now();
          }
          metrics[currentKey] = runtime;
          writeSourceMetrics(metrics);
        }

        const switchResume = {
          dramaId: String(newVodId),
          sourceKey: newSourceKey,
          episodeIndex: options?.episodeIndex ?? currentEpisode,
          resumeTime: options?.resumeTime ?? currentPlaybackTimeRef.current,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(
          SOURCE_SWITCH_RESUME_KEY,
          JSON.stringify(switchResume)
        );
      }

      const url = `/play/${newVodId}?source=${newSourceKey}`;
      router.push(url);
    },
    [router, currentEpisode, currentVodSource?.key, currentSourceKey]
  );

  const handleAutoSwitchByStall = useCallback(
    (positionSeconds: number) => {
      if (!currentSourceKey || rankedSources.length <= 1) return;
      if (effectiveLockedSourceKey && currentSourceKey === effectiveLockedSourceKey) {
        showActionMessage("当前已锁定线路，自动切源已暂停");
        return;
      }

      const retryKey = `${currentSourceKey}:${currentEpisode}`;
      if (!stallRetryTriedRef.current.has(retryKey)) {
        stallRetryTriedRef.current.add(retryKey);
        setInitialProgressTime(positionSeconds);
        localRetryTokenRef.current += 1;
        setLocalRetryToken(localRetryTokenRef.current);
        reportSourceMetric(currentSourceKey, "retry");
        showActionMessage("检测到卡顿，正在重试当前线路...");
        return;
      }

      const control = readAutoSwitchControl();
      const now = Date.now();
      const inWindow = now - control.startedAt < AUTO_SWITCH_COOLDOWN_MS;
      const nextCount = inWindow ? control.count + 1 : 1;
      const startedAt = inWindow ? control.startedAt : now;
      if (nextCount > AUTO_SWITCH_MAX_COUNT) {
        showActionMessage("线路波动较大，请稍后手动切换播放源");
        return;
      }
      writeAutoSwitchControl(startedAt, nextCount);

      autoSwitchTriedSourcesRef.current.add(currentSourceKey);
      const next = rankedSources.find(
        (s) => !autoSwitchTriedSourcesRef.current.has(s.source_key)
      );
      if (!next) return;

      currentPlaybackTimeRef.current = Math.max(
        currentPlaybackTimeRef.current,
        positionSeconds
      );
      reportSourceMetric(currentSourceKey, "stall");
      reportSourceMetric(currentSourceKey, "auto_switch");
      showActionMessage("当前线路持续卡顿，已自动切换到备用线路");
      switchSource(next.source_key, next.vod_id, "stall");
    },
    [
      currentSourceKey,
      rankedSources,
      switchSource,
      currentEpisode,
      showActionMessage,
      effectiveLockedSourceKey,
    ]
  );

  const handleAutoSwitchByFailure = useCallback(() => {
    if (!currentSourceKey || rankedSources.length <= 1) return;
    if (effectiveLockedSourceKey && currentSourceKey === effectiveLockedSourceKey) {
      showActionMessage("当前已锁定线路，自动切源已暂停");
      return;
    }

    autoSwitchTriedSourcesRef.current.add(currentSourceKey);
    const next = rankedSources.find(
      (s) => !autoSwitchTriedSourcesRef.current.has(s.source_key)
    );
    if (!next) {
      showActionMessage("当前线路播放失败，暂无可切换备用线路");
      return;
    }

    const metrics = readSourceMetrics();
    const runtime = metrics[currentSourceKey] || createDefaultMetric();
    runtime.failCount += 1;
    runtime.lastFailAt = Date.now();
    metrics[currentSourceKey] = runtime;
    writeSourceMetrics(metrics);

    reportSourceMetric(currentSourceKey, "auto_switch");
    showActionMessage("当前线路播放失败，已自动切换到下一条线路");
    switchSource(next.source_key, next.vod_id, "stall");
  }, [
    currentSourceKey,
    rankedSources,
    effectiveLockedSourceKey,
    showActionMessage,
    switchSource,
  ]);

  const handleToggleDramaLock = useCallback(
    (sourceKey: string) => {
      setSourceLockPrefs((prev) => {
        const next: SourceLockPrefs = {
          globalSourceKey: prev.globalSourceKey,
          dramaLocks: { ...prev.dramaLocks },
        };
        if (next.dramaLocks[dramaId] === sourceKey) {
          delete next.dramaLocks[dramaId];
          showActionMessage("已取消本剧锁源");
        } else {
          next.dramaLocks[dramaId] = sourceKey;
          showActionMessage("已锁定本剧播放源");
        }
        writeSourceLockPrefs(next);
        return next;
      });
    },
    [dramaId, showActionMessage]
  );

  const handleToggleGlobalLock = useCallback(
    (sourceKey: string) => {
      setSourceLockPrefs((prev) => {
        const next: SourceLockPrefs = {
          globalSourceKey: prev.globalSourceKey === sourceKey ? "" : sourceKey,
          dramaLocks: prev.dramaLocks,
        };
        writeSourceLockPrefs(next);
        showActionMessage(
          next.globalSourceKey ? "已设置全局锁源" : "已取消全局锁源"
        );
        return next;
      });
    },
    [showActionMessage]
  );

  // 选择集数
  const selectEpisode = useCallback(
    (index: number) => {
      if (index >= 0 && dramaDetail && index < dramaDetail.episodes.length) {
        setInitialProgressTime(0);
        lastProgressSyncAtRef.current = 0;
        setCurrentEpisode(index);
        // 切换集数时重置弹幕状态，让新集数可以自动加载
        setDanmakuList([]);
        setDanmakuCount(0);
      }
    },
    [dramaDetail]
  );

  // 上一集
  const previousEpisode = useCallback(() => {
    if (currentEpisode > 0) {
      selectEpisode(currentEpisode - 1);
    }
  }, [currentEpisode, selectEpisode]);

  // 下一集
  const nextEpisode = useCallback(() => {
    if (dramaDetail && currentEpisode < dramaDetail.episodes.length - 1) {
      selectEpisode(currentEpisode + 1);
    }
  }, [dramaDetail, currentEpisode, selectEpisode]);

  const preloadEpisodeAsset = useCallback(
    (episodeIndex: number) => {
      if (!dramaDetail?.episodes?.[episodeIndex]) return;
      const nextUrl = dramaDetail.episodes[episodeIndex].url;
      if (!nextUrl) return;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "fetch";
      link.href = `/api/video-proxy/${encodeURIComponent(nextUrl)}`;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
      setTimeout(() => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      }, 15000);
    },
    [dramaDetail]
  );

  // 返回列表
  const goBack = useCallback(() => {
    router.push("/");
  }, [router]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA"
      )
        return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          previousEpisode();
          break;
        case "ArrowDown":
          e.preventDefault();
          nextEpisode();
          break;
        case "ArrowLeft":
          e.preventDefault();
          previousEpisode();
          break;
        case "ArrowRight":
          e.preventDefault();
          nextEpisode();
          break;
        case "Escape":
          goBack();
          break;
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [previousEpisode, nextEpisode, goBack]);

  // 保存播放历史 - 统一使用视频源封面
  useEffect(() => {
    if (dramaDetail && typeof window !== "undefined") {
      try {
        const history = {
          id: dramaDetail.id,
          name: dramaDetail.name,
          cover: dramaDetail.pic || "",
          episode: currentEpisode,
          timestamp: Date.now(),
          sourceKey: currentVodSource?.key || currentSourceKey || "",
          sourceName: currentVodSource?.name || "",
        };
        localStorage.setItem(
          `play_history_${dramaDetail.id}`,
          JSON.stringify(history)
        );
      } catch {
        // 静默失败，不影响播放
      }
    }
  }, [dramaDetail, currentEpisode, currentVodSource, currentSourceKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-2 border-stone-300 border-t-amber-500 mx-auto mb-4" />
          <p className="text-stone-300 text-lg">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-white text-xl mb-2">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!dramaDetail) {
    return null;
  }

  return (
    <div
      className="w-full min-h-[100dvh] overflow-x-clip"
      style={{
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundImage: "url(/movie-default-bg.jpg)",
      }}
    >
      {/* 顶部导航栏 - Netflix风格 */}
      <nav className="sticky top-0 z-450 bg-zinc-900/95 backdrop-blur-md border-b border-white/5">
        <div className="w-full mx-auto px-3 sm:px-4 md:px-6 min-h-[48px] md:h-[64px] py-2 md:py-0 flex items-center justify-between gap-2">
          <button
            onClick={() => router.back()}
            className="text-white text-sm sm:text-lg font-bold flex items-center gap-1.5 sm:gap-2 hover:text-red-500 transition-all duration-300 group shrink-0"
          >
            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-red-500/10 transition-all duration-300">
              <ArrowLeft className="w-5 h-5" />
            </div>
            <span className="hidden sm:inline">返回</span>
          </button>
          <div className="flex max-w-[65%] md:max-w-none flex-wrap items-center justify-end gap-2 md:gap-4">
            {/* 多源选择器 */}
            <SourceSelector
              sources={rankedSources}
              currentSourceKey={currentSourceKey}
              onSourceChange={switchSource}
              dramaLockedSourceKey={dramaLockedSourceKey}
              globalLockedSourceKey={globalLockedSourceKey}
              onToggleDramaLock={handleToggleDramaLock}
              onToggleGlobalLock={handleToggleGlobalLock}
            />
            {/* 播放器设置 */}
            {playerConfig && (
              <PlayerSettingsPanel
                playerConfig={playerConfig}
                currentMode={playerMode}
                currentIframePlayerIndex={currentIframePlayerIndex}
                vodSource={currentVodSource}
                onModeChange={setPlayerMode}
                onIframePlayerChange={setCurrentIframePlayerIndex}
              />
            )}
            {/* 弹幕选择器 - 仅在本地模式下显示 */}
            {playerMode === "local" && dramaDetail && (
              <DanmakuSelector
                videoTitle={`${dramaDetail.name} - 第${currentEpisode + 1}集`}
                danmakuCount={danmakuCount}
                onDanmakuLoad={(danmaku) => {
                  setDanmakuList(danmaku);
                  setDanmakuCount(danmaku.length);
                }}
              />
            )}
            <button
              onClick={() => setQueueEnabled((prev) => !prev)}
              className={`px-3 py-2 rounded-full text-xs border transition ${
                queueEnabled
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                  : "bg-white/10 border-white/20 text-gray-300"
              }`}
              title="下一集连续播放队列"
            >
              连播队列 {queueEnabled ? "开" : "关"}
            </button>
            {/* 展开侧边栏按钮 */}
            {!isRightPanelOpen && (
              <button
                onClick={() => setIsRightPanelOpen(true)}
                className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-red-500/10 transition-all duration-300 group"
                title="打开侧边栏"
              >
                <ChevronLeft className="w-5 h-5 text-white group-hover:text-red-500 transform rotate-180" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 主内容区域 - 左右分栏布局 */}
      <div className="w-full mx-auto flex flex-col lg:flex-row gap-0 p-0 relative">
        {/* 左侧：视频播放器区域 */}
        <div
          className={`flex-1 transition-all duration-300 ${
            isRightPanelOpen
              ? "lg:min-h-[calc(100vh-65px)]"
              : "lg:h-[calc(100vh-65px)]"
          }`}
        >
          <div
            className={`relative w-full bg-black overflow-hidden ${
              isRightPanelOpen ? "aspect-video h-full" : "h-full"
            }`}
          >
            {dramaDetail && dramaDetail.episodes.length > 0 && (
              <UnifiedPlayer
                videoUrl={dramaDetail.episodes[currentEpisode].url}
                title={`${dramaDetail.name} - 第${currentEpisode + 1}集`}
                mode={playerMode}
                currentIframePlayerIndex={currentIframePlayerIndex}
                vodSource={currentVodSource}
                externalDanmaku={danmakuList}
                initialProgressSeconds={initialProgressTime}
                onDanmakuCountChange={setDanmakuCount}
                onProgress={(time) => {
                  currentPlaybackTimeRef.current = time;
                  syncCloudProgress(time);
                  if (
                    currentSourceKey &&
                    !firstFrameMarkedSourceRef.current &&
                    time > 0.8
                  ) {
                    const metrics = readSourceMetrics();
                    const runtime = metrics[currentSourceKey] || createDefaultMetric();
                    runtime.firstFrameSamples += 1;
                    runtime.firstFrameTotalMs += Math.max(
                      0,
                      Date.now() - sourceBootAtRef.current
                    );
                    metrics[currentSourceKey] = runtime;
                    writeSourceMetrics(metrics);
                    firstFrameMarkedSourceRef.current = currentSourceKey;
                    reportSourceMetric(
                      currentSourceKey,
                      "first_frame",
                      Math.max(0, Date.now() - sourceBootAtRef.current)
                    );
                  }
                  if (
                    currentSourceKey &&
                    !sourceStableMarkedRef.current &&
                    time >= 15
                  ) {
                    const metrics = readSourceMetrics();
                    const runtime = metrics[currentSourceKey] || createDefaultMetric();
                    runtime.successCount += 1;
                    runtime.lastSuccessAt = Date.now();
                    metrics[currentSourceKey] = runtime;
                    writeSourceMetrics(metrics);
                    sourceStableMarkedRef.current = currentSourceKey;
                    reportSourceMetric(currentSourceKey, "playback_success");
                  }
                }}
                onEnded={() => {
                  if (
                    queueEnabled &&
                    queuedNextIndex !== null &&
                    queuedNextIndex > currentEpisode &&
                    queuedNextIndex < dramaDetail.episodes.length
                  ) {
                    selectEpisode(queuedNextIndex);
                    setQueuedNextIndex(null);
                    return;
                  }
                  const best = rankedSources[0];
                  if (
                    best &&
                    currentSourceKey &&
                    currentEpisode < dramaDetail.episodes.length - 1 &&
                    best.source_key !== currentSourceKey
                  ) {
                    switchSource(best.source_key, best.vod_id, "manual", {
                      episodeIndex: currentEpisode + 1,
                      resumeTime: 0,
                    });
                    return;
                  }
                  if (currentEpisode < dramaDetail.episodes.length - 1) {
                    selectEpisode(currentEpisode + 1);
                  }
                }}
                onPreloadNext={() => {
                  if (currentEpisode < dramaDetail.episodes.length - 1) {
                    preloadEpisodeAsset(currentEpisode + 1);
                  }
                }}
                onQueueNext={() => {
                  if (queueEnabled && currentEpisode < dramaDetail.episodes.length - 1) {
                    setQueuedNextIndex(currentEpisode + 1);
                  }
                }}
                onSaveIntroOutro={(payload) => {
                  const sourceKey = currentSourceKey || currentVodSource?.key || "default";
                  const mapKey = `${dramaDetail.id}:${sourceKey}:${currentEpisode}`;
                  setIntroOutroMap((prev) => {
                    const next = {
                      ...prev,
                      [mapKey]: {
                        opEnd: payload.opEnd ?? prev[mapKey]?.opEnd,
                        edStart: payload.edStart ?? prev[mapKey]?.edStart,
                      },
                    };
                    if (typeof window !== "undefined") {
                      localStorage.setItem(INTRO_OUTRO_POINTS_KEY, JSON.stringify(next));
                    }
                    return next;
                  });
                }}
                introOutroPoints={
                  introOutroMap[
                    `${dramaDetail.id}:${currentSourceKey || currentVodSource?.key || "default"}:${currentEpisode}`
                  ]
                }
                retryToken={localRetryToken}
                onStall={handleAutoSwitchByStall}
                onPlaybackFailure={handleAutoSwitchByFailure}
                onIframePlayerSwitch={(index) => {
                  setCurrentIframePlayerIndex(index);
                }}
              />
            )}
          </div>

          {/* 视频下方信息 - 仅在移动端显示 */}
          <div className="lg:hidden p-3 sm:p-4 bg-linear-to-b from-gray-900/90 to-gray-950/90 backdrop-blur-sm">
            <h1 className="text-sm font-bold text-white mb-2 tracking-tight">
              {dramaDetail.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {dramaDetail.year && (
                <span className="px-2 py-1 bg-linear-to-r from-red-600 to-red-500 text-white font-semibold rounded-md shadow-lg shadow-red-500/30">
                  {dramaDetail.year}
                </span>
              )}
              {dramaDetail.type && (
                <span className="text-gray-300 font-medium">
                  {dramaDetail.type}
                </span>
              )}
              {dramaDetail.area && (
                <>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-300 font-medium">
                    {dramaDetail.area}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => toggleLibrary("favorite")}
                disabled={libraryLoading}
                className={`px-2.5 py-1.5 rounded text-xs border transition ${
                  libraryStatus.favorite
                    ? "bg-red-600/20 border-red-500/60 text-red-300"
                    : "bg-white/5 border-white/15 text-gray-300"
                }`}
              >
                收藏
              </button>
              <button
                onClick={() => toggleLibrary("follow")}
                disabled={libraryLoading}
                className={`px-2.5 py-1.5 rounded text-xs border transition ${
                  libraryStatus.follow
                    ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
                    : "bg-white/5 border-white/15 text-gray-300"
                }`}
              >
                追剧
              </button>
              <button
                onClick={() => toggleLibrary("watch_later")}
                disabled={libraryLoading}
                className={`px-2.5 py-1.5 rounded text-xs border transition ${
                  libraryStatus.watch_later
                    ? "bg-amber-600/20 border-amber-500/60 text-amber-300"
                    : "bg-white/5 border-white/15 text-gray-300"
                }`}
              >
                稍后看
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：剧集信息和选择器 - Netflix风格 */}
        {isRightPanelOpen ? (
          <div className="w-full max-w-full lg:w-[380px] xl:w-[420px] bg-zinc-900 overflow-y-auto lg:max-h-[calc(100vh-65px)] relative">
            {/* 关闭按钮 */}
            <button
              onClick={() => setIsRightPanelOpen(false)}
              className="absolute top-3 right-3 lg:top-4 lg:right-4 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all duration-300 group"
              title="关闭侧边栏"
            >
              <X className="w-5 h-5 text-gray-300 group-hover:text-white" />
            </button>
            <div className="p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-6">
              {/* 查看全部集数模式 */}
              {showAllEpisodes ? (
                <div className="space-y-4 lg:space-y-6">
                  {/* 返回按钮和标题 */}
                  <div className="flex items-center justify-between sticky top-0 bg-zinc-900 pb-4 border-b border-white/10 z-10">
                    <button
                      onClick={() => setShowAllEpisodes(false)}
                      className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors group"
                    >
                      <svg
                        className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      <span className="text-xs lg:text-sm font-semibold">
                        返回
                      </span>
                    </button>
                  </div>

                  {/* 剧集标题 */}
                  <div>
                    <h1 className="text-sm lg:text-2xl font-bold text-white mb-2 line-clamp-2 tracking-tight leading-tight">
                      {dramaDetail.name}
                    </h1>
                    <p className="text-xs lg:text-sm text-gray-400">选择集数</p>
                  </div>

                  {/* 所有集数网格 */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pb-6">
                    {dramaDetail.episodes.map((episode, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          selectEpisode(index);
                          setShowAllEpisodes(false);
                        }}
                        className={`aspect-video rounded-lg text-xs lg:text-sm flex flex-col items-center justify-center p-2 transition-all duration-300 group relative overflow-hidden ${
                          currentEpisode === index
                            ? "bg-linear-to-br from-red-600 to-red-500 text-white shadow-lg shadow-red-500/40 ring-2 ring-red-400 scale-105"
                            : "bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white hover:scale-105 backdrop-blur-sm"
                        }`}
                      >
                        {episode.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* 剧集标题和信息 - 仅在桌面端显示 */}
                  <div className="hidden lg:block animate-fade-in">
                    <h1 className="text-2xl font-bold text-white mb-4 line-clamp-2 tracking-tight leading-tight">
                      {dramaDetail.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-sm mb-4">
                      {dramaDetail.year && (
                        <span className="px-3 py-1.5 bg-linear-to-r from-red-600 to-red-500 text-white font-semibold rounded-md shadow-lg shadow-red-500/30">
                          {dramaDetail.year}
                        </span>
                      )}
                      {dramaDetail.remarks && (
                        <span className="px-3 py-1.5 border border-white/20 text-gray-200 rounded-md font-medium backdrop-blur-sm bg-white/5">
                          {dramaDetail.remarks}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300 font-medium">
                      {dramaDetail.type && <span>{dramaDetail.type}</span>}
                      {dramaDetail.area && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span>{dramaDetail.area}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleLibrary("favorite")}
                        disabled={libraryLoading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition ${
                          libraryStatus.favorite
                            ? "bg-red-600/20 border-red-500/60 text-red-300"
                            : "bg-white/5 border-white/15 text-gray-300 hover:text-white"
                        }`}
                      >
                        <Heart size={14} />
                        收藏
                      </button>
                      <button
                        onClick={() => toggleLibrary("follow")}
                        disabled={libraryLoading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition ${
                          libraryStatus.follow
                            ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
                            : "bg-white/5 border-white/15 text-gray-300 hover:text-white"
                        }`}
                      >
                        <ListChecks size={14} />
                        追剧清单
                      </button>
                      <button
                        onClick={() => toggleLibrary("watch_later")}
                        disabled={libraryLoading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition ${
                          libraryStatus.watch_later
                            ? "bg-amber-600/20 border-amber-500/60 text-amber-300"
                            : "bg-white/5 border-white/15 text-gray-300 hover:text-white"
                        }`}
                      >
                        <Clock3 size={14} />
                        稍后再看
                      </button>
                    </div>
                    {actionMessage && (
                      <p className="text-xs text-[#E50914] mt-2">{actionMessage}</p>
                    )}
                  </div>

                  {/* 演职人员 */}
                  {(dramaDetail.actor || dramaDetail.director) && (
                    <div className="space-y-3 text-xs lg:text-sm lg:border-t lg:border-white/10 lg:pt-6">
                      {dramaDetail.actor && (
                        <div className="group">
                          <span className="text-gray-400 font-semibold">
                            主演：
                          </span>
                          <span className="text-gray-200 group-hover:text-white transition-colors">
                            {dramaDetail.actor}
                          </span>
                        </div>
                      )}
                      {dramaDetail.director && (
                        <div className="group">
                          <span className="text-gray-400 font-semibold">
                            导演：
                          </span>
                          <span className="text-gray-200 group-hover:text-white transition-colors">
                            {dramaDetail.director}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 简介 */}
                  {dramaDetail.blurb && (
                    <div className="border-t border-white/10 pt-4 lg:pt-6">
                      <h3 className="text-xs lg:text-sm font-semibold text-gray-400 mb-2">
                        剧情简介
                      </h3>
                      <div className="relative">
                        <p
                          className={`text-xs lg:text-sm text-gray-300 leading-relaxed transition-all duration-300 ${
                            isDescriptionExpanded ? "" : "line-clamp-4"
                          }`}
                          dangerouslySetInnerHTML={{
                            __html: dramaDetail.blurb
                              .replace(/<[^>]*>/g, "")
                              .replace(/&nbsp;/g, " "),
                          }}
                        />
                        {dramaDetail.blurb.length > 100 && (
                          <button
                            onClick={() =>
                              setIsDescriptionExpanded(!isDescriptionExpanded)
                            }
                            className="mt-2 text-xs lg:text-sm text-red-500 hover:text-red-400 font-semibold transition-colors flex items-center gap-1 group"
                          >
                            {isDescriptionExpanded ? (
                              <>
                                <span>显示更少</span>
                                <svg
                                  className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 15l7-7 7 7"
                                  />
                                </svg>
                              </>
                            ) : (
                              <>
                                <span>显示更多</span>
                                <svg
                                  className="w-4 h-4 group-hover:translate-y-0.5 transition-transform"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 选集区域 */}
                  <div className="border-t border-white/10 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xs lg:text-sm font-bold text-white tracking-tight">
                        选集
                      </h2>
                    </div>

                    {/* 上一集/下一集按钮 */}
                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={previousEpisode}
                        disabled={currentEpisode === 0}
                        className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-600 text-white rounded-lg transition-all duration-300 text-xs lg:text-sm font-semibold backdrop-blur-sm shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
                      >
                        上一集
                      </button>
                      <button
                        onClick={nextEpisode}
                        disabled={
                          currentEpisode === dramaDetail.episodes.length - 1
                        }
                        className="flex-1 px-4 py-2.5 bg-linear-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 text-white rounded-lg transition-all duration-300 text-xs lg:text-sm font-semibold shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100 disabled:shadow-none"
                      >
                        下一集
                      </button>
                    </div>

                    {/* 集数预览（显示前12集） */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mb-4">
                      {dramaDetail.episodes
                        .slice(0, 12)
                        .map((episode, index) => (
                          <button
                            key={index}
                            onClick={() => selectEpisode(index)}
                            className={`rounded-lg flex flex-col text-xs lg:text-sm items-center justify-center p-2 transition-all duration-300 group relative overflow-hidden ${
                              currentEpisode === index
                                ? "bg-linear-to-br from-red-600 to-red-500 text-white shadow-lg shadow-red-500/40 ring-2 ring-red-400 scale-105"
                                : "bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white hover:scale-105 backdrop-blur-sm"
                            }`}
                          >
                            {episode.name}
                          </button>
                        ))}
                    </div>

                    {/* 查看全部按钮 */}
                    {dramaDetail.episodes.length > 12 && (
                      <button
                        onClick={() => setShowAllEpisodes(true)}
                        className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-300 text-xs lg:text-sm font-semibold backdrop-blur-sm shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group"
                      >
                        <span>查看全部</span>
                        <svg
                          className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
