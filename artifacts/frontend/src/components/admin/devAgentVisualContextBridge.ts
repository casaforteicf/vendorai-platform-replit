type SemanticPageSnapshot = {
  route: string;
  title: string;
  viewport: string;
  scrollY: number;
  headings: string[];
  activeNavigation: string[];
  actions: string[];
  fields: string[];
  tables: string[];
  dialogs: string[];
};

const DEV_ENDPOINTS = new Set([
  "/api/support/dev/cognition",
  "/api/support/dev/investigate",
  "/api/support/dev/execute",
]);

const originalFetch = typeof window !== "undefined" ? window.fetch.bind(window) : null;
let installed = false;

function compact(value: string, max = 120) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function maskSensitiveText(value: string, max = 180) {
  return compact(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[telefone]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[id]")
    .replace(/\b\d{11,14}\b/g, "[documento]");
}

function isVisible(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
}

function unique(values: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = maskSensitiveText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function elementLabel(element: Element) {
  if (!(element instanceof HTMLElement)) return "";
  return compact(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.innerText ||
      element.textContent ||
      "",
    100,
  );
}

function fieldDescriptor(element: Element) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return "";
  const tag = element.tagName.toLowerCase();
  const type = element instanceof HTMLInputElement ? element.type || "text" : tag;
  if (type === "hidden") return "";
  const label =
    element.getAttribute("aria-label") ||
    element.getAttribute("placeholder") ||
    element.getAttribute("name") ||
    element.id ||
    "sem-rótulo";
  return `${tag}:${type}:${compact(label, 70)}`;
}

function tableDescriptor(table: Element) {
  const headers = Array.from(table.querySelectorAll("thead th, [role='columnheader']"))
    .filter(isVisible)
    .map((cell) => elementLabel(cell))
    .filter(Boolean)
    .slice(0, 10);
  return headers.length ? `colunas=${headers.join(" | ")}` : "tabela sem cabeçalhos visíveis";
}

function dialogDescriptor(dialog: Element) {
  const heading = Array.from(dialog.querySelectorAll("h1,h2,h3,[role='heading']"))
    .filter(isVisible)
    .map((item) => elementLabel(item))
    .find(Boolean);
  const actions = Array.from(dialog.querySelectorAll("button,[role='button']"))
    .filter(isVisible)
    .map((item) => elementLabel(item))
    .filter(Boolean)
    .slice(0, 6);
  return compact(`${heading ? `título=${heading}; ` : ""}ações=${actions.join(" | ")}`, 180);
}

function collectSemanticPageSnapshot(): SemanticPageSnapshot {
  const root = document.querySelector("main") || document.body;
  const headings = unique(
    Array.from(root.querySelectorAll("h1,h2,h3,[role='heading']"))
      .filter(isVisible)
      .map((item) => elementLabel(item)),
    12,
  );

  const activeNavigation = unique(
    Array.from(document.querySelectorAll("a[aria-current='page'], [data-state='active'], [aria-selected='true']"))
      .filter(isVisible)
      .map((item) => elementLabel(item)),
    10,
  );

  const actions = unique(
    Array.from(root.querySelectorAll("button,[role='button'],a[href]"))
      .filter(isVisible)
      .map((item) => elementLabel(item))
      .filter(Boolean),
    18,
  );

  const fields = unique(
    Array.from(root.querySelectorAll("input,textarea,select"))
      .filter(isVisible)
      .map((item) => fieldDescriptor(item))
      .filter(Boolean),
    16,
  );

  const tables = unique(
    Array.from(root.querySelectorAll("table,[role='table'],[role='grid']"))
      .filter(isVisible)
      .map((item) => tableDescriptor(item)),
    5,
  );

  const dialogs = unique(
    Array.from(document.querySelectorAll("[role='dialog'],[aria-modal='true']"))
      .filter(isVisible)
      .map((item) => dialogDescriptor(item))
      .filter(Boolean),
    4,
  );

  return {
    route: `${window.location.pathname}${window.location.search}`,
    title: maskSensitiveText(document.title || ""),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    scrollY: Math.round(window.scrollY || 0),
    headings,
    activeNavigation,
    actions,
    fields,
    tables,
    dialogs,
  };
}

function compactSnapshot(snapshot: SemanticPageSnapshot, max = 460) {
  const text = [
    `rota=${snapshot.route}`,
    `viewport=${snapshot.viewport}`,
    snapshot.headings.length ? `títulos=${snapshot.headings.join(" | ")}` : "",
    snapshot.activeNavigation.length ? `nav=${snapshot.activeNavigation.join(" | ")}` : "",
    snapshot.actions.length ? `ações=${snapshot.actions.slice(0, 10).join(" | ")}` : "",
    snapshot.fields.length ? `campos=${snapshot.fields.slice(0, 8).join(" | ")}` : "",
    snapshot.tables.length ? `tabelas=${snapshot.tables.slice(0, 2).join(" || ")}` : "",
    snapshot.dialogs.length ? `diálogos=${snapshot.dialogs.join(" || ")}` : "",
  ].filter(Boolean).join("; ");
  return text.slice(0, max);
}

function endpointPath(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return "";
  }
}

function actionDetail(action: any) {
  return action?.detail && typeof action.detail === "object" ? action.detail : {};
}

function executionOutcome(payload: any, data: any, responseStatus: number) {
  const actions = Array.isArray(data?.actions) ? data.actions : [];
  const prAction = [...actions].reverse().find((action: any) => action?.tool === "create_pr" && action?.ok);
  const mergeAction = [...actions].reverse().find((action: any) => action?.tool === "merge_pr" && action?.ok && actionDetail(action)?.merged);
  const compareAction = [...actions].reverse().find((action: any) => action?.tool === "compare_branch" && action?.ok);
  const prDetail = actionDetail(prAction);
  const mergeDetail = actionDetail(mergeAction);
  const compareDetail = actionDetail(compareAction);

  const changedFiles = Array.isArray(prDetail.changedFiles)
    ? prDetail.changedFiles
    : Array.isArray(compareDetail.files)
      ? compareDetail.files.map((file: any) => file?.path).filter(Boolean)
      : [];
  const failures = actions
    .filter((action: any) => action?.ok === false)
    .slice(-8)
    .map((action: any) => maskSensitiveText(`${String(action?.tool ?? "tool")}: ${String(actionDetail(action)?.error ?? "falhou")}`, 500));
  const evidence = [
    prDetail.number ? `PR #${Number(prDetail.number)} criado` : "",
    mergeDetail.sha ? `merge ${String(mergeDetail.sha).slice(0, 12)}` : "",
    mergeDetail.postMergeValidation?.runtime ? `validação pendente em ${String(mergeDetail.postMergeValidation.runtime)}` : "",
  ].filter(Boolean);

  return {
    requestId: String(payload?.requestId ?? "").slice(0, 120),
    route: String(payload?.route ?? `${window.location.pathname}${window.location.search}`).slice(0, 500),
    status: String(data?.status ?? (responseStatus >= 400 ? `http_${responseStatus}` : "completed")).slice(0, 60),
    summary: maskSensitiveText(String(data?.summary ?? data?.error ?? "Execução sem resumo textual."), 1200),
    ...(prDetail.number ? { pullRequestNumber: Number(prDetail.number) } : {}),
    ...(mergeDetail.sha ? { mergeSha: String(mergeDetail.sha).slice(0, 64) } : {}),
    changedFiles: changedFiles.slice(0, 20).map((path: unknown) => String(path).slice(0, 300)),
    engines: Array.isArray(data?.executor?.engines) ? data.executor.engines.slice(0, 5).map((engine: unknown) => String(engine).slice(0, 80)) : [],
    failures,
    evidence,
  };
}

async function persistExecutionOutcome(payload: any, data: any, responseStatus: number, headers?: HeadersInit) {
  const outcome = executionOutcome(payload, data, responseStatus);
  if (!outcome.requestId) return;
  try {
    await originalFetch?.("/api/support/dev/execution-memory", {
      method: "POST",
      headers: headers ?? { "Content-Type": "application/json" },
      body: JSON.stringify(outcome),
      keepalive: true,
    });
  } catch {
    // Memória operacional é best-effort e nunca deve bloquear a execução principal.
  }
}

function installBridge() {
  if (installed || !originalFetch || typeof window === "undefined") return;
  installed = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = endpointPath(input);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!DEV_ENDPOINTS.has(path) || method !== "POST" || typeof init?.body !== "string") {
      return originalFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body);

      if (path.endsWith("/execute")) {
        const response = await originalFetch(input, init);
        try {
          const data = await response.clone().json();
          void persistExecutionOutcome(payload, data, response.status, init?.headers);
        } catch {
          // Resposta sem JSON não interfere na execução principal.
        }
        return response;
      }

      const snapshot = collectSemanticPageSnapshot();

      if (path.endsWith("/cognition")) {
        const recent = Array.isArray(payload.recentMessages) ? payload.recentMessages : [];
        payload.recentMessages = [
          ...recent.slice(-11),
          {
            role: "assistant",
            content: `CONTEXTO VISUAL SEMÂNTICO DA TELA (somente leitura; sem valores de campos): ${JSON.stringify(snapshot)}`,
          },
        ];
      }

      if (path.endsWith("/investigate")) {
        const cognition = payload.cognition && typeof payload.cognition === "object" ? payload.cognition : {};
        const plan = Array.isArray(cognition.investigationPlan) ? cognition.investigationPlan : [];
        cognition.investigationPlan = [
          ...plan.slice(0, 5),
          `CONTEXTO VISUAL: ${compactSnapshot(snapshot)}`,
        ];
        payload.cognition = cognition;
      }

      return originalFetch(input, { ...init, body: JSON.stringify(payload) });
    } catch {
      return originalFetch(input, init);
    }
  };
}

installBridge();
