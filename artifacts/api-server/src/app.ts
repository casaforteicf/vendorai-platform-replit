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
  `app.${ROOT_DOMAIN}`,
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

function normalizeHostHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return raw.split(",")[0]?.trim().replace(/:\d+$/, "").toLowerCase() || null;
}

function hostnameFromUrlHeader(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isCrmHostname(hostname: string | null): boolean {
  if (!hostname) return false;
  return MAIN_HOSTNAMES.has(hostname) || hostname.endsWith(`.app.${ROOT_DOMAIN}`);
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const hostname = req.hostname.toLowerCase();
  const cfSubdomain = req.headers["x-tenant-subdomain"];
  const subdomainFromHeader = typeof cfSubdomain === "string" && cfSubdomain.trim()
    ? cfSubdomain.trim()
    : null;

  // O resolvedor abaixo existe para sites públicos/subdomínios de tenant.
  // Ele não deve participar de chamadas autenticadas do CRM: nesses casos o
  // tenant já está no JWT e o enforceTenantPath valida qualquer escopo de
  // tenant informado pela própria requisição. O Vercel/Railway pode remover
  // Host, Referer e headers customizados durante external rewrites; usar o
  // Bearer como sinal torna esse bypass independente do comportamento do proxy.
  const requestPaths = [req.path, req.originalUrl, req.url]
    .map((value) => value.split("?", 1)[0] ?? value);
  const isApiRequest = requestPaths.some((value) => value === "/api" || value.startsWith("/api/"));
  const isAuthApiRequest = requestPaths.some(
    (value) =>
      value === "/api/auth" ||
      value.startsWith("/api/auth/") ||
      value === "/auth" ||
      value.startsWith("/auth/"),
  );
  const hasBearerAuth = req.headers.authorization?.startsWith("Bearer ") === true;

  if (!subdomainFromHeader && (isAuthApiRequest || (isApiRequest && hasBearerAuth))) {
    return next();
  }

  // Vercel faz rewrite de /api/* para o Railway. Em alguns POPs o Railway
  // substitui Host/X-Forwarded-Host pelo domínio *.up.railway.app; nesse caso
  // req.hostname deixa de ser app.appvendorai.com e o resolver abaixo tentava
  // tratar o próprio domínio do Railway como domínio customizado de tenant,
  // devolvendo { error: "Tenant não encontrado" } antes de /auth/me.
  //
  // Para requisições do CRM, recuperamos o host original a partir dos headers
  // preservados pelo proxy e, como fallback de navegador, Origin/Referer.
  // x-tenant-subdomain continua tendo precedência para os sites públicos que
  // chegam pelo Worker do Cloudflare.
  const forwardedHost = normalizeHostHeader(req.headers["x-forwarded-host"]);
  const originalHost = normalizeHostHeader(req.headers["x-original-host"]);
  const originHost = hostnameFromUrlHeader(typeof req.headers.origin === "string" ? req.headers.origin : undefined);
  const refererHost = hostnameFromUrlHeader(typeof req.headers.referer === "string" ? req.headers.referer : undefined);
  const isCrmRequest = [hostname, forwardedHost, originalHost, originHost, refererHost].some(isCrmHostname);

  if (!subdomainFromHeader && isCrmRequest) return next();

  const isWildcard = hostname.endsWith(`.${ROOT_DOMAIN}`);
  const isApi = isApiRequest;

  // Endereço real digitado pelo visitante, só para mensagens de erro — o
  // Cloudflare Worker que faz proxy do *.appvendorai.com remove o Host
  // original e a Railway sobrescreve X-Forwarded-Host com o domínio dela
  // mesma, então `hostname` (req.hostname) não é confiável para exibição.
  const displayAddress = subdomainFromHeader ? `${subdomainFromHeader}.${ROOT_DOMAIN}` : hostname;

  try {
    let tenant: { id: string; name: string; status: string } | undefined;
    // Preenchido quando o identificador bate com o slug de um site
    // específico (gerado na tela de Site Generator) — cada site publicado
    // tem seu próprio endereço, então nesse caso servimos ESSE site, não
    // "o último publicado do tenant".
    let matchedSite: { html: string; published: boolean } | undefined;

    const identifier = subdomainFromHeader
      ?? (isWildcard ? hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1) : null);

    if (identifier === "") {
      return next();
    }

    if (identifier) {
      const [siteMatch] = await db
        .select({
          html: generatedSitesTable.html,
          published: generatedSitesTable.published,
          tenantId: tenantsTable.id,
          tenantName: tenantsTable.name,
          tenantStatus: tenantsTable.status,
        })
        .from(generatedSitesTable)
        .innerJoin(tenantsTable, eq(generatedSitesTable.tenantId, tenantsTable.id))
        .where(eq(generatedSitesTable.siteSlug, identifier))
        .orderBy(desc(generatedSitesTable.updatedAt))
        .limit(1);

      if (siteMatch) {
        tenant = { id: siteMatch.tenantId, name: siteMatch.tenantName, status: siteMatch.tenantStatus };
        matchedSite = { html: siteMatch.html, published: siteMatch.published };
      } else {
        const [found] = await db
          .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
          .from(tenantsTable)
          .where(eq(tenantsTable.subdomainSlug, identifier));
        tenant = found;
      }
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
      return res.status(404).send(notFoundHtml(displayAddress));
    }

    if (tenant.status === "suspended" || tenant.status === "cancelled") {
      if (isApi) return res.status(402).json({ error: "Acesso suspenso por inadimplência" });
      return res.status(402).send(suspendedHtml(tenant.name));
    }

    req.tenantId = tenant.id;
    if (isApi) return next();

    const publicUrl = `https://${displayAddress}`;

    if (req.path === "/robots.txt") {
      res.type("text/plain");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(`User-agent: *\nAllow: /\nSitemap: ${publicUrl}/sitemap.xml\n`);
    }

    if (req.path === "/sitemap.xml") {
      const publishedSites = await db
        .select({ siteSlug: generatedSitesTable.siteSlug, updatedAt: generatedSitesTable.updatedAt })
        .from(generatedSitesTable)
        .where(and(eq(generatedSitesTable.tenantId, tenant.id), eq(generatedSitesTable.published, true)))
        .orderBy(desc(generatedSitesTable.updatedAt));

      const lastmod = publishedSites[0]?.updatedAt
        ? new Date(publishedSites[0].updatedAt).toISOString().slice(0, 10)
        : undefined;

      // A raiz do domínio deste tenant sempre entra; sites com siteSlug
      // próprio (ex: uma landing de campanha à parte) entram também, no
      // próprio subdomínio deles.
      const extraUrls = publishedSites
        .filter((s) => s.siteSlug && s.siteSlug !== identifier)
        .map(
          (s) =>
            `  <url><loc>https://${s.siteSlug}.${ROOT_DOMAIN}/</loc><priority>0.8</priority></url>`,
        )
        .join("\n");

      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url><loc>${publicUrl}/</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<priority>1.0</priority></url>\n` +
        (extraUrls ? extraUrls + "\n" : "") +
        `</urlset>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(xml);
    }

    let site: { html: string } | undefined;

    if (matchedSite) {
      site = matchedSite.published ? { html: matchedSite.html } : undefined;
    } else {
      const [latest] = await db
        .select({ html: generatedSitesTable.html })
        .from(generatedSitesTable)
        .where(and(eq(generatedSitesTable.tenantId, tenant.id), eq(generatedSitesTable.published, true)))
        .orderBy(desc(generatedSitesTable.updatedAt))
        .limit(1);
      site = latest;
    }

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
    // Sites gerados por IA usam bastante style="" inline e, às vezes, um
    // <script> inline pequeno (FAQ, toggles) — sem 'unsafe-inline' em
    // style-src/script-src o CSP acima bloqueia até conteúdo legítimo, não
    // só sobra suja de edição.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https: data:; script-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:; font-src 'self' https: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
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
