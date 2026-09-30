import { Pool } from "pg";

if (process.env.VENDORAI_HOMOLOGATION_SEED !== "1") {
  console.log("[homolog-bootstrap] skipped");
  process.exit(0);
}

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) throw new Error("Homologation database URL missing");
if (/gfocphuiyyufwzcyihbk/i.test(connectionString)) {
  throw new Error("Refusing to bootstrap production database");
}

const pool = new Pool({ connectionString, max: 1 });
await pool.query("CREATE SEQUENCE IF NOT EXISTS tenant_public_code_seq START WITH 1 INCREMENT BY 1");
console.log("[homolog-bootstrap] tenant_public_code_seq ready");
await pool.end();
