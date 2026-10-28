import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { agentTasksTable, db, generatedSitesTable, leadsTable, webBehaviorEventsTable } from "@workspace/db";
import { resolveAdCampaignFromUtm } from "../lib/adAttribution.js";
import { logger } from "../lib/logger.js";
import { resolveRequestGeo } from "../lib/requestGeo.js";

const router: IRouter = Router();

const optionalText = z.string().trim().max(2000).nullable().optional();
const payloadSchema = z.object({
  anonymousSessionId: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  eventType: z.enum(["page_view", "cta_click", "form_submit", "product_view"]).default("cta_click"),
  channel: z.enum(["whatsapp", "instagram", "messenger"]).optional(),
  targetHost: z.string().trim().min(1).max(255).optional(),
  pageUrl: z.string().trim().max(2000),
  path: z.string().trim().max(1000).optional(),
  referrer: optionalText,
  siteIdentifier: z.string().trim().max(255).optional(),
  utmSource: optionalText,
  utmMedium: optionalText,
  utmCampaign: optionalText,
  utmContent: optionalText,
  utmTerm: optionalText,
  gclid: optionalText,
  fbclid: optionalText,
});

const INTENT_BOOST: Record<"page_view" | "cta_click" | "form_submit" | "product_view", number> = {
  page_view: 8,
  product_view: 12,
  cta_click: 28,
  form_submit: 40,
};
const CLOSER_INTENT_THRESHOLD = 60;

function prospectLeadIdFromConfig(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  const marketingContext = (config as Record<string, unknown>)["marketingContext"];
  if (!marketingContext || typeof marketingContext !== "object") return null;
  const leadId = (marketingContext as Record<string, unknown>)["leadId"];
  return typeof leadId === "string" && leadId.trim() ? leadId.trim() : null;
}

async function resolveColdProspectLeadId(tenantId: string, siteIdentifier?: string): Promise<string | null> {
  if (!siteIdentifier) return null;
  const [site] = await db
    .select({ config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(
      eq(generatedSitesTable.tenantId, tenantId),
      eq(generatedSitesTable.siteSlug, siteIdentifier),
    ))
    .limit(1);
  return prospectLeadIdFromConfig(site?.config);
}

async function queueCloserIfHot(tenantId: string, leadId: string, intentScore: number, eventType: string, siteIdentifier?: string) {
  if (intentScore < CLOSER_INTENT_THRESHOLD) return;

  const [existing] = await db
    .select({ id: agentTasksTable.id })
    .from(agentTasksTable)
    .where(and(
      eq(agentTasksTable.tenantId, tenantId),
      eq(agentTasksTable.leadId, leadId),
      eq(agentTasksTable.agentName, "closer"),
      inArray(agentTasksTable.status, ["pendente_aprovacao", "aprovado", "executando"]),
    ))
    .limit(1);

  if (!existing) {
    await db.insert(agentTasksTable).values({
      tenantId,
      leadId,
      agentName: "closer",
      actionType: "lead_quente_lp",
      status: "pendente_aprovacao",
      payload: {
        origin: "cold_prospect_lp",
        intentScore,
        threshold: CLOSER_INTENT_THRESHOLD,
        triggerEvent: eventType,
        siteIdentifier: siteIdentifier ?? null,
        instruction: "Prospect demonstrou alta intenção na LP personalizada. Revisar dossiê e conduzir próximo passo comercial sem repetir a prospecção inicial.",
      },
    });
  }

  await db
    .update(leadsTable)
    .set({
      proximaAcao: `Closer: prospect quente na LP (Intent ${Math.round(intentScore)}/100)`,
      updatedAt: new Date(),
    })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));
}

router.post("/generated-site/touchpoint", async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(404).json({ error: "Tenant context not resolved" });
    return;
  }

  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid touchpoint" });
    return;
  }

  const data = parsed.data;
  try {
    const [adCampaignId, coldProspectLeadId, geo] = await Promise.all([
      resolveAdCampaignFromUtm(tenantId, data.utmCampaign ?? undefined, logger),
      resolveColdProspectLeadId(tenantId, data.siteIdentifier),
      resolveRequestGeo(req),
    ]);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.insert(webBehaviorEventsTable).values({
      anonymousSessionId: data.anonymousSessionId,
      tenantId,
      adCampaignId,
      eventType: data.eventType,
      pageUrl: data.pageUrl,
      path: data.path ?? null,
      referrer: data.referrer ?? null,
      landingPageSlug: data.siteIdentifier ?? null,
      metadata: {
        generatedSite: true,
        coldProspectLeadId,
        channel: data.channel ?? null,
        targetHost: data.targetHost ?? null,
        utmSource: data.utmSource ?? null,
        utmMedium: data.utmMedium ?? null,
        utmCampaign: data.utmCampaign ?? null,
        utmContent: data.utmContent ?? null,
        utmTerm: data.utmTerm ?? null,
        gclid: data.gclid ?? null,
        fbclid: data.fbclid ?? null,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        latitude: geo.latitude,
        longitude: geo.longitude,
        geoSource: geo.source,
      },
      });
    });

    if (coldProspectLeadId) {
      const boost = INTENT_BOOST[data.eventType];
      const [updatedLead] = await db
        .update(leadsTable)
        .set({
          intentScore: sql<number>`LEAST(100, COALESCE(${leadsTable.intentScore}, 0) + ${boost})`,
          lastIntentUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(leadsTable.id, coldProspectLeadId),
          eq(leadsTable.tenantId, tenantId),
        ))
        .returning({ intentScore: leadsTable.intentScore });

      const intentScore = Number(updatedLead?.intentScore ?? 0);
      await queueCloserIfHot(tenantId, coldProspectLeadId, intentScore, data.eventType, data.siteIdentifier);
    }

    res.status(202).json({ accepted: true });
  } catch (err) {
    logger.warn(
      { err, tenantId, eventType: data.eventType, channel: data.channel ?? null },
      "generated-site-touchpoint: ingest failed",
    );
    res.status(202).json({ accepted: false });
  }
});

export default router;
