import { Pool } from "pg";

if (process.env.VENDORAI_HOMOLOGATION_SEED !== "1") {
  throw new Error("Refusing homolog prereqs: VENDORAI_HOMOLOGATION_SEED must be 1");
}

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) throw new Error("Homologation database URL missing");

const url = new URL(connectionString);
const expectedRailwayProjectId = process.env.VENDORAI_HOMOLOGATION_PROJECT_ID?.trim();
const currentRailwayProjectId = process.env.RAILWAY_PROJECT_ID?.trim();
const authorized =
  Boolean(expectedRailwayProjectId) &&
  Boolean(currentRailwayProjectId) &&
  expectedRailwayProjectId === currentRailwayProjectId;

if (!authorized) {
  throw new Error(
    `Refusing homolog prereqs: Railway project mismatch (expected=${expectedRailwayProjectId || "(missing)"}, current=${currentRailwayProjectId || "(missing)"})`,
  );
}

const pool = new Pool({ connectionString, max: 1 });
try {
  await pool.query("CREATE SEQUENCE IF NOT EXISTS tenant_public_code_seq START WITH 1 INCREMENT BY 1");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await pool.query("DROP EXTENSION IF EXISTS vector CASCADE");
  await pool.query("CREATE EXTENSION vector WITH SCHEMA public");
  for (const roleName of ["anon", "authenticated", "service_role"]) {
    const roleCheck = await pool.query("select 1 from pg_roles where rolname = $1", [roleName]);
    if (roleCheck.rowCount === 0) {
      await pool.query(`CREATE ROLE ${roleName} NOLOGIN`);
    }
  }
  const check = await pool.query(`
    select
      current_database() as database,
      current_setting('search_path') as search_path,
      to_regtype('public.vector')::text as public_vector,
      e.extname,
      n.nspname as extension_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector'
  `);
  const row = check.rows[0] ?? null;
  console.log("[homolog-prereqs] sequence/extensions ready", {
    database: url.pathname.replace(/^\//, ""),
    projectId: currentRailwayProjectId,
    vector: row,
  });
  if (!row || row.public_vector !== "vector") {
    throw new Error(`pgvector not available in public schema: ${JSON.stringify(row)}`);
  }
} finally {
  await pool.end();
}
