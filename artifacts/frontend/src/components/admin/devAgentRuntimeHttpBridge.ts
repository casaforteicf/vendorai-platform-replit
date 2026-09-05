type RuntimeHttpSignal = {
  method: string;
  path: string;
  status: number | "network_error";
  durationMs: number;
  pageRoute: string;
  recordedAt: number;
};

const DEV_PATHS = new Set([
  "/api/support/dev/cognition",
  "/api/support/dev/investigate",
  "/api/support/dev/execute",
  "/api/support/dev/validate-production",
  "/api/support/dev/readiness",
  "/api/support/dev/execution-memory",
  "/api/support/dev/memory",
  "/api/support/dev/operational-context",
]);

const MAX_SIGNALS = 24;
const SIGNAL_TTL_MS = 15 * 60 * 1000;
const originalFetch = typeof window !== "undefined" ? window.fetch.bind(window) : null;
let signals: RuntimeHttpSignal[] = [];
let installed = false;

function requestUrl(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function sanitizePath(pathname: string) {
  let path = pathname;
  try { path = decodeURIComponent(pathname); } catch { /* mantém pathname original */ }
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[id]")
    .replace(/\/(\d{6,})(?=\/|$)/g, "/[id]")
    .slice(0, 260);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase().slice(0, 12);
}

function pageRoute() {
  return sanitizePath(window.location.pathname || "/");
}

function pruneSignals() {
  const cutoff = Date.now() - SIGNAL_TTL_MS;
  signals = signals.filter((signal) => signal.recordedAt >= cutoff).slice(-MAX_SIGNALS);
}

function recordSignal(signal: RuntimeHttpSignal) {
  pruneSignals();
  const previous = signals[signals.length - 1];
  if (
    previous &&
    previous.method === signal.method &&
    previous.path === signal.path &&
    previous.status === signal.status &&
    signal.recordedAt - previous.recordedAt < 1500
  ) {
    signals[signals.length - 1] = signal;
    return;
  }
  signals.push(signal);
  if (signals.length > MAX_SIGNALS) signals = signals.slice(-MAX_SIGNALS);
}

function currentRouteSignals() {
  pruneSignals();
  const route = pageRoute();
  const scoped = signals.filter((signal) => signal.pageRoute === route);
  return (scoped.length ? scoped : signals).slice(-6);
}

function runtimeEvidence() {
  const now = Date.now();
  const recent = currentRouteSignals();
  if (!recent.length) return "";
  const text = recent.map((signal) => {
    const ageSeconds = Math.max(0, Math.round((now - signal.recordedAt) / 1000));
    return `${signal.method} ${signal.path} → ${signal.status} (${signal.durationMs}ms, há ${ageSeconds}s)`;
  }).join(" | ");
  return `FALHAS HTTP REAIS DA TELA (sem payload/body/headers): ${text}`.slice(0, 430);
}

function injectRuntimeEvidence(path: string, init?: RequestInit) {
  if (typeof init?.body !== "string") return init;
  const evidence = runtimeEvidence();
  if (!evidence) return init;

  try {
    const payload = JSON.parse(init.body);
    if (path.endsWith("/cognition")) {
      const recent = Array.isArray(payload.recentMessages) ? payload.recentMessages : [];
      payload.recentMessages = [
        ...recent.slice(-11),
        { role: "assistant", content: evidence },
      ];
      return { ...init, body: JSON.stringify(payload) };
    }

    if (path.endsWith("/investigate")) {
      const cognition = payload.cognition && typeof payload.cognition === "object" ? payload.cognition : {};
      const plan = Array.isArray(cognition.investigationPlan) ? cognition.investigationPlan.map(String) : [];
      if (plan.length < 6) {
        cognition.investigationPlan = [...plan, evidence.slice(0, 490)];
      } else {
        const last = String(plan[5] ?? "");
        const visualPart = last.startsWith("CONTEXTO VISUAL") ? last.slice(0, 250) : last.slice(0, 180);
        cognition.investigationPlan = [
          ...plan.slice(0, 5),
          `${visualPart}; ${evidence.slice(0, 230)}`.slice(0, 490),
        ];
      }
      payload.cognition = cognition;
      return { ...init, body: JSON.stringify(payload) };
    }
  } catch {
    return init;
  }

  return init;
}

function installRuntimeHttpBridge() {
  if (installed || !originalFetch || typeof window === "undefined") return;
  installed = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const path = url ? sanitizePath(url.pathname) : "";
    const rawPath = url?.pathname ?? "";
    const method = requestMethod(input, init);
    const sameOriginApi = Boolean(url && url.origin === window.location.origin && rawPath.startsWith("/api/"));
    const isDevCall = DEV_PATHS.has(rawPath);

    if (isDevCall) {
      const nextInit = injectRuntimeEvidence(rawPath, init);
      return originalFetch(input, nextInit);
    }

    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const response = await originalFetch(input, init);
      if (sameOriginApi && !response.ok) {
        const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
        recordSignal({
          method,
          path,
          status: response.status,
          durationMs: Math.max(0, Math.round(ended - started)),
          pageRoute: pageRoute(),
          recordedAt: Date.now(),
        });
      }
      return response;
    } catch (error) {
      if (sameOriginApi) {
        const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
        recordSignal({
          method,
          path,
          status: "network_error",
          durationMs: Math.max(0, Math.round(ended - started)),
          pageRoute: pageRoute(),
          recordedAt: Date.now(),
        });
      }
      throw error;
    }
  };
}

installRuntimeHttpBridge();

export {};
