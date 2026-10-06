type RuntimeJsSignal = {
  kind: "js_error" | "unhandled_rejection" | "resource_error";
  name: string;
  source: string;
  line?: number;
  column?: number;
  pageRoute: string;
  recordedAt: number;
};

const DEV_PATHS = new Set([
  "/api/support/dev/cognition",
  "/api/support/dev/investigate",
]);

const MAX_SIGNALS = 20;
const SIGNAL_TTL_MS = 15 * 60 * 1000;
const originalFetch = typeof window !== "undefined" ? window.fetch.bind(window) : null;
let signals: RuntimeJsSignal[] = [];
let installed = false;

function sanitizePath(value: string) {
  let path = value || "";
  try {
    const url = new URL(value, window.location.origin);
    path = url.pathname;
  } catch {
    // Usa o valor como path quando não for URL válida.
  }
  try { path = decodeURIComponent(path); } catch { /* mantém valor original */ }
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[id]")
    .replace(/\/(\d{6,})(?=\/|$)/g, "/[id]")
    .slice(0, 220);
}

function safeErrorName(value: unknown) {
  const raw = value instanceof Error
    ? value.name
    : typeof value === "string"
      ? "string_reason"
      : value === null
        ? "null_reason"
        : typeof value;
  return String(raw || "Error").replace(/[^a-z0-9_.-]/gi, "").slice(0, 60) || "Error";
}

function pageRoute() {
  return sanitizePath(window.location.pathname || "/");
}

function pruneSignals() {
  const cutoff = Date.now() - SIGNAL_TTL_MS;
  signals = signals.filter((signal) => signal.recordedAt >= cutoff).slice(-MAX_SIGNALS);
}

function recordSignal(signal: RuntimeJsSignal) {
  pruneSignals();
  const previous = signals[signals.length - 1];
  if (
    previous &&
    previous.kind === signal.kind &&
    previous.name === signal.name &&
    previous.source === signal.source &&
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
  return (scoped.length ? scoped : signals).slice(-5);
}

function runtimeEvidence() {
  const now = Date.now();
  const recent = currentRouteSignals();
  if (!recent.length) return "";
  const text = recent.map((signal) => {
    const ageSeconds = Math.max(0, Math.round((now - signal.recordedAt) / 1000));
    const position = signal.line ? `:${signal.line}${signal.column ? `:${signal.column}` : ""}` : "";
    return `${signal.kind}:${signal.name} em ${signal.source || "fonte_desconhecida"}${position} (há ${ageSeconds}s)`;
  }).join(" | ");
  return `ERROS JS REAIS DA TELA (sem mensagem/stack/valores): ${text}`.slice(0, 390);
}

function requestPath(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return "";
  }
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
        const existing = String(plan[5] ?? "");
        cognition.investigationPlan = [
          ...plan.slice(0, 5),
          `${existing.slice(0, 300)}; ${evidence.slice(0, 170)}`.slice(0, 490),
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

function isBenignResizeObserverError(event: ErrorEvent) {
  return /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(event.message || "");
}

function installRuntimeJsBridge() {
  if (installed || !originalFetch || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    if (event instanceof ErrorEvent) {
      if (isBenignResizeObserverError(event)) return;
      recordSignal({
        kind: "js_error",
        name: safeErrorName(event.error),
        source: sanitizePath(event.filename || "script"),
        ...(event.lineno ? { line: event.lineno } : {}),
        ...(event.colno ? { column: event.colno } : {}),
        pageRoute: pageRoute(),
        recordedAt: Date.now(),
      });
      return;
    }

    const target = event.target;
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
      const source = target instanceof HTMLScriptElement ? target.src : target.href;
      recordSignal({
        kind: "resource_error",
        name: target.tagName.toLowerCase(),
        source: sanitizePath(source || "resource"),
        pageRoute: pageRoute(),
        recordedAt: Date.now(),
      });
    }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    recordSignal({
      kind: "unhandled_rejection",
      name: safeErrorName(event.reason),
      source: "promise",
      pageRoute: pageRoute(),
      recordedAt: Date.now(),
    });
  });

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = requestPath(input);
    if (!DEV_PATHS.has(path)) return originalFetch(input, init);
    return originalFetch(input, injectRuntimeEvidence(path, init));
  };
}

installRuntimeJsBridge();

export {};
