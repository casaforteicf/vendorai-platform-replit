import {
  buildJarvisArtifactDirective,
  createJarvisArtifactDraft,
  detectJarvisArtifactRequest,
  downloadJarvisArtifact,
  jarvisArtifactFormatLabel,
} from "./jarvis-artifacts";

type ChatPayload = {
  messages?: Array<{ role?: string; content?: string }>;
  [key: string]: unknown;
};

function toast(message: string, tone: "success" | "error" = "success") {
  const element = document.createElement("div");
  element.textContent = message;
  Object.assign(element.style, {
    position: "fixed",
    right: "20px",
    bottom: "84px",
    zIndex: "2147483647",
    maxWidth: "360px",
    padding: "10px 14px",
    borderRadius: "10px",
    color: tone === "success" ? "#14532d" : "#7f1d1d",
    background: tone === "success" ? "#dcfce7" : "#fee2e2",
    border: `1px solid ${tone === "success" ? "#86efac" : "#fca5a5"}`,
    boxShadow: "0 8px 24px rgba(0,0,0,.14)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
  });
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 4500);
}

function collectAssistantContent(sseText: string): string {
  let content = "";
  for (const line of sseText.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    try {
      const payload = JSON.parse(line.slice(6)) as { content?: string };
      if (payload.content) content += payload.content;
    } catch {
      // Ignora eventos SSE não JSON ou incompletos.
    }
  }
  return content.trim();
}

function isJarvisChatFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  return method === "POST" && /\/api\/support\/chat(?:\?|$)/.test(url);
}

function parsePayload(init?: RequestInit): ChatPayload | null {
  if (typeof init?.body !== "string") return null;
  try {
    return JSON.parse(init.body) as ChatPayload;
  } catch {
    return null;
  }
}

function latestUserText(payload: ChatPayload) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string") return message.content;
  }
  return "";
}

function withArtifactDirective(payload: ChatPayload, directive: string): ChatPayload {
  const messages = Array.isArray(payload.messages) ? payload.messages.map((message) => ({ ...message })) : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || typeof message.content !== "string") continue;
    message.content = `${message.content}\n\n${directive}`;
    break;
  }
  return { ...payload, messages };
}

export function installJarvisArtifactFetchBridge() {
  const globalKey = "__vendoraiJarvisArtifactBridgeInstalled";
  const bridgeWindow = window as Window & { __vendoraiJarvisArtifactBridgeInstalled?: boolean };
  if (bridgeWindow[globalKey]) return;
  bridgeWindow[globalKey] = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isJarvisChatFetch(input, init)) return nativeFetch(input, init);

    const payload = parsePayload(init);
    if (!payload) return nativeFetch(input, init);

    const requestText = latestUserText(payload);
    const format = detectJarvisArtifactRequest(requestText);
    if (!format) return nativeFetch(input, init);

    const outgoingPayload = withArtifactDirective(payload, buildJarvisArtifactDirective(format));
    const response = await nativeFetch(input, {
      ...init,
      body: JSON.stringify(outgoingPayload),
    });

    if (!response.ok) return response;

    void response.clone().text().then(async (sseText) => {
      const content = collectAssistantContent(sseText);
      if (!content) return;
      try {
        const draft = createJarvisArtifactDraft(format, content);
        await downloadJarvisArtifact(draft);
        toast(`${jarvisArtifactFormatLabel(format)} pronto: ${draft.fileName}`);
      } catch (error) {
        console.error("jarvis artifact generation failed", error);
        toast("O JARVIS respondeu, mas não conseguiu gerar o arquivo para download.", "error");
      }
    }).catch((error) => {
      console.error("jarvis artifact response clone failed", error);
    });

    return response;
  }) as typeof window.fetch;
}

installJarvisArtifactFetchBridge();
