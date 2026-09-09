const VOICE_SETTING_KEY = "jarvis_voice_replies";

function shouldSpeak() {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
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

function choosePtBrVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase() === "pt-br")
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("pt"))
    ?? null;
}

function splitForSpeech(text: string, maxChars = 360): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxChars) {
    const windowText = remaining.slice(0, maxChars + 1);
    const sentenceBreak = Math.max(windowText.lastIndexOf(". "), windowText.lastIndexOf("! "), windowText.lastIndexOf("? "));
    const commaBreak = Math.max(windowText.lastIndexOf(", "), windowText.lastIndexOf("; "), windowText.lastIndexOf(": "));
    const spaceBreak = windowText.lastIndexOf(" ");
    const cut = sentenceBreak > 120 ? sentenceBreak + 1 : commaBreak > 120 ? commaBreak + 1 : spaceBreak > 120 ? spaceBreak : maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function speakJarvis(text: string) {
  if (!shouldSpeak()) return;
  const content = cleanForSpeech(text);
  if (!content) return;

  const synth = window.speechSynthesis;
  const chunks = splitForSpeech(content);
  const voice = choosePtBrVoice();
  let index = 0;

  const speakNext = () => {
    if (index >= chunks.length) return;
    const utterance = new SpeechSynthesisUtterance(chunks[index++]);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 0.92;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    utterance.onend = speakNext;
    utterance.onerror = () => {
      if (index < chunks.length) setTimeout(speakNext, 120);
    };
    synth.resume();
    synth.speak(utterance);
  };

  synth.cancel();
  setTimeout(speakNext, 60);
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
    if (content.trim()) speakJarvis(content);
  } catch {
    // Voz é uma melhoria de experiência e nunca pode bloquear a resposta textual.
  }
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
    const response = await previousFetch(input, init);
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (method === "POST" && /(?:^|\/)api\/support\/chat(?:\?|$)/.test(url) && response.ok) {
      void speakSupportResponse(response.clone());
    }

    return response;
  };
}

export { speakJarvis, VOICE_SETTING_KEY };
