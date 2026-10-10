import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { applyPendingMigrations as _applyPendingMigrations } from "./apply-migrations.js";
import { normalizeRuntimeConnectionString, safeConnectionTarget } from "./runtime-connection-string.js";

const { Pool } = pg;

/**
 * Runtime database connection.
 *
 * APP_DATABASE_URL is reserved for the restricted vendorai_app role. The
 * existing variables remain as fallbacks so this change is backwards
 * compatible until the restricted role is provisioned in Replit Secrets.
 */
const rawConnectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error(
    "APP_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL must be set.",
  );
}

const connectionString = normalizeRuntimeConnectionString(rawConnectionString, Boolean(process.env.APP_DATABASE_URL));

const connectionTarget = safeConnectionTarget(connectionString);
if (connectionTarget) {
  console.info("[db] connection target", connectionTarget);
} else {
  console.info("[db] connection target could not be parsed");
}

// O Supabase em session mode limita o role runtime a 15 conexões. Um pool
// local maior que esse limite gera EMAXCONNSESSION sob carga e pode fazer
// gravações simples (como criar usuário/representante) falharem de forma
// intermitente. Mantemos folga para jobs e outras instâncias do backend.
const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "8", 10);
const poolMax = Number.isFinite(configuredPoolMax)
  ? Math.min(Math.max(configuredPoolMax, 1), 10)
  : 8;

export const pool = new Pool({
  connectionString,
  max: poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

console.info("[db] pool configured", { max: poolMax });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./schema/growth_lab";
export * from "./schema/seo_backlink_opportunities";
export * from "./schema/jarvis_continuity";
export * from "./schema/jarvis_cases";
export * from "./schema/jarvis_key_people";
export * from "./schema/vie_sources";
export * from "./schema/vie_items";
export * from "./schema/tenant_user_functions";
export * from "./schema/app_builder";
export * from "./schema/app_users";
export * from "./schema/app_user_auth";
export * from "./schema/app_data_sources";

/**
 * Checks whether a versioned SQL migration (see lib/db/migrations and
 * src/migrate.ts) has already been recorded as applied in
 * `vendorai_schema_migrations`. If the control table doesn't exist yet
 * (fresh database, first boot before any migration has ever run), this
 * returns false rather than throwing.
 */
export async function isMigrationApplied(version: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM vendorai_schema_migrations WHERE version = $1 LIMIT 1`,
      [version],
    );
    return rows.length > 0;
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    // 42P01 = undefined_table (control table not created yet)
    if (code === "42P01") return false;
    throw err;
  }
}

/**
 * Aplica todas as migrations versionadas pendentes (mesmo motor usado pelo
 * CLI `pnpm --filter @workspace/db run migrate`) usando o pool de conexão
 * já configurado deste módulo. Serviços (como a API em boot) chamam isso
 * em vez de duplicar DDL — o SQL sempre vem só dos arquivos em
 * lib/db/migrations.
 */
export async function applyPendingMigrations(logger?: Pick<Console, "info" | "warn" | "error">) {
  return _applyPendingMigrations(pool, { logger });
}

export { inspectMepWallImpact } from "./arqdor-mep-host-impact";
