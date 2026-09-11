/**
 * Calendário estratégico do Plano de Mídia.
 *
 * O Planejador define o que deve acontecer no período; ele NÃO gera a peça final.
 * Cada linha vira uma tarefa de produção que o Gerador de Conteúdo executará depois.
 *
 * Regra importante: a cobertura de canais e a função de cada mídia são determinísticas.
 * A IA melhora títulos e ângulos, mas não pode trocar o papel de Reels, Search, LP etc.
 */
import {
  db,
  mediaPlansTable,
  contentCalendarItemsTable,
  CONTENT_CALENDAR_TIPOS,
  type ContentCalendarTipo,
  type MediaPlanCampaign,
  type MediaPlanCampaignChannel,
} from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { alignMediaChannelFunction, mediaActionFunction } from "./media-channel-functions.js";

const VALID_TYPES = CONTENT_CALENDAR_TIPOS.join(" | ");
const MAX_CALENDAR_ACTIONS = 90;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const SYSTEM_PROMPT = `Você é o calendário estratégico do Planejador de Mídia do VendorAI.
O plano já definiu campanhas, públicos, canais, frequência, formatos e a função oficial de cada mídia. Sua função é melhorar títulos e ângulos de AÇÕES planejadas, sem produzir o material final.

Cada slot já chega com campanha, canal, formato/tipo, pilar funcional e horário calculado. RESPEITE esses campos. Não transforme Reels em peça de conversão direta quando o slot for descoberta; não trate Stories como Carrossel; não trate Google Search como mídia de awareness; não trate Landing Page como postagem; não transforme WhatsApp, E-mail ou SMS em cópia de social.

REGRA DE SUTILEZA GEOGRÁFICA: quando uma campanha tiver região/bairro, isso orienta a segmentação, mas NÃO deve aparecer em todo título. Em geral, mencione a localização explicitamente em apenas 20–30% das ações. Aumente o uso em Google Search, SEO local e Landing Page; reduza em Reels, Feed, YouTube e conteúdo educativo. Nos demais materiais, trabalhe dor, benefício, comparação, prova, aplicação, produto e transformação sem repetir o nome do local.

Mídia paga pode permanecer ativa continuamente; represente marcos de lançamento, renovação de criativo, otimização e teste A/B. WhatsApp e e-mail devem ter mensagens próprias de relacionamento/conversão, não cópias de posts sociais.

Tipos válidos: ${VALID_TYPES}.

Retorne APENAS JSON válido (array), sem markdown. Mantenha campanha, canal, pilar, tipo e minutoOffset do slot original; refine somente temaSugerido.`;

export class ContentCalendarError extends Error {}

type PlannedAction = {
  diaOffset: number;
  minutoOffset: number;
  campanha: string;
  pilar: string;
  temaSugerido: string;
  canal: string;
  tipo: ContentCalendarTipo;
  formato: string;
  funcao: string;
};

type PlannerCampaign = Pick<
  MediaPlanCampaign,
  | "nome"
  | "objetivo"
  | "produtoServico"
  | "publico"
  | "regiao"
  | "oferta"
  | "mensagemCentral"
  | "fase"
  | "inicioOffsetDias"
  | "duracaoDias"
  | "intensidadeGeografica"
  | "regraComunicacaoGeografica"
  | "canais"
>;

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function inferType(canal: string, formatos: string[] = [], index = 0): ContentCalendarTipo {
  const haystack = normalizeKey(`${canal} ${formatos.join(" ")}`);
  if (haystack.includes("performance max") || haystack.includes("pmax") || haystack.includes("grupo de ativos")) return "performance_max";
  if (haystack.includes("google search") || haystack.includes("pesquisa") || haystack.includes("search ad") || haystack.includes("anuncio de pesquisa")) return "search_ad";
  if (haystack.includes("display")) return "display_ad";
  if (haystack.includes("meta ads") || haystack.includes("facebook ads") || haystack.includes("lead ads") || haystack.includes("stories ads")) return "meta_ad";
  if (haystack.includes("youtube short")) return "youtube_short";
  if (haystack.includes("youtube") || haystack.includes("in-stream")) return "youtube_video";
  if (haystack.includes("tiktok") || haystack.includes("ugc") || haystack.includes("spark ads")) return "tiktok";
  if (haystack.includes("linkedin") || haystack.includes("documento")) return "linkedin_post";
  if (haystack.includes("whatsapp") || haystack.includes("qualificacao") || haystack.includes("follow-up") || haystack.includes("recuperacao")) return "whatsapp";
  if (haystack.includes("e-mail") || haystack.includes("email") || haystack.includes("nutricao") || haystack.includes("reativacao")) return "email";
  if (haystack.includes("blog") || haystack.includes("seo") || haystack.includes("artigo") || haystack.includes("pagina local") || haystack.includes("comparativo")) return "blog";
  if (haystack.includes("landing") || haystack.includes("headline a/b")) return "landing_page";
  if (haystack.includes("site") || haystack.includes("pagina institucional") || haystack.includes("bloco de prova")) return "site";
  if (haystack.includes("sms") || haystack.includes("lembrete") || haystack.includes("cta urgente")) return "sms";
  if (haystack.includes("stories")) return "stories";
  if (haystack.includes("reels")) return "reels";
  if (haystack.includes("carrossel")) return "carrossel";
  if (normalizeKey(canal).includes("instagram")) return (["reels", "carrossel", "stories", "feed"] as ContentCalendarTipo[])[index % 4]!;
  return "feed";
}

function fallbackTitle(
  campaign: PlannerCampaign,
  channel: MediaPlanCampaignChannel,
  index: number,
  formato: string,
  funcao: string,
): string {
  const n = index + 1;
  const normalized = normalizeKey(channel.canal);
  const message = campaign.mensagemCentral || campaign.objetivo;
  const offer = campaign.oferta || campaign.produtoServico;
  const action = funcao.split(":")[0]?.trim();
  if (normalized.includes("instagram")) return `${formato} ${n}: ${message}${action ? ` — foco em ${action.toLowerCase()}` : ""}`;
  if (normalized.includes("facebook") && !normalized.includes("ads")) return `${formato} ${n}: ${message}`;
  if (normalized.includes("meta ads")) return `${formato} Meta ${n}: ${offer} com argumento de ${message}`;
  if (normalized.includes("google search") || normalized === "google") return `${formato} ${n}: ${campaign.produtoServico} para intenção de alta conversão`;
  if (normalized.includes("display")) return `${formato} ${n}: reforçar ${message}`;
  if (normalized.includes("performance")) return `${formato} ${n}: ${campaign.produtoServico} + ${offer}`;
  if (normalized.includes("youtube")) return `${formato} ${n}: ${message}`;
  if (normalized.includes("tiktok")) return `${formato} ${n}: ${message}`;
  if (normalized.includes("linkedin")) return `${formato} LinkedIn ${n}: ${message}`;
  if (normalized.includes("whatsapp")) return `${formato} WhatsApp ${n}: ${offer}`;
  if (normalized.includes("e-mail") || normalized.includes("email")) return `${formato} ${n}: ${message} — CTA para ${offer}`;
  if (normalized.includes("blog") || normalized.includes("seo")) return `${formato} SEO ${n}: ${campaign.produtoServico} — ${message}`;
  if (normalized.includes("landing")) return `${formato} ${n}: ${offer}`;
  if (normalized.includes("site")) return `${formato} ${n}: ${message}`;
  if (normalized.includes("sms")) return `${formato} ${n}: ${offer}`;
  return `${channel.canal} · ${formato} ${n}: ${message}`;
}

function buildLegacyCampaign(plan: typeof mediaPlansTable.$inferSelect, semanas: number): PlannerCampaign {
  const baseChannels = (plan.conteudo.canais ?? []).map<MediaPlanCampaignChannel>((channel, index) =>
    alignMediaChannelFunction({
      canal: channel.canal,
      funcao: channel.motivo || "Apoiar o objetivo do período",
      etapaFunil: index === 0 ? "aquisição" : index === 1 ? "consideração" : "conversão",
      formatos: channel.tiposCampanhaSugeridos ?? [],
      frequencia: normalizeKey(channel.canal).includes("ads") || normalizeKey(channel.canal).includes("google")
        ? "contínuo com otimização por desempenho"
        : "2 a 3 ações por semana",
      quantidadeMateriais: Math.max(2, Math.min(12, semanas * 2)),
      kpiPrincipal: "conversões / oportunidades",
      percentualOrcamento: channel.percentualOrcamento,
    }, { phase: "aquisição e conversão", objective: "Executar a direção estratégica do plano" }),
  );

  const channels = baseChannels.length > 0
    ? baseChannels
    : [
        alignMediaChannelFunction({
          canal: "Instagram",
          funcao: "Descoberta e prova",
          etapaFunil: "consideração",
          formatos: [],
          frequencia: "3 ações por semana",
          quantidadeMateriais: Math.max(4, semanas * 3),
          kpiPrincipal: "engajamento qualificado",
        }, { phase: "aquisição e conversão" }),
        alignMediaChannelFunction({
          canal: "Google Search",
          funcao: "Captura de intenção",
          etapaFunil: "aquisição",
          formatos: [],
          frequencia: "contínuo com otimização semanal",
          quantidadeMateriais: Math.max(3, semanas),
          kpiPrincipal: "CPL / conversões",
        }, { phase: "aquisição e conversão" }),
        alignMediaChannelFunction({
          canal: "WhatsApp",
          funcao: "Conversão e continuidade comercial",
          etapaFunil: "conversão",
          formatos: [],
          frequencia: "por comportamento e estágio do lead",
          quantidadeMateriais: Math.max(3, semanas),
          kpiPrincipal: "taxa de resposta / conversão",
        }, { phase: "aquisição e conversão" }),
      ];

  return {
    nome: "Campanha do período",
    objetivo: "Executar a direção estratégica do plano",
    produtoServico: "Oferta prioritária do negócio",
    publico: "Público prioritário do negócio",
    oferta: "Próximo passo comercial definido no plano",
    mensagemCentral: plan.conteudo.pilaresConteudo?.[0] ?? plan.conteudo.diagnostico,
    fase: "aquisição e conversão",
    inicioOffsetDias: 0,
    duracaoDias: Math.max(1, semanas * 7),
    intensidadeGeografica: "baixa",
    regraComunicacaoGeografica: "A localização orienta a segmentação e aparece apenas quando acrescenta intenção ou contexto.",
    canais: channels,
  };
}

function allocateCounts(campaigns: PlannerCampaign[]): Array<{ campaign: PlannerCampaign; channel: MediaPlanCampaignChannel; count: number }> {
  const pairs = campaigns.flatMap((campaign) =>
    campaign.canais
      .filter((channel) => channel.quantidadeMateriais > 0)
      .map((channel) => ({ campaign, channel, requested: Math.max(1, channel.quantidadeMateriais) })),
  );
  if (pairs.length === 0) return [];

  const requestedTotal = pairs.reduce((sum, pair) => sum + pair.requested, 0);
  const targetTotal = Math.min(MAX_CALENDAR_ACTIONS, Math.max(pairs.length, requestedTotal));
  const counts = pairs.map(() => 1);
  let remaining = targetTotal - counts.length;

  while (remaining > 0) {
    let selected = 0;
    let bestNeed = -Infinity;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index]!;
      const need = pair.requested / counts[index]!;
      if (need > bestNeed) {
        bestNeed = need;
        selected = index;
      }
    }
    counts[selected] = counts[selected]! + 1;
    remaining -= 1;
  }

  return pairs.map((pair, index) => ({ campaign: pair.campaign, channel: pair.channel, count: counts[index]! }));
}

function resolvePeriodMinutes(plan: typeof mediaPlansTable.$inferSelect, semanas: number): number {
  const period = plan.conteudo.periodo;
  if (period?.duracaoValor && period.duracaoValor > 0) {
    return Math.max(60, Math.round(period.duracaoValor * (period.duracaoUnidade === "horas" ? 60 : 1440)));
  }
  if (period?.inicioEm && period.fimEm && !period.aberto) {
    const start = new Date(period.inicioEm).getTime();
    const end = new Date(period.fimEm).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(60, Math.round((end - start) / 60000));
    }
  }
  return Math.max(60, Math.round((plan.conteudo.periodoDias ?? Math.max(1, semanas * 7)) * 1440));
}

function buildDeterministicActions(campaigns: PlannerCampaign[], periodoMinutos: number): PlannedAction[] {
  const allocated = allocateCounts(campaigns);
  const actions: PlannedAction[] = [];
  const shortPeriod = periodoMinutos < 1440;

  for (const { campaign, channel, count } of allocated) {
    const requestedStart = shortPeriod ? 0 : Math.max(0, (campaign.inicioOffsetDias ?? 0) * 1440);
    const start = Math.min(Math.max(0, periodoMinutos - 1), requestedStart);
    const requestedDuration = shortPeriod
      ? periodoMinutos - start
      : Math.max(60, (campaign.duracaoDias ?? Math.ceil(periodoMinutos / 1440)) * 1440);
    const duration = Math.max(1, Math.min(periodoMinutos - start, requestedDuration));

    for (let index = 0; index < count; index += 1) {
      const withinCampaign = count <= 1 ? 0 : Math.round((index * Math.max(0, duration - 1)) / (count - 1));
      const minutoOffset = Math.min(periodoMinutos - 1, start + withinCampaign);
      const formato = channel.formatos[index % Math.max(1, channel.formatos.length)] ?? channel.canal;
      const role = mediaActionFunction(channel.canal, formato, index);
      actions.push({
        diaOffset: Math.floor(minutoOffset / 1440),
        minutoOffset,
        campanha: campaign.nome,
        pilar: role.pilar,
        temaSugerido: fallbackTitle(campaign, channel, index, formato, role.funcao),
        canal: channel.canal,
        tipo: inferType(channel.canal, [formato], index),
        formato,
        funcao: role.funcao,
      });
    }
  }

  return actions.sort((a, b) => a.minutoOffset - b.minutoOffset || a.campanha.localeCompare(b.campanha) || a.canal.localeCompare(b.canal));
}

function overlayAiActions(base: PlannedAction[], rawAi: unknown): PlannedAction[] {
  if (!Array.isArray(rawAi) || base.length === 0) return base;
  const result = base.map((item) => ({ ...item }));
  const used = new Set<number>();

  for (const raw of rawAi) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.temaSugerido !== "string" || !item.temaSugerido.trim()) continue;
    const aiChannel = typeof item.canal === "string" ? normalizeKey(item.canal) : "";
    const aiCampaign = typeof item.campanha === "string" ? normalizeKey(item.campanha) : "";

    let index = result.findIndex((candidate, candidateIndex) =>
      !used.has(candidateIndex)
      && (!aiChannel || normalizeKey(candidate.canal) === aiChannel)
      && (!aiCampaign || normalizeKey(candidate.campanha) === aiCampaign),
    );
    if (index < 0 && aiChannel) {
      index = result.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && normalizeKey(candidate.canal) === aiChannel);
    }
    if (index < 0) continue;

    used.add(index);
    const current = result[index]!;
    result[index] = {
      ...current,
      temaSugerido: item.temaSugerido.trim(),
      pilar: current.pilar,
      tipo: current.tipo,
      minutoOffset: current.minutoOffset,
      diaOffset: current.diaOffset,
    };
  }

  return result;
}

function validTimezone(value: unknown): string {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function localDateTimeParts(date: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    time: `${values.get("hour")}:${values.get("minute")}`,
  };
}

export async function generateContentCalendar(
  tenantId: string,
  mediaPlanId: string,
  semanas: number,
  options: { substituirPlanejado?: boolean; refinarComIa?: boolean } = {},
): Promise<{ items: (typeof contentCalendarItemsTable.$inferSelect)[] }> {
  const [plan] = await db.select().from(mediaPlansTable).where(eq(mediaPlansTable.id, mediaPlanId));
  if (!plan || plan.tenantId !== tenantId) {
    throw new ContentCalendarError("Plano de mídia não encontrado.");
  }

  const campanhas: PlannerCampaign[] = (plan.conteudo.campanhas?.length
    ? plan.conteudo.campanhas
    : [buildLegacyCampaign(plan, semanas)]) as PlannerCampaign[];

  if (campanhas.length === 0) {
    throw new ContentCalendarError("O plano de mídia não tem campanhas ou canais definidos.");
  }

  const periodoMinutos = resolvePeriodMinutes(plan, semanas);
  const periodoDias = Math.max(1, Math.ceil(periodoMinutos / 1440));
  const baseActions = buildDeterministicActions(campanhas, periodoMinutos);
  if (baseActions.length === 0) {
    throw new ContentCalendarError("O plano não possui materiais distribuíveis entre os canais.");
  }

  const calendarBaseConditions = [
    eq(contentCalendarItemsTable.tenantId, tenantId),
    eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId),
  ];
  if (options.substituirPlanejado) {
    calendarBaseConditions.push(ne(contentCalendarItemsTable.status, "planejado"));
  }

  const [ultimoAgendado] = await db
    .select({ dataAgendada: contentCalendarItemsTable.dataAgendada, horarioAgendado: contentCalendarItemsTable.horarioAgendado })
    .from(contentCalendarItemsTable)
    .where(and(...calendarBaseConditions))
    .orderBy(desc(contentCalendarItemsTable.dataAgendada), desc(contentCalendarItemsTable.horarioAgendado))
    .limit(1);

  const configuredStart = plan.conteudo.periodo?.inicioEm ? new Date(plan.conteudo.periodo.inicioEm) : null;
  const dataBase = ultimoAgendado
    ? (() => {
        const time = ultimoAgendado.horarioAgendado || "23:59";
        const d = new Date(`${ultimoAgendado.dataAgendada}T${time}:00`);
        d.setMinutes(d.getMinutes() + 1);
        return d;
      })()
    : configuredStart && Number.isFinite(configuredStart.getTime())
      ? configuredStart
      : new Date();

  let actions = baseActions;
  if (options.refinarComIa !== false) {
    try {
      const representativeLimit = Math.min(36, baseActions.length);
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              periodoDias,
              periodoHoras: Math.round((periodoMinutos / 60) * 100) / 100,
              campanhas: campanhas.map((campaign) => ({
                nome: campaign.nome,
                objetivo: campaign.objetivo,
                produtoServico: campaign.produtoServico,
                publico: campaign.publico,
                regiao: campaign.regiao,
                oferta: campaign.oferta,
                mensagemCentral: campaign.mensagemCentral,
                fase: campaign.fase,
                regraComunicacaoGeografica: campaign.regraComunicacaoGeografica,
                canais: campaign.canais,
              })),
              amostraDeSlotsParaRefinar: baseActions.slice(0, representativeLimit),
              instrucao: `Refine até ${representativeLimit} slots mantendo exatamente campanha, canal, formato, função, pilar, tipo e minutoOffset. Não remova canais, não mude a função da mídia e não altere o horário calculado.`,
            }),
          },
        ],
      });
      const textBlock = response.content.find((block) => block.type === "text");
      const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
      if (raw) {
        const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
        actions = overlayAiActions(baseActions, parsed);
      }
    } catch {
      actions = baseActions;
    }
  }

  const timezone = validTimezone(plan.conteudo.publicacaoOrganica?.timezone);
  const rows = actions.slice(0, MAX_CALENDAR_ACTIONS).map((item) => {
    const scheduledAt = new Date(dataBase.getTime() + Math.max(0, item.minutoOffset) * 60000);
    const local = localDateTimeParts(scheduledAt, timezone);
    return {
      tenantId,
      mediaPlanId,
      dataAgendada: local.date,
      horarioAgendado: local.time,
      pilar: `${item.campanha} · ${item.pilar}`,
      temaSugerido: item.temaSugerido,
      tipo: item.tipo,
      canal: item.canal,
    };
  });

  if (options.substituirPlanejado) {
    const items = await db.transaction(async (tx) => {
      await tx
        .delete(contentCalendarItemsTable)
        .where(
          and(
            eq(contentCalendarItemsTable.tenantId, tenantId),
            eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId),
            eq(contentCalendarItemsTable.status, "planejado"),
          ),
        );
      return tx.insert(contentCalendarItemsTable).values(rows).returning();
    });
    return { items };
  }

  const items = await db.insert(contentCalendarItemsTable).values(rows).returning();
  return { items };
}
