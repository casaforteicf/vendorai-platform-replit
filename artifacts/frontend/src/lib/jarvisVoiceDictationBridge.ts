export {};

const POLL_MS = 120;
const RESTART_DELAY_MS = 320;
const FINALIZE_DELAY_MS = 520;

let sessionActive = false;
let wasListening = false;
let segmentStartValue = "";
let lastKnownValue = "";
let manualStopRequested = false;
let bypassSendGuard = false;
let restartTimer: number | null = null;
let finalizeTimer: number | null = null;

function getPanel() {
  return document.querySelector<HTMLElement>('div[aria-label="JARVIS"]');
}

function getTextarea() {
  return getPanel()?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
}

function getMicButton() {
  const panel = getPanel();
  if (!panel) return null;
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      const title = button.getAttribute("title") ?? "";
      return title === "Falar com JARVIS" || title === "Parar de ouvir";
    }) ?? null;
}

function getSendButton() {
  const panel = getPanel();
  if (!panel) return null;
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.getAttribute("title") === "Enviar") ?? null;
}

function clearTimers() {
  if (restartTimer != null) window.clearTimeout(restartTimer);
  if (finalizeTimer != null) window.clearTimeout(finalizeTimer);
  restartTimer = null;
  finalizeTimer = null;
}

function finishSessionAndSend(delay = FINALIZE_DELAY_MS) {
  clearTimers();
  finalizeTimer = window.setTimeout(() => {
    const textarea = getTextarea();
    const send = getSendButton();
    const value = textarea?.value.trim() ?? "";
    if (!sessionActive || !value || !send || send.disabled) {
      sessionActive = false;
      return;
    }

    sessionActive = false;
    manualStopRequested = false;
    bypassSendGuard = true;
    try {
      send.click();
    } finally {
      window.setTimeout(() => {
        bypassSendGuard = false;
      }, 0);
    }
  }, delay);
}

function restartListening() {
  clearTimers();
  restartTimer = window.setTimeout(() => {
    if (!sessionActive || manualStopRequested) return;
    const mic = getMicButton();
    const textarea = getTextarea();
    if (!mic || mic.disabled || mic.getAttribute("title") !== "Falar com JARVIS") return;
    segmentStartValue = textarea?.value.trim() ?? "";
    try {
      mic.click();
    } catch {
      finishSessionAndSend();
    }
  }, RESTART_DELAY_MS);
}

function inspect() {
  const mic = getMicButton();
  const textarea = getTextarea();
  if (!mic || !textarea) {
    wasListening = false;
    sessionActive = false;
    clearTimers();
    return;
  }

  const listeningNow = mic.getAttribute("title") === "Parar de ouvir";
  const currentValue = textarea.value.trim();
  if (currentValue !== lastKnownValue) lastKnownValue = currentValue;

  if (listeningNow && !wasListening) {
    sessionActive = true;
    wasListening = true;
    segmentStartValue = currentValue;
    manualStopRequested = false;
    clearTimers();
    return;
  }

  if (!listeningNow && wasListening) {
    wasListening = false;
    const segmentAddedText = currentValue.length > segmentStartValue.length || currentValue !== segmentStartValue;

    if (manualStopRequested) {
      finishSessionAndSend(180);
      return;
    }

    if (segmentAddedText) {
      // O Web Speech do Android encerra ao detectar pequenas pausas. Reabrimos
      // automaticamente o microfone para que o usuário possa continuar falando.
      restartListening();
      return;
    }

    // Uma segunda janela sem novas palavras significa silêncio real: só então envia.
    if (currentValue) finishSessionAndSend();
  }
}

if (typeof window !== "undefined") {
  // Impede exclusivamente o clique automático antigo de enviar a primeira frase
  // antes que o usuário tenha terminado. Clique manual do usuário continua imediato.
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest?.("button") as HTMLButtonElement | null;
    if (!button) return;
    const title = button.getAttribute("title") ?? "";

    if (title === "Parar de ouvir" && event.isTrusted) {
      manualStopRequested = true;
      return;
    }

    if (title === "Enviar" && sessionActive && !event.isTrusted && !bypassSendGuard) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.setInterval(inspect, POLL_MS);
}
