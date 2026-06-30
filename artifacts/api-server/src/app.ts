import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import { and, desc, eq } from "drizzle-orm";
import { db, tenantsTable, generatedSitesTable } from "@workspace/db";
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

// ─── Subdomain site middleware ────────────────────────────────────────────────
// When a request arrives from a *.appvendorai.com subdomain, serve that
// tenant's published site HTML directly. Assets (/api/storage/*) and intake
// routes (/api/public/*) pass through normally to the /api router.
const ROOT_DOMAIN = "appvendorai.com";

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const hostname = req.hostname; // stripped of port by Express

  const isSubdomain =
    hostname !== ROOT_DOMAIN &&
    hostname !== `www.${ROOT_DOMAIN}` &&
    hostname.endsWith(`.${ROOT_DOMAIN}`);

  if (!isSubdomain) {
    return next();
  }

  // Let API calls pass through (assets, public routes, webhooks, etc.)
  if (req.path.startsWith("/api/")) {
    return next();
  }

  const slug = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);

  if (!slug || slug.length < 1) {
    return next();
  }

  try {
    const [tenant] = await db
      .select({ id: tenantsTable.id, name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug));

    if (!tenant) {
      res.status(404).send(
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrado</title></head>` +
        `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
        `<div style="text-align:center"><p style="font-size:3rem">🌐</p><h1 style="color:#374151">Site não encontrado</h1>` +
        `<p style="color:#6b7280">O endereço <strong>${slug}.${ROOT_DOMAIN}</strong> não corresponde a nenhum site cadastrado.</p></div></body></html>`,
      );
      return;
    }

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
      res.status(404).send(
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Site não publicado</title></head>` +
        `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb">` +
        `<div style="text-align:center"><p style="font-size:3rem">🌐</p><h1 style="color:#374151">Site não publicado</h1>` +
        `<p style="color:#6b7280">O site de <strong>${tenant.name}</strong> ainda não foi publicado.</p></div></body></html>`,
      );
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Tenant-Slug", slug);
    res.send(site.html);
  } catch (err) {
    logger.error({ err, slug }, "subdomain-middleware: error serving tenant site");
    next(err);
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
