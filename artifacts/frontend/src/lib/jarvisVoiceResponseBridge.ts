import { jarvisPermissionEnabled } from "./jarvisPermissions";

const VOICE_SETTING_KEY = "jarvis_voice_replies";
const VOICE_READY_EVENT = "vendorai:jarvis-voice-ready";
const HANDS_FREE_SESSION_KEY = "jarvis_web_hands_free_session";

function canSpeakJarvis() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
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
  if (cleaned.length <= 520) return cleaned;

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const summary = sentences.slice(0, 3).join(" ");
  const compact = (summary || cleaned.slice(0, 480)).slice(0, 500).trim();
  return `${compact} Se quiser, eu detalho.`;
}

function naturalVoiceScore(voice: SpeechSynthesisVoice) {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;

  if (lang === "pt-br") score += 100;
  else if (lang.startsWith("pt")) score += 50;
  else return -1000;

  if (/natural|neural|enhanced|premium|online/.test(name)) score += 40;
  if (/google|microsoft|samsung|apple/.test(name)) score += 18;
  if (/brasil|brazil|portuguese.*brazil/.test(name)) score += 15;
  if (voice.localService) score += 4;
  if (/espeak|compact|legacy|robot/.test(name)) score -= 35;

  return score;
}

function choosePtBrVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices
    .map((voice) => ({ voice, score: naturalVoiceScore(voice) }))
    .filter((item) => item.score > -1000)
    .sort((a, b) => b.score - a.score)[0]?.voice ?? null;
}

function splitForSpeech(text: string, maxChars = 320): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    const windowText = remaining.slice(0, maxChars + 1);
    const sentenceBreak = Math.max(windowText.lastIndexOf(". "), windowText.lastIndexOf("! "), windowText.lastIndexOf("? "));
    const commaBreak = Math.max(windowText.lastIndexOf(", "), windowText.lastIndexOf("; "), windowText.lastIndexOf(": "));
    const spaceBreak = windowText.lastIndexOf(" ");
    const cut = sentenceBreak > 100 ? sentenceBreak + 1 : commaBreak > 100 ? commaBreak + 1 : spaceBreak > 100 ? spaceBreak : maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
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

function speakJarvis(text: string, onComplete?: () => void) {
  if (!shouldSpeak()) return false;
  const content = conciseForSpeech(text);
  if (!content) return false;

  const synth = window.speechSynthesis;
  const chunks = splitForSpeech(content);
  let index = 0;

  const speakNext = () => {
    if (index >= chunks.length) {
      onComplete?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index++]);
    const voice = choosePtBrVoice();
    utterance.lang = voice?.lang || "pt-BR";
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    utterance.onend = speakNext;
    utterance.onerror = () => {
      if (index < chunks.length) setTimeout(speakNext, 140);
      else onComplete?.();
    };
    synth.resume();
    synth.speak(utterance);
  };

  synth.cancel();
  setTimeout(speakNext, 80);
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

async function speakSupportResponse(response: Response) {
  try {
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
    }
  }, true);
}

if (typeof window !== "undefined") {
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  const resumeSpeech = () => {
    try {
      synth?.resume();
      synth?.getVoices();
    } catch {
      // Alguns WebViews Android só inicializam TTS após interação do usuário.
    }
  };
  window.addEventListener("pointerdown", resumeSpeech, { passive: true });
  window.addEventListener("touchstart", resumeSpeech, { passive: true });
  window.addEventListener("keydown", resumeSpeech, { passive: true });

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
