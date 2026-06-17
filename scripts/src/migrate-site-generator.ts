import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const steps = [
  {
    name: "generated_sites table",
    sql: `CREATE TABLE IF NOT EXISTS generated_sites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      site_type TEXT NOT NULL CHECK (site_type IN ('landing', 'ecommerce', 'institutional')),
      config JSONB NOT NULL DEFAULT '{}',
      html TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },
  {
    name: "idx_generated_sites_tenant",
    sql: `CREATE INDEX IF NOT EXISTS idx_generated_sites_tenant
          ON generated_sites(tenant_id, created_at DESC)`,
  },
];

async function main() {
  console.log("🚀 Migrate: Site Generator module\n");
  for (const step of steps) {
    process.stdout.write(`  ⏳ ${step.name}...`);
    try {
      await db.execute(sql.raw(step.sql));
      console.log(" ✅");
    } catch (err: any) {
      console.log(` ❌ ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`\n✔ All ${steps.length} steps completed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
