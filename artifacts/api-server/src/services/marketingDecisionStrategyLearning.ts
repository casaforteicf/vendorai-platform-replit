import { and, desc, eq } from "drizzle-orm";
import { adCampaignEventsTable, adCampaignsTable, db } from "@workspace/db";

const LEARNING_EVENT = "budget_redistribution_learning_evaluated";
const MAX_EVENTS = 40;

type Verdict = "melhorou" | "piorou" | "inconclusivo";

type LearningRow = {
  campaignId: string;
  campaignName: string | null;
  platform: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function verdictOf(metadata: Record<string, unknown>): Verdict | null {
  const verdict = metadata.verdict;
  return verdict === "melhorou" || verdict === "piorou" || verdict === "inconclusivo" ? verdict : null;
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRoas(value: unknown) {
  const parsed = num(value);
  return parsed === null ? "—" : `${parsed.toFixed(2)}x`;
}

function formatDecision(row: LearningRow): string | null {
  const metadata = row.metadata;
  const verdict = verdictOf(metadata);
  if (!verdict) return null;

  const before = asRecord(metadata.before) ?? {};
  const deltas = asRecord(metadata.deltas) ?? {};
  const reason = typeof metadata.reason === "string" ? metadata.reason : "Sem justificativa registrada.";
  const windowHours = num(metadata.evaluationWindowHours);
  const incrementalRoas = formatRoas(metadata.postIncrementalRoas);
  const campaign = row.campaignName?.trim() || `campanha ${row.campaignId.slice(0, 8)}`;
  const platform = row.platform ? ` · ${row.platform}` : "";

  return `- ${verdict.toUpperCase()}: ${campaign}${platform}. Referência ROAS ${formatRoas(before.roas)}; pós-decisão +R$ ${Math.max(0, num(deltas.spend) ?? 0).toFixed(2)} de gasto, +${Math.max(0, num(deltas.leads) ?? 0)} lead(s), +${Math.max(0, num(deltas.sales) ?? 0)} venda(s), ROAS incremental ${incrementalRoas}${windowHours !== null ? ` em ~${Math.round(windowHours)}h` : ""}. ${reason}`;
}

/**
 * Transforma a trilha real de aprendizado pós-redistribuição em memória
 * estratégica consumível pelo próximo Plano de Mídia.
 *
 * Não cria score opaco nem memória paralela: lê apenas eventos já auditados.
 * O bloco instrui o planejador a usar recorrência como evidência e a manter
 * casos isolados/inconclusivos com baixa confiança.
 */
export async function buildMarketingDecisionStrategyLearningBlock(tenantId: string): Promise<string> {
  const rows = await db
    .select({
      campaignId: adCampaignEventsTable.campaignId,
      campaignName: adCampaignsTable.itemLabel,
      platform: adCampaignsTable.plataforma,
      metadata: adCampaignEventsTable.metadata,
      createdAt: adCampaignEventsTable.createdAt,
    })
    .from(adCampaignEventsTable)
    .leftJoin(adCampaignsTable, eq(adCampaignsTable.id, adCampaignEventsTable.campaignId))
    .where(and(
      eq(adCampaignEventsTable.tenantId, tenantId),
      eq(adCampaignEventsTable.eventType, LEARNING_EVENT),
    ))
    .orderBy(desc(adCampaignEventsTable.createdAt))
    .limit(MAX_EVENTS);

  const normalized: LearningRow[] = rows.map((row) => ({
    campaignId: row.campaignId,
    campaignName: row.campaignName ?? null,
    platform: row.platform ?? null,
    metadata: (asRecord(row.metadata) ?? {}),
    createdAt: row.createdAt,
  }));

  const counts = normalized.reduce((acc, row) => {
    const verdict = verdictOf(row.metadata);
    if (verdict) acc[verdict]++;
    return acc;
  }, { melhorou: 0, piorou: 0, inconclusivo: 0 });

  const meaningful = normalized
    .filter((row) => verdictOf(row.metadata) !== "inconclusivo")
    .slice(0, 12)
    .map(formatDecision)
    .filter((line): line is string => Boolean(line));

  if (normalized.length === 0) return "";

  const confidence = meaningful.length >= 6 ? "moderada" : meaningful.length >= 3 ? "baixa a moderada" : "baixa";
  const evidence = meaningful.length
    ? meaningful.join("\n")
    : "- Ainda não existem decisões com resultado conclusivo; preserve a estratégia atual e continue coletando evidência.";

  return `\n## Memória de decisões de orçamento do próprio tenant\nForam avaliadas ${normalized.length} decisão(ões): ${counts.melhorou} melhoraram, ${counts.piorou} pioraram e ${counts.inconclusivo} ficaram inconclusivas. Confiança global atual: ${confidence}.\n${evidence}\n\nRegra para o próximo planejamento: trate decisões que melhoraram repetidamente como sinal para aumentar a prioridade relativa de combinações semelhantes de plataforma/objetivo, e decisões que pioraram repetidamente como sinal para reduzir prioridade, revisar mensagem/oferta/segmentação ou exigir nova evidência antes de escalar. Não copie orçamento passado mecanicamente, não transforme um único caso em regra geral e não interprete casos inconclusivos como sucesso ou fracasso. O teto humano continua soberano.\n`;
}
