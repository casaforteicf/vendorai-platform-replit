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
    .slice(0, 2200);
}

function choosePtBrVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase() === "pt-br")
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("pt"))
    ?? null;
}

function speakJarvis(text: string) {
  if (!shouldSpeak()) return;
  const content = cleanForSpeech(text);
  if (!content) return;

  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = "pt-BR";
  utterance.rate = 1;
  utterance.pitch = 0.92;
  const voice = choosePtBrVoice();
  if (voice) utterance.voice = voice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
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
