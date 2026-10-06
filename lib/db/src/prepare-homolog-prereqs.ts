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
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS tenant_public_code_seq START WITH 1 INCREMENT BY 1;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);
  console.log("[homolog-prereqs] sequence/extensions ready", {
    database: url.pathname.replace(/^\\//, ""),
    projectId: currentRailwayProjectId,
  });
} finally {
  await pool.end();
}
