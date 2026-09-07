import { and, desc, eq, inArray } from "drizzle-orm";
import { adCampaignEventsTable, adCampaignsTable, db } from "@workspace/db";

const AUTONOMY_EVENT_TYPES = [
  "budget_redistribution_auto_applied",
  "budget_redistribution_auto_hold",
  "budget_redistribution_auto_failed",
  "budget_redistribution_applied",
  "budget_redistribution_hold",
  "budget_redistribution_learning_evaluated",
] as const;

export type MarketingAutonomyAuditItem = {
  id: string;
  campaignId: string;
  campaignName: string | null;
  platform: string | null;
  eventType: string;
  severity: string;
  message: string;
  createdAt: Date;
  mediaPlanId: string | null;
  autonomyLevel: number | null;
  authorization: string | null;
  humanCeilingRespected: boolean | null;
  decision: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  learning: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function getMarketingAutonomyAudit(input: {
  tenantId: string;
  mediaPlanId?: string;
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 40));
  const rows = await db
    .select({
      id: adCampaignEventsTable.id,
      campaignId: adCampaignEventsTable.campaignId,
      campaignName: adCampaignsTable.itemLabel,
      platform: adCampaignsTable.plataforma,
      eventType: adCampaignEventsTable.eventType,
      severity: adCampaignEventsTable.severity,
      message: adCampaignEventsTable.message,
      metadata: adCampaignEventsTable.metadata,
      createdAt: adCampaignEventsTable.createdAt,
    })
    .from(adCampaignEventsTable)
    .leftJoin(adCampaignsTable, eq(adCampaignsTable.id, adCampaignEventsTable.campaignId))
    .where(and(
      eq(adCampaignEventsTable.tenantId, input.tenantId),
      inArray(adCampaignEventsTable.eventType, [...AUTONOMY_EVENT_TYPES]),
    ))
    .orderBy(desc(adCampaignEventsTable.createdAt))
    .limit(Math.max(limit * 4, input.mediaPlanId ? 200 : limit * 4));

  const learningBySource = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (row.eventType !== "budget_redistribution_learning_evaluated") continue;
    const metadata = asRecord(row.metadata) ?? {};
    const sourceEventId = typeof metadata.sourceEventId === "string" ? metadata.sourceEventId : null;
    // rows já estão em ordem descrescente; preserve a avaliação mais recente
    // (72h substitui visualmente a preliminar de 24h quando existir).
    if (sourceEventId && !learningBySource.has(sourceEventId)) learningBySource.set(sourceEventId, metadata);
  }

  const items: MarketingAutonomyAuditItem[] = [];
  for (const row of rows) {
    if (row.eventType === "budget_redistribution_learning_evaluated") continue;
    const metadata = asRecord(row.metadata) ?? {};
    const mediaPlanId = typeof metadata.mediaPlanId === "string" ? metadata.mediaPlanId : null;
    if (input.mediaPlanId && mediaPlanId !== input.mediaPlanId) continue;

    const autonomyLevel = Number(metadata.autonomyLevel);
    items.push({
      id: row.id,
      campaignId: row.campaignId,
      campaignName: row.campaignName ?? null,
      platform: row.platform ?? null,
      eventType: row.eventType,
      severity: row.severity,
      message: row.message,
      createdAt: row.createdAt,
      mediaPlanId,
      autonomyLevel: Number.isFinite(autonomyLevel) ? autonomyLevel : null,
      authorization: typeof metadata.authorization === "string" ? metadata.authorization : null,
      humanCeilingRespected: typeof metadata.humanCeilingRespected === "boolean" ? metadata.humanCeilingRespected : null,
      decision: asRecord(metadata.decision),
      schedule: asRecord(metadata.schedule),
      learning: learningBySource.get(row.id) ?? null,
    });
    if (items.length >= limit) break;
  }

  const applied = items.filter((item) => item.eventType.includes("applied")).length;
  const failed = items.filter((item) => item.eventType.includes("failed")).length;
  const holds = items.filter((item) => item.eventType.includes("hold")).length;
  const improved = items.filter((item) => item.learning?.verdict === "melhorou").length;
  const worsened = items.filter((item) => item.learning?.verdict === "piorou").length;
  const inconclusive = items.filter((item) => item.learning?.verdict === "inconclusivo").length;
  const awaitingLearning = items.filter((item) => item.eventType.includes("applied") && !item.learning).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: { total: items.length, applied, failed, holds, improved, worsened, inconclusive, awaitingLearning },
    items,
  };
}
