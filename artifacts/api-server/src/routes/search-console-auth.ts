import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  insertSeoBacklinkOpportunitySchema,
  seoBacklinkOpportunitiesTable,
  updateSeoBacklinkOpportunitySchema,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import { writeConfigurationAudit } from "../lib/configuration-audit.js";
import {
  buildSearchConsoleOAuthUrl,
  exchangeCodeForTokens,
  saveSearchConsolePendingConnection,
  verifyAndActivateSearchConsole,
  refreshSearchConsoleToken,
  disconnectSearchConsole,
  getSearchConsoleConnectionByTenantId,
} from "../services/search-console-oauth.js";
import { getSearchConsoleInsights } from "../services/search-console-insights.js";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed route tenant is consumed only by handlers/middleware that enforce same-tenant or super-admin access before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

function getAppUrl(): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }
  return process.env["APP_URL"]?.replace(/\/$/, "") || "http://localhost:3000";
}

function safeReturnTo(value: unknown, fallback = "/configuracoes") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return fallback;
  return trimmed.slice(0, 500);
}

function appendQueryParam(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function auditActor(req: Request, userId?: string | null) {
  return {
    userId: userId ?? req.user?.sub ?? req.user?.sub ?? null,
    ip: req.ip ?? null,
  };
}

async function auditSearchConsoleChange(
  req: Request,
  tenantId: string,
  before: unknown,
  after: unknown,
  userId?: string | null,
  action: "criar" | "atualizar" | "excluir" = "atualizar",
) {
  const audited = await writeConfigurationAudit({
    tenantId,
    action,
    entity: "search_console_connection",
    entityId: tenantId,
    before: action === "criar" ? undefined : before,
    after: action === "excluir" ? undefined : after,
    actor: auditActor(req, userId),
  });
  if (!audited) logger.warn({ tenantId }, "configuracoes: falha ao auditar Search Console");
}

router.get("/auth/search-console", authenticate, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth Search Console: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }
    const returnTo = safeReturnTo(req.query.returnTo);
    const state = createOAuthState(tenantId, userId, "search-console", returnTo);
    const url = buildSearchConsoleOAuthUrl(state);
    logger.info({ tenantId, userId, returnTo }, "Retornando URL OAuth Search Console");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth Search Console");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/auth/search-console/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();
  let returnTo = "/configuracoes";

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback Search Console: parâmetros inválidos");
    return res.redirect(`${appUrl}${appendQueryParam(returnTo, "searchConsoleError", "access_denied")}`);
  }

  let tenantId: string;
  let auditUserId: string | null = null;
  try {
    const decoded = consumeOAuthState(state, "search-console");
    tenantId = decoded.tenantId;
    auditUserId = decoded.userId ?? null;
    returnTo = safeReturnTo(decoded.returnTo, returnTo);
  } catch (err) {
    logger.warn({ err }, "Callback Search Console: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}${appendQueryParam(returnTo, "searchConsoleError", "invalid_state")}`);
  }

  try {
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(code);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar codigo OAuth do Search Console");
      return res.redirect(`${appUrl}${appendQueryParam(returnTo, "searchConsoleError", "token_exchange")}`);
    }

    if (!tokens.refresh_token) {
      logger.error({ tenantId }, "Google não retornou refresh_token no callback do Search Console");
      return res.redirect(`${appUrl}${appendQueryParam(returnTo, "searchConsoleError", "no_refresh_token")}`);
    }

    const before = await getSearchConsoleConnectionByTenantId(tenantId).catch(() => null);
    await saveSearchConsolePendingConnection(tenantId, tokens.refresh_token, tokens.access_token, tokens.expires_in);
    const after = await getSearchConsoleConnectionByTenantId(tenantId).catch(() => null);
    await auditSearchConsoleChange(req, tenantId, before, after, auditUserId, before ? "atualizar" : "criar");
    logger.info({ tenantId }, "Search Console conectado, aguardando verificação da meta tag");
    return res.redirect(`${appUrl}${appendQueryParam(returnTo, "searchConsoleConnected", "pending")}`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Search Console");
    return res.redirect(`${appUrl}${appendQueryParam(returnTo, "searchConsoleError", "exchange_failed")}`);
  }
});

function assertTenantAccess(req: Request, tenantId: string): boolean {
  const userTenantId = req.user?.tenantId;
  return req.user?.platformRole === "super_admin" || tenantId === userTenantId;
}

router.get("/tenants/:tenantId/search-console-connection", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const conn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!conn || conn.status === "disconnected" || conn.disconnectedAt) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      verified: conn.verified,
      siteUrl: conn.siteUrl,
      sitemapSubmittedAt: conn.sitemapSubmittedAt?.toISOString() ?? null,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao buscar status da conexão Search Console");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/tenants/:tenantId/search-console-insights", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req); // tenant-audit: reviewed authenticated route checks tenant access immediately below
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const requestedDays = Number(req.query.days ?? 28);
    const result = await getSearchConsoleInsights(tenantId, requestedDays);
    return res.json(result);
  } catch (err) {
    const tenantId = routeTenantId(req); // tenant-audit: reviewed logging-only tenant identifier in authenticated route
    const message = err instanceof Error ? err.message : "UNKNOWN";
    logger.error({ err, tenantId }, "Erro ao carregar insights do Search Console");
    if (message === "SEARCH_CONSOLE_NOT_ACTIVE") {
      return res.status(409).json({ error: "SEARCH_CONSOLE_NOT_ACTIVE" });
    }
    if (message.startsWith("SEARCH_CONSOLE_API_")) {
      return res.status(502).json({ error: "SEARCH_CONSOLE_UPSTREAM_ERROR" });
    }
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/tenants/:tenantId/seo/backlinks", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req); // tenant-audit: reviewed authenticated route checks tenant access immediately below
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const rows = await db
      .select()
      .from(seoBacklinkOpportunitiesTable)
      .where(eq(seoBacklinkOpportunitiesTable.tenantId, tenantId))
      .orderBy(desc(seoBacklinkOpportunitiesTable.updatedAt));

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status in acc.byStatus) acc.byStatus[row.status as keyof typeof acc.byStatus] += 1;
        return acc;
      },
      {
        total: 0,
        byStatus: { identified: 0, contacted: 0, negotiating: 0, won: 0, lost: 0 },
      },
    );

    return res.json({ opportunities: rows, summary });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao listar oportunidades de backlinks"); // tenant-audit: reviewed logging-only tenant identifier in authenticated route
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/seo/backlinks", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req); // tenant-audit: reviewed authenticated route checks tenant access immediately below
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const parsed = insertSeoBacklinkOpportunitySchema.safeParse({
      ...req.body,
      tenantId,
      updatedAt: new Date(),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_BACKLINK_OPPORTUNITY", details: parsed.error.flatten() });
    }

    const [created] = await db
      .insert(seoBacklinkOpportunitiesTable)
      .values(parsed.data)
      .returning();

    return res.status(201).json(created);
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao criar oportunidade de backlink"); // tenant-audit: reviewed logging-only tenant identifier in authenticated route
    return res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/tenants/:tenantId/seo/backlinks/:id", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req); // tenant-audit: reviewed authenticated route checks tenant access immediately below
    const id = String(req.params.id);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const parsed = updateSeoBacklinkOpportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_BACKLINK_UPDATE", details: parsed.error.flatten() });
    }

    const before = await db
      .select()
      .from(seoBacklinkOpportunitiesTable)
      .where(and(eq(seoBacklinkOpportunitiesTable.id, id), eq(seoBacklinkOpportunitiesTable.tenantId, tenantId)))
      .limit(1);
    if (!before[0]) return res.status(404).json({ error: "Backlink opportunity not found" });

    const nextStatus = parsed.data.status ?? before[0].status;
    const [updated] = await db
      .update(seoBacklinkOpportunitiesTable)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
        wonAt: nextStatus === "won" ? before[0].wonAt ?? new Date() : null,
      })
      .where(and(eq(seoBacklinkOpportunitiesTable.id, id), eq(seoBacklinkOpportunitiesTable.tenantId, tenantId)))
      .returning();

    return res.json(updated);
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req), id: String(req.params.id) }, "Erro ao atualizar oportunidade de backlink"); // tenant-audit: reviewed logging-only tenant identifier in authenticated route
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/seo/backlinks/:id", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req); // tenant-audit: reviewed authenticated route checks tenant access immediately below
    const id = String(req.params.id);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const [deleted] = await db
      .delete(seoBacklinkOpportunitiesTable)
      .where(and(eq(seoBacklinkOpportunitiesTable.id, id), eq(seoBacklinkOpportunitiesTable.tenantId, tenantId)))
      .returning({ id: seoBacklinkOpportunitiesTable.id });

    if (!deleted) return res.status(404).json({ error: "Backlink opportunity not found" });
    return res.json({ success: true, id: deleted.id });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req), id: String(req.params.id) }, "Erro ao excluir oportunidade de backlink"); // tenant-audit: reviewed logging-only tenant identifier in authenticated route
    return res.status(500).json({ error: "Internal error" });
  }
});

// Chamado pelo usuário depois de esperar a meta tag propagar no site
// (ela é injetada automaticamente, sem precisar regenerar o site).
router.post("/tenants/:tenantId/search-console-connection/verify", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const before = await getSearchConsoleConnectionByTenantId(tenantId).catch(() => null);
    const result = await verifyAndActivateSearchConsole(tenantId);
    const after = await getSearchConsoleConnectionByTenantId(tenantId).catch(() => null);
    await auditSearchConsoleChange(req, tenantId, before, after);
    return res.json(result);
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao verificar Search Console");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/search-console-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const conn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }
    await refreshSearchConsoleToken(conn.id);
    const after = await getSearchConsoleConnectionByTenantId(tenantId).catch(() => null);
    await auditSearchConsoleChange(req, tenantId, conn, after);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao renovar token Search Console");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/search-console-connection", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const before = await getSearchConsoleConnectionByTenantId(tenantId).catch(() => null);
    await disconnectSearchConsole(tenantId);
    await auditSearchConsoleChange(req, tenantId, before, null, null, "excluir");
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao desconectar Search Console");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const searchConsoleCallbackRouter: IRouter = router;
