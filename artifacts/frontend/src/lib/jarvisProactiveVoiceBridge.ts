import { speakJarvis, VOICE_SETTING_KEY } from "./jarvisVoiceResponseBridge";

type ProactiveItem = {
  id: string;
  title: string;
  priorityScore: number;
  recommendedAction?: string | null;
  updatedAt?: string | null;
  explicitFinancialImpact?: { amount: number } | null;
  historicalFinancialEstimate?: {
    medianAmount: number;
    sampleSize: number;
    confidence: number;
  } | null;
};

type ProactivityResponse = {
  proactivity?: {
    interruptNow?: ProactiveItem[];
  };
};

const POLL_MS = 120_000;
const SEEN_KEY = "jarvis_proactive_alerts_seen_v1";
const MUTE_UNTIL_KEY = "jarvis_proactive_voice_muted_until";
const ALERT_EVENT = "vendorai:jarvis-proactive-alert";
const MAX_SEEN_AGE_MS = 12 * 60 * 60 * 1000;

let armedByUserGesture = false;
let polling = false;
let pollTimer: number | null = null;

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function alertFingerprint(item: ProactiveItem) {
  return [item.id, item.priorityScore, item.updatedAt ?? "", item.title].join("|");
}

function loadSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, number> : {};
    const cutoff = Date.now() - MAX_SEEN_AGE_MS;
    return Object.fromEntries(Object.entries(parsed).filter(([, timestamp]) => Number(timestamp) >= cutoff));
  } catch {
    return {};
  }
}

function markSeen(item: ProactiveItem) {
  try {
    const seen = loadSeen();
    seen[alertFingerprint(item)] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Deduplicação é auxiliar e não deve bloquear alertas.
  }
}

function wasSeen(item: ProactiveItem) {
  return Boolean(loadSeen()[alertFingerprint(item)]);
}

function mutedUntil() {
  const value = Number(localStorage.getItem(MUTE_UNTIL_KEY) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function muteForOneHour() {
  localStorage.setItem(MUTE_UNTIL_KEY, String(Date.now() + 60 * 60 * 1000));
  window.speechSynthesis?.cancel();
}

function canSpeakProactively() {
  if (!armedByUserGesture) return false;
  if (document.visibilityState !== "visible") return false;
  if (localStorage.getItem(VOICE_SETTING_KEY) === "off") return false;
  if (Date.now() < mutedUntil()) return false;
  if ("speechSynthesis" in window && window.speechSynthesis.speaking) return false;

  const panel = document.querySelector<HTMLElement>('div[aria-label="JARVIS"]');
  const textarea = panel?.querySelector<HTMLTextAreaElement>("textarea");
  if (textarea?.disabled) return false;
  return true;
}

function spokenAlert(item: ProactiveItem) {
  const financial = item.explicitFinancialImpact?.amount != null
    ? ` Impacto informado de ${formatBrl(item.explicitFinancialImpact.amount)}.`
    : item.historicalFinancialEstimate
      ? ` Há precedente histórico com mediana de ${formatBrl(item.historicalFinancialEstimate.medianAmount)}.`
      : "";
  return `JARVIS detectou uma prioridade alta. ${item.title}. Prioridade ${item.priorityScore} de 100.${financial} Posso abrir os detalhes.`;
}

function ensureStyle() {
  if (document.getElementById("jarvis-proactive-alert-style")) return;
  const style = document.createElement("style");
  style.id = "jarvis-proactive-alert-style";
  style.textContent = `
    .jarvis-proactive-alert{position:fixed;right:16px;bottom:80px;z-index:70;width:min(390px,calc(100vw - 32px));border:1px solid hsl(var(--border));background:hsl(var(--background));color:hsl(var(--foreground));box-shadow:0 18px 50px rgb(0 0 0/.18);border-radius:16px;padding:12px}
    .jarvis-proactive-alert__top{display:flex;align-items:flex-start;gap:10px}.jarvis-proactive-alert__badge{flex:0 0 auto;border-radius:999px;background:hsl(var(--primary)/.12);color:hsl(var(--primary));font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:4px 7px}.jarvis-proactive-alert__body{min-width:0;flex:1}.jarvis-proactive-alert__title{font-size:13px;font-weight:700;line-height:1.3}.jarvis-proactive-alert__meta{margin-top:3px;font-size:10px;color:hsl(var(--muted-foreground))}.jarvis-proactive-alert__actions{display:flex;gap:7px;margin-top:10px}.jarvis-proactive-alert__actions button{height:32px;border-radius:9px;border:1px solid hsl(var(--border));padding:0 10px;font-size:11px;font-weight:600;background:hsl(var(--background));color:hsl(var(--foreground))}.jarvis-proactive-alert__actions button:first-child{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-color:hsl(var(--primary))}
    @media(max-width:640px){.jarvis-proactive-alert{right:10px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 64px));width:calc(100vw - 20px)}}
  `;
  document.head.appendChild(style);
}

function dismissAlert() {
  document.querySelector<HTMLElement>(".jarvis-proactive-alert")?.remove();
}

function showAlert(item: ProactiveItem) {
  ensureStyle();
  dismissAlert();

  const element = document.createElement("aside");
  element.className = "jarvis-proactive-alert";
  element.setAttribute("role", "status");
  const financial = item.explicitFinancialImpact?.amount != null
    ? ` · ${formatBrl(item.explicitFinancialImpact.amount)}`
    : "";
  element.innerHTML = `
    <div class="jarvis-proactive-alert__top">
      <span class="jarvis-proactive-alert__badge">Prioridade alta</span>
      <div class="jarvis-proactive-alert__body">
        <div class="jarvis-proactive-alert__title"></div>
        <div class="jarvis-proactive-alert__meta">Prioridade ${item.priorityScore}/100${financial}</div>
      </div>
    </div>
    <div class="jarvis-proactive-alert__actions">
      <button type="button" data-action="open">Abrir JARVIS</button>
      <button type="button" data-action="mute">Silenciar 1h</button>
      <button type="button" data-action="dismiss">Agora não</button>
    </div>`;

  const title = element.querySelector<HTMLElement>(".jarvis-proactive-alert__title");
  if (title) title.textContent = item.title;

  element.querySelector<HTMLButtonElement>('[data-action="open"]')?.addEventListener("click", () => {
    dismissAlert();
    window.dispatchEvent(new CustomEvent("vendorai:open-support", {
      detail: { question: `Detalhe esta prioridade: ${item.title}` },
    }));
  });
  element.querySelector<HTMLButtonElement>('[data-action="mute"]')?.addEventListener("click", () => {
    muteForOneHour();
    dismissAlert();
  });
  element.querySelector<HTMLButtonElement>('[data-action="dismiss"]')?.addEventListener("click", dismissAlert);

  document.body.appendChild(element);
  window.dispatchEvent(new CustomEvent(ALERT_EVENT, { detail: item }));
}

async function pollProactivity() {
  if (polling || document.visibilityState !== "visible") return;
  if (Date.now() < mutedUntil()) return;
  const token = localStorage.getItem("vendorai_token");
  if (!token) return;

  polling = true;
  try {
    const response = await fetch("/api/jarvis/proactivity", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const data = await response.json() as ProactivityResponse;
    const item = (data.proactivity?.interruptNow ?? []).find((candidate) => !wasSeen(candidate));
    if (!item) return;

    markSeen(item);
    showAlert(item);
    if (canSpeakProactively()) speakJarvis(spokenAlert(item));
  } catch {
    // Proatividade nunca deve afetar o funcionamento normal do sistema.
  } finally {
    polling = false;
  }
}

function schedulePolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => void pollProactivity(), POLL_MS);
}

if (typeof window !== "undefined") {
  const arm = () => {
    armedByUserGesture = true;
  };
  window.addEventListener("pointerdown", arm, { passive: true });
  window.addEventListener("keydown", arm, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pollProactivity();
  });
  window.addEventListener("focus", () => void pollProactivity());
  schedulePolling();
  window.setTimeout(() => void pollProactivity(), 5_000);
}

export { ALERT_EVENT };
