import { and, desc, eq } from "drizzle-orm";
import { adCampaignEventsTable, adCampaignsTable, db } from "@workspace/db";

const LEARNING_EVENT = "budget_redistribution_learning_evaluated";
const MAX_EVENTS = 80;

type Verdict = "melhorou" | "piorou" | "inconclusivo";

type LearningRow = {
  campaignId: string;
  campaignName: string | null;
  platform: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type PlatformAggregate = {
  platform: string;
  total: number;
  melhorou: number;
  piorou: number;
  inconclusivo: number;
  meaningful: number;
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
  const stage = typeof metadata.evaluationStage === "string" ? ` · janela ${metadata.evaluationStage}` : "";
  const incrementalRoas = formatRoas(metadata.postIncrementalRoas);
  const campaign = row.campaignName?.trim() || `campanha ${row.campaignId.slice(0, 8)}`;
  const platform = row.platform ? ` · ${row.platform}` : "";

  return `- ${verdict.toUpperCase()}: ${campaign}${platform}${stage}. Referência ROAS ${formatRoas(before.roas)}; pós-decisão +R$ ${Math.max(0, num(deltas.spend) ?? 0).toFixed(2)} de gasto, +${Math.max(0, num(deltas.leads) ?? 0)} lead(s), +${Math.max(0, num(deltas.sales) ?? 0)} venda(s), ROAS incremental ${incrementalRoas}${windowHours !== null ? ` em ~${Math.round(windowHours)}h` : ""}. ${reason}`;
}

function normalizePlatform(value: string | null): string {
  const normalized = value?.trim();
  return normalized || "plataforma não identificada";
}

function aggregateByPlatform(rows: LearningRow[]): PlatformAggregate[] {
  const aggregates = new Map<string, PlatformAggregate>();
  for (const row of rows) {
    const verdict = verdictOf(row.metadata);
    if (!verdict) continue;
    const platform = normalizePlatform(row.platform);
    const current = aggregates.get(platform) ?? {
      platform,
      total: 0,
      melhorou: 0,
      piorou: 0,
      inconclusivo: 0,
      meaningful: 0,
    };
    current.total++;
    current[verdict]++;
    if (verdict !== "inconclusivo") current.meaningful++;
    aggregates.set(platform, current);
  }
  return Array.from(aggregates.values()).sort((a, b) => b.meaningful - a.meaningful || b.total - a.total);
}

function formatRecurringPatterns(rows: LearningRow[]): string {
  const patterns = aggregateByPlatform(rows)
    .filter((group) => group.meaningful >= 2)
    .slice(0, 8)
    .map((group) => {
      const positiveShare = group.meaningful > 0 ? group.melhorou / group.meaningful : 0;
      const negativeShare = group.meaningful > 0 ? group.piorou / group.meaningful : 0;
      const sample = `${group.meaningful} decisão(ões) conclusiva(s)`;

      if (group.meaningful >= 3 && positiveShare >= 0.67) {
        return `- PADRÃO POSITIVO em ${group.platform}: ${group.melhorou} melhoraram e ${group.piorou} pioraram (${sample}). Pode elevar a prioridade relativa de estratégias semelhantes nessa plataforma, sempre dentro do teto humano e com nova validação.`;
      }
      if (group.meaningful >= 3 && negativeShare >= 0.67) {
        return `- PADRÃO NEGATIVO em ${group.platform}: ${group.piorou} pioraram e ${group.melhorou} melhoraram (${sample}). Reduza a prioridade relativa ou revise oferta, mensagem, segmentação e destino antes de escalar.`;
      }
      return `- PADRÃO MISTO em ${group.platform}: ${group.melhorou} melhoraram e ${group.piorou} pioraram (${sample}). Não generalize; mantenha testes controlados até separar quais condições explicam a diferença.`;
    });

  if (patterns.length === 0) {
    return "- Ainda não existe recorrência suficiente por plataforma para formar um padrão confiável. Casos isolados continuam apenas como evidência exploratória.";
  }
  return patterns.join("\n");
}

/**
 * Transforma a trilha real de aprendizado pós-redistribuição em memória
 * estratégica consumível pelo próximo Plano de Mídia.
 *
 * Quando existe mais de uma janela para a mesma decisão (24h/72h), somente
 * a avaliação mais recente entra na memória e nas contagens. Assim uma leitura
 * preliminar não infla a evidência nem compete com a avaliação final.
 *
 * A recorrência é calculada explicitamente por plataforma. O planejador não
 * precisa inferir repetição a partir de uma lista de casos isolados.
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

  const latestBySource = new Map<string, LearningRow>();
  const legacy: LearningRow[] = [];
  for (const row of rows) {
    const normalized: LearningRow = {
      campaignId: row.campaignId,
      campaignName: row.campaignName ?? null,
      platform: row.platform ?? null,
      metadata: asRecord(row.metadata) ?? {},
      createdAt: row.createdAt,
    };
    const sourceEventId = typeof normalized.metadata.sourceEventId === "string" ? normalized.metadata.sourceEventId : null;
    if (!sourceEventId) {
      legacy.push(normalized);
      continue;
    }
    if (!latestBySource.has(sourceEventId)) latestBySource.set(sourceEventId, normalized);
  }

  const normalized = [...latestBySource.values(), ...legacy]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 40);

  const counts = normalized.reduce((acc, row) => {
    const verdict = verdictOf(row.metadata);
    if (verdict) acc[verdict]++;
    return acc;
  }, { melhorou: 0, piorou: 0, inconclusivo: 0 });

  const meaningfulRows = normalized.filter((row) => {
    const verdict = verdictOf(row.metadata);
    return verdict === "melhorou" || verdict === "piorou";
  });
  const meaningful = meaningfulRows
    .slice(0, 12)
    .map(formatDecision)
    .filter((line): line is string => Boolean(line));

  if (normalized.length === 0) return "";

  const recurringPatterns = formatRecurringPatterns(normalized);
  const confidence = meaningfulRows.length >= 8 ? "moderada" : meaningfulRows.length >= 4 ? "baixa a moderada" : "baixa";
  const evidence = meaningful.length
    ? meaningful.join("\n")
    : "- Ainda não existem decisões com resultado conclusivo; preserve a estratégia atual e continue coletando evidência.";

  return `\n## Memória de decisões de orçamento do próprio tenant\nForam avaliadas ${normalized.length} decisão(ões) únicas: ${counts.melhorou} melhoraram, ${counts.piorou} pioraram e ${counts.inconclusivo} ficaram inconclusivas. Quando há janelas de 24h e 72h para a mesma decisão, vale apenas a leitura mais recente. Confiança global atual: ${confidence}.\n\n### Padrões recorrentes calculados\n${recurringPatterns}\n\n### Evidências recentes\n${evidence}\n\nRegra para o próximo planejamento: use PRIMEIRO os padrões recorrentes calculados acima e só depois os casos individuais como contexto. Um padrão positivo exige recorrência; um padrão negativo exige recorrência; padrão misto exige novos testes. Não copie orçamento passado mecanicamente, não transforme um único caso em regra geral e não interprete casos inconclusivos como sucesso ou fracasso. O teto humano continua soberano.\n`;
}
