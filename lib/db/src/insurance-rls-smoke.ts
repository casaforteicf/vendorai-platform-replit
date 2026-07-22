#!/usr/bin/env tsx
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;
const adminUrl = process.env.MIGRATION_DATABASE_URL;
if (!adminUrl) throw new Error("MIGRATION_DATABASE_URL is required");

const admin = new Pool({ connectionString: adminUrl, max: 2 });
const suffix = crypto.randomUUID();
const productA = `insurance-rls-a-${suffix}`;
const productB = `insurance-rls-b-${suffix}`;

async function visibleProductIds(tenantId: string): Promise<string[]> {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE vendorai_app");
    await client.query("SELECT app_security.set_tenant_context($1, FALSE)", [tenantId]);
    const result = await client.query<{ id: string }>(
      "SELECT id FROM insurance_products WHERE id = ANY($1::text[]) ORDER BY id",
      [[productA, productB]],
    );
    await client.query("ROLLBACK");
    return result.rows.map((row) => row.id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  const client = await admin.connect();
  try {
    const tenants = await client.query<{ id: string }>("SELECT id FROM tenants ORDER BY created_at LIMIT 2");
    const [tenantA, tenantB] = tenants.rows.map((row) => row.id);
    if (!tenantA || !tenantB || tenantA === tenantB) {
      throw new Error("Current database needs at least two tenants for the isolation smoke test");
    }

    await client.query(
      `INSERT INTO insurance_products
        (id, tenant_id, code, name, default_term_days, renewal_lead_days, active)
       VALUES
        ($1, $2, $3, 'RLS smoke A', 365, 90, true),
        ($4, $5, $6, 'RLS smoke B', 365, 90, true)`,
      [productA, tenantA, productA, productB, tenantB, productB],
    );

    const visibleA = await visibleProductIds(tenantA);
    const visibleB = await visibleProductIds(tenantB);
    if (visibleA.length !== 1 || visibleA[0] !== productA) {
      throw new Error(`Tenant A isolation failed: visible=${visibleA.join(",")}`);
    }
    if (visibleB.length !== 1 || visibleB[0] !== productB) {
      throw new Error(`Tenant B isolation failed: visible=${visibleB.join(",")}`);
    }
    console.log("✓ Insurance RLS two-tenant isolation passed");
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    await client.query("DELETE FROM insurance_products WHERE id = ANY($1::text[])", [[productA, productB]]).catch(() => undefined);
    client.release();
    await admin.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
