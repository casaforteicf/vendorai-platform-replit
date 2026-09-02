import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, webBehaviorEventsTable } from "@workspace/db";
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
    const adCampaignId = await resolveAdCampaignFromUtm(
      tenantId,
      data.utmCampaign ?? undefined,
      logger,
    );

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
