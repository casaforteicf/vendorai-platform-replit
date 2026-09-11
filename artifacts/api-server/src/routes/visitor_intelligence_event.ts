import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, webBehaviorEventsTable } from "@workspace/db";

const router: IRouter = Router();

const eventSchema = z.object({
  anonymousSessionId: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  eventType: z.enum([
    "session_start",
    "heartbeat",
    "page_view",
    "screen_view",
    "cta_click",
    "form_start",
    "form_submit",
    "feature_use",
    "search",
    "login",
    "signup",
    "conversion",
    "engagement",
    "error",
  ]),
  pageUrl: z.string().trim().max(2000).optional(),
  path: z.string().trim().max(1000).optional(),
  referrer: z.string().trim().max(2000).optional(),
  utmCampaign: z.string().trim().max(500).optional(),
  engagedMs: z.number().int().min(0).max(86_400_000).optional(),
  scrollDepth: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

function header(req: Parameters<IRouter["use"]>[0] extends never ? never : any, name: string) {
  const value = req.get?.(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

router.post("/visitor-intelligence/event", async (req, res) => {
  const tenantId = (req as typeof req & { user?: { tenantId?: string; id?: string } }).user?.tenantId;
  const userId = (req as typeof req & { user?: { tenantId?: string; id?: string } }).user?.id;
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Evento inválido.", details: parsed.error.issues });
  }

  const d = parsed.data;
  const metadata = {
    ...(d.metadata ?? {}),
    ...(userId ? { userId } : {}),
    country: header(req, "x-vercel-ip-country") ?? header(req, "cf-ipcountry") ?? null,
    region: header(req, "x-vercel-ip-country-region") ?? null,
    city: header(req, "x-vercel-ip-city") ?? null,
  };

  try {
    await db.insert(webBehaviorEventsTable).values({
      anonymousSessionId: d.anonymousSessionId,
      tenantId,
      eventType: d.eventType,
      pageUrl: d.pageUrl ?? null,
      path: d.path ?? null,
      referrer: d.referrer ?? null,
      engagedMs: d.engagedMs ?? null,
      scrollDepth: d.scrollDepth ?? null,
      metadata,
    });
    return res.status(202).json({ accepted: true });
  } catch {
    return res.status(202).json({ accepted: false });
  }
});

export default router;
