import { recordExecutionMemory } from "../routes/dev_agent_memory.js";

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

type SentinelLogger = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

const RUNTIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 15 * 60 * 1000;
const AGGREGATION_WINDOW_MS = 5 * 60 * 1000;
const SLOW_SERVER_MS = 2500;
const MAX_BUCKETS = 600;
const SERVER_SENTINEL_INTERVAL_MS = 5 * 60 * 1000;
const SERVER_ERROR_INCIDENT_THRESHOLD = 3;
const SLOW_REQUEST_INCIDENT_THRESHOLD = 8;
const buckets = new Map<string, RuntimeBucket>();

let sentinelTimer: NodeJS.Timeout | null = null;
let consecutiveIncidentChecks = 0;
let activeIncidentKey: string | null = null;
let activeIncidentPersisted = false;

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

export function captureServerRuntimeFromPinoArgs(args: readonly unknown[]) {
  for (const candidate of args) {
    if (!candidate || typeof candidate !== "object") continue;
    const value = candidate as {
      req?: { method?: unknown; url?: unknown; originalUrl?: unknown };
      res?: { statusCode?: unknown; status?: unknown };
      responseTime?: unknown;
      responseTimeMs?: unknown;
    };

    const method = String(value.req?.method ?? "");
    const path = String(value.req?.originalUrl ?? value.req?.url ?? "");
    const status = Number(value.res?.statusCode ?? value.res?.status);
    const durationMs = Number(value.responseTime ?? value.responseTimeMs);
    if (!method || !path || !Number.isInteger(status) || !Number.isFinite(durationMs) || durationMs < 0) continue;

    recordMetric({ method, path, status, durationMs });
    break;
  }
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

function hasActiveIncident(snapshot: ServerRuntimeSnapshot) {
  return snapshot.serverErrors15m >= SERVER_ERROR_INCIDENT_THRESHOLD || snapshot.slowRequests15m >= SLOW_REQUEST_INCIDENT_THRESHOLD;
}

function buildIncidentKey(snapshot: ServerRuntimeSnapshot) {
  const revision = String(
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_DEPLOYMENT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "runtime",
  ).slice(0, 12);
  const dominant = snapshot.topSignals
    .slice(0, 3)
    .map((signal) => `${signal.kind}:${signal.method}:${signal.path}:${signal.status}`)
    .join("|")
    .replace(/[^a-zA-Z0-9_:/|[\].-]+/g, "-")
    .slice(0, 72);
  return `server-runtime-${revision}-${dominant || "incident"}`.slice(0, 120);
}

async function persistRuntimeIncident(snapshot: ServerRuntimeSnapshot, status: "server_runtime_incident" | "server_runtime_recovered", requestId: string, logger: SentinelLogger) {
  const top = snapshot.topSignals.slice(0, 5);
  try {
    await recordExecutionMemory({
      requestId,
      route: "/admin/dev-engineering",
      recordedAt: new Date().toISOString(),
      status,
      summary: status === "server_runtime_incident"
        ? `Watchdog server-side confirmou incidente após ${consecutiveIncidentChecks} ciclos: ${snapshot.serverErrors15m} erros 5xx e ${snapshot.slowRequests15m} respostas lentas nos últimos 15 minutos.`
        : `Watchdog server-side confirmou recuperação: ${snapshot.serverErrors15m} erros 5xx e ${snapshot.slowRequests15m} respostas lentas nos últimos 15 minutos.`,
      changedFiles: [],
      engines: ["server-runtime-sentinel"],
      failures: status === "server_runtime_incident"
        ? top.filter((signal) => signal.kind === "server_error").map((signal) => `${signal.method} ${signal.path} -> ${signal.status} x${signal.count}`).slice(0, 8)
        : [],
      evidence: [
        `server_errors_15m=${snapshot.serverErrors15m}`,
        `slow_requests_15m=${snapshot.slowRequests15m}`,
        `server_errors_24h=${snapshot.serverErrors24h}`,
        `slow_requests_24h=${snapshot.slowRequests24h}`,
        ...top.map((signal) => `${signal.kind}:${signal.method}:${signal.path}:status=${signal.status}:count=${signal.count}:avg=${signal.avgDurationMs}ms:max=${signal.maxDurationMs}ms`),
      ].slice(0, 8),
    });
    logger.info({ requestId, status }, "dev-ia server runtime: incident memory persisted");
    return true;
  } catch (error) {
    logger.warn({ err: error, requestId, status }, "dev-ia server runtime: failed to persist incident memory");
    return false;
  }
}

async function runServerRuntimeSentinel(logger: SentinelLogger) {
  const snapshot = getServerRuntimeSnapshot(8);
  const incident = hasActiveIncident(snapshot);

  if (incident) {
    consecutiveIncidentChecks += 1;
    const key = buildIncidentKey(snapshot);
    if (activeIncidentKey !== key) {
      activeIncidentKey = key;
      activeIncidentPersisted = false;
    }
    if (consecutiveIncidentChecks >= 2 && !activeIncidentPersisted) {
      activeIncidentPersisted = await persistRuntimeIncident(snapshot, "server_runtime_incident", key, logger);
    }
    logger.warn({
      serverErrors15m: snapshot.serverErrors15m,
      slowRequests15m: snapshot.slowRequests15m,
      totalSignals24h: snapshot.totalSignals24h,
      consecutiveIncidentChecks,
    }, "dev-ia server runtime: backend needs attention");
    return;
  }

  consecutiveIncidentChecks = 0;
  if (activeIncidentKey && activeIncidentPersisted) {
    const recovered = await persistRuntimeIncident(snapshot, "server_runtime_recovered", activeIncidentKey, logger);
    if (recovered) {
      activeIncidentKey = null;
      activeIncidentPersisted = false;
    }
  } else {
    activeIncidentKey = null;
    activeIncidentPersisted = false;
  }
}

export function startServerRuntimeSentinel(logger: SentinelLogger) {
  if (sentinelTimer) return;
  void runServerRuntimeSentinel(logger);
  sentinelTimer = setInterval(() => {
    void runServerRuntimeSentinel(logger);
  }, SERVER_SENTINEL_INTERVAL_MS);
  sentinelTimer.unref();
  logger.info({
    intervalMs: SERVER_SENTINEL_INTERVAL_MS,
    errorThreshold15m: SERVER_ERROR_INCIDENT_THRESHOLD,
    slowThreshold15m: SLOW_REQUEST_INCIDENT_THRESHOLD,
    slowRequestMs: SLOW_SERVER_MS,
  }, "dev-ia server runtime: watchdog started");
}
