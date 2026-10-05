import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  agentActionsLogTable,
  browserAgentConnectionsTable,
  browserAgentSkillsTable,
  tenantsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto.js";
import { runBrowserAgent, type BrowserAgentInput, type PlannedAction } from "../services/browser-agent.js";
import { browserFleetConfigured, browserFleetStatus } from "../services/browser-fleet.js";
import { fetchRenderedBatch, fetchRenderedPage } from "../services/browser-fetch.js";
import { extractStructuredData } from "../services/web-structured-extractor.js";
import { runParallelMissions } from "../services/web-parallel-runner.js";
import { runBrowserSkill } from "../services/browser-skill-runner.js";
import { discoverWebsite } from "../services/browser-discovery.js";
import { compareWatchFingerprint, fingerprintSkillResult } from "../services/web-watch.js";
import {
  mergeBrowserProfiles,
  type BrowserProfileState,
} from "../services/browser-profile.js";
import { chooseWebExecutionStrategy } from "../services/web-execution-router.js";
import {
  captureLiveBrowserSession,
  closeLiveBrowserSession,
  controlLiveBrowserSession,
  createLiveBrowserSession,
  getLiveBrowserSession,
  getLiveBrowserHandoff,
  getRecordedBrowserActions,
  captureLiveBrowserHandoff,
  setLiveBrowserHandoffPaused,
  controlLiveBrowserHandoff,
  closeLiveBrowserHandoff,
  setLiveBrowserPaused,
  startLiveBrowserMission,
} from "../services/browser-live-session.js";

const router: IRouter = Router();

const vendiAutonomyEnabled = () => String(process.env["VENDI_AUTONOMY_ENABLED"] ?? "").toLowerCase() === "true";

function vendiControlUrl(sessionId: string, handoffToken: string) {
  const configured = (process.env["VENDI_CONTROL_BASE_URL"] ?? "https://app.appvendorai.com").trim().replace(/\/$/, "");
  const base = configured || "https://app.appvendorai.com";
  return `${base}/vendi/handoff?browserSession=${encodeURIComponent(sessionId)}&handoff=${encodeURIComponent(handoffToken)}`;
}

const connectionSchema = z.object({
  name: z.string().min(2).max(120),
  startUrl: z.string().url(),
  allowedHosts: z.array(z.string().min(1).max(255)).max(20).optional(),
  login: z.string().max(500).optional(),
  passcode: z.string().max(2000).optional(),
});

const connectionPatchSchema = connectionSchema.partial().extend({
  clearSession: z.boolean().optional(),
});

const liveCreateSchema = z.object({
  connectionId: z.string().min(1),
  allowWrite: z.boolean().default(false),
});

const liveMissionSchema = z.object({
  goal: z.string().min(3).max(4000),
  maxSteps: z.number().int().min(1).max(40).default(20),
});

const livePauseSchema = z.object({
  paused: z.boolean(),
});

const liveControlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), x: z.number().min(0).max(5000), y: z.number().min(0).max(5000) }),
  z.object({ action: z.literal("type"), text: z.string().max(4000) }),
  z.object({ action: z.literal("key"), key: z.string().min(1).max(50) }),
  z.object({ action: z.literal("navigate"), url: z.string().url() }),
  z.object({ action: z.literal("back") }),
  z.object({ action: z.literal("reload") }),
  z.object({ action: z.literal("open_tab"), url: z.string().url().optional() }),
  z.object({ action: z.literal("switch_tab"), index: z.number().int().min(0).max(30) }),
  z.object({ action: z.literal("close_tab"), index: z.number().int().min(0).max(30) }),
  z.object({ action: z.literal("upload"), selector: z.string().min(1).max(1000), fileName: z.string().min(1).max(255) }),
  z.object({ action: z.literal("download"), selector: z.string().min(1).max(1000) }),
]);

const fetchSchema = z.object({
  url: z.string().url(),
  maxTextChars: z.number().int().min(1000).max(100000).optional(),
  timeoutMs: z.number().int().min(3000).max(60000).optional(),
});

const fetchBatchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(50),
  concurrency: z.number().int().min(1).max(12).default(4),
});

const extractionFieldTypeSchema = z.enum(["string", "number", "boolean", "string[]", "number[]"]);
const extractStructuredSchema = z.object({
  url: z.string().url(),
  goal: z.string().min(3).max(2000),
  schema: z.record(z.string().min(1).max(100), extractionFieldTypeSchema).refine(
    (value) => Object.keys(value).length > 0 && Object.keys(value).length <= 50,
    "schema deve conter entre 1 e 50 campos",
  ),
});

const parallelMissionSchema = z.object({
  missions: z.array(z.object({
    id: z.string().min(1).max(120),
    goal: z.string().min(3).max(4000),
    startUrl: z.string().url(),
    strategy: z.enum(["auto", "browser", "fetch"]).default("auto"),
  })).min(1).max(24),
  concurrency: z.number().int().min(1).max(12).default(4),
});

const skillFromSessionSchema = z.object({
  name: z.string().min(2).max(120),
  sessionId: z.string().min(1),
});

const skillRunSchema = z.object({
  allowWrite: z.boolean().default(false),
  allowSelfHeal: z.boolean().default(true),
});

const discoverySchema = z.object({
  startUrl: z.string().url(),
  allowedHosts: z.array(z.string().min(1).max(255)).max(20).optional(),
  maxPages: z.number().int().min(1).max(12).default(5),
});

const skillWatchSchema = z.object({
  enabled: z.boolean(),
});

const runSchema = z.object({
  goal: z.string().min(3).max(4000),
  startUrl: z.string().url().optional(),
  connectionId: z.string().optional(),
  agentName: z.string().min(1).default("browser"),
  leadId: z.string().optional(),
  mode: z.enum(["assistido", "autonomo"]).optional(),
  allowWrite: z.boolean().optional(),
  maxSteps: z.number().int().min(1).max(30).default(12),
  strategy: z.enum(["browser", "auto"]).default("browser"),
});

function resolveTenant(req: any) {
  return req.user?.tenantId;
}

function readBrowserProfile(connection: typeof browserAgentConnectionsTable.$inferSelect): BrowserProfileState | undefined {
  if (!connection.profileEncrypted) return undefined;
  try {
    return JSON.parse(decrypt(connection.profileEncrypted)) as BrowserProfileState;
  } catch {
    return undefined;
  }
}

function safeConnection(connection: typeof browserAgentConnectionsTable.$inferSelect) {
  return {
    id: connection.id,
    name: connection.name,
    startUrl: connection.startUrl,
    allowedHosts: connection.allowedHosts ?? [],
    loginConfigured: Boolean(connection.usernameEncrypted),
    passcodeConfigured: Boolean(connection.passwordEncrypted),
    hasPersistentSession: Boolean(connection.profileEncrypted || connection.cookiesEncrypted),
    hasFullProfile: Boolean(connection.profileEncrypted),
    lastUsedAt: connection.lastUsedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

router.get("/browser-agent/status", (_req, res) => {
  res.json({
    configured: browserFleetConfigured(),
    allowlistEnabled: Boolean(process.env["BROWSER_ALLOWED_HOSTS"]),
    runtime: "vendor_chromium_fleet",
    fleet: browserFleetStatus(),
    persistentConnections: true,
    secureSecretInjection: true,
    vendiAutonomyEnabled: vendiAutonomyEnabled(),
  });
});

router.post("/browser-agent/discover", async (req, res) => {
  const parsed = discoverySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    const host = new URL(parsed.data.startUrl).hostname.toLowerCase();
    const result = await discoverWebsite({
      startUrl: parsed.data.startUrl,
      allowedHosts: Array.from(new Set([host, ...(parsed.data.allowedHosts ?? [])])),
      maxPages: parsed.data.maxPages,
    });
    await db.insert(agentActionsLogTable).values({
      tenantId,
      agentName: "browser",
      actionType: "browser_discovery",
      status: "executed",
      payload: {
        startUrl: parsed.data.startUrl,
        pages: result.pages.length,
        networkApiCandidates: result.networkCalls.length,
      },
    });
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "DISCOVERY_FAILED" });
  }
});

router.post("/browser-agent/fetch", async (req, res) => {
  const parsed = fetchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const host = new URL(parsed.data.url).hostname.toLowerCase();
    const result = await fetchRenderedPage({
      url: parsed.data.url,
      allowedHosts: [host],
      timeoutMs: parsed.data.timeoutMs,
      maxTextChars: parsed.data.maxTextChars,
    });
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "FETCH_FAILED" });
  }
});

router.post("/browser-agent/fetch-batch", async (req, res) => {
  const parsed = fetchBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const requests = parsed.data.urls.map((url) => ({
    url,
    allowedHosts: [new URL(url).hostname.toLowerCase()],
  }));
  const results = await fetchRenderedBatch(requests, parsed.data.concurrency);
  res.json({ count: results.length, results, fleet: browserFleetStatus() });
});

router.post("/browser-agent/extract-structured", async (req, res) => {
  const parsed = extractStructuredSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    const host = new URL(parsed.data.url).hostname.toLowerCase();
    const page = await fetchRenderedPage({
      url: parsed.data.url,
      allowedHosts: [host],
      maxTextChars: 50000,
    });
    const extraction = await extractStructuredData({
      tenantId,
      goal: parsed.data.goal,
      page,
      schema: parsed.data.schema,
    });
    res.json({
      ok: true,
      source: { url: page.url, title: page.title, fetchedAt: page.fetchedAt, nodeId: page.nodeId },
      ...extraction,
    });
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "STRUCTURED_EXTRACT_FAILED" });
  }
});

router.post("/browser-agent/missions/parallel", async (req, res) => {
  const parsed = parallelMissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const results = await runParallelMissions(
    parsed.data.missions.map((mission) => ({ id: mission.id, payload: mission })),
    async ({ payload }) => {
      const host = new URL(payload.startUrl).hostname.toLowerCase();
      const strategy = payload.strategy === "auto"
        ? chooseWebExecutionStrategy({ goal: payload.goal })
        : payload.strategy;

      if (strategy === "fetch") {
        return {
          strategy,
          result: await fetchRenderedPage({
            url: payload.startUrl,
            allowedHosts: [host],
          }),
        };
      }

      return {
        strategy: "browser" as const,
        result: await runBrowserAgent({
          tenantId,
          goal: payload.goal,
          startUrl: payload.startUrl,
          allowedHosts: [host],
          allowWrite: false,
          mode: "autonomo",
          maxSteps: 18,
        }),
      };
    },
    parsed.data.concurrency,
  );

  res.json({
    ok: results.every((item) => item.ok),
    count: results.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
    fleet: browserFleetStatus(),
  });
});

router.get("/browser-agent/connections", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const rows = await db
    .select()
    .from(browserAgentConnectionsTable)
    .where(eq(browserAgentConnectionsTable.tenantId, tenantId));

  res.json(rows.map(safeConnection));
});

router.post("/browser-agent/connections", async (req, res) => {
  const parsed = connectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const url = new URL(parsed.data.startUrl);
  const baseHost = url.hostname.toLowerCase();
  const allowedHosts = Array.from(new Set([baseHost, ...(parsed.data.allowedHosts ?? [])]));

  const [row] = await db
    .insert(browserAgentConnectionsTable)
    .values({
      tenantId,
      name: parsed.data.name,
      startUrl: parsed.data.startUrl,
      allowedHosts,
      usernameEncrypted: parsed.data.login ? encrypt(parsed.data.login) : null,
      passwordEncrypted: parsed.data.passcode ? encrypt(parsed.data.passcode) : null,
    })
    .returning();

  res.status(201).json(row ? safeConnection(row) : null);
});

router.patch("/browser-agent/connections/:id", async (req, res) => {
  const parsed = connectionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const [existing] = await db
    .select()
    .from(browserAgentConnectionsTable)
    .where(and(
      eq(browserAgentConnectionsTable.id, String(req.params.id)),
      eq(browserAgentConnectionsTable.tenantId, tenantId),
    ));

  if (!existing) {
    res.status(404).json({ error: "Conexão não encontrada" });
    return;
  }

  const nextStartUrl = parsed.data.startUrl ?? existing.startUrl;
  const nextUrl = new URL(nextStartUrl);
  const nextAllowedHosts = parsed.data.allowedHosts
    ? Array.from(new Set([nextUrl.hostname.toLowerCase(), ...parsed.data.allowedHosts]))
    : existing.allowedHosts;

  const [row] = await db
    .update(browserAgentConnectionsTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.startUrl !== undefined ? { startUrl: parsed.data.startUrl } : {}),
      ...(parsed.data.allowedHosts !== undefined ? { allowedHosts: nextAllowedHosts } : {}),
      ...(parsed.data.login !== undefined ? { usernameEncrypted: parsed.data.login ? encrypt(parsed.data.login) : null } : {}),
      ...(parsed.data.passcode !== undefined ? { passwordEncrypted: parsed.data.passcode ? encrypt(parsed.data.passcode) : null } : {}),
      ...(parsed.data.clearSession ? { cookiesEncrypted: null, profileEncrypted: null } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(browserAgentConnectionsTable.id, existing.id),
      eq(browserAgentConnectionsTable.tenantId, tenantId),
    ))
    .returning();

  res.json(row ? safeConnection(row) : null);
});

router.delete("/browser-agent/connections/:id", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const [deleted] = await db
    .delete(browserAgentConnectionsTable)
    .where(and(
      eq(browserAgentConnectionsTable.id, String(req.params.id)),
      eq(browserAgentConnectionsTable.tenantId, tenantId),
    ))
    .returning({ id: browserAgentConnectionsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Conexão não encontrada" });
    return;
  }

  res.json({ success: true, id: deleted.id });
});

router.get("/browser-agent/skills", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  const skills = await db
    .select()
    .from(browserAgentSkillsTable)
    .where(eq(browserAgentSkillsTable.tenantId, tenantId));
  res.json(skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    connectionId: skill.connectionId,
    startUrl: skill.startUrl,
    allowedHosts: skill.allowedHosts,
    actionCount: Array.isArray(skill.actions) ? skill.actions.length : 0,
    version: skill.version,
    status: skill.status,
    repairCount: skill.repairCount,
    lastRunAt: skill.lastRunAt,
    lastSuccessAt: skill.lastSuccessAt,
    lastError: skill.lastError,
    watchEnabled: skill.watchEnabled,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  })));
});

router.post("/browser-agent/skills/from-session", async (req, res) => {
  const parsed = skillFromSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const session = await getLiveBrowserSession(tenantId, parsed.data.sessionId);
  const actions = getRecordedBrowserActions(tenantId, parsed.data.sessionId)
    .filter((action) => action.action !== "finish");

  if (!actions.length) {
    res.status(409).json({ error: "A sessão não possui ações reutilizáveis para gravar como skill" });
    return;
  }

  let connection: typeof browserAgentConnectionsTable.$inferSelect | undefined;
  if (session.connectionId) {
    [connection] = await db
      .select()
      .from(browserAgentConnectionsTable)
      .where(and(
        eq(browserAgentConnectionsTable.id, session.connectionId),
        eq(browserAgentConnectionsTable.tenantId, tenantId),
      ));
  }

  const startUrl = connection?.startUrl ?? session.url;
  const allowedHosts = connection?.allowedHosts ?? [new URL(startUrl).hostname.toLowerCase()];
  const [skill] = await db.insert(browserAgentSkillsTable).values({
    tenantId,
    connectionId: connection?.id ?? null,
    name: parsed.data.name,
    startUrl,
    allowedHosts,
    actions: actions as Array<Record<string, unknown>>,
  }).returning();

  res.status(201).json({
    id: skill?.id,
    name: skill?.name,
    connectionId: skill?.connectionId,
    startUrl: skill?.startUrl,
    actionCount: actions.length,
  });
});

router.post("/browser-agent/skills/:id/run", async (req, res) => {
  const parsed = skillRunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const [skill] = await db
    .select()
    .from(browserAgentSkillsTable)
    .where(and(
      eq(browserAgentSkillsTable.id, String(req.params.id)),
      eq(browserAgentSkillsTable.tenantId, tenantId),
    ));
  if (!skill) {
    res.status(404).json({ error: "Skill não encontrada" });
    return;
  }

  let connection: typeof browserAgentConnectionsTable.$inferSelect | undefined;
  if (skill.connectionId) {
    [connection] = await db
      .select()
      .from(browserAgentConnectionsTable)
      .where(and(
        eq(browserAgentConnectionsTable.id, skill.connectionId),
        eq(browserAgentConnectionsTable.tenantId, tenantId),
      ));
  }

  const sessionCookies = connection?.cookiesEncrypted
    ? JSON.parse(decrypt(connection.cookiesEncrypted))
    : undefined;
  let sessionProfile = connection ? readBrowserProfile(connection) : undefined;

  try {
    const result = await runBrowserSkill({
      tenantId,
      goal: "Executar Web Skill: " + skill.name,
      startUrl: skill.startUrl,
      allowedHosts: skill.allowedHosts ?? [],
      allowWrite: parsed.data.allowWrite,
      mode: "autonomo",
      actions: (skill.actions ?? []) as PlannedAction[],
      allowSelfHeal: parsed.data.allowSelfHeal,
      sessionCookies,
      sessionProfile,
      secrets: connection ? {
        login: connection.usernameEncrypted ? decrypt(connection.usernameEncrypted) : undefined,
        passcode: connection.passwordEncrypted ? decrypt(connection.passwordEncrypted) : undefined,
      } : undefined,
      onSessionPersist: connection ? async (cookies) => {
        await db.update(browserAgentConnectionsTable)
          .set({
            cookiesEncrypted: encrypt(JSON.stringify(cookies)),
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(browserAgentConnectionsTable.id, connection!.id),
            eq(browserAgentConnectionsTable.tenantId, tenantId),
          ));
      } : undefined,
      onProfilePersist: connection ? async (profile) => {
        sessionProfile = mergeBrowserProfiles(sessionProfile, profile);
        await db.update(browserAgentConnectionsTable)
          .set({
            profileEncrypted: encrypt(JSON.stringify(sessionProfile)),
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(browserAgentConnectionsTable.id, connection!.id),
            eq(browserAgentConnectionsTable.tenantId, tenantId),
          ));
      } : undefined,
    });

    const repaired = result.repairs > 0;
    await db.update(browserAgentSkillsTable)
      .set({
        ...(repaired ? {
          actions: result.repairedActions as Array<Record<string, unknown>>,
          version: skill.version + 1,
          repairCount: skill.repairCount + result.repairs,
        } : {}),
        status: "ready",
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(browserAgentSkillsTable.id, skill.id),
        eq(browserAgentSkillsTable.tenantId, tenantId),
      ));

    res.json({
      ok: true,
      skillId: skill.id,
      skillName: skill.name,
      version: skill.version + (repaired ? 1 : 0),
      selfHealed: repaired,
      ...result,
    });
  } catch (error: any) {
    await db.update(browserAgentSkillsTable)
      .set({
        status: "degraded",
        lastRunAt: new Date(),
        lastError: error?.message ?? "SKILL_RUN_FAILED",
        updatedAt: new Date(),
      })
      .where(and(
        eq(browserAgentSkillsTable.id, skill.id),
        eq(browserAgentSkillsTable.tenantId, tenantId),
      ));
    res.status(409).json({
      ok: false,
      skillId: skill.id,
      skillName: skill.name,
      error: error?.message ?? "SKILL_RUN_FAILED",
    });
  }
});

router.patch("/browser-agent/skills/:id/watch", async (req, res) => {
  const parsed = skillWatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const [skill] = await db.update(browserAgentSkillsTable)
    .set({
      watchEnabled: parsed.data.enabled,
      updatedAt: new Date(),
    })
    .where(and(
      eq(browserAgentSkillsTable.id, String(req.params.id)),
      eq(browserAgentSkillsTable.tenantId, tenantId),
    ))
    .returning();

  if (!skill) {
    res.status(404).json({ error: "Skill não encontrada" });
    return;
  }

  res.json({
    id: skill.id,
    name: skill.name,
    watchEnabled: skill.watchEnabled,
    watchFingerprint: skill.watchFingerprint,
  });
});

router.post("/browser-agent/skills/:id/watch-check", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const [skill] = await db
    .select()
    .from(browserAgentSkillsTable)
    .where(and(
      eq(browserAgentSkillsTable.id, String(req.params.id)),
      eq(browserAgentSkillsTable.tenantId, tenantId),
    ));
  if (!skill) {
    res.status(404).json({ error: "Skill não encontrada" });
    return;
  }

  let connection: typeof browserAgentConnectionsTable.$inferSelect | undefined;
  if (skill.connectionId) {
    [connection] = await db
      .select()
      .from(browserAgentConnectionsTable)
      .where(and(
        eq(browserAgentConnectionsTable.id, skill.connectionId),
        eq(browserAgentConnectionsTable.tenantId, tenantId),
      ));
  }

  const sessionCookies = connection?.cookiesEncrypted
    ? JSON.parse(decrypt(connection.cookiesEncrypted))
    : undefined;
  let sessionProfile = connection ? readBrowserProfile(connection) : undefined;

  try {
    const result = await runBrowserSkill({
      tenantId,
      goal: "Watch Skill: " + skill.name,
      startUrl: skill.startUrl,
      allowedHosts: skill.allowedHosts ?? [],
      allowWrite: false,
      allowSelfHeal: true,
      mode: "autonomo",
      actions: (skill.actions ?? []) as PlannedAction[],
      sessionCookies,
      sessionProfile,
      secrets: connection ? {
        login: connection.usernameEncrypted ? decrypt(connection.usernameEncrypted) : undefined,
        passcode: connection.passwordEncrypted ? decrypt(connection.passwordEncrypted) : undefined,
      } : undefined,
      onSessionPersist: connection ? async (cookies) => {
        await db.update(browserAgentConnectionsTable)
          .set({
            cookiesEncrypted: encrypt(JSON.stringify(cookies)),
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(browserAgentConnectionsTable.id, connection!.id),
            eq(browserAgentConnectionsTable.tenantId, tenantId),
          ));
      } : undefined,
      onProfilePersist: connection ? async (profile) => {
        sessionProfile = mergeBrowserProfiles(sessionProfile, profile);
        await db.update(browserAgentConnectionsTable)
          .set({
            profileEncrypted: encrypt(JSON.stringify(sessionProfile)),
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(browserAgentConnectionsTable.id, connection!.id),
            eq(browserAgentConnectionsTable.tenantId, tenantId),
          ));
      } : undefined,
    });

    const fingerprint = fingerprintSkillResult(result);
    const comparison = compareWatchFingerprint(skill.watchFingerprint, fingerprint);
    const repaired = result.repairs > 0;

    await db.update(browserAgentSkillsTable)
      .set({
        ...(repaired ? {
          actions: result.repairedActions as Array<Record<string, unknown>>,
          version: skill.version + 1,
          repairCount: skill.repairCount + result.repairs,
        } : {}),
        watchFingerprint: fingerprint,
        ...(comparison.changed ? { watchLastChangedAt: new Date() } : {}),
        status: "ready",
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(browserAgentSkillsTable.id, skill.id),
        eq(browserAgentSkillsTable.tenantId, tenantId),
      ));

    res.json({
      ok: true,
      skillId: skill.id,
      skillName: skill.name,
      watchEnabled: skill.watchEnabled,
      selfHealed: repaired,
      version: skill.version + (repaired ? 1 : 0),
      ...comparison,
    });
  } catch (error: any) {
    await db.update(browserAgentSkillsTable)
      .set({
        status: "degraded",
        lastRunAt: new Date(),
        lastError: error?.message ?? "WATCH_CHECK_FAILED",
        updatedAt: new Date(),
      })
      .where(and(
        eq(browserAgentSkillsTable.id, skill.id),
        eq(browserAgentSkillsTable.tenantId, tenantId),
      ));

    res.status(409).json({
      ok: false,
      skillId: skill.id,
      error: error?.message ?? "WATCH_CHECK_FAILED",
    });
  }
});

router.delete("/browser-agent/skills/:id", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  const [deleted] = await db
    .delete(browserAgentSkillsTable)
    .where(and(
      eq(browserAgentSkillsTable.id, String(req.params.id)),
      eq(browserAgentSkillsTable.tenantId, tenantId),
    ))
    .returning({ id: browserAgentSkillsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Skill não encontrada" });
    return;
  }
  res.json({ success: true, id: deleted.id });
});

router.post("/browser-agent/live", async (req, res) => {
  const parsed = liveCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  const [connection] = await db
    .select()
    .from(browserAgentConnectionsTable)
    .where(and(
      eq(browserAgentConnectionsTable.id, parsed.data.connectionId),
      eq(browserAgentConnectionsTable.tenantId, tenantId),
    ));

  if (!connection) {
    res.status(404).json({ error: "Conexão do navegador não encontrada" });
    return;
  }

  const sessionCookies = connection.cookiesEncrypted
    ? JSON.parse(decrypt(connection.cookiesEncrypted))
    : undefined;
  let sessionProfile = readBrowserProfile(connection);

  const session = await createLiveBrowserSession({
    tenantId,
    connectionId: connection.id,
    startUrl: connection.startUrl,
    allowedHosts: connection.allowedHosts ?? [],
    allowWrite: vendiAutonomyEnabled() ? true : parsed.data.allowWrite,
    secrets: {
      login: connection.usernameEncrypted ? decrypt(connection.usernameEncrypted) : undefined,
      passcode: connection.passwordEncrypted ? decrypt(connection.passwordEncrypted) : undefined,
    },
    sessionCookies,
    sessionProfile,
    onSessionPersist: async (cookies) => {
      await db
        .update(browserAgentConnectionsTable)
        .set({
          cookiesEncrypted: encrypt(JSON.stringify(cookies)),
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(browserAgentConnectionsTable.id, connection.id),
          eq(browserAgentConnectionsTable.tenantId, tenantId),
        ));
    },
    onProfilePersist: async (profile) => {
      sessionProfile = mergeBrowserProfiles(sessionProfile, profile);
      await db
        .update(browserAgentConnectionsTable)
        .set({
          profileEncrypted: encrypt(JSON.stringify(sessionProfile)),
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(browserAgentConnectionsTable.id, connection.id),
          eq(browserAgentConnectionsTable.tenantId, tenantId),
        ));
    },
  });

  await db.insert(agentActionsLogTable).values({
    tenantId,
    agentName: "browser",
    actionType: "browser_live_session_started",
    status: "executed",
    payload: {
      sessionId: session.id,
      connectionId: connection.id,
      allowWrite: parsed.data.allowWrite,
    },
  });

  res.status(201).json(session);
});

router.get("/browser-agent/handoff/:sessionId/screenshot", async (req, res) => {
  try {
    res.json(await captureLiveBrowserHandoff(String(req.params.sessionId), String(req.query.handoff ?? "")));
  } catch (error: any) {
    res.status(404).json({ error: error?.message ?? "Sessão não encontrada" });
  }
});

router.post("/browser-agent/handoff/:sessionId/pause", async (req, res) => {
  const parsed = livePauseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.flatten() }); return; }
  try {
    res.json(await setLiveBrowserHandoffPaused(String(req.params.sessionId), String(req.query.handoff ?? ""), parsed.data.paused));
  } catch (error: any) {
    res.status(409).json({ error: error?.message ?? "Não foi possível alterar o controle" });
  }
});

router.post("/browser-agent/handoff/:sessionId/control", async (req, res) => {
  const parsed = liveControlSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.flatten() }); return; }
  try {
    res.json(await controlLiveBrowserHandoff(String(req.params.sessionId), String(req.query.handoff ?? ""), parsed.data));
  } catch (error: any) {
    res.status(409).json({ error: error?.message ?? "Controle manual falhou" });
  }
});

router.delete("/browser-agent/handoff/:sessionId", async (req, res) => {
  try {
    res.json(await closeLiveBrowserHandoff(String(req.params.sessionId), String(req.query.handoff ?? "")));
  } catch (error: any) {
    res.status(404).json({ error: error?.message ?? "Sessão não encontrada" });
  }
});

router.get("/browser-agent/live/:sessionId", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    res.json(await getLiveBrowserSession(tenantId, String(req.params.sessionId)));
  } catch (error: any) {
    res.status(404).json({ error: error?.message ?? "Sessão não encontrada" });
  }
});

router.get("/browser-agent/live/:sessionId/screenshot", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    res.json(await captureLiveBrowserSession(tenantId, String(req.params.sessionId)));
  } catch (error: any) {
    res.status(404).json({ error: error?.message ?? "Sessão não encontrada" });
  }
});

router.post("/browser-agent/live/:sessionId/mission", async (req, res) => {
  const parsed = liveMissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    const session = startLiveBrowserMission(
      tenantId,
      String(req.params.sessionId),
      parsed.data.goal,
      parsed.data.maxSteps,
    );

    await db.insert(agentActionsLogTable).values({
      tenantId,
      agentName: "browser",
      actionType: "browser_live_mission_started",
      status: "executed",
      payload: { sessionId: session.id, goal: parsed.data.goal },
    });

    res.status(202).json(session);
  } catch (error: any) {
    res.status(409).json({ error: error?.message ?? "Não foi possível iniciar a missão" });
  }
});

router.post("/browser-agent/live/:sessionId/pause", async (req, res) => {
  const parsed = livePauseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    res.json(await setLiveBrowserPaused(tenantId, String(req.params.sessionId), parsed.data.paused));
  } catch (error: any) {
    res.status(404).json({ error: error?.message ?? "Sessão não encontrada" });
  }
});

router.post("/browser-agent/live/:sessionId/control", async (req, res) => {
  const parsed = liveControlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    const result = await controlLiveBrowserSession(
      tenantId,
      String(req.params.sessionId),
      parsed.data,
    );

    await db.insert(agentActionsLogTable).values({
      tenantId,
      agentName: "browser",
      actionType: "browser_manual_control",
      status: "executed",
      payload: {
        sessionId: String(req.params.sessionId),
        action: parsed.data.action,
      },
    });

    res.json(result);
  } catch (error: any) {
    res.status(409).json({ error: error?.message ?? "Controle manual falhou" });
  }
});

router.delete("/browser-agent/live/:sessionId", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    const result = await closeLiveBrowserSession(tenantId, String(req.params.sessionId));
    await db.insert(agentActionsLogTable).values({
      tenantId,
      agentName: "browser",
      actionType: "browser_live_session_closed",
      status: "executed",
      payload: { sessionId: String(req.params.sessionId) },
    });
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ error: error?.message ?? "Sessão não encontrada" });
  }
});

router.post("/browser-agent/run", async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(422).json({ error: "tenantId não resolvido" });
    return;
  }

  const [tenantAutonomy] = await db
    .select({ autonomyEnabledAt: tenantsTable.autonomyEnabledAt })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const autonomyEnabled = Boolean(tenantAutonomy?.autonomyEnabledAt);
  const mode = vendiAutonomyEnabled() ? "autonomo" : (parsed.data.mode ?? (autonomyEnabled ? "autonomo" : "assistido"));
  const allowWrite = vendiAutonomyEnabled() ? true : (parsed.data.allowWrite ?? autonomyEnabled);

  let connection: typeof browserAgentConnectionsTable.$inferSelect | undefined;
  if (parsed.data.connectionId) {
    [connection] = await db
      .select()
      .from(browserAgentConnectionsTable)
      .where(and(
        eq(browserAgentConnectionsTable.id, parsed.data.connectionId),
        eq(browserAgentConnectionsTable.tenantId, tenantId),
      ));

    if (!connection) {
      res.status(404).json({ error: "Conexão do navegador não encontrada" });
      return;
    }
  }

  const startUrl = connection?.startUrl ?? parsed.data.startUrl;
  if (!startUrl) {
    res.status(422).json({ error: "startUrl ou connectionId é obrigatório" });
    return;
  }

  const selectedStrategy = parsed.data.strategy === "auto"
    ? chooseWebExecutionStrategy({
        goal: parsed.data.goal,
        connectionId: parsed.data.connectionId,
        allowWrite: parsed.data.allowWrite ?? false,
      })
    : "browser";

  if (selectedStrategy === "fetch") {
    try {
      const host = new URL(startUrl).hostname.toLowerCase();
      const result = await fetchRenderedPage({ url: startUrl, allowedHosts: [host] });
      const [audit] = await db.insert(agentActionsLogTable).values({
        tenantId,
        leadId: parsed.data.leadId ?? null,
        agentName: parsed.data.agentName,
        actionType: "web_fetch",
        status: "executed",
        payload: { goal: parsed.data.goal, startUrl, strategy: "fetch", nodeId: result.nodeId },
      }).returning();
      res.json({ runId: audit?.id, ok: true, strategy: "fetch", result });
      return;
    } catch (error: any) {
      res.status(502).json({ error: error?.message ?? "FETCH_FAILED", strategy: "fetch" });
      return;
    }
  }

  const [audit] = await db.insert(agentActionsLogTable).values({
    tenantId,
    leadId: parsed.data.leadId ?? null,
    agentName: parsed.data.agentName,
    actionType: "browser_run",
    status: allowWrite ? "approved" : "pending",
    payload: {
      goal: parsed.data.goal,
      startUrl,
      connectionId: connection?.id ?? null,
      mode,
      allowWrite,
    },
  }).returning();

  try {
    const sessionCookies = connection?.cookiesEncrypted
      ? JSON.parse(decrypt(connection.cookiesEncrypted))
      : undefined;
    let sessionProfile = connection ? readBrowserProfile(connection) : undefined;

    const agentInput: BrowserAgentInput = {
      tenantId,
      goal: parsed.data.goal,
      startUrl,
      mode,
      allowWrite,
      maxSteps: parsed.data.maxSteps,
      allowedHosts: connection?.allowedHosts ?? [],
      secrets: connection ? {
        login: connection.usernameEncrypted ? decrypt(connection.usernameEncrypted) : undefined,
        passcode: connection.passwordEncrypted ? decrypt(connection.passwordEncrypted) : undefined,
      } : undefined,
      sessionCookies,
      sessionProfile,
      onSessionPersist: connection ? async (cookies) => {
        await db
          .update(browserAgentConnectionsTable)
          .set({
            cookiesEncrypted: encrypt(JSON.stringify(cookies)),
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(browserAgentConnectionsTable.id, connection!.id),
            eq(browserAgentConnectionsTable.tenantId, tenantId),
          ));
      } : undefined,
      onProfilePersist: connection ? async (profile) => {
        sessionProfile = mergeBrowserProfiles(sessionProfile, profile);
        await db
          .update(browserAgentConnectionsTable)
          .set({
            profileEncrypted: encrypt(JSON.stringify(sessionProfile)),
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(browserAgentConnectionsTable.id, connection!.id),
            eq(browserAgentConnectionsTable.tenantId, tenantId),
          ));
      } : undefined,
    };
    agentInput.onHumanVerification = async (browser, page) => {
      const session = await createLiveBrowserSession({ ...agentInput,
        connectionId: connection?.id, existing: { browser, page },
        onMissionResult: async (result) => {
          if (audit?.id) await db.update(agentActionsLogTable)
            .set({ status: result.ok ? "executed" : "rejected", payload: { ...(audit.payload ?? {}), result } })
            .where(eq(agentActionsLogTable.id, audit.id));
        },
      });
      startLiveBrowserMission(tenantId, session.id, agentInput.goal, agentInput.maxSteps, true);
      const handoff = getLiveBrowserHandoff(session.id);
      return { sessionId: session.id,
        controlUrl: vendiControlUrl(session.id, handoff.handoffToken) };
    };
    const result = await runBrowserAgent(agentInput);

    if (audit?.id) {
      await db.update(agentActionsLogTable)
        .set({ status: result.ok ? "executed" : ("status" in result && result.status === "awaiting_human" ? "pending" : "rejected"), payload: { ...(audit.payload ?? {}), result } })
        .where(eq(agentActionsLogTable.id, audit.id));
    }

    res.json({ runId: audit?.id, ...result });
  } catch (error: any) {
    const approvalRequired = String(error?.message ?? "").startsWith("APPROVAL_REQUIRED:");
    if (audit?.id) {
      await db.update(agentActionsLogTable)
        .set({
          status: approvalRequired ? "pending" : "rejected",
          payload: { ...(audit.payload ?? {}), error: error?.message ?? "Browser Agent failed" },
        })
        .where(eq(agentActionsLogTable.id, audit.id));
    }

    res.status(approvalRequired ? 409 : 500).json({
      error: error?.message ?? "Browser Agent failed",
      runId: audit?.id,
      approvalRequired,
    });
  }
});

export default router;

