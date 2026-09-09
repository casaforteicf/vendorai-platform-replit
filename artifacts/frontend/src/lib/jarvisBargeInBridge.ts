const HANDS_FREE_SESSION_KEY = "jarvis_web_hands_free_session";
const MIN_CONFIDENCE = 0.58;
const ARM_DELAY_MS = 650;
const RETRY_DELAY_MS = 900;

type RecognitionResultLike = {
  transcript?: string;
  confidence?: number;
};

type RecognitionEventLike = {
  results?: ArrayLike<ArrayLike<RecognitionResultLike>>;
};

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => RecognitionLike;

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

let recognition: RecognitionLike | null = null;
let armTimer: number | null = null;
let retryTimer: number | null = null;
let speechWasActive = false;
let userGestureSeen = false;

function handsFreeActive() {
  try {
    return sessionStorage.getItem(HANDS_FREE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function getMicButton() {
  const panel = document.querySelector<HTMLElement>('div[aria-label="JARVIS"]');
  if (!panel) return null;
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      const title = button.getAttribute("title") ?? "";
      return title === "Falar com JARVIS" || title === "Parar de ouvir";
    }) ?? null;
}

function stopDetector() {
  if (armTimer) window.clearTimeout(armTimer);
  if (retryTimer) window.clearTimeout(retryTimer);
  armTimer = null;
  retryTimer = null;
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Detector auxiliar; falha nunca pode afetar o chat.
    }
  }
  recognition = null;
}

function transferToNormalMic() {
  const mic = getMicButton();
  if (!mic || mic.disabled) return;
  if (mic.getAttribute("title") !== "Falar com JARVIS") return;
  window.setTimeout(() => {
    try {
      mic.click();
    } catch {
      // Alguns navegadores exigem novo gesto para abrir o microfone.
    }
  }, 90);
}

function interruptJarvis() {
  if (!("speechSynthesis" in window) || !window.speechSynthesis.speaking) return;
  window.speechSynthesis.cancel();
  stopDetector();
  transferToNormalMic();
  window.dispatchEvent(new CustomEvent("vendorai:jarvis-barge-in"));
}

function armDetector() {
  if (!userGestureSeen || !handsFreeActive()) return;
  if (!("speechSynthesis" in window) || !window.speechSynthesis.speaking) return;
  if (recognition) return;

  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Recognition) return;

  try {
    const next = new Recognition();
    next.lang = "pt-BR";
    next.interimResults = true;
    next.continuous = false;
    next.onresult = (event) => {
      const first = event.results?.[0]?.[0];
      const transcript = String(first?.transcript ?? "").trim();
      const confidence = Number(first?.confidence ?? 0);
      if (transcript.length < 2) return;
      if (Number.isFinite(confidence) && confidence > 0 && confidence < MIN_CONFIDENCE) return;
      interruptJarvis();
    };
    next.onerror = () => {
      recognition = null;
      if (window.speechSynthesis?.speaking && handsFreeActive()) {
        retryTimer = window.setTimeout(armDetector, RETRY_DELAY_MS);
      }
    };
    next.onend = () => {
      recognition = null;
      if (window.speechSynthesis?.speaking && handsFreeActive()) {
        retryTimer = window.setTimeout(armDetector, RETRY_DELAY_MS);
      }
    };
    recognition = next;
    next.start();
  } catch {
    recognition = null;
  }
}

function inspectSpeech() {
  const speaking = "speechSynthesis" in window && window.speechSynthesis.speaking;
  if (speaking && !speechWasActive) {
    speechWasActive = true;
    if (armTimer) window.clearTimeout(armTimer);
    armTimer = window.setTimeout(armDetector, ARM_DELAY_MS);
    return;
  }
  if (!speaking && speechWasActive) {
    speechWasActive = false;
    stopDetector();
  }
}

if (typeof window !== "undefined") {
  const markGesture = () => {
    userGestureSeen = true;
  };
  window.addEventListener("pointerdown", markGesture, { passive: true });
  window.addEventListener("keydown", markGesture, { passive: true });
  window.setInterval(inspectSpeech, 180);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") stopDetector();
  });
}

export {};
