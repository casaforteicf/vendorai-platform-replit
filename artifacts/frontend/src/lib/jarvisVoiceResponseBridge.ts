import { jarvisPermissionEnabled } from "./jarvisPermissions";

const VOICE_SETTING_KEY = "jarvis_voice_replies";
const VOICE_READY_EVENT = "vendorai:jarvis-voice-ready";
const HANDS_FREE_SESSION_KEY = "jarvis_web_hands_free_session";
const TOKEN_KEY = "vendorai_token";
const DUPLICATE_WINDOW_MS = 10_000;
let activeNeuralAudio: HTMLAudioElement | null = null;
let activeNeuralUrl: string | null = null;
let activeSpeechGeneration = 0;
let lastSpeechFingerprint = "";
let lastSpeechStartedAt = 0;

function canSpeakJarvis() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function shouldSpeak() {
  if (!canSpeakJarvis()) return false;
  if (!jarvisPermissionEnabled("voiceReplies")) return false;
  return localStorage.getItem(VOICE_SETTING_KEY) !== "off";
}

function cleanForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2600);
}

function conciseForSpeech(text: string) {
  const cleaned = cleanForSpeech(text);
  if (cleaned.length <= 620) return cleaned;

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const summary = sentences.slice(0, 4).join(" ");
  const compact = (summary || cleaned.slice(0, 580)).slice(0, 600).trim();
  return `${compact} Se quiser, eu detalho.`;
}

function prepareNeuralSpeech(text: string) {
  return text
    .replace(/\bJARVIS\b/g, "Jarvis")
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 por cento")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 de $2")
    .replace(/\s*[:;]\s*/g, ", ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([,.!?])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function speechFingerprint(text: string) {
  return text.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function getJarvisPanel() {
  return document.querySelector<HTMLElement>('div[aria-label="JARVIS"]');
}

function findJarvisMicButton() {
  const panel = getJarvisPanel();
  if (!panel) return null;
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      const title = button.getAttribute("title") ?? "";
      return title === "Falar com JARVIS" || title === "Parar de ouvir";
    }) ?? null;
}

function findJarvisSendButton() {
  const panel = getJarvisPanel();
  if (!panel) return null;
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.getAttribute("title") === "Enviar") ?? null;
}

function getJarvisTextarea() {
  return getJarvisPanel()?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
}

function isHandsFreeSessionActive() {
  return jarvisPermissionEnabled("handsFree")
    && sessionStorage.getItem(HANDS_FREE_SESSION_KEY) === "1";
}

function activateHandsFreeSession() {
  if (!jarvisPermissionEnabled("handsFree")) {
    sessionStorage.removeItem(HANDS_FREE_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(HANDS_FREE_SESSION_KEY, "1");
}

function restartJarvisMicAfterSpeech() {
  if (!isHandsFreeSessionActive()) return;
  window.setTimeout(() => {
    const mic = findJarvisMicButton();
    if (!mic || mic.disabled || mic.getAttribute("title") !== "Falar com JARVIS") return;
    try {
      mic.click();
    } catch {
      // Alguns navegadores exigem novo gesto do usuário para reabrir o microfone.
    }
  }, 420);
}

function stopNeuralAudio() {
  activeSpeechGeneration += 1;
  if (activeNeuralAudio) {
    activeNeuralAudio.pause();
    activeNeuralAudio.src = "";
    activeNeuralAudio = null;
  }
  if (activeNeuralUrl) {
    URL.revokeObjectURL(activeNeuralUrl);
    activeNeuralUrl = null;
  }
  window.speechSynthesis?.cancel();
}

async function speakNeuralJarvis(content: string, generation: number, onComplete?: () => void) {
  if (typeof Audio === "undefined") return false;

  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch("/api/jarvis/voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: prepareNeuralSpeech(content) }),
    });
    if (!response.ok || generation !== activeSpeechGeneration) return false;

    const blob = await response.blob();
    if (!blob.size || generation !== activeSpeechGeneration) return false;

    if (activeNeuralAudio) {
      activeNeuralAudio.pause();
      activeNeuralAudio.src = "";
      activeNeuralAudio = null;
    }
    if (activeNeuralUrl) URL.revokeObjectURL(activeNeuralUrl);

    activeNeuralUrl = URL.createObjectURL(blob);
    const audio = new Audio(activeNeuralUrl);
    activeNeuralAudio = audio;
    audio.preload = "auto";
    audio.onended = () => {
      if (generation !== activeSpeechGeneration) return;
      if (activeNeuralUrl) URL.revokeObjectURL(activeNeuralUrl);
      activeNeuralUrl = null;
      activeNeuralAudio = null;
      onComplete?.();
    };
    audio.onerror = () => {
      if (generation !== activeSpeechGeneration) return;
      if (activeNeuralUrl) URL.revokeObjectURL(activeNeuralUrl);
      activeNeuralUrl = null;
      activeNeuralAudio = null;
      onComplete?.();
    };
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function speakJarvis(text: string, onComplete?: () => void) {
  if (!shouldSpeak()) return false;
  const content = conciseForSpeech(text);
  if (!content) return false;

  const fingerprint = speechFingerprint(content);
  const now = Date.now();
  if (fingerprint === lastSpeechFingerprint && now - lastSpeechStartedAt < DUPLICATE_WINDOW_MS) {
    return true;
  }

  lastSpeechFingerprint = fingerprint;
  lastSpeechStartedAt = now;
  stopNeuralAudio();
  const generation = activeSpeechGeneration;

  void speakNeuralJarvis(content, generation, onComplete).then((started) => {
    if (!started && generation === activeSpeechGeneration) onComplete?.();
  });
  return true;
}

function announceVoiceReady(content: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VOICE_READY_EVENT, {
    detail: {
      content,
      supported: canSpeakJarvis(),
      autoEnabled: shouldSpeak(),
    },
  }));
}

function earlySpeechPrefix(content: string) {
  if (content.length < 72) return "";
  const capped = content.slice(0, 320);
  const sentence = capped.match(/^([\s\S]{60,}?[.!?])(?:\s|$)/)?.[1]?.trim();
  if (sentence) return sentence;
  if (content.length < 190) return "";
  const boundary = capped.lastIndexOf(" ", 190);
  return capped.slice(0, boundary > 120 ? boundary : 190).trim();
}

async function speakSupportResponse(response: Response) {
  try {
    if (!shouldSpeak() || !response.body) {
      const raw = await response.text();
      let content = "";
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6)) as { content?: unknown; error?: unknown };
          if (typeof payload.content === "string") content += payload.content;
          if (payload.error) return;
        } catch {
          // Linhas SSE incompletas ou não-JSON não devem afetar o chat.
        }
      }
      if (content.trim()) {
        announceVoiceReady(content);
        speakJarvis(content, restartJarvisMicAfterSpeech);
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let fullContent = "";
    let spokenPrefix = "";
    let earlyStarted = false;
    let streamDoneResolve!: () => void;
    const streamDone = new Promise<void>((resolve) => { streamDoneResolve = resolve; });

    const maybeStartEarlyVoice = () => {
      if (earlyStarted) return;
      const prefix = earlySpeechPrefix(fullContent);
      if (!prefix) return;
      earlyStarted = true;
      spokenPrefix = prefix;
      announceVoiceReady(prefix);
      const started = speakJarvis(prefix, () => {
        void streamDone.then(() => {
          const remaining = fullContent.slice(spokenPrefix.length).trim();
          if (remaining) {
            speakJarvis(remaining, restartJarvisMicAfterSpeech);
          } else {
            restartJarvisMicAfterSpeech();
          }
        });
      });
      if (!started) earlyStarted = false;
    };

    const consumeLine = (line: string) => {
      if (!line.startsWith("data: ")) return;
      try {
        const payload = JSON.parse(line.slice(6)) as { content?: unknown; error?: unknown };
        if (payload.error) return;
        if (typeof payload.content === "string") {
          fullContent += payload.content;
          maybeStartEarlyVoice();
        }
      } catch {
        // Linhas SSE incompletas ou não-JSON não devem afetar o chat.
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (pending) consumeLine(pending);
    streamDoneResolve();

    if (!earlyStarted && fullContent.trim()) {
      announceVoiceReady(fullContent);
      speakJarvis(fullContent, restartJarvisMicAfterSpeech);
    }
  } catch {
    // Voz é uma melhoria de experiência e nunca pode bloquear a resposta textual.
  }
}

function addVoiceRuntimeContext(init?: RequestInit): RequestInit | undefined {
  if (typeof init?.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const messages = Array.isArray(payload.messages) ? [...payload.messages] : null;
    if (!messages?.length) return init;
    const lastUserIndex = [...messages].map((message) => message.role).lastIndexOf("user");
    if (lastUserIndex < 0) return init;
    const lastContent = String(messages[lastUserIndex]?.content ?? "");
    if (!/\b(voz|audio|áudio|microfone|falar|fala|falado|ouvir|responder por voz)\b/i.test(lastContent)) return init;

    const handsFree = jarvisPermissionEnabled("handsFree");
    const voiceReplies = jarvisPermissionEnabled("voiceReplies");
    const wakeWord = jarvisPermissionEnabled("wakeWord");
    messages[lastUserIndex] = {
      ...messages[lastUserIndex],
      content: `${lastContent}\n\n[Contexto técnico da interface, não mostrar como citação do usuário: este chat JARVIS oferece entrada por microfone e envio automático após reconhecimento. Respostas por voz=${voiceReplies ? "permitidas" : "desativadas"}; mãos livres=${handsFree ? "permitido" : "desativado"}; wake word=${wakeWord ? "preferência ativada" : "desativada"}. No navegador, microfone e wake word dependem de permissão/gesto e página ativa; app fechado é capacidade nativa separada.]`,
    };
    return { ...init, body: JSON.stringify({ ...payload, messages }) };
  } catch {
    return init;
  }
}

function installJarvisVoiceAutoSend() {
  let wasListening = false;
  let valueBeforeListening = "";
  let lastSentValue = "";
  let inspectScheduled = false;

  const inspect = () => {
    inspectScheduled = false;
    const mic = findJarvisMicButton();
    const textarea = getJarvisTextarea();
    if (!mic || !textarea) {
      wasListening = false;
      return;
    }

    const listeningNow = mic.getAttribute("title") === "Parar de ouvir";
    if (listeningNow && !wasListening) {
      wasListening = true;
      valueBeforeListening = textarea.value.trim();
      return;
    }

    if (!listeningNow && wasListening) {
      wasListening = false;
      window.setTimeout(() => {
        const currentTextarea = getJarvisTextarea();
        const sendButton = findJarvisSendButton();
        const current = currentTextarea?.value.trim() ?? "";
        if (!current || current === valueBeforeListening || current === lastSentValue) return;
        if (!sendButton || sendButton.disabled) return;
        lastSentValue = current;
        sendButton.click();
      }, 140);
    }
  };

  const scheduleInspect = () => {
    if (inspectScheduled) return;
    inspectScheduled = true;
    window.requestAnimationFrame(inspect);
  };

  const observer = new MutationObserver(scheduleInspect);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title", "disabled"],
  });
  window.setInterval(scheduleInspect, 400);

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest?.("button") as HTMLButtonElement | null;
    if (!button) return;
    const title = button.getAttribute("title") ?? "";
    if (title === "Falar com JARVIS" || title === "Parar de ouvir") {
      activateHandsFreeSession();
      if (title === "Falar com JARVIS") stopNeuralAudio();
    }
  }, true);
}

if (typeof window !== "undefined") {
  window.speechSynthesis?.cancel();

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isJarvisChat = method === "POST" && /(?:^|\/)api\/support\/chat(?:\?|$)/.test(url);
    const effectiveInit = isJarvisChat ? addVoiceRuntimeContext(init) : init;
    const response = await previousFetch(input, effectiveInit);

    if (isJarvisChat && response.ok) {
      void speakSupportResponse(response.clone());
    }

    return response;
  };

  installJarvisVoiceAutoSend();
}

export { canSpeakJarvis, speakJarvis, VOICE_READY_EVENT, VOICE_SETTING_KEY };
