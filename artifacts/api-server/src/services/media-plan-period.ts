import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { MediaPlanCampaign, MediaPlanCampaignChannel, MediaPlanConteudo } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { buildOwnPerformancePromptBlock } from "./content-performance.js";
import {
  MEDIA_FUNCTION_VERSION,
  alignMediaChannelFunction,
  mediaFunctionCatalogForPrompt,
} from "./media-channel-functions.js";

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

function campaignCount(periodoDias: number): number {
  if (periodoDias <= 1) return 1;
  if (periodoDias <= 7) return 2;
  if (periodoDias <= 30) return 3;
  if (periodoDias <= 60) return 5;
  if (periodoDias <= 90) return 8;
  if (periodoDias <= 180) return 10;
  return 12;
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

function dedupeChannels(channels: MediaPlanCampaignChannel[]): MediaPlanCampaignChannel[] {
  const byChannel = new Map<string, MediaPlanCampaignChannel>();
  for (const channel of channels) {
    const key = normalizeChannelName(channel.canal);
    const existing = byChannel.get(key);
    if (!existing) {
      byChannel.set(key, channel);
      continue;
    }
    byChannel.set(key, {
      ...existing,
      quantidadeMateriais: Math.max(existing.quantidadeMateriais, channel.quantidadeMateriais),
      percentualOrcamento: existing.percentualOrcamento ?? channel.percentualOrcamento,
    });
  }
  return Array.from(byChannel.values());
}

function normalizeChannel(
  raw: unknown,
  context: { phase?: string; objective?: string },
): MediaPlanCampaignChannel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const canal = normalizeText(item.canal, "");
  if (!canal) return null;
  const formatos = Array.isArray(item.formatos)
    ? item.formatos.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).map((v) => v.trim())
    : [];

  return alignMediaChannelFunction({
    canal,
    funcao: normalizeText(item.funcao, "Apoiar o objetivo da campanha"),
    etapaFunil: normalizeText(item.etapaFunil, "consideração"),
    formatos,
    frequencia: normalizeText(item.frequencia, "conforme desempenho e capacidade de produção"),
    quantidadeMateriais: normalizeNumber(item.quantidadeMateriais, Math.max(1, formatos.length), 0, 120),
    kpiPrincipal: normalizeText(item.kpiPrincipal, "conversões"),
    percentualOrcamento:
      item.percentualOrcamento == null ? undefined : normalizeNumber(item.percentualOrcamento, 0, 0, 100),
  }, context);
}

function normalizeCampaign(raw: unknown, index: number, periodoDias: number): MediaPlanCampaign | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const count = campaignCount(periodoDias);
  const objective = normalizeText(item.objetivo, "Gerar oportunidades");
  const phase = normalizeText(item.fase, "aquisição");
  const canais = Array.isArray(item.canais)
    ? dedupeChannels(
        item.canais
          .map((channel) => normalizeChannel(channel, { phase, objective }))
          .filter((v): v is MediaPlanCampaignChannel => Boolean(v)),
      )
    : [];
  const minDuration = periodoDias <= 1 ? 1 : Math.min(3, periodoDias);
  const duracaoDefault = Math.max(minDuration, Math.round(periodoDias / Math.max(1, count / 2)));
  return {
    id: `camp-${index + 1}`,
    nome: normalizeText(item.nome, `Campanha ${index + 1}`),
    objetivo: objective,
    produtoServico: normalizeText(item.produtoServico, "Oferta principal"),
    publico: normalizeText(item.publico, "Público prioritário do negócio"),
    regiao: typeof item.regiao === "string" ? item.regiao.trim() || undefined : undefined,
    oferta: normalizeText(item.oferta, "Próximo passo comercial claro"),
    mensagemCentral: normalizeText(item.mensagemCentral, "Conectar uma dor real do público à solução oferecida"),
    fase: phase,
    inicioOffsetDias: normalizeNumber(item.inicioOffsetDias, Math.min(periodoDias - 1, index * Math.max(1, Math.floor(periodoDias / count))), 0, Math.max(0, periodoDias - 1)),
    duracaoDias: normalizeNumber(item.duracaoDias, duracaoDefault, minDuration, Math.max(minDuration, periodoDias)),
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

function fallbackChannels(
  conteudo: MediaPlanConteudo,
  campaignIndex: number,
  context: { phase: string; objective: string },
): MediaPlanCampaignChannel[] {
  const preferred = conteudo.canais?.map((c) => c.canal).filter(Boolean) ?? [];
  const base = Array.from(new Set([
    ...preferred,
    "Instagram",
    "Meta Ads",
    "Google Search",
    "WhatsApp",
    "Landing Page",
  ])).slice(0, 10);

  const aligned = base.map((canal) => {
    const lower = normalizeChannelName(canal);
    const paid = lower.includes("ads") || lower.includes("google") || lower.includes("performance") || lower.includes("display");
    const direct = lower.includes("whatsapp") || lower.includes("landing") || lower.includes("email");
    return alignMediaChannelFunction({
      canal,
      funcao: direct ? "Conversão e continuidade comercial" : paid ? "Aquisição e captura de demanda" : "Descoberta, educação e prova",
      etapaFunil: direct ? "conversão" : paid ? "aquisição" : "descoberta/consideração",
      formatos: [],
      frequencia: paid ? "contínuo com otimização por desempenho" : campaignIndex % 2 === 0 ? "3 ações por semana" : "2 ações por semana",
      quantidadeMateriais: paid ? 6 : lower.includes("instagram") ? 10 : direct ? 4 : 4,
      kpiPrincipal: direct ? "taxa de conversão" : paid ? "CPL / CPA" : "alcance e engajamento qualificado",
      percentualOrcamento: paid ? undefined : 0,
    }, context);
  });
  return dedupeChannels(aligned);
}

function fallbackCampaigns(conteudo: MediaPlanConteudo, periodoDias: number): MediaPlanCampaign[] {
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
    const objective = objectives[index] ?? "Gerar oportunidades";
    const phase = index < Math.ceil(count / 3)
      ? "aquisição"
      : index < Math.ceil((count * 2) / 3)
        ? "consideração"
        : index === count - 1
          ? "conversão/remarketing"
          : "conversão";
    const canais = fallbackChannels(conteudo, index, { phase, objective });
    const inicio = Math.min(periodoDias - 1, Math.round((index * periodoDias) / count));
    const minDuration = periodoDias <= 1 ? 1 : Math.min(3, periodoDias);
    const duracao = Math.min(periodoDias - inicio, Math.max(minDuration, Math.round(periodoDias / 2)));
    return {
      id: `camp-${index + 1}`,
      nome: count === 1 && conteudo.nomeCampanha ? conteudo.nomeCampanha : objective,
      objetivo: objective,
      produtoServico: "Produto ou serviço prioritário do período",
      publico: "Público prioritário definido no perfil do negócio",
      oferta: conteudoBaseFallbackOffer(conteudo),
      mensagemCentral: pillars[index % pillars.length] ?? "Mensagem principal da campanha",
      fase: phase,
      inicioOffsetDias: Math.max(0, inicio),
      duracaoDias: Math.max(minDuration, duracao),
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

function conteudoBaseFallbackOffer(conteudo: MediaPlanConteudo): string {
  return conteudo.ofertaCampanha || "Oferta ou próximo passo comercial adequado à etapa";
}

export function alignMediaFunctionsInContent(conteudo: MediaPlanConteudo): MediaPlanConteudo {
  if (!conteudo.campanhas?.length) {
    return { ...conteudo, versaoFuncoesMidia: MEDIA_FUNCTION_VERSION };
  }
  const campanhas = conteudo.campanhas.map((campaign) => {
    const canais = dedupeChannels(campaign.canais.map((channel) => alignMediaChannelFunction(channel, {
      phase: campaign.fase,
      objective: campaign.objetivo,
    })));
    return {
      ...campaign,
      canais,
      materiaisPlanejados: canais.reduce((sum, channel) => sum + channel.quantidadeMateriais, 0),
    };
  });
  return {
    ...conteudo,
    campanhas,
    totalAcoesPlanejadas: campanhas.reduce((sum, campaign) => sum + campaign.materiaisPlanejados, 0),
    versaoFuncoesMidia: MEDIA_FUNCTION_VERSION,
  };
}

function mergeChannelCoverage(aiCampaign: MediaPlanCampaign, fallbackCampaign: MediaPlanCampaign): MediaPlanCampaign {
  const merged = dedupeChannels(aiCampaign.canais.map((channel) => alignMediaChannelFunction(channel, {
    phase: aiCampaign.fase,
    objective: aiCampaign.objetivo,
  })));
  const existing = new Set(merged.map((channel) => normalizeChannelName(channel.canal)));

  for (const fallbackChannel of fallbackCampaign.canais) {
    const aligned = alignMediaChannelFunction(fallbackChannel, {
      phase: aiCampaign.fase,
      objective: aiCampaign.objetivo,
    });
    const key = normalizeChannelName(aligned.canal);
    if (!existing.has(key)) {
      merged.push(aligned);
      existing.add(key);
    }
  }

  return {
    ...aiCampaign,
    canais: merged,
    materiaisPlanejados: merged.reduce((sum, channel) => sum + channel.quantidadeMateriais, 0),
  };
}

function budgetPrompt(conteudo: MediaPlanConteudo): string {
  if (!conteudo.orcamento) return "Sem orçamento financeiro informado; não invente valores.";
  return `Orçamento humano: R$ ${conteudo.orcamento.valor.toFixed(2)} (${conteudo.orcamento.tipo}). A IA pode distribuir percentuais entre canais pagos e ajustar a alocação estratégica, mas a soma deve respeitar 100% do orçamento disponível e o valor informado é limite rígido; nunca autorize gasto acima dele.`;
}

const SYSTEM_PROMPT = `Você é o Planejador de Mídia do VendorAI. Sua função é DIREÇÃO ESTRATÉGICA; a execução ocorrerá depois no Gerador de Conteúdo.

Crie campanhas completas para qualquer período informado pelo usuário, de campanhas muito curtas até ciclos longos. Cada campanha deve agrupar todos os canais que fazem sentido para o mesmo objetivo; NÃO crie uma campanha separada por canal.

Canais disponíveis no ecossistema: ${AVAILABLE_CHANNELS.join(", ")}.
Escolha os canais relevantes para cada campanha. Cada canal e cada formato/mídia têm uma função própria no funil; não use todos como se fossem posts equivalentes e não copie a mesma mensagem literalmente entre plataformas.

FUNÇÕES OFICIAIS DOS CANAIS E FORMATOS:
${mediaFunctionCatalogForPrompt()}

A arquitetura mínima precisa considerar descoberta/orgânico, mídia paga, captura de intenção, conversão direta e destino próprio. Na prática, quando fizer sentido ao negócio, use Instagram, Meta Ads, Google Search, WhatsApp e Landing Page, além de E-mail, Blog/SEO, YouTube, Performance Max, Site ou outros canais relevantes.

Quando receber aprendizado do próprio negócio, trate-o como evidência histórica: preserve temas/canais/formatos que performaram melhor, reformule os fracos e corrija alertas recorrentes de qualidade. Não copie mecanicamente o ciclo anterior e não extrapole além dos dados apresentados.

REGRA GEOGRÁFICA IMPORTANTE: localização e bairro podem orientar a segmentação sem aparecer em todo material. Em campanhas locais, use normalmente intensidade baixa ou média. Em conteúdo orgânico e descoberta, priorize dor, benefício, educação, arquitetura, prova e produto. Mencione a localização explicitamente apenas em parte das peças (em geral 20–30%), aumentando o uso em Google Search, SEO local, LP e conteúdos de alta intenção. Evite títulos repetitivos do tipo “no bairro X” em todas as peças.

Frequência: respeite a função oficial de cada canal. Mídia paga pode ficar contínua com renovação por fadiga/performance; WhatsApp/e-mail devem responder a comportamento e estágio; Site/LP são destinos e não devem receber uma falsa frequência de postagem; SMS é gatilho pontual, não mídia de descoberta.

A quantidade de campanhas deve ser proporcional ao período: 1 para até 1 dia, 2 para até 7 dias, cerca de 3 para 30 dias, 5 para 60, 8 para 90, até 12 para ciclos longos. Campanhas podem se sobrepor.

Quando houver orçamento informado, distribua percentualOrcamento SOMENTE entre canais pagos. A soma dos canais pagos deve ser aproximadamente 100%. Canais orgânicos, próprios e diretos podem usar 0%. O orçamento é um limite humano rígido; o planejamento não autoriza publicação, ativação nem gasto.

Retorne APENAS JSON válido, sem markdown, no formato {"campanhas":[...]}. Cada campanha precisa: nome, objetivo, produtoServico, publico, regiao opcional, oferta, mensagemCentral, fase, inicioOffsetDias, duracaoDias, intensidadeGeografica (baixa|media|alta), regraComunicacaoGeografica, canais, kpiPrincipal, metaPrincipal, materiaisPlanejados. Cada canal precisa: canal, funcao, etapaFunil, formatos[], frequencia, quantidadeMateriais, kpiPrincipal e percentualOrcamento opcional. A resposta da IA será normalizada pelas funções oficiais acima.`;

export async function enrichMediaPlanForPeriod(
  tenantId: string,
  conteudoBase: MediaPlanConteudo,
  periodoDias: number,
): Promise<MediaPlanConteudo> {
  const normalizedDays = Math.max(1, Math.ceil(periodoDias));
  const fallback = fallbackCampaigns(conteudoBase, normalizedDays);
  let campanhas = fallback;
  const performanceLearning = await buildOwnPerformancePromptBlock(tenantId).catch((error) => {
    logger.warn({ error, tenantId }, "media-plan-period: aprendizado histórico indisponível");
    return "";
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: normalizedDays > 90 ? 7000 : 5000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            periodoDias: normalizedDays,
            periodo: conteudoBase.periodo,
            nomeCampanha: conteudoBase.nomeCampanha,
            ofertaCampanha: conteudoBase.ofertaCampanha,
            orcamento: conteudoBase.orcamento,
            regraOrcamento: budgetPrompt(conteudoBase),
            diagnostico: conteudoBase.diagnostico,
            oportunidades: conteudoBase.oportunidades,
            pilaresConteudo: conteudoBase.pilaresConteudo,
            canaisPrioritariosJaAnalisados: conteudoBase.canais,
            keywordsRelevantes: conteudoBase.keywordsRelevantes,
            aprendizadoDoProprioNegocio: performanceLearning || undefined,
          }),
        },
      ],
    });
    const block = response.content.find((item) => item.type === "text");
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) as { campanhas?: unknown[] };
    const normalized = Array.isArray(parsed.campanhas)
      ? parsed.campanhas.map((item, index) => normalizeCampaign(item, index, normalizedDays)).filter((item): item is MediaPlanCampaign => Boolean(item))
      : [];
    if (normalized.length >= 1) {
      campanhas = normalized.map((campaign, index) => mergeChannelCoverage(campaign, fallback[index % fallback.length]!));
    }
  } catch (err) {
    logger.warn({ err, tenantId, periodoDias: normalizedDays }, "media-plan-period: IA falhou; usando campanhas determinísticas");
  }

  const totalAcoesPlanejadas = campanhas.reduce((acc, campanha) => acc + campanha.materiaisPlanejados, 0);
  return {
    ...conteudoBase,
    periodoDias: normalizedDays,
    campanhas,
    totalAcoesPlanejadas,
    statusPlanejamento: "em_revisao",
    aprovadoEm: null,
    versaoPlanejamento: Math.max(1, conteudoBase.versaoPlanejamento ?? 1),
    versaoFuncoesMidia: MEDIA_FUNCTION_VERSION,
  };
}
