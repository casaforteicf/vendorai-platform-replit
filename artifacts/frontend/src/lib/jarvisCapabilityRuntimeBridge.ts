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
  return /\b(o que (voce|você) (consegue|pode)|quais (funcoes|funções|capacidades)|capacidade|funcionalidade|integracao|integração|tem acesso|consegue acessar|consegue falar|voz|audio|áudio)\b/i.test(text);
}

function getLastUserText(body: string) {
  try {
    const payload = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
    if (!Array.isArray(payload.messages)) return "";
    for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
      if (payload.messages[index]?.role === "user") return String(payload.messages[index]?.content ?? "").trim();
    }
  } catch {
    return "";
  }
  return "";
}

function humanCapabilitySummary(capabilities: JarvisRuntimeCapability[]) {
  const available = capabilities.filter((item) => item.available);
  const unavailable = capabilities.filter((item) => !item.available);

  const lines = [
    "Hoje eu consigo trabalhar com:",
    "• negócio e CRM: leads, propostas, campanhas, agenda, prioridades, Casos Vendor e inteligência do tenant;",
    "• vendas, marketing, estratégia, formação de preço, custos, margem, financeiro e análise gerencial;",
    "• tributário, jurídico/legislação, importação/exportação, crédito e financiamentos, usando pesquisa atual quando a regra ou dado depende do momento;",
    "• câmbio/Forex, cripto e dados de mercado com providers/fallback de pesquisa atual;",
    "• arquivos e documentos: PDF, Word, Excel, CSV, TXT, Markdown e imagens, inclusive geração/exportação de arquivos;",
    "• voz: você pode falar comigo pelo microfone e eu tento responder em áudio quando o dispositivo suporta TTS;",
    "• conhecimento geral, livros, filmes, sites, cursos, motivação e coaching de alta performance.",
  ];

  if (available.length) {
    lines.push("", "Ações externas disponíveis neste tenant:");
    for (const item of available) {
      const approval = item.approvalRequired ? " (com aprovação)" : "";
      lines.push(`• ${item.label ?? item.key}${approval}.`);
    }
  }

  if (unavailable.length) {
    lines.push("", "Integrações que ainda dependem de configuração:");
    for (const item of unavailable) {
      lines.push(`• ${item.label ?? item.key}${item.limitation ? ` — ${item.limitation}` : ""}.`);
    }
  }

  lines.push("", "Se você me pedir uma ação, eu separo claramente o que analisei, o que está preparado e o que foi realmente executado.");
  return lines.join("\n");
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
    const lastText = getLastUserText(init.body);
    if (!isCapabilityQuestion(lastText)) return previousFetch(input, init);

    let capabilities: JarvisRuntimeCapability[] = [];
    try {
      const token = localStorage.getItem("vendorai_token");
      const capabilityResponse = await previousFetch("/api/jarvis/capabilities", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (capabilityResponse.ok) {
        const payload = await capabilityResponse.json() as CapabilityResponse;
        capabilities = Array.isArray(payload.capabilities) ? payload.capabilities : [];
      }
    } catch {
      capabilities = [];
    }

    return sseResponse(humanCapabilitySummary(capabilities));
  };
}

export {};
