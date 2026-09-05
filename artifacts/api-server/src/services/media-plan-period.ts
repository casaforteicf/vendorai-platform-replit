import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { MediaPlanCampaign, MediaPlanCampaignChannel, MediaPlanConteudo } from "@workspace/db";
import { logger } from "../lib/logger.js";
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

function isPaidChannel(channel: string): boolean {
  const value = normalizeChannelName(channel);
  return value.includes("meta ads")
    || value.includes("google search")
    || value.includes("google display")
    || value.includes("performance max")
    || value.includes("youtube")
    || value.includes("tiktok")
    || value.includes("linkedin ads")
    || value.includes("facebook ads");
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

function normalizeBudgetAllocation(channels: MediaPlanCampaignChannel[]): MediaPlanCampaignChannel[] {
  const paidIndexes = channels
    .map((channel, index) => isPaidChannel(channel.canal) ? index : -1)
    .filter((index) => index >= 0);
  if (paidIndexes.length === 0) return channels.map((channel) => ({ ...channel, percentualOrcamento: 0 }));

  const current = paidIndexes.map((index) => Math.max(0, channels[index]?.percentualOrcamento ?? 0));
  const total = current.reduce((sum, value) => sum + value, 0);
  const equal = 100 / paidIndexes.length;

  return channels.map((channel, index) => {
    const paidPosition = paidIndexes.indexOf(index);
    if (paidPosition < 0) return { ...channel, percentualOrcamento: 0 };
    const percentage = total > 0 ? (current[paidPosition]! / total) * 100 : equal;
    return { ...channel, percentualOrcamento: Math.round(percentage * 10) / 10 };
  });
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
  const objective = normalizeText(item.objetivo, "Gerar oportunidades");
  const phase = normalizeText(item.fase, "aquisição");
  const canais = Array.isArray(item.canais)
    ? normalizeBudgetAllocation(dedupeChannels(
        item.canais
          .map((channel) => normalizeChannel(channel, { phase, objective }))
          .filter((v): v is MediaPlanCampaignChannel => Boolean(v)),
      ))
    : [];
  const count = campaignCount(periodoDias);
  const duracaoDefault = periodoDias <= 2
    ? 1
    : Math.max(3, Math.round(periodoDias / Math.max(1, count / 2)));
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
    duracaoDias: normalizeNumber(item.duracaoDias, duracaoDefault, 1, periodoDias),
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
  periodoDias: number,
): MediaPlanCampaignChannel[] {
  const preferred = conteudo.canais?.map((c) => c.canal).filter(Boolean) ?? [];
  const maxChannels = periodoDias <= 2 ? 3 : periodoDias <= 7 ? 4 : 10;
  const base = Array.from(new Set([
    ...preferred,
    "Instagram",
    "Meta Ads",
    "Google Search",
    "WhatsApp",
    "Landing Page",
  ])).slice(0, maxChannels);

  const aligned = base.map((canal) => {
    const lower = normalizeChannelName(canal);
    const paid = isPaidChannel(canal);
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
  return normalizeBudgetAllocation(dedupeChannels(aligned));
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
    "Sustentação e renovação criativa",
    "Eficiência de CAC e qualidade de oportunidades",
    "Escala dos canais vencedores",
    "Fechamento e aprendizado acumulado",
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
    const canais = fallbackChannels(conteudo, index, { phase, objective }, periodoDias);
    const inicio = Math.min(periodoDias - 1, Math.round((index * periodoDias) / count));
    const duracaoBase = periodoDias <= 2 ? 1 : Math.max(3, Math.round(periodoDias / 2));
    const duracao = Math.min(periodoDias - inicio, duracaoBase);
    return {
      id: `camp-${index + 1}`,
      nome: objective,
      objetivo: objective,
      produtoServico: "Produto ou serviço prioritário do período",
      publico: "Público prioritário definido no perfil do negócio",
      oferta: conteudo.ofertaCampanha || "Oferta ou próximo passo comercial adequado à etapa",
      mensagemCentral: pillars[index % pillars.length] ?? "Mensagem principal da campanha",
      fase: phase,
      inicioOffsetDias: inicio,
      duracaoDias: Math.max(1, duracao),
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

export function alignMediaFunctionsInContent(conteudo: MediaPlanConteudo): MediaPlanConteudo {
  if (!conteudo.campanhas?.length) {
    return { ...conteudo, versaoFuncoesMidia: MEDIA_FUNCTION_VERSION };
  }
  const campanhas = conteudo.campanhas.map((campaign) => {
    const canais = normalizeBudgetAllocation(dedupeChannels(campaign.canais.map((channel) => alignMediaChannelFunction(channel, {
      phase: campaign.fase,
      objective: campaign.objetivo,
    }))));
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

  const canais = normalizeBudgetAllocation(merged);
  return {
    ...aiCampaign,
    canais,
    materiaisPlanejados: canais.reduce((sum, channel) => sum + channel.quantidadeMateriais, 0),
  };
}

const SYSTEM_PROMPT = `Você é o Planejador de Mídia do VendorAI. Sua função é DIREÇÃO ESTRATÉGICA; a execução ocorrerá depois no Gerador de Conteúdo e nos publicadores de mídia.

O período é totalmente livre e pode durar horas, 1 dia, vários meses, anos ou ser uma campanha contínua. O payload informa periodoDias para dimensionamento e também pode trazer início/fim exatos, campanha aberta e orçamento.

O HUMANO define somente o macro: título/tema quando quiser, oferta/promoção/CTA quando quiser, período e limite financeiro. A IA decide canais, públicos, formatos, horários, frequência, testes, remarketing e distribuição do orçamento. Não peça ao usuário para distribuir verba por canal.

Canais disponíveis no ecossistema: ${AVAILABLE_CHANNELS.join(", ")}.
Escolha apenas os canais que fazem sentido para cada campanha e para a duração disponível. Em campanhas curtas, concentre a verba nos poucos canais com maior probabilidade de resposta rápida. Em campanhas longas, use fases, aprendizado, rotação criativa e redistribuição progressiva.

ORÇAMENTO: percentualOrcamento representa a alocação ATUAL sugerida pela IA nos canais pagos. A soma dos canais pagos de cada campanha deve ficar próxima de 100%; canais orgânicos, próprios ou diretos sem compra de mídia devem usar 0. A alocação não é fixa: deve ser tratada como dinâmica e redistribuível conforme CPL, qualidade do lead, oportunidade, venda, receita, margem e fadiga criativa. Nunca proponha ultrapassar o limite financeiro informado.

Cada canal e cada formato/mídia têm uma função própria no funil; não use todos como se fossem posts equivalentes e não copie a mesma mensagem literalmente entre plataformas.

FUNÇÕES OFICIAIS DOS CANAIS E FORMATOS:
${mediaFunctionCatalogForPrompt()}

REGRA GEOGRÁFICA IMPORTANTE: localização e bairro podem orientar a segmentação sem aparecer em todo material. Em campanhas locais, use normalmente intensidade baixa ou média. Em conteúdo orgânico e descoberta, priorize dor, benefício, educação, arquitetura, prova e produto. Mencione a localização explicitamente apenas em parte das peças (em geral 20–30%), aumentando o uso em Google Search, SEO local, LP e conteúdos de alta intenção. Evite títulos repetitivos do tipo “no bairro X” em todas as peças.

Frequência: respeite a função oficial de cada canal. Mídia paga pode ficar contínua com renovação por fadiga/performance; WhatsApp/e-mail devem responder a comportamento e estágio; Site/LP são destinos e não devem receber uma falsa frequência de postagem; SMS é gatilho pontual, não mídia de descoberta.

Dimensione aproximadamente 1 campanha/fase para até 1 dia, 2 para até 7 dias, 3 para até 30 dias, 5 para até 60 dias, 8 para até 90 dias, 10 para até 180 dias e no máximo 12 fases para períodos maiores. Campanhas podem se sobrepor quando fizer sentido.

Retorne APENAS JSON válido, sem markdown, no formato {"campanhas":[...]}. Cada campanha precisa: nome, objetivo, produtoServico, publico, regiao opcional, oferta, mensagemCentral, fase, inicioOffsetDias, duracaoDias, intensidadeGeografica (baixa|media|alta), regraComunicacaoGeografica, canais, kpiPrincipal, metaPrincipal, materiaisPlanejados. Cada canal precisa: canal, funcao, etapaFunil, formatos[], frequencia, quantidadeMateriais, kpiPrincipal e percentualOrcamento. A resposta da IA será normalizada pelas funções oficiais acima.`;

export async function enrichMediaPlanForPeriod(
  tenantId: string,
  conteudoBase: MediaPlanConteudo,
  periodoDias: number,
): Promise<MediaPlanConteudo> {
  const safePeriod = Math.min(3650, Math.max(1, Math.round(periodoDias)));
  const fallback = fallbackCampaigns(conteudoBase, safePeriod);
  let campanhas = fallback;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: safePeriod > 90 ? 7000 : 5000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            periodoDias: safePeriod,
            periodoInicioEm: conteudoBase.periodoInicioEm,
            periodoFimEm: conteudoBase.periodoFimEm,
            periodoAberto: conteudoBase.periodoAberto,
            nomeCampanha: conteudoBase.nomeCampanha,
            ofertaCampanha: conteudoBase.ofertaCampanha,
            orcamento: conteudoBase.orcamento,
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
      ? parsed.campanhas.map((item, index) => normalizeCampaign(item, index, safePeriod)).filter((item): item is MediaPlanCampaign => Boolean(item))
      : [];
    const minimumCampaigns = safePeriod <= 7 ? 1 : 2;
    if (normalized.length >= minimumCampaigns) {
      campanhas = normalized.map((campaign, index) => mergeChannelCoverage(campaign, fallback[index % fallback.length]!));
    }
  } catch (err) {
    logger.warn({ err, tenantId, periodoDias: safePeriod }, "media-plan-period: IA falhou; usando campanhas determinísticas");
  }

  const totalAcoesPlanejadas = campanhas.reduce((acc, campanha) => acc + campanha.materiaisPlanejados, 0);
  return {
    ...conteudoBase,
    periodoDias: safePeriod,
    campanhas,
    totalAcoesPlanejadas,
    statusPlanejamento: "em_revisao",
    aprovadoEm: null,
    versaoPlanejamento: Math.max(1, conteudoBase.versaoPlanejamento ?? 1),
    versaoFuncoesMidia: MEDIA_FUNCTION_VERSION,
  };
}