import { Pool } from "pg";

if (process.env.VENDORAI_HOMOLOGATION_SEED !== "1") {
  throw new Error("Refusing homolog reset: VENDORAI_HOMOLOGATION_SEED must be 1");
}

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Homolog reset database URL missing");
}

const url = new URL(connectionString);
const expectedRailwayProjectId = process.env.VENDORAI_HOMOLOGATION_PROJECT_ID?.trim();
const currentRailwayProjectId = process.env.RAILWAY_PROJECT_ID?.trim();
const explicitlyAuthorizedRailwayHomolog =
  Boolean(expectedRailwayProjectId) &&
  Boolean(currentRailwayProjectId) &&
  expectedRailwayProjectId === currentRailwayProjectId;

const legacyHomologNaming =
  /homolog-db/i.test(url.hostname) &&
  /homolog/i.test(url.pathname.replace(/^\//, ""));

if (!legacyHomologNaming && !explicitlyAuthorizedRailwayHomolog) {
  throw new Error(
    `Refusing homolog reset: database is not an explicitly authorized homolog target (host=${url.hostname}, database=${url.pathname})`,
  );
}

const pool = new Pool({ connectionString, max: 1 });
try {
  const before = await pool.query(
    `select current_database() as database,
            to_regclass('public.tenants')::text as tenants,
            to_regclass('public.leads')::text as leads,
            to_regclass('public.activities')::text as activities`,
  );
  console.log("[homolog-reset] before", before.rows[0]);

  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO PUBLIC");

  const after = await pool.query(
    `select current_database() as database,
            to_regclass('public.tenants')::text as tenants,
            to_regclass('public.leads')::text as leads,
            to_regclass('public.activities')::text as activities`,
  );
  console.log("[homolog-reset] completed", after.rows[0]);
} finally {
  await pool.end();
}
