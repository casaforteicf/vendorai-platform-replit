type WorkStatus = "idle" | "analisando" | "executando" | "validando" | "concluido";

type WorkState = {
  task: string;
  status: WorkStatus;
  changes: string[];
  pending: string[];
  updatedAt: number;
};

const STORAGE_KEY = "jarvis_work_mode_state";
const PANEL_ATTR = "data-jarvis-work-mode";
const STATUS_LABELS: Record<WorkStatus, string> = {
  idle: "Aguardando",
  analisando: "Analisando",
  executando: "Executando",
  validando: "Validando",
  concluido: "Concluído",
};

let state: WorkState = {
  task: "",
  status: "idle",
  changes: [],
  pending: [],
  updatedAt: Date.now(),
};
let lastUserText = "";
let lastAssistantText = "";
let completionTimer: number | null = null;

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<WorkState>;
    state = {
      task: typeof parsed.task === "string" ? parsed.task : "",
      status: (parsed.status && parsed.status in STATUS_LABELS ? parsed.status : "idle") as WorkStatus,
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 3) : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending.slice(0, 3) : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    // Estado auxiliar: falha de persistência nunca deve afetar o chat.
  }
}

function persistState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Estado auxiliar: falha de persistência nunca deve afetar o chat.
  }
}

function getPanel() {
  return document.querySelector<HTMLElement>('div[aria-label="JARVIS"]');
}

function getConversationArea(panel: HTMLElement) {
  return panel.querySelector<HTMLElement>(".flex-1.overflow-y-auto");
}

function getChatTexts(panel: HTMLElement) {
  const area = getConversationArea(panel);
  if (!area) return { users: [] as string[], assistants: [] as string[] };

  const users: string[] = [];
  const assistants: string[] = [];
  for (const wrapper of Array.from(area.children)) {
    const bubble = wrapper.querySelector<HTMLElement>("div");
    if (!bubble) continue;
    const text = (bubble.innerText || bubble.textContent || "").trim();
    if (bubble.classList.contains("rounded-br-sm")) users.push(text);
    if (bubble.classList.contains("rounded-bl-sm") && bubble.classList.contains("bg-muted")) assistants.push(text);
  }
  return { users, assistants };
}

function compactTask(text: string) {
  return text
    .replace(/\[Anexo:[^\]]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function extractSignals(text: string) {
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 180);

  const changes = lines
    .filter((line) => /\b(corrigi|corrigido|ajustei|ajustado|alterei|alterado|atualizei|atualizado|implementei|implementado|criei|criado|apliquei|aplicado|resolvi|resolvido|concluí|concluido|concluído)\b/i.test(line))
    .slice(0, 3);

  const pending = lines
    .filter((line) => /\b(pendente|pendência|falta|faltam|resta|restam|ainda|próximo passo|precisa|necessário|não consegui|não foi possível|aguardando|validar)\b/i.test(line))
    .slice(0, 3);

  return { changes, pending };
}

function setState(patch: Partial<WorkState>) {
  state = { ...state, ...patch, updatedAt: Date.now() };
  persistState();
  render();
}

function statusDotClass(status: WorkStatus) {
  if (status === "concluido") return "is-done";
  if (status === "idle") return "is-idle";
  return "is-active";
}

function renderList(items: string[], emptyText: string) {
  if (!items.length) return `<div class="jarvis-work-empty">${emptyText}</div>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureWorkPanel(panel: HTMLElement) {
  let work = panel.querySelector<HTMLElement>(`[${PANEL_ATTR}]`);
  if (work) return work;

  work = document.createElement("section");
  work.setAttribute(PANEL_ATTR, "true");
  work.className = "jarvis-work-mode";
  work.innerHTML = `
    <button type="button" class="jarvis-work-summary" aria-expanded="false">
      <span class="jarvis-work-icon" aria-hidden="true">◈</span>
      <span class="jarvis-work-main">
        <span class="jarvis-work-kicker">Modo Trabalho</span>
        <span class="jarvis-work-task">Aguardando uma tarefa</span>
      </span>
      <span class="jarvis-work-status"><span class="jarvis-work-dot is-idle"></span><span>Aguardando</span></span>
      <span class="jarvis-work-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="jarvis-work-details" hidden>
      <div class="jarvis-work-columns">
        <div>
          <div class="jarvis-work-section-title">Alterações</div>
          <div class="jarvis-work-changes"></div>
        </div>
        <div>
          <div class="jarvis-work-section-title">Pendências</div>
          <div class="jarvis-work-pending"></div>
        </div>
      </div>
    </div>`;

  const header = panel.firstElementChild;
  if (header?.nextSibling) panel.insertBefore(work, header.nextSibling);
  else panel.appendChild(work);

  const summary = work.querySelector<HTMLButtonElement>(".jarvis-work-summary");
  const details = work.querySelector<HTMLElement>(".jarvis-work-details");
  summary?.addEventListener("click", () => {
    if (!details || !summary) return;
    const expanded = summary.getAttribute("aria-expanded") === "true";
    summary.setAttribute("aria-expanded", String(!expanded));
    details.hidden = expanded;
  });

  return work;
}

function render() {
  const panel = getPanel();
  if (!panel) return;
  const work = ensureWorkPanel(panel);
  const task = work.querySelector<HTMLElement>(".jarvis-work-task");
  const status = work.querySelector<HTMLElement>(".jarvis-work-status");
  const changes = work.querySelector<HTMLElement>(".jarvis-work-changes");
  const pending = work.querySelector<HTMLElement>(".jarvis-work-pending");

  if (task) task.textContent = state.task || "Aguardando uma tarefa";
  if (status) {
    status.innerHTML = `<span class="jarvis-work-dot ${statusDotClass(state.status)}"></span><span>${STATUS_LABELS[state.status]}</span>`;
  }
  if (changes) changes.innerHTML = renderList(state.changes, state.status === "concluido" ? "Nenhuma alteração explícita detectada na resposta." : "As alterações aparecerão aqui durante a execução.");
  if (pending) pending.innerHTML = renderList(state.pending, state.status === "concluido" ? "Nenhuma pendência explícita detectada." : "Pendências serão destacadas quando identificadas.");
}

function scheduleCompletion(assistantText: string) {
  if (completionTimer) window.clearTimeout(completionTimer);
  completionTimer = window.setTimeout(() => {
    const signals = extractSignals(assistantText);
    setState({
      status: "concluido",
      changes: signals.changes,
      pending: signals.pending,
    });
  }, 900);
}

function inspect() {
  const panel = getPanel();
  if (!panel) return;
  render();

  const { users, assistants } = getChatTexts(panel);
  const userText = users.at(-1)?.trim() ?? "";
  const assistantText = assistants.at(-1)?.trim() ?? "";

  if (userText && userText !== lastUserText) {
    lastUserText = userText;
    lastAssistantText = "";
    if (completionTimer) window.clearTimeout(completionTimer);
    setState({
      task: compactTask(userText),
      status: "analisando",
      changes: [],
      pending: [],
    });
    return;
  }

  if (!userText) return;

  if (!assistantText && lastUserText === userText) {
    if (state.status === "analisando") setState({ status: "executando" });
    return;
  }

  if (assistantText && assistantText !== lastAssistantText) {
    lastAssistantText = assistantText;
    if (state.status !== "validando") setState({ status: "validando" });
    scheduleCompletion(assistantText);
  }
}

if (typeof window !== "undefined") {
  loadState();
  const observer = new MutationObserver(inspect);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.setInterval(inspect, 500);
  window.addEventListener("beforeunload", persistState);
  window.setTimeout(inspect, 150);
}

export {};
