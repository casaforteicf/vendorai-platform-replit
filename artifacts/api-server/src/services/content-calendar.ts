/**
 * Calendário estratégico do Plano de Mídia.
 *
 * O Planejador define o que deve acontecer no período; ele NÃO gera a peça final.
 * Cada linha vira uma tarefa de produção que o Gerador de Conteúdo executará depois.
 *
 * Regra importante: a cobertura de canais é determinística. A IA melhora títulos e
 * ângulos, mas nunca pode reduzir um plano multicanal a uma sequência só de Instagram.
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
import { and, desc, eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const VALID_TYPES = CONTENT_CALENDAR_TIPOS.join(" | ");
const MAX_CALENDAR_ACTIONS = 90;

const SYSTEM_PROMPT = `Você é o calendário estratégico do Planejador de Mídia do VendorAI.
O plano já definiu campanhas, públicos, canais, frequência e objetivos. Sua função é melhorar títulos e ângulos de AÇÕES planejadas, sem produzir o material final.

Cada ação precisa ter um tema/título específico, canal, formato, campanha e pilar. Distribua os canais de acordo com a função de cada um no funil; não copie a mesma frase em todas as plataformas.

REGRA DE SUTILEZA GEOGRÁFICA: quando uma campanha tiver região/bairro, isso orienta a segmentação, mas NÃO deve aparecer em todo título. Em geral, mencione a localização explicitamente em apenas 20–30% das ações. Aumente o uso em Google Search, SEO local e Landing Page; reduza em Reels, Feed, YouTube e conteúdo educativo. Nos demais materiais, trabalhe dor, benefício, comparação, prova, aplicação, produto e transformação sem repetir o nome do local.

Mídia paga pode permanecer ativa continuamente; represente marcos de lançamento, renovação de criativo, otimização e teste A/B. WhatsApp e e-mail devem ter mensagens próprias de relacionamento/conversão, não cópias de posts sociais.

Tipos válidos: ${VALID_TYPES}.

Retorne APENAS JSON válido (array), sem markdown:
[
  {
    "diaOffset": 0,
    "campanha": "nome exato da campanha",
    "pilar": "dor | educação | produto | prova | autoridade | oferta | conversão | otimização",
    "temaSugerido": "título/ação específica e natural",
    "canal": "nome exato do canal",
    "tipo": "um dos tipos válidos"
  }
]`;

export class ContentCalendarError extends Error {}

type PlannedAction = {
  diaOffset: number;
  campanha: string;
  pilar: string;
  temaSugerido: string;
  canal: string;
  tipo: ContentCalendarTipo;
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
  if (haystack.includes("performance max") || haystack.includes("pmax")) return "performance_max";
  if (haystack.includes("google search") || haystack.includes("pesquisa") || haystack.includes("search ad")) return "search_ad";
  if (haystack.includes("display")) return "display_ad";
  if (haystack.includes("meta ads") || haystack.includes("facebook ads")) return "meta_ad";
  if (haystack.includes("youtube short")) return "youtube_short";
  if (haystack.includes("youtube")) return "youtube_video";
  if (haystack.includes("tiktok")) return "tiktok";
  if (haystack.includes("linkedin")) return "linkedin_post";
  if (haystack.includes("whatsapp")) return "whatsapp";
  if (haystack.includes("e-mail") || haystack.includes("email")) return "email";
  if (haystack.includes("blog") || haystack.includes("seo")) return "blog";
  if (haystack.includes("landing")) return "landing_page";
  if (haystack.includes("site")) return "site";
  if (haystack.includes("sms")) return "sms";
  if (haystack.includes("stories")) return "stories";
  if (haystack.includes("reels")) return "reels";
  if (haystack.includes("carrossel")) return "carrossel";
  if (normalizeKey(canal).includes("instagram")) return (["reels", "carrossel", "stories", "feed"] as ContentCalendarTipo[])[index % 4]!;
  return "feed";
}

function normalizeType(value: unknown, canal = "", formatos: string[] = [], index = 0): ContentCalendarTipo {
  if (typeof value === "string" && (CONTENT_CALENDAR_TIPOS as readonly string[]).includes(value)) {
    return value as ContentCalendarTipo;
  }
  return inferType(canal, formatos, index);
}

function pilarForChannel(canal: string, index: number): string {
  const normalized = normalizeKey(canal);
  if (normalized.includes("google") || normalized.includes("ads") || normalized.includes("performance") || normalized.includes("display")) {
    return index % 3 === 0 ? "oferta" : index % 3 === 1 ? "conversão" : "otimização";
  }
  if (normalized.includes("whatsapp") || normalized.includes("email") || normalized.includes("sms")) {
    return index % 2 === 0 ? "conversão" : "relacionamento";
  }
  if (normalized.includes("landing") || normalized.includes("site")) return index % 2 === 0 ? "conversão" : "prova";
  if (normalized.includes("blog") || normalized.includes("seo")) return index % 2 === 0 ? "educação" : "autoridade";
  return ["dor", "educação", "produto", "prova", "autoridade", "oferta"][index % 6]!;
}

function fallbackTitle(campaign: PlannerCampaign, channel: MediaPlanCampaignChannel, index: number): string {
  const n = index + 1;
  const normalized = normalizeKey(channel.canal);
  const message = campaign.mensagemCentral || campaign.objetivo;
  const offer = campaign.oferta || campaign.produtoServico;
  if (normalized.includes("instagram")) return `${message} — peça ${n} para ${channel.formatos[index % Math.max(1, channel.formatos.length)] ?? "conteúdo social"}`;
  if (normalized.includes("meta ads")) return `Criativo Meta ${n}: ${offer} com argumento de ${message}`;
  if (normalized.includes("google search") || normalized === "google") return `Anúncio de busca ${n}: ${campaign.produtoServico} para intenção de alta conversão`;
  if (normalized.includes("display")) return `Variação Display ${n}: ${message}`;
  if (normalized.includes("performance")) return `Ativo Performance Max ${n}: ${campaign.produtoServico} + ${offer}`;
  if (normalized.includes("youtube")) return `Vídeo ${n}: ${message}`;
  if (normalized.includes("tiktok")) return `Vídeo curto ${n}: ${message}`;
  if (normalized.includes("linkedin")) return `Conteúdo LinkedIn ${n}: ${message}`;
  if (normalized.includes("whatsapp")) return `Mensagem WhatsApp ${n}: ${offer}`;
  if (normalized.includes("e-mail") || normalized.includes("email")) return `E-mail ${n}: ${message} — CTA para ${offer}`;
  if (normalized.includes("blog") || normalized.includes("seo")) return `Conteúdo SEO ${n}: ${campaign.produtoServico} — ${message}`;
  if (normalized.includes("landing")) return `Variação de Landing Page ${n}: ${offer}`;
  if (normalized.includes("site")) return `Ajuste de site ${n}: ${message}`;
  if (normalized.includes("sms")) return `SMS ${n}: ${offer}`;
  return `${channel.canal} · ação ${n}: ${message}`;
}

function buildLegacyCampaign(plan: typeof mediaPlansTable.$inferSelect, semanas: number): PlannerCampaign {
  const baseChannels = (plan.conteudo.canais ?? []).map<MediaPlanCampaignChannel>((channel, index) => ({
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
  }));

  const channels = baseChannels.length > 0
    ? baseChannels
    : [
        {
          canal: "Instagram",
          funcao: "Descoberta e prova",
          etapaFunil: "consideração",
          formatos: ["Reels", "Carrossel", "Stories"],
          frequencia: "3 ações por semana",
          quantidadeMateriais: Math.max(4, semanas * 3),
          kpiPrincipal: "engajamento qualificado",
        },
        {
          canal: "Google Search",
          funcao: "Captura de intenção",
          etapaFunil: "aquisição",
          formatos: ["Anúncio de pesquisa"],
          frequencia: "contínuo com otimização semanal",
          quantidadeMateriais: Math.max(3, semanas),
          kpiPrincipal: "CPL / conversões",
        },
        {
          canal: "WhatsApp",
          funcao: "Conversão e continuidade comercial",
          etapaFunil: "conversão",
          formatos: ["Mensagem", "Follow-up"],
          frequencia: "por comportamento e estágio do lead",
          quantidadeMateriais: Math.max(3, semanas),
          kpiPrincipal: "taxa de resposta / conversão",
        },
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
    duracaoDias: Math.max(7, semanas * 7),
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

function buildDeterministicActions(campaigns: PlannerCampaign[], periodoDias: number): PlannedAction[] {
  const allocated = allocateCounts(campaigns);
  const actions: PlannedAction[] = [];

  for (const { campaign, channel, count } of allocated) {
    const start = Math.max(0, Math.min(periodoDias - 1, campaign.inicioOffsetDias ?? 0));
    const duration = Math.max(1, Math.min(periodoDias - start, campaign.duracaoDias ?? periodoDias));
    for (let index = 0; index < count; index += 1) {
      const withinCampaign = count <= 1 ? 0 : Math.round((index * Math.max(0, duration - 1)) / (count - 1));
      actions.push({
        diaOffset: Math.min(periodoDias - 1, start + withinCampaign),
        campanha: campaign.nome,
        pilar: pilarForChannel(channel.canal, index),
        temaSugerido: fallbackTitle(campaign, channel, index),
        canal: channel.canal,
        tipo: inferType(channel.canal, channel.formatos, index),
      });
    }
  }

  return actions.sort((a, b) => a.diaOffset - b.diaOffset || a.campanha.localeCompare(b.campanha) || a.canal.localeCompare(b.canal));
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
      diaOffset: Number.isFinite(Number(item.diaOffset)) ? Math.max(0, Math.round(Number(item.diaOffset))) : current.diaOffset,
      pilar: typeof item.pilar === "string" && item.pilar.trim() ? item.pilar.trim() : current.pilar,
      temaSugerido: item.temaSugerido.trim(),
      tipo: normalizeType(item.tipo, current.canal, [], index),
    };
  }

  return result;
}

export async function generateContentCalendar(
  tenantId: string,
  mediaPlanId: string,
  semanas: number,
  options: { substituirPlanejado?: boolean } = {},
): Promise<{ items: (typeof contentCalendarItemsTable.$inferSelect)[] }> {
  const [plan] = await db.select().from(mediaPlansTable).where(eq(mediaPlansTable.id, mediaPlanId));
  if (!plan || plan.tenantId !== tenantId) {
    throw new ContentCalendarError("Plano de mídia não encontrado.");
  }

  if (options.substituirPlanejado) {
    // Preserva tudo que o usuário já aprovou, recusou, gerou ou publicou.
    // Só reestrutura as sugestões ainda pendentes do Planejador.
    await db
      .delete(contentCalendarItemsTable)
      .where(
        and(
          eq(contentCalendarItemsTable.tenantId, tenantId),
          eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId),
          eq(contentCalendarItemsTable.status, "planejado"),
        ),
      );
  }

  const campanhas: PlannerCampaign[] = (plan.conteudo.campanhas?.length
    ? plan.conteudo.campanhas
    : [buildLegacyCampaign(plan, semanas)]) as PlannerCampaign[];

  if (campanhas.length === 0) {
    throw new ContentCalendarError("O plano de mídia não tem campanhas ou canais definidos.");
  }

  const periodoDias = Math.max(7, Math.min(90, plan.conteudo.periodoDias ?? semanas * 7));
  const baseActions = buildDeterministicActions(campanhas, periodoDias);
  if (baseActions.length === 0) {
    throw new ContentCalendarError("O plano não possui materiais distribuíveis entre os canais.");
  }

  const [ultimoAgendado] = await db
    .select({ dataAgendada: contentCalendarItemsTable.dataAgendada })
    .from(contentCalendarItemsTable)
    .where(and(eq(contentCalendarItemsTable.tenantId, tenantId), eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId)))
    .orderBy(desc(contentCalendarItemsTable.dataAgendada))
    .limit(1);

  const dataBase = ultimoAgendado
    ? (() => {
        const d = new Date(ultimoAgendado.dataAgendada + "T12:00:00");
        d.setDate(d.getDate() + 1);
        return d;
      })()
    : new Date();

  let actions = baseActions;
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
            instrucao: `Refine até ${representativeLimit} slots mantendo exatamente campanha e canal. Não remova canais.`,
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
    // O calendário determinístico já é completo. Falha da IA não pode
    // devolver o sistema para Instagram-only nem bloquear o planejamento.
    actions = baseActions;
  }

  const maxOffset = Math.max(1, periodoDias - 1);
  const rows = actions.slice(0, MAX_CALENDAR_ACTIONS).map((item) => {
    const data = new Date(dataBase);
    data.setDate(data.getDate() + Math.min(maxOffset, Math.max(0, item.diaOffset)));
    return {
      tenantId,
      mediaPlanId,
      dataAgendada: data.toISOString().slice(0, 10),
      pilar: `${item.campanha} · ${item.pilar}`,
      temaSugerido: item.temaSugerido,
      tipo: item.tipo,
      canal: item.canal,
    };
  });

  const items = await db.insert(contentCalendarItemsTable).values(rows).returning();
  return { items };
}
