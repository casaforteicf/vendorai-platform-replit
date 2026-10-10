import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  agentActionsLogTable,
  browserAgentConnectionsTable,
  tenantsTable,
  usersTable,
  leadsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { decrypt, encrypt } from "../lib/crypto.js";
import { runBrowserAgent, type BrowserAgentInput } from "../services/browser-agent.js";
import { mergeBrowserProfiles, type BrowserProfileState } from "../services/browser-profile.js";
import { signToken } from "../lib/jwt.js";

import { createLiveBrowserSession, getLiveBrowserHandoff, startLiveBrowserMission } from "../services/browser-live-session.js";

const router: IRouter = Router();

const vendiAutonomyEnabled = () => String(process.env["VENDI_AUTONOMY_ENABLED"] ?? "").toLowerCase() === "true";

function vendiControlUrl(sessionId: string, handoffToken: string) {
  const configured = (process.env["VENDI_CONTROL_BASE_URL"] ?? "https://app.appvendorai.com").trim().replace(/\/$/, "");
  const base = configured || "https://app.appvendorai.com";
  return `${base}/vendi/handoff?browserSession=${encodeURIComponent(sessionId)}&handoff=${encodeURIComponent(handoffToken)}`;
}

function authorized(req: any): boolean {
  const expected = process.env["BROWSER_MCP_ACCESS_TOKEN"]?.trim();
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

router.post("/internal/browser-mcp/homolog-bootstrap", async (req, res) => {
  if (String(process.env["HOMOLOGATION_AUTH_BOOTSTRAP_ENABLED"] ?? "").toLowerCase() !== "true") {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const parsed = z.object({ tenantKey: tenantKeySchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const upstreamToken = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!upstreamToken) {
    res.status(401).json({ error: "missing_upstream_token" });
    return;
  }

  const verifyUrl = process.env["HOMOLOGATION_UPSTREAM_AUTH_ME_URL"]?.trim()
    || "https://app.appvendorai.com/api/auth/me";

  let upstreamUser: any;
  try {
    const verifyResponse = await fetch(verifyUrl, {
      headers: { authorization: `Bearer ${upstreamToken}` },
    });
    if (!verifyResponse.ok) {
      res.status(401).json({ error: "upstream_token_rejected", status: verifyResponse.status });
      return;
    }
    upstreamUser = await verifyResponse.json();
  } catch {
    res.status(502).json({ error: "upstream_auth_unreachable" });
    return;
  }

  if (upstreamUser?.platformRole !== "super_admin") {
    res.status(403).json({ error: "super_admin_required" });
    return;
  }

  const tenantId = await resolveTenantId(parsed.data.tenantKey);
  if (!tenantId) {
    res.status(404).json({ error: "tenant_not_found" });
    return;
  }

  const principalSelect = {
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    platformRole: usersTable.platformRole,
    role: usersTable.role,
    userFunction: usersTable.userFunction,
    active: usersTable.active,
  };

  const [platformPrincipal] = await db.select(principalSelect)
    .from(usersTable)
    .where(and(eq(usersTable.platformRole, "super_admin"), eq(usersTable.active, true)))
    .limit(1);
  const [tenantPrincipal] = await db.select(principalSelect)
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)))
    .limit(1);
  const servicePrincipal = tenantPrincipal;

  if (!servicePrincipal) {
    res.status(409).json({ error: "vendi_auth_principal_not_found" });
    return;
  }

  const token = signToken({
    sub: servicePrincipal.id,
    email: servicePrincipal.email,
    platformRole: servicePrincipal.platformRole,
    tenantId,
    role: servicePrincipal.role,
    userFunction: servicePrincipal.userFunction ?? undefined,
    actorType: "ai",
  });

  res.json({
    token,
    tenantId,
    userCache: {
      id: servicePrincipal.id,
      email: servicePrincipal.email,
      name: servicePrincipal.name,
      platformRole: servicePrincipal.platformRole,
      tenantId,
      role: servicePrincipal.role,
      userFunction: servicePrincipal.userFunction ?? null,
      actorType: "ai",
    },
  });
});

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
  profileEncrypted: browserAgentConnectionsTable.profileEncrypted,
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
  | "profileEncrypted"
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
    hasPersistentProfile: Boolean(connection.profileEncrypted),
    lastUsedAt: connection.lastUsedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

/** Read-only CRM integration for the existing Vendi MCP.
 * Uses the established BROWSER_MCP_ACCESS_TOKEN middleware and resolves
 * tenant on the server. No browser, JWT impersonation or cross-tenant query.
 */
router.post("/internal/browser-mcp/crm-summary", async (req, res) => {
  const parsed = z.object({ tenantKey: tenantKeySchema }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "invalid_tenant_key" });
    return;
  }
  try {
    const tenantId = await resolveTenantId(parsed.data.tenantKey);
    if (!tenantId) {
      res.status(404).json({ error: "tenant_not_found" });
      return;
    }

    const [summary] = await db
      .select({ totalLeads: sql<number>`cast(count(*) as integer)` })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm)));

    res.json({
      ok: true,
      tenantId,
      crm: { activeLeads: Number(summary?.totalLeads ?? 0) },
      readOnly: true,
      source: "vendorai-api",
    });
  } catch {
    res.status(503).json({ error: "crm_summary_unavailable" });
  }
});

router.get("/internal/browser-mcp/status", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env["BROWSER_CDP_URL"]),
    runtime: "cdp",
    secureSecretInjection: true,
    persistentConnections: true,
    persistentProfiles: true,
    humanVerificationSessionReuse: true,
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
  // An explicit assisted/read-only request must never be escalated by tenant or global autonomy.
  const mode = parsed.data.mode === "assistido"
    ? "assistido"
    : (globalVendiAutonomy ? "autonomo" : (parsed.data.mode ?? (autonomyEnabled ? "autonomo" : "assistido")));
  const allowWrite = parsed.data.allowWrite === false
    ? false
    : (globalVendiAutonomy ? true : (parsed.data.allowWrite ?? autonomyEnabled));

  let connection: BrowserMcpConnection | undefined;
  if (parsed.data.connectionId) {
    [connection] = await db
      .select(browserMcpConnectionSelection)
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
      .select(browserMcpConnectionSelection)
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
    .returning({ id: agentActionsLogTable.id, payload: agentActionsLogTable.payload });

  try {
    const sessionCookies = connection?.cookiesEncrypted
      ? JSON.parse(decrypt(connection.cookiesEncrypted))
      : undefined;
    let sessionProfile: BrowserProfileState | undefined;
    if (connection?.profileEncrypted) {
      try {
        sessionProfile = JSON.parse(decrypt(connection.profileEncrypted)) as BrowserProfileState;
      } catch {
        sessionProfile = undefined;
      }
    }

    let firstPartyAuthToken: string | undefined;
    let firstPartyAuthUserCache: Record<string, unknown> | undefined;
    const firstPartyUrl = new URL(startUrl);
    const firstPartyHost = firstPartyUrl.hostname.toLowerCase();

    if (firstPartyHost === "app.appvendorai.com") {
      const principalSelect = {
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        platformRole: usersTable.platformRole,
        role: usersTable.role,
        userFunction: usersTable.userFunction,
        active: usersTable.active,
      };

      const [platformPrincipal] = await db.select(principalSelect)
        .from(usersTable)
        .where(and(eq(usersTable.platformRole, "super_admin"), eq(usersTable.active, true)))
        .limit(1);
      const [tenantPrincipal] = await db.select(principalSelect)
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)))
        .limit(1);
      const servicePrincipal = tenantPrincipal;
      if (!servicePrincipal) throw new Error("VENDI_AUTH_PRINCIPAL_NOT_FOUND");

      firstPartyAuthToken = signToken({
        sub: servicePrincipal.id,
        email: servicePrincipal.email,
        platformRole: servicePrincipal.platformRole,
        tenantId,
        role: servicePrincipal.role,
        userFunction: servicePrincipal.userFunction ?? undefined,
        actorType: "ai",
      });
      firstPartyAuthUserCache = {
        id: servicePrincipal.id,
        email: servicePrincipal.email,
        name: servicePrincipal.name,
        platformRole: servicePrincipal.platformRole,
        tenantId,
        role: servicePrincipal.role,
        userFunction: servicePrincipal.userFunction ?? null,
        actorType: "ai",
      };
    } else if (
      String(process.env["HOMOLOGATION_AUTH_BOOTSTRAP_ENABLED"] ?? "").toLowerCase() === "true" &&
      /^vendorai-homolog-frontend-[a-z0-9-]+\.up\.railway\.app$/i.test(firstPartyHost)
    ) {
      const principalSelect = {
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        platformRole: usersTable.platformRole,
        role: usersTable.role,
        userFunction: usersTable.userFunction,
        active: usersTable.active,
      };
      const [platformPrincipal] = await db.select(principalSelect)
        .from(usersTable)
        .where(and(eq(usersTable.platformRole, "super_admin"), eq(usersTable.active, true)))
        .limit(1);
      const [tenantPrincipal] = await db.select(principalSelect)
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)))
        .limit(1);
      const servicePrincipal = tenantPrincipal;
      if (!servicePrincipal) throw new Error("VENDI_AUTH_PRINCIPAL_NOT_FOUND");

      firstPartyAuthToken = signToken({
        sub: servicePrincipal.id,
        email: servicePrincipal.email,
        platformRole: servicePrincipal.platformRole,
        tenantId,
        role: servicePrincipal.role,
        userFunction: servicePrincipal.userFunction ?? undefined,
        actorType: "ai",
      });
      firstPartyAuthUserCache = {
        id: servicePrincipal.id,
        email: servicePrincipal.email,
        name: servicePrincipal.name,
        platformRole: servicePrincipal.platformRole,
        tenantId,
        role: servicePrincipal.role,
        userFunction: servicePrincipal.userFunction ?? null,
        actorType: "ai",
      };
    } else if (firstPartyHost === "homolog.appvendorai.com") {
      // Gera primeiro uma credencial técnica válida na produção e a apresenta à
      // homologação. A homologação valida essa credencial contra /auth/me da
      // produção e só então emite um JWT local com o próprio JWT_SECRET.
      const principalSelect = {
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        platformRole: usersTable.platformRole,
        role: usersTable.role,
        userFunction: usersTable.userFunction,
        active: usersTable.active,
      };
      const [platformPrincipal] = await db.select(principalSelect)
        .from(usersTable)
        .where(and(eq(usersTable.platformRole, "super_admin"), eq(usersTable.active, true)))
        .limit(1);
      if (!platformPrincipal) throw new Error("VENDI_AUTH_PRINCIPAL_NOT_FOUND");

      const upstreamToken = signToken({
        sub: platformPrincipal.id,
        email: platformPrincipal.email,
        platformRole: platformPrincipal.platformRole,
        tenantId,
        role: platformPrincipal.role,
        userFunction: platformPrincipal.userFunction ?? undefined,
        actorType: "ai",
      });

      const exchangeUrl = new URL("/api/internal/browser-mcp/homolog-bootstrap", firstPartyUrl.origin);
      const exchangeResponse = await fetch(exchangeUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${upstreamToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantKey: parsed.data.tenantKey }),
      });

      if (!exchangeResponse.ok) {
        const detail = await exchangeResponse.text().catch(() => "");
        throw new Error(`VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED:${exchangeResponse.status}:${detail.slice(0, 200)}`);
      }

      const exchanged = await exchangeResponse.json() as {
        token?: string;
        userCache?: Record<string, unknown>;
      };
      if (!exchanged.token) throw new Error("VENDI_HOMOLOG_AUTH_EXCHANGE_INVALID_RESPONSE");

      firstPartyAuthToken = exchanged.token;
      firstPartyAuthUserCache = exchanged.userCache;
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
      sessionProfile,
      firstPartyAuthToken,
      firstPartyAuthUserCache,
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
      onProfilePersist: connection
        ? async (profile) => {
            sessionProfile = mergeBrowserProfiles(sessionProfile, profile);
            await db
              .update(browserAgentConnectionsTable)
              .set({
                profileEncrypted: encrypt(JSON.stringify(sessionProfile)),
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
        controlUrl: vendiControlUrl(session.id, handoff.handoffToken) };
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

    if (approvalRequired) {
      await db.insert(notificationsTable).values({
        tenantId,
        type: "warning",
        category: "browser_agent_approval_required",
        title: "Browser Agent aguardando aprovação",
        message: `A execução foi pausada porque precisa de aprovação humana. Objetivo: ${parsed.data.goal}. Abra a Central para aprovar e continuar.`,
      });
    }

    res.status(approvalRequired ? 409 : 500).json({
      error: message,
      runId: audit?.id ?? null,
      approvalRequired,
    });
  }
});

export default router;
