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

import { createLiveBrowserSession, startLiveBrowserMission } from "../services/browser-live-session.js";

const router: IRouter = Router();

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

router.get("/internal/browser-mcp/status", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env["BROWSER_CDP_URL"]),
    runtime: "cdp",
    secureSecretInjection: true,
    persistentConnections: true,
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
    .select()
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
    allowWrite: z.boolean().default(false),
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

  let connection: typeof browserAgentConnectionsTable.$inferSelect | undefined;
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
  }

  const startUrl = connection?.startUrl ?? parsed.data.startUrl;
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
      status: parsed.data.allowWrite ? "approved" : "pending",
      payload: {
        goal: parsed.data.goal,
        startUrl,
        connectionId: connection?.id ?? null,
        allowWrite: parsed.data.allowWrite,
      },
    })
    .returning();

  try {
    const sessionCookies = connection?.cookiesEncrypted
      ? JSON.parse(decrypt(connection.cookiesEncrypted))
      : undefined;

    // First-party Vendor.ai sessions do not require a human password. The MCP endpoint
    // is already protected by BROWSER_MCP_ACCESS_TOKEN and tenant resolution above.
    // Mint a short-lived browser JWT from an active tenant administrator, marked as AI,
    // so the frontend can authenticate normally while downstream APIs retain actorType=ai.
    let firstPartyAuthToken: string | undefined;
    if (new URL(startUrl).hostname.toLowerCase() === "app.appvendorai.com") {
      const [servicePrincipal] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          platformRole: usersTable.platformRole,
          role: usersTable.role,
          userFunction: usersTable.userFunction,
          active: usersTable.active,
        })
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)))
        .limit(1);
      if (!servicePrincipal) {
        throw new Error("VENDI_AUTH_PRINCIPAL_NOT_FOUND: tenant sem usuário ativo para sessão interna");
      }
      firstPartyAuthToken = signToken({
        sub: servicePrincipal.id,
        email: servicePrincipal.email,
        platformRole: servicePrincipal.platformRole,
        tenantId,
        role: servicePrincipal.role,
        userFunction: servicePrincipal.userFunction ?? undefined,
        actorType: "ai",
      });
    }

    const agentInput: BrowserAgentInput = {
      tenantId,
      goal: parsed.data.goal,
      startUrl,
      mode: "assistido",
      allowWrite: parsed.data.allowWrite,
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

    const result = await runBrowserAgent(agentInput);

    if (audit?.id) {
      await db
        .update(agentActionsLogTable)
        .set({ status: "executed", payload: { ...(audit.payload ?? {}), result } })
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