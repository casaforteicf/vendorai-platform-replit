import { Router, type IRouter, type Request } from "express";
import { z } from "zod/v4";
import { db, webBehaviorEventsTable } from "@workspace/db";
import { getVisitorIntelligence } from "../services/visitorIntelligence.js";
import { resolveRequestGeo } from "../lib/requestGeo.js";
import {
  registerVisitorPushDevice,
  unregisterVisitorPushDevice,
} from "../services/visitorPushNotifications.js";

const router: IRouter = Router();
const INSTITUTIONAL_TENANT_ID = "1d4ea673-58d0-413a-a554-c9aca72a3121";

const querySchema = z.object({
  minutes: z.coerce.number().int().min(5).max(90 * 24 * 60).optional(),
  onlineWindowSeconds: z.coerce.number().int().min(30).max(300).optional(),
});

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

const pushDeviceSchema = z.object({
  expoPushToken: z.string().trim().min(20).max(300),
  platform: z.enum(["android", "ios", "unknown"]).default("unknown"),
});

function tenantFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { tenantId?: string; platformRole?: string } }).user;
  if (user?.tenantId) return String(user.tenantId);
  if (user?.platformRole === "super_admin") return INSTITUTIONAL_TENANT_ID;
  return null;
}

function userIdFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { sub?: string; id?: string } }).user;
  return user?.sub ?? user?.id ?? null;
}

router.post("/visitor-intelligence/push/register", async (req, res) => {
  const tenantId = tenantFromRequest(req);
  const userId = userIdFromRequest(req);
  if (!tenantId || !userId) return res.status(401).json({ error: "Usuário ou tenant não identificado." });

  const parsed = pushDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dispositivo inválido.", details: parsed.error.issues });
  }

  try {
    const result = await registerVisitorPushDevice({ tenantId, userId, ...parsed.data });
    return res.json(result);
  } catch (error) {
    req.log.warn({ error, tenantId, userId }, "visitor-intelligence: push register failed");
    return res.status(400).json({ error: "Não foi possível registrar as notificações deste aparelho." });
  }
});

router.delete("/visitor-intelligence/push/register", async (req, res) => {
  const tenantId = tenantFromRequest(req);
  const userId = userIdFromRequest(req);
  if (!tenantId || !userId) return res.status(401).json({ error: "Usuário ou tenant não identificado." });

  const parsed = pushDeviceSchema.pick({ expoPushToken: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dispositivo inválido." });

  await unregisterVisitorPushDevice({ tenantId, userId, expoPushToken: parsed.data.expoPushToken });
  return res.json({ registered: false });
});

router.post("/visitor-intelligence/event", async (req, res) => {
  const tenantId = tenantFromRequest(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Evento inválido.", details: parsed.error.issues });
  }

  const d = parsed.data;
  const user = (req as Request & { user?: { sub?: string; id?: string } }).user;
  const geo = await resolveRequestGeo(req);

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
      metadata: {
        ...(d.metadata ?? {}),
        userId: user?.sub ?? user?.id ?? null,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        latitude: geo.latitude,
        longitude: geo.longitude,
        geoSource: geo.source,
      },
    });
    return res.status(202).json({ accepted: true });
  } catch (error) {
    req.log.warn({ error, tenantId, eventType: d.eventType }, "visitor-intelligence: event ingest failed");
    return res.status(202).json({ accepted: false });
  }
});

router.get("/visitor-intelligence", async (req, res) => {
  const tenantId = tenantFromRequest(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Filtros inválidos.", details: parsed.error.issues });
  }

  try {
    const result = await getVisitorIntelligence(tenantId, parsed.data);
    return res.json(result);
  } catch (error) {
    req.log.error({ error, tenantId }, "visitor-intelligence: dashboard failed");
    return res.status(500).json({ error: "Não foi possível carregar Visitor Intelligence." });
  }
});

export default router;
