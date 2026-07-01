import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import { and, desc, eq } from "drizzle-orm";
import { db, tenantsTable, generatedSitesTable, tenantDomainsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust proxy headers from Replit's reverse proxy
app.set("trust proxy", true);

app.use(compression());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS — allow all origins including *.appvendorai.com subdomains
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.endsWith(".appvendorai.com") ||
        origin === "https://appvendorai.com" ||
        origin === "https://www.appvendorai.com" ||
        origin === "https://vendorai.replit.app"
      ) {
        return callback(null, true);
      }
      // Allow in development
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      return callback(null, true); // open for now; tighten if needed
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ─── Subdomain / custom-domain tenant resolver ────────────────────────────────
// Runs before all routes. Detects *.appvendorai.com subdomains and verified
// custom domains, resolves the tenant, and:
//   • returns 404 JSON/HTML for unknown hosts
//   • returns 402 JSON/HTML for suspended/cancelled tenants
//   • injects req.tenantId and continues for all other requests
//   • for non-/api/ paths: additionally serves the tenant's published HTML site
const ROOT_DOMAIN = "appvendorai.com";
const MAIN_HOSTNAMES = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, "localhost", "127.0.0.1"]);

function notFoundHtml(label: string) {
  return (
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrado</title></head>` +
    `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
    `<div style="text-align:center"><p style="font-size:3rem">🌐</p><h1 style="color:#374151">Site não encontrado</h1>` +
    `<p style="color:#6b7280">O endereço <strong>${label}</strong> não corresponde a nenhum site cadastrado.</p></div></body></html>`
  );
}

function suspendedHtml(name: string) {
  return (
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Acesso suspenso</title></head>` +
    `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
    `<div style="text-align:center"><p style="font-size:3rem">🔒</p><h1 style="color:#374151">Acesso suspenso</h1>` +
    `<p style="color:#6b7280">O acesso de <strong>${name}</strong> está suspenso. Entre em contato com o suporte.</p></div></body></html>`
  );
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const hostname = req.hostname; // stripped of port by Express

  // Priority 1: Cloudflare Worker proxy sends X-Tenant-Subdomain header.
  // Must be checked BEFORE the MAIN_HOSTNAMES guard because Replit proxy
  // makes req.hostname appear as "localhost" even for subdomain requests.
  const cfSubdomain = req.headers["x-tenant-subdomain"];
  const subdomainFromHeader = typeof cfSubdomain === "string" && cfSubdomain.trim()
    ? cfSubdomain.trim()
    : null;

  // Skip main/platform domains — but only when no CF subdomain header present
  if (!subdomainFromHeader && MAIN_HOSTNAMES.has(hostname)) return next();

  const isWildcard = hostname.endsWith(`.${ROOT_DOMAIN}`);
  const isApi = req.path.startsWith("/api/");

  try {
    let tenant: { id: string; name: string; status: string } | undefined;

    if (subdomainFromHeader) {
      // Cloudflare Worker path: subdomain already extracted and sent via header
      const [found] = await db
        .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
        .from(tenantsTable)
        .where(eq(tenantsTable.subdomainSlug, subdomainFromHeader));
      tenant = found;
    } else if (isWildcard) {
      // Direct wildcard DNS path: "wolmann-design.appvendorai.com" → "wolmann-design"
      const subdomainSlug = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
      if (!subdomainSlug) return next();

      const [found] = await db
        .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
        .from(tenantsTable)
        .where(eq(tenantsTable.subdomainSlug, subdomainSlug));
      tenant = found;
    } else {
      // Custom domain: look up in tenant_domains (only active/verified domains)
      const [domainRow] = await db
        .select({ tenantId: tenantDomainsTable.tenantId, domainStatus: tenantDomainsTable.status })
        .from(tenantDomainsTable)
        .where(eq(tenantDomainsTable.domain, hostname));

      if (domainRow?.domainStatus === "active") {
        const [found] = await db
          .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, domainRow.tenantId));
        tenant = found;
      }
    }

    if (!tenant) {
      if (isApi) {
        return res.status(404).json({ error: "Tenant não encontrado", hostname });
      }
      return res.status(404).send(notFoundHtml(hostname));
    }

    if (tenant.status === "suspended" || tenant.status === "cancelled") {
      if (isApi) {
        return res.status(402).json({ error: "Acesso suspenso por inadimplência", tenantId: tenant.id });
      }
      return res.status(402).send(suspendedHtml(tenant.name));
    }

    // Inject tenant context for downstream route handlers
    req.tenantId = tenant.id;

    // For API calls: just continue — route handlers will use req.tenantId
    if (isApi) return next();

    // For non-API paths: serve the tenant's published site HTML
    const [site] = await db
      .select({ html: generatedSitesTable.html })
      .from(generatedSitesTable)
      .where(
        and(
          eq(generatedSitesTable.tenantId, tenant.id),
          eq(generatedSitesTable.published, true),
        ),
      )
      .orderBy(desc(generatedSitesTable.updatedAt))
      .limit(1);

    if (!site) {
      return res.status(404).send(
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Site não publicado</title></head>` +
        `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
        `<div style="text-align:center"><p style="font-size:3rem">🌐</p><h1 style="color:#374151">Site não publicado</h1>` +
        `<p style="color:#6b7280">O site de <strong>${tenant.name}</strong> ainda não foi publicado.</p></div></body></html>`,
      );
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Tenant-Id", tenant.id);
    return res.send(site.html);
  } catch (err) {
    logger.error({ err, hostname }, "subdomain-middleware: error resolving tenant");
    return next(err);
  }
});

// ─── Main API router ──────────────────────────────────────────────────────────
app.use("/api", router);

// Global error handler — catches any unhandled async errors (Express 5 auto-forwards them)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status: number }).status
      : typeof err === "object" && err !== null && "statusCode" in err
      ? (err as { statusCode: number }).statusCode
      : 500;

  const message =
    err instanceof Error ? err.message : "Erro interno no servidor";

  logger.error({ err }, "Unhandled route error");

  // Always return a safe 5xx for auth/permission errors that bubble up from SDKs
  const safeStatus = status === 401 || status === 403 ? 502 : Math.min(status, 599);

  res.status(safeStatus).json({ error: message });
});

export default app;
