import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function runStartupMigrations() {
  try {
    await db.execute(sql`
      ALTER TABLE lead_briefings
        ADD COLUMN IF NOT EXISTS journey_stage text DEFAULT 'abordagem',
        ADD COLUMN IF NOT EXISTS journey_checklist jsonb DEFAULT '{}'::jsonb
    `);
    logger.info("startup migrations: lead service journey OK");

    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL
    `);
    logger.info("startup migrations: user module permissions OK");

    // Compatibilidade de deploy: garante que o Vehicle Lookup esteja pronto
    // antes das rotas aceitarem consultas. A migration 091 continua sendo o
    // histórico oficial; este DDL é idempotente para ambientes que iniciam a
    // API sem executar previamente o migration runner.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicles (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plate text, chassis text, renavam text, brand text, model text,
        version text, raw_description text, full_name text,
        manufacture_year integer, model_year integer, fuel text, engine text,
        transmission text, power_hp integer, color text, vehicle_type text,
        fipe_code text, source text NOT NULL, confidence numeric(4,3) NOT NULL,
        confidence_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        possible_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
        provider_data jsonb, last_verified_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_plate_unique ON vehicles(tenant_id, plate) WHERE plate IS NOT NULL`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_chassis_unique ON vehicles(tenant_id, chassis) WHERE chassis IS NOT NULL`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicle_lookup_cache (
        id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lookup_type text NOT NULL, lookup_hash text NOT NULL,
        vehicle_id text NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        provider text NOT NULL, expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE(tenant_id, lookup_type, lookup_hash)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicle_lookup_history (
        id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        query_type text NOT NULL, query_masked text NOT NULL,
        vehicle_id text REFERENCES vehicles(id) ON DELETE SET NULL,
        provider text NOT NULL, success boolean NOT NULL, duration_ms integer NOT NULL,
        error_code text, created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS vehicle_lookup_history_tenant_created_idx ON vehicle_lookup_history(tenant_id, created_at)`);
    await db.execute(sql`
      ALTER TABLE veiculos_estoque
        ADD COLUMN IF NOT EXISTS chassi text,
        ADD COLUMN IF NOT EXISTS renavam text,
        ADD COLUMN IF NOT EXISTS versao text,
        ADD COLUMN IF NOT EXISTS motor text,
        ADD COLUMN IF NOT EXISTS potencia_hp integer,
        ADD COLUMN IF NOT EXISTS codigo_fipe text
    `);
    logger.info("startup migrations: vehicle lookup OK");

    // Imported Scout findings used to arrive as "em_negociacao" even when
    // no proposal or deal existed. Keep negotiation reserved for records
    // that actually have a commercial document/process attached.
    await db.execute(sql`
      UPDATE scout_oportunidades
      SET status = 'pendente',
          pipeline_stage = 'identificada',
          approved_by = NULL,
          approved_at = NULL
      WHERE status = 'em_negociacao'
        AND proposta_id IS NULL
        AND deal_id IS NULL
    `);
    logger.info("startup migrations: normalized Scout negotiation statuses OK");
  } catch (err) {
    logger.error({ err }, "startup migrations: lead service journey failed");
    throw err;
  }
}

async function start() {
  // Apply the idempotent compatibility DDL before routes start selecting the
  // new columns. The versioned SQL migration remains the schema history.
  await runStartupMigrations();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background scheduler after server is ready
    startScheduler(logger);
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});
