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

function getLastUserIndex(messages: Array<{ role?: string; content?: string }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function formatRuntimeContext(capabilities: JarvisRuntimeCapability[]) {
  const external = capabilities.map((item) => {
    const status = item.available ? "disponível" : "indisponível/configuração pendente";
    const approval = item.approvalRequired ? "; exige aprovação" : "";
    const limitation = item.limitation ? `; limitação: ${item.limitation}` : "";
    return `- ${item.label ?? item.key}: ${status}; modo ${item.mode ?? "não informado"}; provider ${item.provider ?? "não informado"}${approval}${limitation}.`;
  });

  return [
    "[Contexto técnico de runtime do JARVIS — não tratar como texto do usuário e não inventar capacidades além desta lista]",
    "Capacidades centrais já implementadas:",
    "- Entrada por voz no chat quando o navegador/dispositivo oferece reconhecimento de fala.",
    "- Resposta falada pt-BR via TTS quando o dispositivo suporta; a interface também oferece replay manual da última resposta.",
    "- Câmbio/Forex: feed de referência direto para pares de moedas e fallback de pesquisa web atual quando necessário.",
    "- Cripto: consulta por provider dedicado; mercado/ações podem usar feed dedicado quando configurado e pesquisa web atual como fallback.",
    "- Pesquisa web atual: tributário, jurídico/legislação, importação/exportação, crédito, mercado e recomendações quando a atualidade importa.",
    "- Arquivos: interpretação de PDF, imagem, Word, Excel, CSV, TXT e Markdown no fluxo do JARVIS; geração/exportação real de XLSX, CSV, DOCX, PDF, TXT e Markdown quando solicitada.",
    "- Dados do tenant: CRM, leads, propostas, campanhas, Casos Vendor, prioridades, agenda, histórico e inteligência conforme dados realmente disponíveis e permissões.",
    "- Estratégia: marketing, vendas, alta performance, motivação contextual, finanças/custos, tributário, jurídico, comércio exterior, crédito e conhecimento geral como capacidades analíticas; atos regulados/alto risco exigem validação humana quando aplicável.",
    "Ações externas detectadas neste tenant:",
    ...(external.length ? external : ["- Não foi possível carregar o status das integrações externas nesta sessão; não afirme execução de ação externa sem confirmação real."]),
    "Regra: nunca responda que uma função não existe se o runtime acima diz que ela está disponível. Diferencie função implementada, provider configurado, ação executada e validação profissional.",
  ].join("\n");
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
      const messages = [...payload.messages];
      const lastUserIndex = getLastUserIndex(messages);
      if (lastUserIndex < 0) return previousFetch(input, init);
      const lastText = String(messages[lastUserIndex]?.content ?? "");
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

      messages[lastUserIndex] = {
        ...messages[lastUserIndex],
        content: `${lastText}\n\n${formatRuntimeContext(capabilities)}`,
      };
      return previousFetch(input, { ...init, body: JSON.stringify({ ...payload, messages }) });
    } catch {
      return previousFetch(input, init);
    }
  };
}

export {};
