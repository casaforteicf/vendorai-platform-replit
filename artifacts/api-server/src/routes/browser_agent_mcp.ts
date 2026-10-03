import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  agentActionsLogTable,
  browserAgentConnectionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { decrypt, encrypt } from "../lib/crypto.js";
import { runBrowserAgent, type BrowserAgentInput } from "../services/browser-agent.js";
import { signToken } from "../lib/jwt.js";

import { createLiveBrowserSession, getLiveBrowserHandoff, startLiveBrowserMission } from "../services/browser-live-session.js";

const router: IRouter = Router();

const vendiAutonomyEnabled = () => String(process.env["VENDI_AUTONOMY_ENABLED"] ?? "").toLowerCase() === "true";

function authorized(req: any): boolean {
  const expected = process.env["BROWSER_MCP_ACCESS_TOKEN"]?.trim();
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

router.use("/internal/browser-mcp", (req, res, next) => {
  if (!authorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

const tenantKeySchema = z.string().min(1).max(255);

const browserMcpConnectionSelection = {
  id: browserAgentConnectionsTable.id,
  tenantId: browserAgentConnectionsTable.tenantId,
  name: browserAgentConnectionsTable.name,
  startUrl: browserAgentConnectionsTable.startUrl,
  allowedHosts: browserAgentConnectionsTable.allowedHosts,
  usernameEncrypted: browserAgentConnectionsTable.usernameEncrypted,
  passwordEncrypted: browserAgentConnectionsTable.passwordEncrypted,
  cookiesEncrypted: browserAgentConnectionsTable.cookiesEncrypted,
  lastUsedAt: browserAgentConnectionsTable.lastUsedAt,
  createdAt: browserAgentConnectionsTable.createdAt,
  updatedAt: browserAgentConnectionsTable.updatedAt,
};

type BrowserMcpConnection = Pick<
  typeof browserAgentConnectionsTable.$inferSelect,
  | "id"
  | "tenantId"
  | "name"
  | "startUrl"
  | "allowedHosts"
  | "usernameEncrypted"
  | "passwordEncrypted"
  | "cookiesEncrypted"
  | "lastUsedAt"
  | "createdAt"
  | "updatedAt"
>;

async function resolveTenantId(tenantKey: string): Promise<string | undefined> {
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(
      or(
        eq(tenantsTable.id, tenantKey),
        eq(tenantsTable.slug, tenantKey),
        eq(tenantsTable.subdomainSlug, tenantKey),
      ),
    )
    .limit(1);
  return tenant?.id;
}

function safeConnection(connection: BrowserMcpConnection) {
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

router.get("/internal/browser-mcp/status", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env["BROWSER_CDP_URL"]),
    runtime: "cdp",
    secureSecretInjection: true,
    persistentConnections: true,
    vendiAutonomyEnabled: vendiAutonomyEnabled(),
  });
});

router.post("/internal/browser-mcp/connections", async (req, res) => {
  const parsed = z.object({ tenantKey: tenantKeySchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = await resolveTenantId(parsed.data.tenantKey);
  if (!tenantId) {
    res.status(404).json({ error: "tenant_not_found" });
    return;
  }

  const rows = await db
    .select(browserMcpConnectionSelection)
    .from(browserAgentConnectionsTable)
    .where(eq(browserAgentConnectionsTable.tenantId, tenantId));

  res.json({ tenantId, connections: rows.map(safeConnection) });
});

router.post("/internal/browser-mcp/run", async (req, res) => {
  const parsed = z.object({
    tenantKey: tenantKeySchema,
    goal: z.string().min(3).max(4000),
    connectionId: z.string().min(1).optional(),
    startUrl: z.string().url().optional(),
    mode: z.enum(["assistido", "autonomo"]).optional(),
    allowWrite: z.boolean().optional(),
    maxSteps: z.number().int().min(1).max(30).default(12),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = await resolveTenantId(parsed.data.tenantKey);
  if (!tenantId) {
    res.status(404).json({ error: "tenant_not_found" });
    return;
  }

  const [tenantAutonomy] = await db
    .select({ autonomyEnabledAt: tenantsTable.autonomyEnabledAt })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const autonomyEnabled = Boolean(tenantAutonomy?.autonomyEnabledAt);
  const globalVendiAutonomy = vendiAutonomyEnabled();
  const mode = globalVendiAutonomy ? "autonomo" : (parsed.data.mode ?? (autonomyEnabled ? "autonomo" : "assistido"));
  const allowWrite = globalVendiAutonomy ? true : (parsed.data.allowWrite ?? autonomyEnabled);

  let connection: BrowserMcpConnection | undefined;
  if (parsed.data.connectionId) {
    [connection] = await db
      .select()
      .from(browserAgentConnectionsTable)
      .where(
        and(
          eq(browserAgentConnectionsTable.id, parsed.data.connectionId),
          eq(browserAgentConnectionsTable.tenantId, tenantId),
        ),
      );

    if (!connection) {
      res.status(404).json({ error: "browser_connection_not_found" });
      return;
    }
  } else if (parsed.data.startUrl) {
    const start = new URL(parsed.data.startUrl);
    const normalizedStartUrl = start.origin + "/";
    [connection] = await db
      .select()
      .from(browserAgentConnectionsTable)
      .where(
        and(
          eq(browserAgentConnectionsTable.tenantId, tenantId),
          eq(browserAgentConnectionsTable.startUrl, normalizedStartUrl),
        ),
      )
      .limit(1);

    if (!connection) {
      [connection] = await db
        .insert(browserAgentConnectionsTable)
        .values({
          tenantId,
          name: `Auto — ${start.hostname}`,
          startUrl: normalizedStartUrl,
          allowedHosts: [start.hostname.toLowerCase()],
        })
        .returning(browserMcpConnectionSelection);
    }
  }

  const startUrl = parsed.data.startUrl ?? connection?.startUrl;
  if (!startUrl) {
    res.status(422).json({ error: "connectionId_or_startUrl_required" });
    return;
  }

  const [audit] = await db
    .insert(agentActionsLogTable)
    .values({
      tenantId,
      agentName: "browser_mcp",
      actionType: "browser_mcp_run",
      status: allowWrite ? "approved" : "pending",
      payload: {
        goal: parsed.data.goal,
        startUrl,
        connectionId: connection?.id ?? null,
        mode,
        allowWrite,
      },
    })
    .returning(browserMcpConnectionSelection);

  try {
    const sessionCookies = connection?.cookiesEncrypted
      ? JSON.parse(decrypt(connection.cookiesEncrypted))
      : undefined;

    let firstPartyAuthToken: string | undefined;
    if (new URL(startUrl).hostname.toLowerCase() === "app.appvendorai.com") {
      const [servicePrincipal] = await db.select({ id: usersTable.id, email: usersTable.email, platformRole: usersTable.platformRole, role: usersTable.role, userFunction: usersTable.userFunction, active: usersTable.active })
        .from(usersTable).where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true))).limit(1);
      if (!servicePrincipal) throw new Error("VENDI_AUTH_PRINCIPAL_NOT_FOUND");
      firstPartyAuthToken = signToken({ sub: servicePrincipal.id, email: servicePrincipal.email, platformRole: servicePrincipal.platformRole, tenantId, role: servicePrincipal.role, userFunction: servicePrincipal.userFunction ?? undefined, actorType: "ai" });
    }

    const agentInput: BrowserAgentInput = {
      tenantId,
      goal: parsed.data.goal,
      startUrl,
      mode,
      allowWrite,
      maxSteps: parsed.data.maxSteps,
      allowedHosts: connection?.allowedHosts ?? [],
      secrets: connection
        ? {
            login: connection.usernameEncrypted ? decrypt(connection.usernameEncrypted) : undefined,
            passcode: connection.passwordEncrypted ? decrypt(connection.passwordEncrypted) : undefined,
          }
        : undefined,
      sessionCookies,
      firstPartyAuthToken,
      onSessionPersist: connection
        ? async (cookies) => {
            await db
              .update(browserAgentConnectionsTable)
              .set({
                cookiesEncrypted: encrypt(JSON.stringify(cookies)),
                lastUsedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(browserAgentConnectionsTable.id, connection!.id),
                  eq(browserAgentConnectionsTable.tenantId, tenantId),
                ),
              );
          }
        : undefined,
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
      await db
        .update(agentActionsLogTable)
        .set({ status: result.ok ? "executed" : ("status" in result && result.status === "awaiting_human" ? "pending" : "rejected"), payload: { ...(audit.payload ?? {}), result } })
        .where(eq(agentActionsLogTable.id, audit.id));
    }

    res.json({ runId: audit?.id ?? null, tenantId, ...result });
  } catch (error: any) {
    const message = error?.message ?? "Browser Agent failed";
    const approvalRequired = String(message).startsWith("APPROVAL_REQUIRED:");

    if (audit?.id) {
      await db
        .update(agentActionsLogTable)
        .set({
          status: approvalRequired ? "pending" : "rejected",
          payload: { ...(audit.payload ?? {}), error: message },
        })
        .where(eq(agentActionsLogTable.id, audit.id));
    }

    res.status(approvalRequired ? 409 : 500).json({
      error: message,
      runId: audit?.id ?? null,
      approvalRequired,
    });
  }
});

export default router;

