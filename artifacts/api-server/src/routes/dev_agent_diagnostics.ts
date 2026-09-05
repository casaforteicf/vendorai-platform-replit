import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getServerRuntimeSnapshot, type ServerRuntimeSignal } from "../lib/dev-agent-server-runtime.js";

const router = Router();

type DatabaseDiagnostics = {
  status: "healthy" | "degraded" | "unavailable";
  reachable: boolean;
  latencyMs: number | null;
  statsAvailable: boolean;
  totalConnections: number | null;
  activeConnections: number | null;
  waitingConnections: number | null;
  waitingLocks: number | null;
  longQueries: number | null;
  longTransactions: number | null;
  maxActiveQueryMs: number | null;
  warnings: string[];
  checkedAt: string;
};

type IntegrationFamily = "meta" | "whatsapp" | "google" | "email" | "webhooks" | "payments" | "other";

type IntegrationDiagnostics = {
  family: IntegrationFamily;
  status: "healthy" | "degraded" | "unknown";
  serverErrors24h: number;
  slowRequests24h: number;
  maxDurationMs: number;
  affectedEndpoints: string[];
  lastSeenAt: string | null;
};

export type PlatformDiagnostics = {
  database: DatabaseDiagnostics;
  integrations: IntegrationDiagnostics[];
  runtime: ReturnType<typeof getServerRuntimeSnapshot>;
  checkedAt: string;
  privacy: {
    queryTextCollected: false;
    requestBodyCollected: false;
    headersCollected: false;
    secretsCollected: false;
    tenantDataCollected: false;
  };
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getDatabaseDiagnostics(): Promise<DatabaseDiagnostics> {
  const checkedAt = new Date().toISOString();
  const warnings: string[] = [];
  const started = Date.now();

  try {
    await db.execute(sql`SELECT 1 AS ok`);
  } catch {
    return {
      status: "unavailable",
      reachable: false,
      latencyMs: null,
      statsAvailable: false,
      totalConnections: null,
      activeConnections: null,
      waitingConnections: null,
      waitingLocks: null,
      longQueries: null,
      longTransactions: null,
      maxActiveQueryMs: null,
      warnings: ["PostgreSQL não respondeu à sonda read-only."],
      checkedAt,
    };
  }

  const latencyMs = Math.max(0, Date.now() - started);
  if (latencyMs >= 500) warnings.push(`Latência da sonda PostgreSQL elevada: ${latencyMs}ms.`);

  try {
    const result = await db.execute(sql`
      SELECT
        count(*)::int AS total_connections,
        count(*) FILTER (WHERE state = 'active')::int AS active_connections,
        count(*) FILTER (WHERE wait_event IS NOT NULL)::int AS waiting_connections,
        count(*) FILTER (
          WHERE state = 'active'
            AND query_start IS NOT NULL
            AND now() - query_start > interval '5 seconds'
        )::int AS long_queries,
        count(*) FILTER (
          WHERE xact_start IS NOT NULL
            AND now() - xact_start > interval '30 seconds'
        )::int AS long_transactions,
        coalesce(
          max((extract(epoch FROM (now() - query_start)) * 1000)::bigint)
            FILTER (WHERE state = 'active' AND query_start IS NOT NULL),
          0
        )::bigint AS max_active_query_ms,
        (SELECT count(*)::int FROM pg_locks WHERE NOT granted) AS waiting_locks
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
    const totalConnections = asNumber(row.total_connections);
    const activeConnections = asNumber(row.active_connections);
    const waitingConnections = asNumber(row.waiting_connections);
    const waitingLocks = asNumber(row.waiting_locks);
    const longQueries = asNumber(row.long_queries);
    const longTransactions = asNumber(row.long_transactions);
    const maxActiveQueryMs = asNumber(row.max_active_query_ms);

    if (waitingConnections > 0) warnings.push(`${waitingConnections} conexão(ões) aguardando evento no PostgreSQL.`);
    if (waitingLocks > 0) warnings.push(`${waitingLocks} lock(s) aguardando liberação.`);
    if (longQueries > 0) warnings.push(`${longQueries} query(ies) ativa(s) acima de 5s.`);
    if (longTransactions > 0) warnings.push(`${longTransactions} transação(ões) acima de 30s.`);

    return {
      status: warnings.length ? "degraded" : "healthy",
      reachable: true,
      latencyMs,
      statsAvailable: true,
      totalConnections,
      activeConnections,
      waitingConnections,
      waitingLocks,
      longQueries,
      longTransactions,
      maxActiveQueryMs,
      warnings: warnings.slice(0, 8),
      checkedAt,
    };
  } catch {
    warnings.push("PostgreSQL respondeu, mas estatísticas agregadas de pg_stat_activity/pg_locks não estão disponíveis para esta credencial.");
    return {
      status: latencyMs >= 500 ? "degraded" : "healthy",
      reachable: true,
      latencyMs,
      statsAvailable: false,
      totalConnections: null,
      activeConnections: null,
      waitingConnections: null,
      waitingLocks: null,
      longQueries: null,
      longTransactions: null,
      maxActiveQueryMs: null,
      warnings: warnings.slice(0, 8),
      checkedAt,
    };
  }
}

function integrationFamily(path: string): IntegrationFamily {
  const value = path.toLowerCase();
  if (/instagram|facebook|meta(?:\/|$)|graph\.facebook/.test(value)) return "meta";
  if (/whatsapp|\/wa(?:\/|$)|waba/.test(value)) return "whatsapp";
  if (/google|calendar|gmail|youtube|oauth\/google/.test(value)) return "google";
  if (/smtp|email|mail(?:\/|$)/.test(value)) return "email";
  if (/webhook|n8n|typebot|callback/.test(value)) return "webhooks";
  if (/asaas|payment|pagamento|billing|subscription|stripe|mercadopago/.test(value)) return "payments";
  return "other";
}

function aggregateIntegrationSignals(signals: ServerRuntimeSignal[]): IntegrationDiagnostics[] {
  const families: IntegrationFamily[] = ["meta", "whatsapp", "google", "email", "webhooks", "payments", "other"];
  return families.map((family) => {
    const matching = signals.filter((signal) => integrationFamily(signal.path) === family);
    const serverErrors24h = matching.filter((signal) => signal.kind === "server_error").reduce((sum, signal) => sum + signal.count, 0);
    const slowRequests24h = matching.filter((signal) => signal.kind === "slow_server").reduce((sum, signal) => sum + signal.count, 0);
    const maxDurationMs = matching.reduce((max, signal) => Math.max(max, signal.maxDurationMs), 0);
    const lastSeenAt = matching.map((signal) => signal.lastSeenAt).sort().at(-1) ?? null;
    const affectedEndpoints = [...new Set(matching.map((signal) => `${signal.method} ${signal.path}`))].slice(0, 8);
    const hasSignals = matching.length > 0;
    return {
      family,
      status: !hasSignals ? "unknown" : serverErrors24h > 0 || maxDurationMs >= 5000 ? "degraded" : "healthy",
      serverErrors24h,
      slowRequests24h,
      maxDurationMs,
      affectedEndpoints,
      lastSeenAt,
    };
  });
}

export async function getPlatformDiagnostics(): Promise<PlatformDiagnostics> {
  const [database, runtime] = await Promise.all([
    getDatabaseDiagnostics(),
    Promise.resolve(getServerRuntimeSnapshot(40)),
  ]);

  return {
    database,
    integrations: aggregateIntegrationSignals(runtime.topSignals),
    runtime,
    checkedAt: new Date().toISOString(),
    privacy: {
      queryTextCollected: false,
      requestBodyCollected: false,
      headersCollected: false,
      secretsCollected: false,
      tenantDataCollected: false,
    },
  };
}

router.get("/support/dev/diagnostics", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode consultar diagnósticos do Dev IA." });
  }

  try {
    const diagnostics = await getPlatformDiagnostics();
    return res.json({ success: true, diagnostics });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia platform diagnostics failed");
    return res.status(500).json({ error: "Falha ao executar diagnóstico read-only da plataforma" });
  }
});

export default router;
