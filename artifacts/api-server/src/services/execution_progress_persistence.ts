import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { validateCompletedQuantity } from "./execution_progress_rules.js";

export async function saveExecutionProgress(input: {
  tenantId: string; dealId: string; lotId: string; itemId: string;
  actorId: string; completedQuantity: number; note?: string;
}) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const deal = await client.query(
      "SELECT id FROM deals WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [input.tenantId, input.dealId],
    );
    if (!deal.rowCount) throw new Error("Negócio não localizado");
    const lot = await client.query(
      "SELECT status FROM execution_lots WHERE tenant_id=$1 AND deal_id=$2 AND id=$3 FOR UPDATE",
      [input.tenantId, input.dealId, input.lotId],
    );
    if (!lot.rowCount) throw new Error("Lote não localizado");
    if (lot.rows[0].status !== "in_progress") throw new Error("Lote não está em andamento");
    const itemRows = await client.query(
      "SELECT id, quantity, completed_quantity FROM execution_lot_items WHERE tenant_id=$1 AND deal_id=$2 AND lot_id=$3 AND source_item_id=$4 FOR UPDATE",
      [input.tenantId, input.dealId, input.lotId, input.itemId],
    );
    if (!itemRows.rowCount) throw new Error("Item não localizado");
    const item = itemRows.rows[0];
    const previous = Number(item.completed_quantity);
    const next = validateCompletedQuantity(Number(item.quantity), previous, input.completedQuantity);
    if (next !== previous) {
      await client.query(
        "UPDATE execution_lot_items SET completed_quantity=$1, updated_at=now() WHERE tenant_id=$2 AND id=$3",
        [next, input.tenantId, item.id],
      );
      await client.query(
        "INSERT INTO execution_lot_events (id, tenant_id, lot_id, actor_id, event_type, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
        [randomUUID(), input.tenantId, input.lotId, input.actorId, "item_progress",
          JSON.stringify({ itemId: input.itemId, previous, next, note: input.note ?? null })],
      );
    }
    await client.query("COMMIT");
    inTransaction = false;
    return { itemId: input.itemId, completedQuantity: next, unchanged: next === previous };
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
