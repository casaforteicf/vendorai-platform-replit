/**
 * Contrato único de execução do Plano de Mídia.
 *
 * Este módulo é puro (sem IO, sem React) e existe para que backend e frontend
 * derivem o MESMO contexto, os MESMOS parâmetros de mídia e o MESMO estado
 * operacional a partir do planejamento aprovado. Nada aqui persiste dados: o
 * Plano de Mídia continua sendo a fonte de verdade estratégica e o calendário
 * a fonte de verdade da execução.
 *
 * Regras:
 * - sem fallback silencioso para outra campanha (item sem campanha é erro);
 * - sem valores fixos de objetivo/destino: tudo deriva do plano e do canal;
 * - duração de vídeo é um default documentado por formato, não uma decisão
 *   escondida no componente.
 */

export type MarketingAdObjective = "awareness" | "lead" | "sale" | "visit" | "whatsapp";
export type MarketingAdDestination = "landing_page" | "whatsapp" | "produto" | "formulario_lead";

export interface MediaPlanChannelShape {
  canal: string;
  funcao?: string | null;
  etapaFunil?: string | null;
  formatos?: string[] | null;
  kpiPrincipal?: string | null;
}

export interface MediaPlanCampaignShape {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string | null;
  oferta: string;
  mensagemCentral: string;
  regraComunicacaoGeografica?: string | null;
  kpiPrincipal?: string | null;
  metaPrincipal?: string | null;
  duracaoDias?: number | null;
  inicioOffsetDias?: number | null;
  fase?: string | null;
  canais?: MediaPlanChannelShape[] | null;
}

export interface MediaPlanCalendarItemShape {
  id: string;
  tipo: string;
  canal: string;
  pilar: string;
  temaSugerido: string;
  dataAgendada: string;
}

const VIDEO_TYPES = new Set(["reels", "tiktok", "youtube_short", "youtube_video"]);

/** Duração padrão por formato, em segundos. O plano não declara duração por peça. */
export const DEFAULT_VIDEO_DURATION_SECONDS: Record<string, number> = {
  reels: 16,
  tiktok: 16,
  youtube_short: 20,
  youtube_video: 30,
};

export const MIN_VIDEO_DURATION_SECONDS = 4;
export const MAX_VIDEO_DURATION_SECONDS = 30;

export function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Nome da campanha a partir do campo `pilar` do calendário.
 * Formato canônico: "Campanha · pilar". Aceita também o separador legado
 * corrompido (U+FFFD) para não perder itens antigos já gravados.
 */
export function campaignNameFromPilar(pilar: string | null | undefined): string {
  const value = String(pilar ?? "").trim();
  if (!value) return "";
  const parts = value.split(/\s*[·\uFFFD|]\s*/u);
  return (parts[0] ?? value).trim();
}

/** Pilar de conteúdo (texto depois do nome da campanha). */
export function contentPillarFromPilar(pilar: string | null | undefined): string {
  const value = String(pilar ?? "").trim();
  const index = value.search(/[·\uFFFD|]/u);
  if (index < 0) return value;
  return value.slice(index + 1).trim();
}

/**
 * Localiza a campanha do item por nome exato (normalizado).
 * Nunca cai para `campaigns[0]`: um item sem campanha precisa falhar e ser
 * corrigido, em vez de ser produzido com o contexto de outra campanha.
 */
export function findCampaignForItem<T extends Pick<MediaPlanCampaignShape, "id" | "nome">>(
  campaigns: readonly T[],
  item: Pick<MediaPlanCalendarItemShape, "pilar" | "id">,
): T | null {
  const name = normalizeLabel(campaignNameFromPilar(item.pilar));
  if (!name) return null;
  return campaigns.find((campaign) => normalizeLabel(campaign.nome) === name) ?? null;
}

export function channelForItem(
  campaign: Pick<MediaPlanCampaignShape, "canais">,
  item: Pick<MediaPlanCalendarItemShape, "canal">,
): MediaPlanChannelShape | null {
  const channel = normalizeLabel(item.canal);
  return (campaign.canais ?? []).find((entry) => normalizeLabel(entry.canal) === channel) ?? null;
}

export function isVideoType(tipo: string | null | undefined): boolean {
  return VIDEO_TYPES.has(String(tipo ?? "").trim().toLowerCase());
}

function funnelText(campaign: MediaPlanCampaignShape, item: Pick<MediaPlanCalendarItemShape, "canal">): string {
  const channel = channelForItem(campaign, item);
  // O KPI/etapa do canal manda no item; o KPI global da campanha só entra
  // quando o canal não declara nada (evita "ROAS" global transformar toda
  // peça de descoberta em venda).
  const parts = channel
    ? [channel.etapaFunil, channel.kpiPrincipal, campaign.objetivo]
    : [campaign.fase, campaign.objetivo, campaign.kpiPrincipal, campaign.metaPrincipal];
  return normalizeLabel(parts.filter(Boolean).join(" "));
}

/**
 * Objetivo de campanha de anúncio derivado da etapa de funil e do KPI do plano.
 * O enum é o mesmo contrato já aceito por `ad_campaigns.segmentacao.campaignControl`.
 */
export function resolveAdObjective(
  campaign: MediaPlanCampaignShape,
  item: Pick<MediaPlanCalendarItemShape, "canal" | "tipo">,
): MarketingAdObjective {
  const channel = normalizeLabel(item.canal);
  if (channel.includes("whatsapp")) return "whatsapp";

  const funnel = funnelText(campaign, item);

  if (/\b(roas|receita|venda|faturamento|ticket)\b/.test(funnel)) return "sale";
  if (/\b(descoberta|alcance|awareness|reconhecimento|branding)\b/.test(funnel)) return "awareness";
  if (/\b(conversao|conversoes|cpl|cpa|lead|leads|oportunidade)\b/.test(funnel)) return "lead";
  if (/\b(consideracao|remarketing|recuperacao|reativacao)\b/.test(funnel)) return "visit";
  if (channel.includes("google") || channel.includes("search")) return "lead";
  return "awareness";
}

/**
 * Destino do clique derivado do canal, do formato e da existência de landing
 * page aprovada na própria campanha. Não usa WhatsApp como default universal.
 */
export function resolveAdDestination(
  campaign: MediaPlanCampaignShape,
  item: Pick<MediaPlanCalendarItemShape, "canal" | "tipo">,
  options: { hasLandingPage?: boolean } = {},
): MarketingAdDestination {
  const channel = normalizeLabel(item.canal);
  const type = normalizeLabel(item.tipo);
  if (channel.includes("whatsapp")) return "whatsapp";

  const planHasLandingPage = (campaign.canais ?? []).some((entry) => {
    const name = normalizeLabel(entry.canal);
    return name.includes("landing") || name.includes("site");
  });
  if (options.hasLandingPage || planHasLandingPage) return "landing_page";

  if (type === "search_ad" || type === "display_ad" || type === "performance_max") {
    return resolveAdObjective(campaign, item) === "lead" ? "formulario_lead" : "landing_page";
  }
  if (type === "meta_ad" || type === "tiktok") {
    return resolveAdObjective(campaign, item) === "lead" ? "formulario_lead" : "landing_page";
  }
  return "landing_page";
}

export function resolveVideoDurationSeconds(tipo: string | null | undefined): number {
  const key = String(tipo ?? "").trim().toLowerCase();
  const value = DEFAULT_VIDEO_DURATION_SECONDS[key] ?? 16;
  return Math.min(MAX_VIDEO_DURATION_SECONDS, Math.max(MIN_VIDEO_DURATION_SECONDS, value));
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Janela de veiculação do anúncio dentro da fase da campanha.
 * A campanha é a dona do período; a data do item do calendário não define a
 * janela. `planStartDate` é a primeira data do lote/plano (calendário).
 */
export function resolveAdFlightWindow(
  campaign: Pick<MediaPlanCampaignShape, "inicioOffsetDias" | "duracaoDias">,
  planStartDate: string | null | undefined,
  fallbackItemDate: string,
): { startDate: string; endDate: string } {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(planStartDate ?? "")) ? String(planStartDate) : fallbackItemDate;
  const offset = Math.max(0, Math.floor(Number(campaign.inicioOffsetDias ?? 0) || 0));
  const duration = Math.max(1, Math.floor(Number(campaign.duracaoDias ?? 1) || 1));
  const startDate = addDays(base, offset);
  return { startDate, endDate: addDays(startDate, duration - 1) };
}

export type OperationalStateCode =
  | "planned"
  | "authorized"
  | "producing"
  | "in_review"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "skipped"
  | "failed";

export type OperationalStateTone = "muted" | "ready" | "warning" | "success" | "danger";

export interface OperationalStateInput {
  calendarStatus: string;
  hasGeneration?: boolean;
  isVideo?: boolean;
  hasFinalVideo?: boolean;
  publicationStatus?: string | null;
  materializationStatus?: string | null;
  /** true quando um claim de produção está ativo (produção em andamento). */
  producing?: boolean;
}

export interface OperationalState {
  code: OperationalStateCode;
  label: string;
  tone: OperationalStateTone;
}

const STATE_LABELS: Record<OperationalStateCode, { label: string; tone: OperationalStateTone }> = {
  planned: { label: "Planejado", tone: "muted" },
  authorized: { label: "Pronto para produzir", tone: "ready" },
  producing: { label: "Em produção", tone: "warning" },
  in_review: { label: "Em revisão", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  scheduled: { label: "Agendado", tone: "success" },
  published: { label: "Publicado", tone: "success" },
  rejected: { label: "Recusado", tone: "muted" },
  skipped: { label: "Ignorado", tone: "muted" },
  failed: { label: "Falhou", tone: "danger" },
};

export function operationalStateLabel(code: OperationalStateCode): OperationalState {
  const entry = STATE_LABELS[code];
  return { code, ...entry };
}

/**
 * Estado operacional único de uma ação do calendário.
 *
 * Precedência: falha explícita > publicação > estados do calendário > mídia.
 * `gerado` sem arquivo final de vídeo NÃO é "pronto para revisão": é produção
 * ainda em andamento (o roteiro existe, o vídeo não).
 */
export function deriveOperationalState(input: OperationalStateInput): OperationalState {
  const publication = String(input.publicationStatus ?? "").toLowerCase();
  if (publication === "published") return operationalStateLabel("published");
  if (publication === "scheduled" || publication === "queued" || publication === "publishing") {
    return operationalStateLabel("scheduled");
  }

  const status = String(input.calendarStatus ?? "").toLowerCase();
  if (status === "recusado") return operationalStateLabel("rejected");
  if (status === "pulado") return operationalStateLabel("skipped");
  if (status === "publicado") return operationalStateLabel("published");

  if (input.materializationStatus === "failed") return operationalStateLabel("failed");
  if (input.producing || status === "processando") return operationalStateLabel("producing");

  if (status === "gerado") {
    if (input.isVideo && !input.hasFinalVideo) return operationalStateLabel("producing");
    return operationalStateLabel("in_review");
  }
  if (status === "aprovado") {
    return operationalStateLabel(input.hasGeneration ? "approved" : "authorized");
  }
  return operationalStateLabel("planned");
}

/** Rótulo curto de formato, usado em logs e contextos de projeto. */
export function executionKindForType(tipo: string | null | undefined): string {
  const value = String(tipo ?? "").trim().toLowerCase();
  if (isVideoType(value)) return "video";
  if (value === "landing_page" || value === "site") return "site";
  if (value === "meta_ad" || value === "search_ad" || value === "display_ad" || value === "performance_max") return "ad";
  if (value === "whatsapp" || value === "email" || value === "blog" || value === "sms") return "message";
  if (value === "stories") return "story";
  return "feed";
}


/**
 * Seleciona um lote justo entre tenants: round-robin na ordem de primeira
 * aparição, com teto por tenant e teto total. Evita que o backlog antigo de um
 * tenant consuma todas as vagas do worker e deixe os demais sem produção.
 */
export function selectRoundRobinByTenant<T>(
  items: readonly T[],
  getTenantId: (item: T) => string,
  maxPerTenant: number,
  maxTotal: number,
): T[] {
  const total = Math.max(0, Math.floor(maxTotal));
  const perTenant = Math.max(1, Math.floor(maxPerTenant));
  if (total === 0) return [];

  const buckets = new Map<string, T[]>();
  const order: string[] = [];
  for (const item of items) {
    const tenant = getTenantId(item);
    if (!buckets.has(tenant)) {
      buckets.set(tenant, []);
      order.push(tenant);
    }
    buckets.get(tenant)!.push(item);
  }

  const selected: T[] = [];
  let index = 0;
  while (selected.length < total) {
    let progressed = false;
    for (const tenant of order) {
      if (selected.length >= total) break;
      const bucket = buckets.get(tenant)!;
      if (index < bucket.length && index < perTenant) {
        selected.push(bucket[index]!);
        progressed = true;
      }
    }
    if (!progressed) break;
    index += 1;
  }
  return selected;
}
