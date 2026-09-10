import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, generatedSitesTable, leadsTable, webBehaviorEventsTable } from "@workspace/db";
import { resolveAdCampaignFromUtm } from "../lib/adAttribution.js";
import { logger } from "../lib/logger.js";

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
    const [adCampaignId, coldProspectLeadId] = await Promise.all([
      resolveAdCampaignFromUtm(tenantId, data.utmCampaign ?? undefined, logger),
      resolveColdProspectLeadId(tenantId, data.siteIdentifier),
    ]);

    await db.insert(webBehaviorEventsTable).values({
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
      },
    });

    // A personalized prospect LP carries its leadId only in generated_sites.config.
    // Turning anonymous page behavior into intent happens only for that exact tenant + slug,
    // preventing cross-tenant attribution and keeping ordinary public sites unchanged.
    if (coldProspectLeadId) {
      const boost = INTENT_BOOST[data.eventType];
      await db
        .update(leadsTable)
        .set({
          intentScore: sql<number>`LEAST(100, COALESCE(${leadsTable.intentScore}, 0) + ${boost})`,
          lastIntentUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(leadsTable.id, coldProspectLeadId),
          eq(leadsTable.tenantId, tenantId),
        ));
    }

    res.status(202).json({ accepted: true });
  } catch (err) {
    logger.warn(
      { err, tenantId, eventType: data.eventType, channel: data.channel ?? null },
      "generated-site-touchpoint: ingest failed",
    );
    // Telemetry is best-effort and must never block the visitor's navigation or channel click.
    res.status(202).json({ accepted: false });
  }
});

export default router;
