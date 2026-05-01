import "server-only";

export interface RateLimitOptions {
  key: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;

function nowMs(): number {
  return Date.now();
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function maybePruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  pruneExpiredBuckets(now);

  if (buckets.size < MAX_BUCKETS) return;

  // Hard cap fallback: remove oldest resetAt entries.
  const entries = Array.from(buckets.entries()).sort(
    (left, right) => left[1].resetAt - right[1].resetAt
  );
  const overflow = buckets.size - MAX_BUCKETS + 1;
  for (let i = 0; i < overflow; i += 1) {
    buckets.delete(entries[i][0]);
  }
}

export function applyRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = nowMs();
  maybePruneBuckets(now);

  const existing = buckets.get(options.key);
  let bucket: Bucket;

  if (!existing || existing.resetAt <= now) {
    bucket = {
      count: 0,
      resetAt: now + options.windowMs,
    };
    buckets.set(options.key, bucket);
  } else {
    bucket = existing;
  }

  bucket.count += 1;

  const allowed = bucket.count <= options.max;
  const remaining = Math.max(0, options.max - bucket.count);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000)
  );

  return {
    allowed,
    limit: options.max,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  };
}
