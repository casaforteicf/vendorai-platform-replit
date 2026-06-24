import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

await db.execute(sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS metodo_vendas text`);
console.log("✓ metodo_vendas column added to business_profiles");
process.exit(0);
