import type { NextFunction, Request, Response } from "express";

export type ServerRuntimeSignalKind = "server_error" | "slow_server";

export type ServerRuntimeSignal = {
  kind: ServerRuntimeSignalKind;
  method: string;
  path: string;
  status: number;
  count: number;
  avgDurationMs: number;
  maxDurationMs: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ServerRuntimeSnapshot = {
  windowHours: number;
  aggregationMinutes: number;
  slowThresholdMs: number;
  totalSignals24h: number;
  serverErrors24h: number;
  slowRequests24h: number;
  serverErrors15m: number;
  slowRequests15m: number;
  topSignals: ServerRuntimeSignal[];
  checkedAt: string;
};

type RuntimeBucket = {
  windowStartMs: number;
  kind: ServerRuntimeSignalKind;
  method: string;
  path: string;
  status: number;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  firstSeenMs: number;
  lastSeenMs: number;
};

const RUNTIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 15 * 60 * 1000;
const AGGREGATION_WINDOW_MS = 5 * 60 * 1000;
const SLOW_SERVER_MS = 2500;
const MAX_BUCKETS = 600;
const buckets = new Map<string, RuntimeBucket>();

function sanitizePath(value: string) {
  let path = String(value || "/").split("?", 1)[0] || "/";
  try { path = decodeURIComponent(path); } catch { /* mantém o path original */ }
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[id]")
    .replace(/\/(\d{6,})(?=\/|$)/g, "/[id]")
    .slice(0, 260);
}

function normalizeMethod(value: string) {
  return String(value || "GET").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 12) || "GET";
}

function shouldObserve(path: string) {
  if (!(path === "/api" || path.startsWith("/api/") || path === "/api/v1" || path.startsWith("/api/v1/"))) return false;
  return !/^\/api(?:\/v1)?\/support\/dev(?:\/|$)/.test(path);
}

function prune(now = Date.now()) {
  const cutoff = now - RUNTIME_WINDOW_MS;
  for (const [key, bucket] of buckets) {
    if (bucket.lastSeenMs < cutoff) buckets.delete(key);
  }

  if (buckets.size <= MAX_BUCKETS) return;
  const oldest = [...buckets.entries()]
    .sort((a, b) => a[1].lastSeenMs - b[1].lastSeenMs)
    .slice(0, buckets.size - MAX_BUCKETS);
  for (const [key] of oldest) buckets.delete(key);
}

function recordMetric(args: { method: string; path: string; status: number; durationMs: number; recordedAt?: number }) {
  const now = args.recordedAt ?? Date.now();
  const path = sanitizePath(args.path);
  if (!shouldObserve(path)) return;

  const durationMs = Math.max(0, Math.min(10 * 60 * 1000, Math.round(args.durationMs)));
  const status = Number.isInteger(args.status) ? args.status : 0;
  const kind: ServerRuntimeSignalKind | null = status >= 500
    ? "server_error"
    : durationMs >= SLOW_SERVER_MS
      ? "slow_server"
      : null;
  if (!kind) return;

  prune(now);
  const method = normalizeMethod(args.method);
  const windowStartMs = Math.floor(now / AGGREGATION_WINDOW_MS) * AGGREGATION_WINDOW_MS;
  const key = `${windowStartMs}|${kind}|${method}|${path}|${status}`;
  const current = buckets.get(key);

  if (current) {
    current.count += 1;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    current.lastSeenMs = now;
    return;
  }

  buckets.set(key, {
    windowStartMs,
    kind,
    method,
    path,
    status,
    count: 1,
    totalDurationMs: durationMs,
    maxDurationMs: durationMs,
    firstSeenMs: now,
    lastSeenMs: now,
  });
}

export function serverRuntimeTelemetryMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = sanitizePath(req.originalUrl || req.url || req.path || "/");
  if (!shouldObserve(path)) return next();

  const startedAt = Date.now();
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    recordMetric({
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  };

  res.once("finish", record);
  res.once("close", record);
  next();
}

export function getServerRuntimeSnapshot(limit = 10): ServerRuntimeSnapshot {
  const now = Date.now();
  prune(now);
  const cutoff24h = now - RUNTIME_WINDOW_MS;
  const cutoff15m = now - RECENT_WINDOW_MS;
  const aggregated = new Map<string, RuntimeBucket>();

  let serverErrors24h = 0;
  let slowRequests24h = 0;
  let serverErrors15m = 0;
  let slowRequests15m = 0;

  for (const bucket of buckets.values()) {
    if (bucket.lastSeenMs < cutoff24h) continue;
    if (bucket.kind === "server_error") serverErrors24h += bucket.count;
    else slowRequests24h += bucket.count;

    if (bucket.lastSeenMs >= cutoff15m) {
      if (bucket.kind === "server_error") serverErrors15m += bucket.count;
      else slowRequests15m += bucket.count;
    }

    const key = `${bucket.kind}|${bucket.method}|${bucket.path}|${bucket.status}`;
    const current = aggregated.get(key);
    if (current) {
      current.count += bucket.count;
      current.totalDurationMs += bucket.totalDurationMs;
      current.maxDurationMs = Math.max(current.maxDurationMs, bucket.maxDurationMs);
      current.firstSeenMs = Math.min(current.firstSeenMs, bucket.firstSeenMs);
      current.lastSeenMs = Math.max(current.lastSeenMs, bucket.lastSeenMs);
    } else {
      aggregated.set(key, { ...bucket });
    }
  }

  const topSignals = [...aggregated.values()]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "server_error" ? -1 : 1;
      return b.count - a.count || b.maxDurationMs - a.maxDurationMs || b.lastSeenMs - a.lastSeenMs;
    })
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map((bucket): ServerRuntimeSignal => ({
      kind: bucket.kind,
      method: bucket.method,
      path: bucket.path,
      status: bucket.status,
      count: bucket.count,
      avgDurationMs: Math.round(bucket.totalDurationMs / Math.max(1, bucket.count)),
      maxDurationMs: bucket.maxDurationMs,
      firstSeenAt: new Date(bucket.firstSeenMs).toISOString(),
      lastSeenAt: new Date(bucket.lastSeenMs).toISOString(),
    }));

  return {
    windowHours: 24,
    aggregationMinutes: 5,
    slowThresholdMs: SLOW_SERVER_MS,
    totalSignals24h: serverErrors24h + slowRequests24h,
    serverErrors24h,
    slowRequests24h,
    serverErrors15m,
    slowRequests15m,
    topSignals,
    checkedAt: new Date(now).toISOString(),
  };
}
