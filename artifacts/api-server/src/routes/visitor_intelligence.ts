import { Router, type IRouter, type Request } from "express";
import { z } from "zod/v4";
import { db, webBehaviorEventsTable } from "@workspace/db";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
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

const webVitalsQuerySchema = z.object({
  minutes: z.coerce.number().int().min(5).max(90 * 24 * 60).optional(),
  device: z.enum(["all", "mobile", "tablet", "desktop"]).optional(),
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

type VitalName = "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
type VitalSample = {
  name: VitalName;
  value: number;
  rating: "good" | "needs-improvement" | "poor" | "unknown";
  path: string;
  deviceCategory: string | null;
  createdAt: Date;
};

type ApiTimingSample = {
  endpoint: string;
  durationMs: number;
  transferSize: number;
  encodedBodySize: number;
  path: string;
  deviceCategory: string | null;
  createdAt: Date;
};

type RuntimeErrorSample = {
  path: string;
  message: string;
  source: string | null;
  deviceCategory: string | null;
  createdAt: Date;
};

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

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1));
  return Number(sorted[index].toFixed(sorted[index] < 10 ? 3 : 1));
}

function vitalSummary(samples: VitalSample[], name: VitalName) {
  const metricSamples = samples.filter((sample) => sample.name === name);
  const values = metricSamples.map((sample) => sample.value);
  const good = metricSamples.filter((sample) => sample.rating === "good").length;
  const needsImprovement = metricSamples.filter((sample) => sample.rating === "needs-improvement").length;
  const poor = metricSamples.filter((sample) => sample.rating === "poor").length;
  return {
    name,
    samples: values.length,
    p75: percentile(values, 0.75),
    median: percentile(values, 0.5),
    goodPercent: values.length ? Math.round((good / values.length) * 100) : null,
    distribution: { good, needsImprovement, poor },
  };
}

function parseRuntimeErrorSample(row: { path: string | null; metadata: Record<string, unknown>; createdAt: Date }): RuntimeErrorSample | null {
  const metadata = row.metadata ?? {};
  if (metadata["kind"] !== "runtime_error") return null;
  const message = typeof metadata["message"] === "string" ? metadata["message"].trim().slice(0, 300) : "";
  if (!message) return null;
  const rawPath = row.path || "/";
  const pathname = rawPath.split("?")[0]?.replace(/\/$/, "") || "/";
  return {
    path: pathname,
    message,
    source: typeof metadata["source"] === "string" ? metadata["source"] : null,
    deviceCategory: typeof metadata["deviceCategory"] === "string" ? metadata["deviceCategory"] : null,
    createdAt: row.createdAt,
  };
}

function parseApiTimingSample(row: { path: string | null; metadata: Record<string, unknown>; createdAt: Date }): ApiTimingSample | null {
  const metadata = row.metadata ?? {};
  if (metadata["kind"] !== "api_timing") return null;
  const endpoint = typeof metadata["endpoint"] === "string" ? metadata["endpoint"] : null;
  const durationMs = Number(metadata["durationMs"]);
  const transferSize = Number(metadata["transferSize"] ?? 0);
  const encodedBodySize = Number(metadata["encodedBodySize"] ?? 0);
  if (!endpoint || !endpoint.startsWith("/api/") || !Number.isFinite(durationMs) || durationMs < 0) return null;
  const rawPath = row.path || "/";
  const pathname = rawPath.split("?")[0]?.replace(/\/$/, "") || "/";
  return {
    endpoint,
    durationMs,
    transferSize: Number.isFinite(transferSize) && transferSize >= 0 ? transferSize : 0,
    encodedBodySize: Number.isFinite(encodedBodySize) && encodedBodySize >= 0 ? encodedBodySize : 0,
    path: pathname,
    deviceCategory: typeof metadata["deviceCategory"] === "string" ? metadata["deviceCategory"] : null,
    createdAt: row.createdAt,
  };
}

function parseVitalSample(row: { path: string | null; metadata: Record<string, unknown>; createdAt: Date }): VitalSample | null {
  const metadata = row.metadata ?? {};
  if (metadata["kind"] !== "web_vital") return null;
  const metric = metadata["metric"];
  if (metric !== "CLS" && metric !== "FCP" && metric !== "INP" && metric !== "LCP" && metric !== "TTFB") return null;
  const value = Number(metadata["value"]);
  if (!Number.isFinite(value) || value < 0) return null;
  const rawRating = metadata["rating"];
  const rating = rawRating === "good" || rawRating === "needs-improvement" || rawRating === "poor" ? rawRating : "unknown";
  const rawPath = row.path || "/";
  const pathname = rawPath.split("?")[0]?.replace(/\/$/, "") || "/";
  return {
    name: metric,
    value,
    rating,
    path: pathname,
    deviceCategory: typeof metadata["deviceCategory"] === "string" ? metadata["deviceCategory"] : null,
    createdAt: row.createdAt,
  };
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
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.insert(webBehaviorEventsTable).values({
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
    });
    return res.status(202).json({ accepted: true });
  } catch (error) {
    req.log.warn({ error, tenantId, eventType: d.eventType }, "visitor-intelligence: event ingest failed");
    return res.status(202).json({ accepted: false });
  }
});

router.get("/visitor-intelligence/web-vitals", async (req, res) => {
  const tenantId = tenantFromRequest(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const parsed = webVitalsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Filtros inválidos.", details: parsed.error.issues });
  }

  const minutes = parsed.data.minutes ?? 10_080;
  const device = parsed.data.device ?? "all";
  const now = Date.now();
  const since = new Date(now - minutes * 60_000);
  const previousSince = new Date(now - minutes * 2 * 60_000);
  const previous2Since = new Date(now - minutes * 3 * 60_000);

  try {
    const rows = await db
      .select({
        path: webBehaviorEventsTable.path,
        metadata: webBehaviorEventsTable.metadata,
        createdAt: webBehaviorEventsTable.createdAt,
      })
      .from(webBehaviorEventsTable)
      .where(and(
        eq(webBehaviorEventsTable.tenantId, tenantId),
        eq(webBehaviorEventsTable.eventType, "engagement"),
        gte(webBehaviorEventsTable.createdAt, since),
      ))
      .orderBy(desc(webBehaviorEventsTable.createdAt))
      .limit(10_000);

    const previousRows = await db
      .select({
        path: webBehaviorEventsTable.path,
        metadata: webBehaviorEventsTable.metadata,
        createdAt: webBehaviorEventsTable.createdAt,
      })
      .from(webBehaviorEventsTable)
      .where(and(
        eq(webBehaviorEventsTable.tenantId, tenantId),
        eq(webBehaviorEventsTable.eventType, "engagement"),
        gte(webBehaviorEventsTable.createdAt, previousSince),
        lt(webBehaviorEventsTable.createdAt, since),
      ))
      .orderBy(desc(webBehaviorEventsTable.createdAt))
      .limit(10_000);

    const previous2Rows = await db
      .select({
        path: webBehaviorEventsTable.path,
        metadata: webBehaviorEventsTable.metadata,
        createdAt: webBehaviorEventsTable.createdAt,
      })
      .from(webBehaviorEventsTable)
      .where(and(
        eq(webBehaviorEventsTable.tenantId, tenantId),
        eq(webBehaviorEventsTable.eventType, "engagement"),
        gte(webBehaviorEventsTable.createdAt, previous2Since),
        lt(webBehaviorEventsTable.createdAt, previousSince),
      ))
      .orderBy(desc(webBehaviorEventsTable.createdAt))
      .limit(10_000);

    const samples = rows
      .map((row) => parseVitalSample({ path: row.path, metadata: row.metadata ?? {}, createdAt: row.createdAt }))
      .filter((sample): sample is VitalSample => sample !== null)
      .filter((sample) => device === "all" || sample.deviceCategory === device);

    const previousSamples = previousRows
      .map((row) => parseVitalSample({ path: row.path, metadata: row.metadata ?? {}, createdAt: row.createdAt }))
      .filter((sample): sample is VitalSample => sample !== null)
      .filter((sample) => device === "all" || sample.deviceCategory === device);

    const previous2Samples = previous2Rows
      .map((row) => parseVitalSample({ path: row.path, metadata: row.metadata ?? {}, createdAt: row.createdAt }))
      .filter((sample): sample is VitalSample => sample !== null)
      .filter((sample) => device === "all" || sample.deviceCategory === device);

    const apiSamples = rows
      .map((row) => parseApiTimingSample({ path: row.path, metadata: row.metadata ?? {}, createdAt: row.createdAt }))
      .filter((sample): sample is ApiTimingSample => sample !== null)
      .filter((sample) => device === "all" || sample.deviceCategory === device);

    const runtimeErrors = rows
      .map((row) => parseRuntimeErrorSample({ path: row.path, metadata: row.metadata ?? {}, createdAt: row.createdAt }))
      .filter((sample): sample is RuntimeErrorSample => sample !== null)
      .filter((sample) => device === "all" || sample.deviceCategory === device);

    const errorMap = new Map<string, RuntimeErrorSample[]>();
    for (const sample of runtimeErrors) {
      const key = `${sample.path}::${sample.message}`;
      const list = errorMap.get(key) ?? [];
      list.push(sample);
      errorMap.set(key, list);
    }
    const runtimeErrorSummary = [...errorMap.entries()]
      .map(([key, samples]) => {
        const [path, message] = key.split("::");
        return {
          path,
          message,
          count: samples.length,
          source: samples[0]?.source ?? null,
          lastSeenAt: samples[0]?.createdAt?.toISOString?.() ?? null,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const apiMap = new Map<string, ApiTimingSample[]>();
    for (const sample of apiSamples) {
      const list = apiMap.get(sample.endpoint) ?? [];
      list.push(sample);
      apiMap.set(sample.endpoint, list);
    }
    const apiTimings = [...apiMap.entries()]
      .map(([endpoint, endpointSamples]) => {
        const values = endpointSamples.map((sample) => sample.durationMs);
        const transferValues = endpointSamples.map((sample) => sample.transferSize).filter((value) => value > 0);
        const bodyValues = endpointSamples.map((sample) => sample.encodedBodySize).filter((value) => value > 0);
        return {
          endpoint,
          samples: values.length,
          p75: percentile(values, 0.75),
          median: percentile(values, 0.5),
          max: values.length ? Math.round(Math.max(...values)) : null,
          transferP75: percentile(transferValues, 0.75),
          bodyP75: percentile(bodyValues, 0.75),
        };
      })
      .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0))
      .slice(0, 12);

    const apiRouteMap = new Map<string, ApiTimingSample[]>();
    for (const sample of apiSamples) {
      const key = `${sample.path}::${sample.endpoint}`;
      const list = apiRouteMap.get(key) ?? [];
      list.push(sample);
      apiRouteMap.set(key, list);
    }
    const apiRouteTimings = [...apiRouteMap.entries()]
      .map(([key, routeSamples]) => {
        const [path, endpoint] = key.split("::");
        const values = routeSamples.map((sample) => sample.durationMs);
        const transferValues = routeSamples.map((sample) => sample.transferSize).filter((value) => value > 0);
        return {
          path,
          endpoint,
          samples: values.length,
          p75: percentile(values, 0.75),
          median: percentile(values, 0.5),
          transferP75: percentile(transferValues, 0.75),
        };
      })
      .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0))
      .slice(0, 30);

    const routeMap = new Map<string, VitalSample[]>();
    for (const sample of samples) {
      const list = routeMap.get(sample.path) ?? [];
      list.push(sample);
      routeMap.set(sample.path, list);
    }

    const previousRouteMap = new Map<string, VitalSample[]>();
    for (const sample of previousSamples) {
      const list = previousRouteMap.get(sample.path) ?? [];
      list.push(sample);
      previousRouteMap.set(sample.path, list);
    }

    const previous2RouteMap = new Map<string, VitalSample[]>();
    for (const sample of previous2Samples) {
      const list = previous2RouteMap.get(sample.path) ?? [];
      list.push(sample);
      previous2RouteMap.set(sample.path, list);
    }

    const routes = [...routeMap.entries()]
      .map(([path, routeSamples]) => {
        const previous = previousRouteMap.get(path) ?? [];
        const previous2 = previous2RouteMap.get(path) ?? [];
        return {
          path,
          samples: routeSamples.length,
          lcp: vitalSummary(routeSamples, "LCP").p75,
          inp: vitalSummary(routeSamples, "INP").p75,
          cls: vitalSummary(routeSamples, "CLS").p75,
          previous: {
            samples: previous.length,
            lcp: vitalSummary(previous, "LCP").p75,
            inp: vitalSummary(previous, "INP").p75,
            cls: vitalSummary(previous, "CLS").p75,
          },
          previous2: {
            samples: previous2.length,
            lcp: vitalSummary(previous2, "LCP").p75,
            inp: vitalSummary(previous2, "INP").p75,
            cls: vitalSummary(previous2, "CLS").p75,
          },
        };
      })
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 20);

    return res.json({
      minutes,
      device,
      since: since.toISOString(),
      previousSince: previousSince.toISOString(),
      previous2Since: previous2Since.toISOString(),
      generatedAt: new Date().toISOString(),
      sampleCount: samples.length,
      metrics: {
        LCP: vitalSummary(samples, "LCP"),
        INP: vitalSummary(samples, "INP"),
        CLS: vitalSummary(samples, "CLS"),
        FCP: vitalSummary(samples, "FCP"),
        TTFB: vitalSummary(samples, "TTFB"),
      },
      devices: {
        mobile: samples.filter((sample) => sample.deviceCategory === "mobile").length,
        tablet: samples.filter((sample) => sample.deviceCategory === "tablet").length,
        desktop: samples.filter((sample) => sample.deviceCategory === "desktop").length,
      },
      apiTimings,
      apiRouteTimings,
      runtimeErrors: runtimeErrorSummary,
      routes,
    });
  } catch (error) {
    req.log.error({ error, tenantId }, "visitor-intelligence: web vitals failed");
    return res.status(500).json({ error: "Não foi possível carregar Core Web Vitals." });
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
