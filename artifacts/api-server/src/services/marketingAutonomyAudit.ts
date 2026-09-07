import { and, desc, eq, inArray } from "drizzle-orm";
import { adCampaignEventsTable, adCampaignsTable, db } from "@workspace/db";

const AUTONOMY_EVENT_TYPES = [
  "budget_redistribution_auto_applied",
  "budget_redistribution_auto_hold",
  "budget_redistribution_auto_failed",
  "budget_redistribution_applied",
  "budget_redistribution_hold",
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
    .limit(Math.max(limit, input.mediaPlanId ? 100 : limit));

  const items: MarketingAutonomyAuditItem[] = [];
  for (const row of rows) {
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
    });
    if (items.length >= limit) break;
  }

  const applied = items.filter((item) => item.eventType.includes("applied")).length;
  const failed = items.filter((item) => item.eventType.includes("failed")).length;
  const holds = items.filter((item) => item.eventType.includes("hold")).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: { total: items.length, applied, failed, holds },
    items,
  };
}
