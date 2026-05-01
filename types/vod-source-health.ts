export interface VodSourceHealthSnapshot {
  key: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  averageLatencyMs: number;
  lastLatencyMs: number;
  lastStatusCode?: number;
  lastError?: string;
  lastStatus: "healthy" | "unhealthy";
  lastCheckedAt?: string;
  updatedAt?: string;
}

export interface SourceProbeResult {
  key: string;
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

export type SourcePlaybackEventType =
  | "first_frame"
  | "playback_success"
  | "stall"
  | "auto_switch"
  | "retry";

export interface SourcePlaybackMetricEvent {
  key: string;
  eventType: SourcePlaybackEventType;
  valueMs?: number;
}
