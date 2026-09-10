const MOBILE_MAX_WIDTH = 768;
const LEGACY_GREETING = "Olá. Sou o JARVIS, seu Agente Mestre no VendorAI. Posso analisar o negócio, orientar o uso do sistema, mostrar prioridades e acompanhar ações que precisam da sua aprovação. Você pode falar, digitar ou anexar documentos e imagens.";
let enhanceScheduled = false;

function isMobileViewport() {
  return window.innerWidth <= MOBILE_MAX_WIDTH || window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function harmonizeJarvisPresence(panel: HTMLElement) {
  const unifiedLauncher = document.querySelector<HTMLElement>("[data-vendorai-unified-assistant]");
  if (unifiedLauncher) {
    unifiedLauncher.dataset.jarvisPanelOpen = "1";
    unifiedLauncher.style.setProperty("display", "none", "important");
  }

  // Defesa de compatibilidade: versões antigas do widget ainda podem montar a saudação
  // institucional. Enquanto a Presence Layer é consolidada no componente React,
  // mostramos uma abertura curta e humana em qualquer viewport.
  const candidates = panel.querySelectorAll<HTMLElement>("div, p, span");
  for (const candidate of candidates) {
    if (candidate.children.length > 0) continue;
    if ((candidate.textContent ?? "").trim() !== LEGACY_GREETING) continue;
    candidate.textContent = "Oi. Tô por aqui.";
    candidate.dataset.jarvisPresenceGreeting = "1";
    break;
  }
}

function restoreUnifiedLauncherWhenClosed() {
  const panel = document.querySelector<HTMLElement>('[aria-label="JARVIS"]');
  if (panel) return;
  const unifiedLauncher = document.querySelector<HTMLElement>("[data-vendorai-unified-assistant]");
  if (!unifiedLauncher || unifiedLauncher.dataset.jarvisPanelOpen !== "1") return;
  unifiedLauncher.style.removeProperty("display");
  delete unifiedLauncher.dataset.jarvisPanelOpen;
}

function applyJarvisMobileLayout() {
  if (!isMobileViewport()) return;
  const panel = document.querySelector<HTMLElement>('[aria-label="JARVIS"]');
  if (!panel) return;

  Object.assign(panel.style, {
    top: "0px",
    right: "0px",
    bottom: "0px",
    left: "0px",
    width: "100vw",
    maxWidth: "100vw",
    height: "100dvh",
    maxHeight: "100dvh",
    borderRadius: "0px",
    borderLeftWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    zIndex: "80",
  });

  const header = panel.firstElementChild as HTMLElement | null;
  if (header) {
    header.style.paddingTop = "max(10px, env(safe-area-inset-top))";
    header.style.paddingBottom = "10px";
  }

  const composer = panel.lastElementChild as HTMLElement | null;
  if (composer) {
    Object.assign(composer.style, {
      position: "sticky",
      bottom: "0px",
      zIndex: "5",
      background: "hsl(var(--background))",
      paddingBottom: "max(10px, env(safe-area-inset-bottom))",
    });
  }

  const conversation = panel.querySelector<HTMLElement>(".flex-1.overflow-y-auto");
  if (conversation) {
    conversation.style.paddingLeft = "10px";
    conversation.style.paddingRight = "10px";
    conversation.style.scrollPaddingBottom = "100px";
  }

  const textarea = panel.querySelector<HTMLTextAreaElement>("textarea");
  if (textarea) {
    textarea.setAttribute("enterkeyhint", "send");
    textarea.style.fontSize = "16px";
  }

  const openToggle = document.querySelector<HTMLButtonElement>('button[aria-label="Abrir JARVIS"]');
  const toggleContainer = openToggle?.parentElement as HTMLElement | null;
  if (toggleContainer) toggleContainer.style.display = "none";

  const replay = document.querySelector<HTMLElement>(".jarvis-voice-replay-control");
  if (replay) {
    Object.assign(replay.style, {
      top: "8px",
      right: "76px",
      bottom: "auto",
      zIndex: "90",
    });
  }
}

function restoreToggleWhenClosed() {
  const panel = document.querySelector<HTMLElement>('[aria-label="JARVIS"]');
  if (panel) return;
  const openToggle = document.querySelector<HTMLButtonElement>('button[aria-label="Abrir JARVIS"]');
  const toggleContainer = openToggle?.parentElement as HTMLElement | null;
  if (toggleContainer) toggleContainer.style.display = "";
}

function setupKeyboardSend(panel: HTMLElement) {
  const textarea = panel.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea || textarea.dataset.jarvisEnterBound === "1") return;
  textarea.dataset.jarvisEnterBound = "1";
  textarea.setAttribute("enterkeyhint", "send");

  textarea.addEventListener("keyup", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const sendButton = panel.querySelector<HTMLButtonElement>('button[title="Enviar"]');
    if (textarea.value.trim() && sendButton && !sendButton.disabled) sendButton.click();
  });
}

function setupVoiceAutoSend(panel: HTMLElement) {
  const micButton = panel.querySelector<HTMLButtonElement>('button[title="Falar com JARVIS"], button[title="Parar de ouvir"]');
  if (!micButton || micButton.dataset.jarvisVoiceAutoSend === "1") return;
  micButton.dataset.jarvisVoiceAutoSend = "1";

  micButton.addEventListener("click", () => {
    const textarea = panel.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) return;
    const before = textarea.value.trim();
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      const currentPanel = document.querySelector<HTMLElement>('[aria-label="JARVIS"]');
      if (!currentPanel) {
        clearInterval(timer);
        return;
      }
      const currentMic = currentPanel.querySelector<HTMLButtonElement>('button[title="Falar com JARVIS"], button[title="Parar de ouvir"]');
      const currentTextarea = currentPanel.querySelector<HTMLTextAreaElement>("textarea");
      const sendButton = currentPanel.querySelector<HTMLButtonElement>('button[title="Enviar"]');
      const text = currentTextarea?.value.trim() ?? "";
      const recognitionFinished = currentMic?.title === "Falar com JARVIS";
      const hasNewTranscript = Boolean(text) && text !== before;

      if (recognitionFinished && hasNewTranscript && sendButton && !sendButton.disabled) {
        clearInterval(timer);
        setTimeout(() => sendButton.click(), 80);
        return;
      }
      if (Date.now() - startedAt > 15000) clearInterval(timer);
    }, 180);
  });
}

function enhance() {
  const panel = document.querySelector<HTMLElement>('[aria-label="JARVIS"]');
  if (!panel) {
    restoreToggleWhenClosed();
    restoreUnifiedLauncherWhenClosed();
    return;
  }
  harmonizeJarvisPresence(panel);
  applyJarvisMobileLayout();
  setupKeyboardSend(panel);
  setupVoiceAutoSend(panel);
}

function scheduleEnhance() {
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  window.requestAnimationFrame(() => {
    enhanceScheduled = false;
    enhance();
  });
}

if (typeof window !== "undefined") {
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "disabled", "style"],
  });
  window.addEventListener("resize", scheduleEnhance, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleEnhance, { passive: true });
  queueMicrotask(scheduleEnhance);
}

export {};
