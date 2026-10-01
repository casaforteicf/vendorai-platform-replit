import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  agentActionsLogTable,
  browserAgentConnectionsTable,
  tenantsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto.js";
import { runBrowserAgent, type BrowserAgentInput } from "../services/browser-agent.js";
import {
  captureLiveBrowserSession,
  closeLiveBrowserSession,
  controlLiveBrowserSession,
  createLiveBrowserSession,
  getLiveBrowserSession,
  getLiveBrowserHandoff,
  captureLiveBrowserHandoff,
  setLiveBrowserHandoffPaused,
  controlLiveBrowserHandoff,
  closeLiveBrowserHandoff,
  setLiveBrowserPaused,
  startLiveBrowserMission,
} from "../services/browser-live-session.js";

const router: IRouter = Router();

const vendiAutonomyEnabled = () => String(process.env["VENDI_AUTONOMY_ENABLED"] ?? "").toLowerCase() === "true";

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
]);

const runSchema = z.object({
  goal: z.string().min(3).max(4000),
  startUrl: z.string().url().optional(),
  connectionId: z.string().optional(),
  agentName: z.string().min(1).default("browser"),
  leadId: z.string().optional(),
  mode: z.enum(["assistido", "autonomo"]).optional(),
  allowWrite: z.boolean().optional(),
  maxSteps: z.number().int().min(1).max(30).default(12),
});

function resolveTenant(req: any) {
  return req.user?.tenantId;
}

function safeConnection(connection: typeof browserAgentConnectionsTable.$inferSelect) {
  return {
    id: connection.id,
    name: connection.name,
    startUrl: connection.startUrl,
    allowedHosts: connection.allowedHosts ?? [],
    loginConfigured: Boolean(connection.usernameEncrypted),
    passcodeConfigured: Boolean(connection.passwordEncrypted),
    hasPersistentSession: Boolean(connection.cookiesEncrypted),
    lastUsedAt: connection.lastUsedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

router.get("/browser-agent/status", (_req, res) => {
  res.json({
    configured: Boolean(process.env["BROWSER_CDP_URL"]),
    allowlistEnabled: Boolean(process.env["BROWSER_ALLOWED_HOSTS"]),
    runtime: "cdp",
    persistentConnections: true,
    secureSecretInjection: true,
    vendiAutonomyEnabled: vendiAutonomyEnabled(),
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
      ...(parsed.data.clearSession ? { cookiesEncrypted: null } : {}),
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
        controlUrl: `https://homolog.appvendorai.com/agents/config?browserSession=${encodeURIComponent(session.id)}&handoff=${encodeURIComponent(handoff.handoffToken)}` };
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

