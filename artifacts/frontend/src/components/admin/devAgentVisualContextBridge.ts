export {};

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

type ValidationLink = {
  requestId: string;
  route: string;
  revision: string;
  pullRequestNumber?: number;
  recordedAt: string;
};

const DEV_ENDPOINTS = new Set([
  "/api/support/dev/cognition",
  "/api/support/dev/investigate",
  "/api/support/dev/execute",
  "/api/support/dev/validate-production",
]);

const VALIDATION_LINKS_STORAGE = "vendorai_dev_ia_validation_links_v1";
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

function normalizeRevision(value: unknown) {
  const revision = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(revision) ? revision : "";
}

function revisionsMatch(a: string, b: string) {
  return Boolean(a && b && (a === b || a.startsWith(b) || b.startsWith(a)));
}

function readValidationLinks(): ValidationLink[] {
  try {
    const raw = localStorage.getItem(VALIDATION_LINKS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function writeValidationLinks(links: ValidationLink[]) {
  try {
    localStorage.setItem(VALIDATION_LINKS_STORAGE, JSON.stringify(links.slice(0, 30)));
  } catch {
    // Correlação é best-effort e não pode bloquear o Dev IA.
  }
}

function rememberValidationLink(link: ValidationLink) {
  const revision = normalizeRevision(link.revision);
  if (!link.requestId || !revision) return;
  const next: ValidationLink = {
    requestId: String(link.requestId).slice(0, 120),
    route: String(link.route || "/").slice(0, 500),
    revision,
    ...(link.pullRequestNumber && link.pullRequestNumber > 0 ? { pullRequestNumber: Math.trunc(link.pullRequestNumber) } : {}),
    recordedAt: new Date().toISOString(),
  };
  const links = readValidationLinks().filter((item) => !revisionsMatch(item.revision, revision));
  writeValidationLinks([next, ...links]);
}

function findValidationLink(revision: unknown) {
  const normalized = normalizeRevision(revision);
  if (!normalized) return null;
  return readValidationLinks().find((item) => revisionsMatch(item.revision, normalized)) ?? null;
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

function rememberExecutionForValidation(payload: any, data: any) {
  const actions = Array.isArray(data?.actions) ? data.actions : [];
  const mergeAction = [...actions].reverse().find((action: any) => action?.tool === "merge_pr" && action?.ok && actionDetail(action)?.merged);
  const prAction = [...actions].reverse().find((action: any) => action?.tool === "create_pr" && action?.ok);
  const mergeDetail = actionDetail(mergeAction);
  const prDetail = actionDetail(prAction);
  if (!mergeDetail.sha || !payload?.requestId) return;
  rememberValidationLink({
    requestId: String(payload.requestId),
    route: String(payload.route ?? `${window.location.pathname}${window.location.search}`),
    revision: String(mergeDetail.sha),
    ...(prDetail.number ? { pullRequestNumber: Number(prDetail.number) } : {}),
    recordedAt: new Date().toISOString(),
  });
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

function validationOutcome(payload: any, data: any, responseStatus: number) {
  const expectedRevision = normalizeRevision(payload?.expectedRevision ?? data?.expectedRevision ?? data?.observedRevision);
  const link = findValidationLink(expectedRevision);
  if (!link) return null;

  const state = String(data?.state ?? (responseStatus >= 400 ? `http_${responseStatus}` : "unknown"));
  const observedRevision = normalizeRevision(data?.observedRevision);
  const runtime = String(data?.runtime ?? "unknown").slice(0, 40);
  const changedFiles = Array.isArray(data?.evidence?.changedFiles)
    ? data.evidence.changedFiles.slice(0, 20).map((path: unknown) => String(path).slice(0, 300))
    : [];
  const validated = state === "validated";

  return {
    requestId: link.requestId,
    route: link.route,
    status: `production_${state}`.slice(0, 60),
    summary: maskSensitiveText(
      validated
        ? `Produção validada em ${runtime} para a revisão ${observedRevision || expectedRevision}.`
        : `Validação de produção em ${runtime}: estado ${state}; revisão esperada ${expectedRevision || "desconhecida"}; observada ${observedRevision || "desconhecida"}.`,
      1200,
    ),
    ...(link.pullRequestNumber ? { pullRequestNumber: link.pullRequestNumber } : {}),
    ...(expectedRevision ? { mergeSha: expectedRevision } : {}),
    changedFiles,
    engines: [],
    failures: validated ? [] : [`production_validation:${state}`],
    evidence: [
      `runtime=${runtime}`,
      expectedRevision ? `expected=${expectedRevision.slice(0, 12)}` : "",
      observedRevision ? `observed=${observedRevision.slice(0, 12)}` : "",
      data?.mainRevision ? `main=${String(data.mainRevision).slice(0, 12)}` : "",
    ].filter(Boolean),
  };
}

async function persistValidationOutcome(payload: any, data: any, responseStatus: number, headers?: HeadersInit) {
  const outcome = validationOutcome(payload, data, responseStatus);
  if (!outcome) return;
  try {
    await originalFetch?.("/api/support/dev/execution-memory", {
      method: "POST",
      headers: headers ?? { "Content-Type": "application/json" },
      body: JSON.stringify(outcome),
      keepalive: true,
    });
  } catch {
    // Aprendizado pós-deploy é best-effort e nunca bloqueia a validação.
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
          rememberExecutionForValidation(payload, data);
          void persistExecutionOutcome(payload, data, response.status, init?.headers);
        } catch {
          // Resposta sem JSON não interfere na execução principal.
        }
        return response;
      }

      if (path.endsWith("/validate-production")) {
        const response = await originalFetch(input, init);
        try {
          const data = await response.clone().json();
          void persistValidationOutcome(payload, data, response.status, init?.headers);
        } catch {
          // Resposta sem JSON não interfere na validação principal.
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
