/**
 * Cmd 24 — Consolidação dos Fluxos de Atendimento
 * Adiciona campos last_inbound_at e current_agent à tabela conversations
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

async function main() {
  console.log("Cmd 24 migrate: updating conversations table...");

  await db.execute(sql`
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
      ADD COLUMN IF NOT EXISTS current_agent text;
  `);
  console.log("  ✓ conversations.last_inbound_at adicionada");
  console.log("  ✓ conversations.current_agent adicionada");

  console.log("Cmd 24 migrate: done ✓");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
