import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { and, desc, eq } from "drizzle-orm";
import { db, tenantsTable, generatedSitesTable, tenantDomainsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { enforceTenantPath } from "./middlewares/tenant-path-guard.js";

const app: Express = express();

app.set("trust proxy", true);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Muitas tentativas. Aguarde 1 minuto." });
  },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);

app.use(compression());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

const configuredOrigins = new Set(
  (process.env["CORS_ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isVendorDomain =
        origin === "https://appvendorai.com" ||
        origin === "https://www.appvendorai.com" ||
        origin === "https://vendorai.replit.app" ||
        /^https:\/\/[a-z0-9-]+\.appvendorai\.com$/i.test(origin);

      if (isVendorDomain || configuredOrigins.has(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      logger.warn({ origin }, "CORS blocked origin");
      return callback(new Error("CORS origin denied"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(enforceTenantPath);

const ROOT_DOMAIN = "appvendorai.com";
const replitDomains = (process.env["REPLIT_DOMAINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const replitDevDomain = (process.env["REPLIT_DEV_DOMAIN"] ?? "").trim();
const MAIN_HOSTNAMES = new Set([
  ROOT_DOMAIN,
  `www.${ROOT_DOMAIN}`,
  "localhost",
  "127.0.0.1",
  ...replitDomains,
  ...(replitDevDomain ? [replitDevDomain] : []),
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notFoundHtml(label: string) {
  const safeLabel = escapeHtml(label);
  return (
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrado</title></head>` +
    `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
    `<div style="text-align:center"><p style="font-size:3rem">🌐</p><h1 style="color:#374151">Site não encontrado</h1>` +
    `<p style="color:#6b7280">O endereço <strong>${safeLabel}</strong> não corresponde a nenhum site cadastrado.</p></div></body></html>`
  );
}

function suspendedHtml(name: string) {
  const safeName = escapeHtml(name);
  return (
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Acesso suspenso</title></head>` +
    `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
    `<div style="text-align:center"><p style="font-size:3rem">🔒</p><h1 style="color:#374151">Acesso suspenso</h1>` +
    `<p style="color:#6b7280">O acesso de <strong>${safeName}</strong> está suspenso. Entre em contato com o suporte.</p></div></body></html>`
  );
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const hostname = req.hostname;
  const cfSubdomain = req.headers["x-tenant-subdomain"];
  const subdomainFromHeader = typeof cfSubdomain === "string" && cfSubdomain.trim()
    ? cfSubdomain.trim()
    : null;

  if (!subdomainFromHeader && MAIN_HOSTNAMES.has(hostname)) return next();

  const isWildcard = hostname.endsWith(`.${ROOT_DOMAIN}`);
  const isApi = req.path.startsWith("/api/");

  try {
    let tenant: { id: string; name: string; status: string } | undefined;

    if (subdomainFromHeader) {
      const [found] = await db
        .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
        .from(tenantsTable)
        .where(eq(tenantsTable.subdomainSlug, subdomainFromHeader));
      tenant = found;
    } else if (isWildcard) {
      const subdomainSlug = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
      if (!subdomainSlug) return next();

      const [found] = await db
        .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
        .from(tenantsTable)
        .where(eq(tenantsTable.subdomainSlug, subdomainSlug));
      tenant = found;
    } else {
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
      if (isApi) return res.status(404).json({ error: "Tenant não encontrado" });
      return res.status(404).send(notFoundHtml(hostname));
    }

    if (tenant.status === "suspended" || tenant.status === "cancelled") {
      if (isApi) return res.status(402).json({ error: "Acesso suspenso por inadimplência" });
      return res.status(402).send(suspendedHtml(tenant.name));
    }

    req.tenantId = tenant.id;
    if (isApi) return next();

    const [site] = await db
      .select({ html: generatedSitesTable.html })
      .from(generatedSitesTable)
      .where(and(eq(generatedSitesTable.tenantId, tenant.id), eq(generatedSitesTable.published, true)))
      .orderBy(desc(generatedSitesTable.updatedAt))
      .limit(1);

    if (!site) {
      return res.status(404).send(
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Site não publicado</title></head>` +
        `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
        `<div style="text-align:center"><p style="font-size:3rem">🌐</p><h1 style="color:#374151">Site não publicado</h1>` +
        `<p style="color:#6b7280">O site de <strong>${escapeHtml(tenant.name)}</strong> ainda não foi publicado.</p></div></body></html>`,
      );
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Tenant-Id", tenant.id);
    res.setHeader("Content-Security-Policy", "default-src 'self' https: data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    return res.send(site.html);
  } catch (err) {
    logger.error({ err, hostname }, "subdomain-middleware: error resolving tenant");
    return next(err);
  }
});

// Re-run after domain resolution so JWT tenant and subdomain/custom-domain tenant
// must agree before the request reaches any API route.
app.use(enforceTenantPath);

app.use("/api", router);
app.use("/api/v1", router);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const rawStatus =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: number }).status)
      : typeof err === "object" && err !== null && "statusCode" in err
        ? Number((err as { statusCode: number }).statusCode)
        : 500;

  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;
  const correlationId = req.id;
  logger.error({ err, correlationId }, "Unhandled route error");

  res.status(status).json({
    error: status === 500 ? "Erro interno no servidor" : "Não foi possível processar a solicitação",
    correlationId,
  });
});

export default app;
