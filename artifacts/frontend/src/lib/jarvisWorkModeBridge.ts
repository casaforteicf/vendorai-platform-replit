type WorkStatus = "idle" | "analisando" | "executando" | "validando" | "aguardando_aprovacao" | "concluido" | "erro";

type AgentTaskLike = {
  id?: string;
  agentName?: string;
  actionType?: string;
  status?: "pendente_aprovacao" | "aprovado" | "executando" | "concluido" | "rejeitado" | "erro";
  createdAt?: string;
};

type WorkState = {
  task: string;
  status: WorkStatus;
  activity: string[];
  pending: string[];
  updatedAt: number;
};

const STORAGE_KEY = "jarvis_work_mode_state_v2";
const PANEL_ATTR = "data-jarvis-work-mode";
const STATUS_LABELS: Record<WorkStatus, string> = {
  idle: "Pronto",
  analisando: "Analisando",
  executando: "Executando",
  validando: "Validando",
  aguardando_aprovacao: "Aguardando aprovação",
  concluido: "Concluído",
  erro: "Erro",
};
const STATUS_ORDER: WorkStatus[] = ["analisando", "executando", "validando", "concluido"];

let state: WorkState = {
  task: "Aguardando comando",
  status: "idle",
  activity: [],
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
      task: typeof parsed.task === "string" && parsed.task ? parsed.task : "Aguardando comando",
      status: parsed.status && parsed.status in STATUS_LABELS ? parsed.status as WorkStatus : "idle",
      activity: Array.isArray(parsed.activity) ? parsed.activity.slice(0, 4) : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending.slice(0, 3) : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    // Estado auxiliar: nunca pode bloquear o JARVIS.
  }
}

function persistState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Estado auxiliar: nunca pode bloquear o JARVIS.
  }
}

function setState(patch: Partial<WorkState>) {
  state = { ...state, ...patch, updatedAt: Date.now() };
  persistState();
  render();
}

function addActivity(message: string) {
  const next = [message, ...state.activity.filter((item) => item !== message)].slice(0, 4);
  setState({ activity: next });
}

function cleanLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function compactTask(text: string) {
  const cleaned = text
    .replace(/\[Anexo:[^\]]+\]/gi, "")
    .replace(/\[[\s\S]*?\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Comando do JARVIS";
  return cleaned.length > 110 ? `${cleaned.slice(0, 107)}…` : cleaned;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char] ?? char));
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

function extractSignals(text: string) {
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 180);
  const activity = lines
    .filter((line) => /\b(corrigi|corrigido|ajustei|ajustado|alterei|alterado|atualizei|atualizado|implementei|implementado|apliquei|aplicado|resolvi|resolvido|concluí|concluido|concluído|validei|validado)\b/i.test(line))
    .slice(0, 3);
  const pending = lines
    .filter((line) => /\b(pendente|pendência|falta|faltam|resta|restam|próximo passo|precisa|necessário|não consegui|não foi possível|aguardando|validar)\b/i.test(line))
    .slice(0, 3);
  return { activity, pending };
}

function mapTaskStatus(task: AgentTaskLike): WorkStatus {
  if (task.status === "pendente_aprovacao" || task.status === "aprovado") return "aguardando_aprovacao";
  if (task.status === "executando") return "executando";
  if (task.status === "concluido") return "concluido";
  if (task.status === "erro" || task.status === "rejeitado") return "erro";
  return state.status;
}

function updateFromAgentTasks(tasks: AgentTaskLike[]) {
  const sorted = [...tasks].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  const pendingTasks = sorted.filter((task) => task.status === "pendente_aprovacao" || task.status === "aprovado");
  const active = sorted.find((task) => ["pendente_aprovacao", "aprovado", "executando"].includes(String(task.status)))
    ?? sorted.find((task) => ["concluido", "erro", "rejeitado"].includes(String(task.status)));

  const pending = pendingTasks.slice(0, 3).map((task) => {
    const action = cleanLabel(task.actionType ?? "ação");
    return task.status === "aprovado" ? `${action}: aprovado, aguardando execução` : `${action}: aguardando aprovação`;
  });

  if (!active) {
    setState({ pending });
    return;
  }

  const action = cleanLabel(active.actionType ?? "ação do JARVIS");
  const status = mapTaskStatus(active);
  const activity = [...state.activity];
  if (active.status === "executando") activity.unshift(`${action}: execução iniciada`);
  if (active.status === "concluido") activity.unshift(`${action}: concluída`);
  if (active.status === "erro") activity.unshift(`${action}: terminou com erro`);
  if (active.status === "rejeitado") activity.unshift(`${action}: rejeitada`);

  setState({
    task: action || state.task,
    status,
    pending,
    activity: Array.from(new Set(activity)).slice(0, 4),
  });
}

function ensureStyle() {
  if (document.getElementById("jarvis-work-mode-style")) return;
  const style = document.createElement("style");
  style.id = "jarvis-work-mode-style";
  style.textContent = `
    .jarvis-work-mode{border-bottom:1px solid hsl(var(--border));background:hsl(var(--muted)/.22);padding:9px 12px}
    .jarvis-work-summary{width:100%;display:flex;align-items:center;gap:9px;text-align:left}
    .jarvis-work-main{min-width:0;flex:1;display:flex;flex-direction:column}
    .jarvis-work-kicker{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:hsl(var(--muted-foreground))}
    .jarvis-work-task{font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .jarvis-work-status{display:inline-flex;align-items:center;gap:5px;border:1px solid hsl(var(--border));background:hsl(var(--background));border-radius:999px;padding:3px 7px;font-size:10px;white-space:nowrap}
    .jarvis-work-dot{width:7px;height:7px;border-radius:999px;background:hsl(var(--muted-foreground))}.jarvis-work-dot.is-active{background:hsl(var(--primary))}.jarvis-work-dot.is-done{background:#16a34a}.jarvis-work-dot.is-error{background:hsl(var(--destructive))}
    .jarvis-work-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:7px}.jarvis-work-progress span{height:4px;border-radius:999px;background:hsl(var(--muted))}.jarvis-work-progress span.active{background:hsl(var(--primary))}
    .jarvis-work-details{margin-top:8px}.jarvis-work-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.jarvis-work-box{border:1px solid hsl(var(--border));border-radius:9px;background:hsl(var(--background)/.82);padding:7px 8px;min-width:0}.jarvis-work-section-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:hsl(var(--muted-foreground))}.jarvis-work-item{font-size:10px;line-height:1.25;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jarvis-work-empty{font-size:10px;color:hsl(var(--muted-foreground));margin-top:3px}
    @media(max-width:640px){.jarvis-work-mode{padding:7px 10px}.jarvis-work-columns{display:none}.jarvis-work-details{margin-top:0}.jarvis-work-status{font-size:9px}.jarvis-work-task{font-size:11px}}
  `;
  document.head.appendChild(style);
}

function statusDotClass(status: WorkStatus) {
  if (status === "concluido") return "is-done";
  if (status === "erro") return "is-error";
  if (status === "idle") return "";
  return "is-active";
}

function renderItems(items: string[], empty: string) {
  if (!items.length) return `<div class="jarvis-work-empty">${escapeHtml(empty)}</div>`;
  return items.slice(0, 2).map((item) => `<div class="jarvis-work-item" title="${escapeHtml(item)}">${escapeHtml(item)}</div>`).join("");
}

function ensureWorkPanel(panel: HTMLElement) {
  let work = panel.querySelector<HTMLElement>(`[${PANEL_ATTR}]`);
  if (work) return work;
  work = document.createElement("section");
  work.setAttribute(PANEL_ATTR, "true");
  work.className = "jarvis-work-mode";
  const header = panel.firstElementChild;
  if (header?.nextSibling) panel.insertBefore(work, header.nextSibling);
  else panel.appendChild(work);
  return work;
}

function render() {
  ensureStyle();
  const panel = getPanel();
  if (!panel) return;
  const work = ensureWorkPanel(panel);
  const stepIndex = STATUS_ORDER.indexOf(state.status);
  const activeThrough = state.status === "aguardando_aprovacao" ? 1 : stepIndex;
  const progress = STATUS_ORDER.map((_, index) => `<span class="${activeThrough >= index ? "active" : ""}"></span>`).join("");
  work.innerHTML = `
    <button type="button" class="jarvis-work-summary" aria-expanded="false">
      <span class="jarvis-work-main"><span class="jarvis-work-kicker">Modo Trabalho</span><span class="jarvis-work-task" title="${escapeHtml(state.task)}">${escapeHtml(state.task)}</span></span>
      <span class="jarvis-work-status"><span class="jarvis-work-dot ${statusDotClass(state.status)}"></span>${STATUS_LABELS[state.status]}</span>
    </button>
    <div class="jarvis-work-progress" aria-label="Analisando, Executando, Validando, Concluído">${progress}</div>
    <div class="jarvis-work-details" hidden>
      <div class="jarvis-work-columns">
        <div class="jarvis-work-box"><div class="jarvis-work-section-title">Atividade</div>${renderItems(state.activity, "Nenhuma atividade registrada")}</div>
        <div class="jarvis-work-box"><div class="jarvis-work-section-title">Pendências</div>${renderItems(state.pending, "Nenhuma pendência")}</div>
      </div>
    </div>`;
  const summary = work.querySelector<HTMLButtonElement>(".jarvis-work-summary");
  const details = work.querySelector<HTMLElement>(".jarvis-work-details");
  summary?.addEventListener("click", () => {
    if (!summary || !details) return;
    const expanded = summary.getAttribute("aria-expanded") === "true";
    summary.setAttribute("aria-expanded", String(!expanded));
    details.hidden = expanded;
  });
}

function scheduleCompletion(assistantText: string) {
  if (completionTimer) window.clearTimeout(completionTimer);
  completionTimer = window.setTimeout(() => {
    const signals = extractSignals(assistantText);
    setState({
      status: state.status === "aguardando_aprovacao" ? "aguardando_aprovacao" : "concluido",
      activity: signals.activity.length ? signals.activity : ["Resposta concluída"],
      pending: state.pending.length ? state.pending : signals.pending,
    });
  }, 900);
}

function inspectChat() {
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
    setState({ task: compactTask(userText), status: "analisando", activity: ["Comando recebido"], pending: [] });
    return;
  }
  if (!userText) return;
  if (!assistantText && lastUserText === userText) {
    if (state.status === "analisando") setState({ status: "executando", activity: ["JARVIS iniciou a execução", ...state.activity].slice(0, 4) });
    return;
  }
  if (assistantText && assistantText !== lastAssistantText) {
    lastAssistantText = assistantText;
    if (state.status !== "aguardando_aprovacao") setState({ status: "validando" });
    scheduleCompletion(assistantText);
  }
}

function installFetchBridge() {
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isAgentTasks = /\/api\/tenants\/[^/]+\/agent-tasks(?:\/|\?|$)/.test(url);
    try {
      const response = await previousFetch(input, init);
      if (isAgentTasks && response.ok) {
        void response.clone().json().then((data: unknown) => {
          const rows = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
          updateFromAgentTasks(rows as AgentTaskLike[]);
        }).catch(() => undefined);
      }
      return response;
    } catch (error) {
      if (/\/api\/support\/chat(?:\?|$)/.test(url)) setState({ status: "erro", activity: ["Conexão interrompida", ...state.activity].slice(0, 4) });
      throw error;
    }
  };
}

if (typeof window !== "undefined") {
  loadState();
  installFetchBridge();
  const observer = new MutationObserver(inspectChat);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.setInterval(inspectChat, 500);
  window.addEventListener("vendorai:open-support", () => window.setTimeout(inspectChat, 80));
  window.addEventListener("beforeunload", persistState);
  window.setTimeout(inspectChat, 150);
}

export {};
