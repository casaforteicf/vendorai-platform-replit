import { speakJarvis, VOICE_READY_EVENT } from "./jarvisVoiceResponseBridge";

type JarvisRuntimeCapability = {
  key?: string;
  label?: string;
  mode?: string;
  available?: boolean;
  approvalRequired?: boolean;
  provider?: string;
  executionClaim?: string;
  limitation?: string | null;
};

type CapabilityResponse = {
  capabilities?: JarvisRuntimeCapability[];
};

function isCapabilityQuestion(text: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(quais funcoes|quais capacidades|o que voce consegue|o que voce pode fazer|o que sabe fazer|funcoes que voce tem|capacidades que voce tem|consegue falar|tem voz|tem audio)\b/.test(normalized);
}

function getLastUserText(messages: Array<{ role?: string; content?: string }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return String(messages[index]?.content ?? "").trim();
  }
  return "";
}

function actionStatus(capability: JarvisRuntimeCapability) {
  if (!capability.available) return `⚠️ ${capability.label ?? capability.key}: configuração pendente${capability.limitation ? ` (${capability.limitation})` : ""}.`;
  if (capability.mode === "backend_execute") return `✅ ${capability.label ?? capability.key}: execução real${capability.approvalRequired ? " com aprovação" : ""}.`;
  if (capability.mode === "device_open") return `✅ ${capability.label ?? capability.key}: abre no dispositivo${capability.limitation ? `; ${capability.limitation}` : ""}.`;
  return `✅ ${capability.label ?? capability.key}: disponível.`;
}

function buildCapabilityAnswer(capabilities: JarvisRuntimeCapability[]) {
  const actions = capabilities.map(actionStatus);
  return [
    "Hoje eu consigo atuar nestas frentes:",
    "",
    "• Negócio: CRM, leads, clientes, propostas, campanhas, agenda, prioridades, Casos Vendor, custos, margem e análise do tenant.",
    "• Mercado: câmbio e Forex, cripto e pesquisa atual para ações, índices, commodities e notícias quando necessário.",
    "• Tributário e jurídico: ICMS, ST, DIFAL, IPI, ISS, PIS/COFINS, NCM, CFOP, legislação, contratos e regras vigentes com pesquisa atual quando necessário.",
    "• Comércio exterior e crédito: importação, exportação, custos, Incoterms, financiamento, empréstimos, CET e impacto financeiro.",
    "• Marketing e vendas: estratégia, campanhas, copy, planejamento comercial, coaching de vendas, alta performance e motivação contextual.",
    "• Arquivos: analisar PDF, imagem, Word, Excel, CSV e TXT; gerar Excel, CSV, Word, PDF, TXT e Markdown.",
    "• Recomendações e conhecimento geral: livros, filmes, sites, cursos, pesquisas e perguntas gerais.",
    "• Voz: você pode falar comigo pelo microfone e eu tento responder por voz em pt-BR; também há replay da última resposta quando o dispositivo suporta TTS.",
    "",
    "Ações externas neste tenant agora:",
    ...(actions.length ? actions : ["⚠️ Não consegui ler o estado das integrações externas nesta sessão."]),
    "",
    "Quando uma ação exigir autorização, eu preparo e coloco na fila de aprovações antes de executar.",
  ].join("\n");
}

function sseResponse(content: string) {
  const body = [
    `data: ${JSON.stringify({ content })}`,
    "",
    `data: ${JSON.stringify({ done: true })}`,
    "",
  ].join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

function announceVoice(content: string) {
  window.dispatchEvent(new CustomEvent(VOICE_READY_EVENT, {
    detail: { content, supported: "speechSynthesis" in window, autoEnabled: true },
  }));
  void speakJarvis(content);
}

if (typeof window !== "undefined") {
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isJarvisChat = method === "POST" && /(?:^|\/)api\/support\/chat(?:\?|$)/.test(url);

    if (!isJarvisChat || typeof init?.body !== "string") return previousFetch(input, init);

    try {
      const payload = JSON.parse(init.body) as { messages?: Array<{ role?: string; content?: string }> };
      if (!Array.isArray(payload.messages)) return previousFetch(input, init);
      const lastText = getLastUserText(payload.messages);
      if (!isCapabilityQuestion(lastText)) return previousFetch(input, init);

      let capabilities: JarvisRuntimeCapability[] = [];
      try {
        const token = localStorage.getItem("vendorai_token");
        const capabilityResponse = await previousFetch("/api/jarvis/capabilities", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (capabilityResponse.ok) {
          const capabilityPayload = await capabilityResponse.json() as CapabilityResponse;
          capabilities = Array.isArray(capabilityPayload.capabilities) ? capabilityPayload.capabilities : [];
        }
      } catch {
        capabilities = [];
      }

      const answer = buildCapabilityAnswer(capabilities);
      queueMicrotask(() => announceVoice(answer));
      return sseResponse(answer);
    } catch {
      return previousFetch(input, init);
    }
  };
}

export {};
