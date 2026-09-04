import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { MediaPlanCampaign, MediaPlanCampaignChannel, MediaPlanConteudo } from "@workspace/db";
import { logger } from "../lib/logger.js";

const AVAILABLE_CHANNELS = [
  "Instagram",
  "Facebook",
  "Meta Ads",
  "Google Search",
  "Google Display",
  "Performance Max",
  "YouTube",
  "TikTok",
  "LinkedIn",
  "WhatsApp",
  "E-mail",
  "Blog/SEO",
  "Site",
  "Landing Page",
  "SMS",
] as const;

function campaignCount(periodoDias: 30 | 60 | 90): number {
  if (periodoDias === 30) return 3;
  if (periodoDias === 60) return 5;
  return 8;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeIntensity(value: unknown): "baixa" | "media" | "alta" {
  if (value === "alta" || value === "media" || value === "baixa") return value;
  return "baixa";
}

function normalizeChannelName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function normalizeChannel(raw: unknown): MediaPlanCampaignChannel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const canal = normalizeText(item.canal, "");
  if (!canal) return null;
  const formatos = Array.isArray(item.formatos)
    ? item.formatos.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).map((v) => v.trim())
    : [];
  return {
    canal,
    funcao: normalizeText(item.funcao, "Apoiar o objetivo da campanha"),
    etapaFunil: normalizeText(item.etapaFunil, "consideração"),
    formatos,
    frequencia: normalizeText(item.frequencia, "conforme desempenho e capacidade de produção"),
    quantidadeMateriais: normalizeNumber(item.quantidadeMateriais, Math.max(1, formatos.length), 0, 120),
    kpiPrincipal: normalizeText(item.kpiPrincipal, "conversões"),
    percentualOrcamento:
      item.percentualOrcamento == null ? undefined : normalizeNumber(item.percentualOrcamento, 0, 0, 100),
  };
}

function normalizeCampaign(raw: unknown, index: number, periodoDias: 30 | 60 | 90): MediaPlanCampaign | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const canais = Array.isArray(item.canais)
    ? item.canais.map(normalizeChannel).filter((v): v is MediaPlanCampaignChannel => Boolean(v))
    : [];
  const duracaoDefault = Math.max(14, Math.round(periodoDias / Math.max(2, campaignCount(periodoDias) / 2)));
  return {
    id: `camp-${index + 1}`,
    nome: normalizeText(item.nome, `Campanha ${index + 1}`),
    objetivo: normalizeText(item.objetivo, "Gerar oportunidades"),
    produtoServico: normalizeText(item.produtoServico, "Oferta principal"),
    publico: normalizeText(item.publico, "Público prioritário do negócio"),
    regiao: typeof item.regiao === "string" ? item.regiao.trim() || undefined : undefined,
    oferta: normalizeText(item.oferta, "Próximo passo comercial claro"),
    mensagemCentral: normalizeText(item.mensagemCentral, "Conectar uma dor real do público à solução oferecida"),
    fase: normalizeText(item.fase, "aquisição"),
    inicioOffsetDias: normalizeNumber(item.inicioOffsetDias, Math.min(periodoDias - 1, index * Math.max(5, Math.floor(periodoDias / campaignCount(periodoDias)))), 0, periodoDias - 1),
    duracaoDias: normalizeNumber(item.duracaoDias, duracaoDefault, 3, periodoDias),
    intensidadeGeografica: normalizeIntensity(item.intensidadeGeografica),
    regraComunicacaoGeografica: normalizeText(
      item.regraComunicacaoGeografica,
      "A localização orienta a segmentação, mas só deve aparecer explicitamente em parte das peças. Priorize dor, benefício, prova e produto para manter a comunicação natural.",
    ),
    canais,
    kpiPrincipal: normalizeText(item.kpiPrincipal, "CPL / oportunidades"),
    metaPrincipal: normalizeText(item.metaPrincipal, "Melhorar aquisição e conversão no período"),
    materiaisPlanejados: normalizeNumber(
      item.materiaisPlanejados,
      canais.reduce((acc, canal) => acc + canal.quantidadeMateriais, 0),
      0,
      500,
    ),
    status: "planejada",
  };
}

function fallbackChannels(conteudo: MediaPlanConteudo, campaignIndex: number): MediaPlanCampaignChannel[] {
  const preferred = conteudo.canais?.map((c) => c.canal).filter(Boolean) ?? [];
  const base = Array.from(new Set([...preferred, "Instagram", "Meta Ads", "Google Search", "WhatsApp", "Landing Page"])).slice(0, 8);
  return base.map((canal) => {
    const lower = normalizeChannelName(canal);
    const paid = lower.includes("ads") || lower.includes("google") || lower.includes("performance") || lower.includes("display");
    const direct = lower.includes("whatsapp") || lower.includes("landing") || lower.includes("email");
    const formatos = lower.includes("instagram")
      ? ["Reels", "Carrossel", "Stories"]
      : lower.includes("google")
        ? ["Anúncio de pesquisa", "Extensões", "Variações de headline"]
        : lower.includes("whatsapp")
          ? ["Mensagem", "Follow-up"]
          : lower.includes("landing")
            ? ["Landing Page", "Headline A/B"]
            : lower.includes("email")
              ? ["E-mail", "Automação"]
              : ["Criativo", "Copy"];
    return {
      canal,
      funcao: direct ? "Conversão e continuidade comercial" : paid ? "Aquisição e captura de demanda" : "Descoberta, educação e prova",
      etapaFunil: direct ? "conversão" : paid ? "aquisição" : "descoberta/consideração",
      formatos,
      frequencia: paid ? "contínuo com otimização por desempenho" : campaignIndex % 2 === 0 ? "3 ações por semana" : "2 ações por semana",
      quantidadeMateriais: paid ? 6 : lower.includes("instagram") ? 10 : direct ? 4 : 4,
      kpiPrincipal: direct ? "taxa de conversão" : paid ? "CPL / CPA" : "alcance e engajamento qualificado",
      percentualOrcamento: paid ? undefined : 0,
    };
  });
}

function fallbackCampaigns(conteudo: MediaPlanConteudo, periodoDias: 30 | 60 | 90): MediaPlanCampaign[] {
  const count = campaignCount(periodoDias);
  const pillars = conteudo.pilaresConteudo?.length ? conteudo.pilaresConteudo : ["Dor", "Educação", "Prova", "Oferta", "Conversão"];
  const objectives = [
    "Aquisição de novas oportunidades",
    "Educação e diferenciação da solução",
    "Prova, confiança e consideração",
    "Conversão de demanda existente",
    "Remarketing e recuperação",
    "Expansão de público",
    "Escala dos melhores argumentos",
    "Conversão final e aprendizado do ciclo",
  ];
  return Array.from({ length: count }, (_, index) => {
    const canais = fallbackChannels(conteudo, index);
    const inicio = Math.min(periodoDias - 1, Math.round((index * periodoDias) / count));
    const duracao = Math.min(periodoDias - inicio, Math.max(14, Math.round(periodoDias / 2)));
    return {
      id: `camp-${index + 1}`,
      nome: `${objectives[index] ?? `Campanha ${index + 1}`}`,
      objetivo: objectives[index] ?? "Gerar oportunidades",
      produtoServico: "Produto ou serviço prioritário do período",
      publico: "Público prioritário definido no perfil do negócio",
      oferta: "Oferta ou próximo passo comercial adequado à etapa",
      mensagemCentral: pillars[index % pillars.length] ?? "Mensagem principal da campanha",
      fase: index < Math.ceil(count / 3) ? "aquisição" : index < Math.ceil((count * 2) / 3) ? "consideração" : "conversão/remarketing",
      inicioOffsetDias: inicio,
      duracaoDias: Math.max(3, duracao),
      intensidadeGeografica: "baixa",
      regraComunicacaoGeografica: "Use a região principalmente na segmentação. Mencione-a explicitamente apenas quando aumentar intenção ou contexto (cerca de 20–30% das peças), evitando repetir o local em todo material.",
      canais,
      kpiPrincipal: index < Math.ceil(count / 2) ? "CPL / oportunidades" : "conversões / receita",
      metaPrincipal: "Superar o desempenho de referência do período anterior",
      materiaisPlanejados: canais.reduce((acc, canal) => acc + canal.quantidadeMateriais, 0),
      status: "planejada",
    };
  });
}

function mergeChannelCoverage(aiCampaign: MediaPlanCampaign, fallbackCampaign: MediaPlanCampaign): MediaPlanCampaign {
  const merged = [...aiCampaign.canais];
  const existing = new Set(merged.map((channel) => normalizeChannelName(channel.canal)));

  // A IA decide mensagem e estratégia, mas não pode derrubar a arquitetura
  // operacional para um único canal. O fallback representa os executores que
  // já existem no VendorAI e é incorporado quando algum deles ficou ausente.
  for (const channel of fallbackCampaign.canais) {
    const key = normalizeChannelName(channel.canal);
    if (!existing.has(key)) {
      merged.push(channel);
      existing.add(key);
    }
  }

  return {
    ...aiCampaign,
    canais: merged,
    materiaisPlanejados: merged.reduce((sum, channel) => sum + channel.quantidadeMateriais, 0),
  };
}

const SYSTEM_PROMPT = `Você é o Planejador de Mídia do VendorAI. Sua função é DIREÇÃO ESTRATÉGICA; a execução ocorrerá depois no Gerador de Conteúdo.

Crie campanhas completas para um período de 30, 60 ou 90 dias. Cada campanha deve agrupar todos os canais que fazem sentido para o mesmo objetivo; NÃO crie uma campanha separada por canal.

Canais disponíveis no ecossistema: ${AVAILABLE_CHANNELS.join(", ")}.
Escolha os canais relevantes para cada campanha e dê a cada canal uma função diferente no funil. Não repita a mesma mensagem literalmente em todos os canais.

A arquitetura mínima precisa considerar descoberta/orgânico, mídia paga, captura de intenção, conversão direta e destino próprio. Na prática, quando fizer sentido ao negócio, use Instagram, Meta Ads, Google Search, WhatsApp e Landing Page, além de E-mail, Blog/SEO, YouTube, Performance Max, Site ou outros canais relevantes.

REGRA GEOGRÁFICA IMPORTANTE: localização e bairro podem orientar a segmentação sem aparecer em todo material. Em campanhas locais, use normalmente intensidade baixa ou média. Em conteúdo orgânico e descoberta, priorize dor, benefício, educação, arquitetura, prova e produto. Mencione a localização explicitamente apenas em parte das peças (em geral 20–30%), aumentando o uso em Google Search, SEO local, LP e conteúdos de alta intenção. Evite títulos repetitivos do tipo “no bairro X” em todas as peças.

Frequência: orgânico deve ser realista; mídia paga pode ficar contínua com renovação por fadiga/performance; WhatsApp/e-mail devem respeitar comportamento e não copiar posts sociais.

A quantidade de campanhas deve ser aproximadamente: 3 para 30 dias, 5 para 60 dias e 8 para 90 dias. Campanhas podem se sobrepor.

Retorne APENAS JSON válido, sem markdown, no formato {"campanhas":[...]}. Cada campanha precisa: nome, objetivo, produtoServico, publico, regiao opcional, oferta, mensagemCentral, fase, inicioOffsetDias, duracaoDias, intensidadeGeografica (baixa|media|alta), regraComunicacaoGeografica, canais, kpiPrincipal, metaPrincipal, materiaisPlanejados. Cada canal precisa: canal, funcao, etapaFunil, formatos[], frequencia, quantidadeMateriais, kpiPrincipal e percentualOrcamento opcional.`;

export async function enrichMediaPlanForPeriod(
  tenantId: string,
  conteudoBase: MediaPlanConteudo,
  periodoDias: 30 | 60 | 90,
): Promise<MediaPlanConteudo> {
  const fallback = fallbackCampaigns(conteudoBase, periodoDias);
  let campanhas = fallback;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: periodoDias === 90 ? 7000 : 5000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            periodoDias,
            diagnostico: conteudoBase.diagnostico,
            oportunidades: conteudoBase.oportunidades,
            pilaresConteudo: conteudoBase.pilaresConteudo,
            canaisPrioritariosJaAnalisados: conteudoBase.canais,
            keywordsRelevantes: conteudoBase.keywordsRelevantes,
          }),
        },
      ],
    });
    const block = response.content.find((item) => item.type === "text");
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) as { campanhas?: unknown[] };
    const normalized = Array.isArray(parsed.campanhas)
      ? parsed.campanhas.map((item, index) => normalizeCampaign(item, index, periodoDias)).filter((item): item is MediaPlanCampaign => Boolean(item))
      : [];
    if (normalized.length >= 2) {
      campanhas = normalized.map((campaign, index) => mergeChannelCoverage(campaign, fallback[index % fallback.length]!));
    }
  } catch (err) {
    logger.warn({ err, tenantId, periodoDias }, "media-plan-period: IA falhou; usando campanhas determinísticas");
  }

  const totalAcoesPlanejadas = campanhas.reduce((acc, campanha) => acc + campanha.materiaisPlanejados, 0);
  return {
    ...conteudoBase,
    periodoDias,
    campanhas,
    totalAcoesPlanejadas,
    statusPlanejamento: "em_revisao",
    aprovadoEm: null,
    versaoPlanejamento: Math.max(1, conteudoBase.versaoPlanejamento ?? 1),
  };
}
