import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Check current state first
const check = await db.execute(sql`
  SELECT ac.tenant_id, ac.monthly_token_limit, t.plan_id, p.ai_quota_usd, p.slug
  FROM agent_configs ac
  JOIN tenants t ON t.id = ac.tenant_id
  LEFT JOIN plans p ON p.id = t.plan_id
  ORDER BY ac.monthly_token_limit
`);

const rows = Array.isArray(check) ? check : (check as any).rows ?? [];
console.log(`Found ${rows.length} agent_configs row(s):`);
for (const r of rows) {
  console.log(`  tenant=${r.tenant_id}  limit=${r.monthly_token_limit}  plan=${r.slug ?? "none"}  aiQuotaUsd=${r.ai_quota_usd ?? "null"}`);
}

// Update all rows where limit doesn't match expected value from plan
const update = await db.execute(sql`
  UPDATE agent_configs ac
  SET monthly_token_limit = COALESCE(
    ROUND(CAST(p.ai_quota_usd AS numeric) * 750000),
    26250000
  )
  FROM tenants t
  LEFT JOIN plans p ON p.id = t.plan_id
  WHERE ac.tenant_id = t.id
  AND ac.monthly_token_limit != COALESCE(
    ROUND(CAST(p.ai_quota_usd AS numeric) * 750000)::int,
    26250000
  )
  RETURNING ac.tenant_id, ac.monthly_token_limit
`);

const updated = Array.isArray(update) ? update : (update as any).rows ?? [];
console.log(`\nUpdated ${updated.length} row(s):`);
for (const r of updated) {
  console.log(`  tenant ${r.tenant_id} → monthly_token_limit = ${r.monthly_token_limit}`);
}
console.log("Done.");
process.exit(0);
