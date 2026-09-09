type JarvisScreenContext = {
  route: string;
  search: string;
  hash: string;
  title: string;
  breadcrumbs: string[];
  headings: string[];
  dialogTitle: string | null;
  selectedItems: string[];
  focusedControl: string | null;
  capturedAt: string;
};

const SENSITIVE_PARAM_RE = /(token|auth|secret|password|passwd|code|key|credential|session)/i;

function visible(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && rect.width > 0
    && rect.height > 0;
}

function compactText(value: string | null | undefined, max = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeParams(raw: string, prefix: "?" | "#") {
  const source = raw.startsWith(prefix) ? raw.slice(1) : raw;
  if (!source) return "";
  try {
    const params = new URLSearchParams(source);
    for (const key of Array.from(params.keys())) {
      if (SENSITIVE_PARAM_RE.test(key)) params.set(key, "[redacted]");
    }
    const value = params.toString();
    return value ? `${prefix}${value}` : "";
  } catch {
    return "";
  }
}

function uniqueVisibleTexts(selector: string, limit: number, maxChars = 120) {
  const values: string[] = [];
  for (const element of Array.from(document.querySelectorAll(selector))) {
    if (!visible(element)) continue;
    const text = compactText((element as HTMLElement).innerText || element.textContent, maxChars);
    if (!text || values.includes(text)) continue;
    values.push(text);
    if (values.length >= limit) break;
  }
  return values;
}

function focusedControlLabel() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active.matches('input[type="password"]')) return "campo protegido";
  return compactText(
    active.getAttribute("aria-label")
      || active.getAttribute("title")
      || active.getAttribute("name")
      || active.closest("label")?.textContent,
    80,
  ) || null;
}

function captureScreenContext(): JarvisScreenContext {
  const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(visible);
  const dialogTitle = dialog
    ? compactText(
        dialog.querySelector<HTMLElement>('[role="heading"], h1, h2, h3, [data-dialog-title]')?.innerText,
        120,
      ) || null
    : null;

  return {
    route: window.location.pathname,
    search: sanitizeParams(window.location.search, "?"),
    hash: sanitizeParams(window.location.hash, "#"),
    title: document.title,
    breadcrumbs: uniqueVisibleTexts(
      '[aria-label*="breadcrumb" i] a, [aria-label*="breadcrumb" i] span, nav ol li',
      6,
      80,
    ),
    headings: uniqueVisibleTexts('main h1, main h2, [role="main"] h1, [role="main"] h2', 6, 100),
    dialogTitle,
    selectedItems: uniqueVisibleTexts(
      '[aria-selected="true"], [data-selected="true"], [data-state="selected"], tr[data-state="selected"]',
      6,
      100,
    ),
    focusedControl: focusedControlLabel(),
    capturedAt: new Date().toISOString(),
  };
}

function enrichJarvisRequest(init?: RequestInit): RequestInit | undefined {
  if (typeof init?.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body) as {
      context?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const screenContext = captureScreenContext();
    return {
      ...init,
      body: JSON.stringify({
        ...payload,
        context: {
          ...(payload.context ?? {}),
          route: screenContext.route,
          title: screenContext.title,
          source: "web_ui",
          screenContext,
        },
      }),
    };
  } catch {
    return init;
  }
}

function installMicBargeIn() {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest?.("button") as HTMLButtonElement | null;
    if (!button) return;
    const title = button.getAttribute("title") ?? "";
    if (title !== "Falar com JARVIS" && title !== "Parar de ouvir") return;
    if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  }, true);
}

if (typeof window !== "undefined") {
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isJarvisChat = method === "POST" && /(?:^|\/)api\/support\/chat(?:\?|$)/.test(url);
    return previousFetch(input, isJarvisChat ? enrichJarvisRequest(init) : init);
  };

  installMicBargeIn();
}

export {};
