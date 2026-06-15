/**
 * One-off cleanup: remove duplicate pending activities and agent_tasks created
 * by the churn-check scheduler before the deduplication fix was applied.
 *
 * Run: pnpm --filter @workspace/scripts run cleanup-duplicates
 */
import { db, activitiesTable, agentTasksTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

async function cleanupDuplicateActivities(): Promise<void> {
  console.log("── Limpando atividades duplicadas ──────────────────────────");

  // Find IDs of duplicate pending activities — keep only the oldest per (tenant_id, lead_id, titulo, status)
  const dupes = await db.execute(sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY tenant_id, lead_id, titulo, status
          ORDER BY created_at ASC
        ) AS rn
      FROM activities
      WHERE status = 'pendente'
    )
    SELECT id FROM ranked WHERE rn > 1
  `);

  const dupeIds = (dupes.rows as { id: string }[]).map((r) => r.id);
  console.log(`  Atividades duplicadas encontradas: ${dupeIds.length}`);

  if (dupeIds.length > 0) {
    const deleted = await db
      .delete(activitiesTable)
      .where(inArray(activitiesTable.id, dupeIds))
      .returning({ id: activitiesTable.id });
    console.log(`  ✅ ${deleted.length} atividades removidas.`);
  } else {
    console.log("  ✅ Nenhuma atividade duplicada encontrada.");
  }
}

async function cleanupDuplicateAgentTasks(): Promise<void> {
  console.log("── Limpando agent_tasks duplicadas ─────────────────────────");

  const dupes = await db.execute(sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY tenant_id, lead_id, action_type, status
          ORDER BY created_at ASC
        ) AS rn
      FROM agent_tasks
      WHERE status IN ('pendente_aprovacao', 'aprovado', 'executando')
    )
    SELECT id FROM ranked WHERE rn > 1
  `);

  const dupeIds = (dupes.rows as { id: string }[]).map((r) => r.id);
  console.log(`  Agent tasks duplicadas encontradas: ${dupeIds.length}`);

  if (dupeIds.length > 0) {
    const deleted = await db
      .delete(agentTasksTable)
      .where(inArray(agentTasksTable.id, dupeIds))
      .returning({ id: agentTasksTable.id });
    console.log(`  ✅ ${deleted.length} agent_tasks removidas.`);
  } else {
    console.log("  ✅ Nenhuma agent_task duplicada encontrada.");
  }
}

async function main(): Promise<void> {
  try {
    await cleanupDuplicateActivities();
    await cleanupDuplicateAgentTasks();
    console.log("\n✅ Limpeza concluída.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro durante limpeza:", err);
    process.exit(1);
  }
}

main();
