import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { calculateExecutionBalances, type ExecutionAllocation, type ExecutionItem } from "./partial_execution.js";

export type LotStatus = "reserved" | "in_progress" | "completed" | "cancelled";
const allowed: Record<LotStatus, readonly LotStatus[]> = {
  reserved: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export function assertLotTransition(current: LotStatus, next: LotStatus) {
  if (!allowed[current]?.includes(next)) throw new Error("Transição de estado não permitida");
}

export async function getExecutionLots(tenantId: string, dealId: string, proposalId: string) {
  const client = await pool.connect();
  try {
    const proposal = await client.query(
      "SELECT itens FROM propostas WHERE tenant_id=$1 AND deal_id=$2 AND id=$3",
      [tenantId, dealId, proposalId],
    );
    if (!proposal.rowCount) throw new Error("Proposta não encontrada");
    const source = proposal.rows[0].itens;
    if (!Array.isArray(source)) throw new Error("Itens de proposta inválidos");
    const contracted: ExecutionItem[] = source.map((item: any, index: number) => ({
      itemId: String(index), contractedQuantity: item.quantidade,
      groupId: item.etapaId ?? null, environmentId: item.ambienteId ?? null,
    }));
    const lots = await client.query(
      "SELECT id, status, label, created_at, updated_at FROM execution_lots WHERE tenant_id=$1 AND deal_id=$2 AND proposal_id=$3 ORDER BY created_at DESC",
      [tenantId, dealId, proposalId],
    );
    const lines = await client.query(
      `SELECT i.lot_id, i.source_item_id, i.quantity, i.completed_quantity, i.status
         FROM execution_lot_items i JOIN execution_lots l ON l.id=i.lot_id
        WHERE i.tenant_id=$1 AND i.deal_id=$2 AND l.proposal_id=$3`,
      [tenantId, dealId, proposalId],
    );
    const allocations: ExecutionAllocation[] = lines.rows.map((row) => ({
      lotId: row.lot_id, itemId: row.source_item_id, quantity: Number(row.quantity), status: row.status,
    }));
    const balances = calculateExecutionBalances(contracted, allocations).map((balance) => ({
      ...balance,
      completed: lines.rows.filter((row) => row.source_item_id === balance.itemId && row.status !== "cancelled")
        .reduce((sum, row) => sum + Number(row.completed_quantity), 0),
    }));
    const events = await client.query(
      "SELECT e.id, e.lot_id, e.event_type, e.payload, e.actor_id, e.created_at FROM execution_lot_events e JOIN execution_lots l ON l.id=e.lot_id AND l.tenant_id=e.tenant_id WHERE l.tenant_id=$1 AND l.deal_id=$2 AND l.proposal_id=$3 ORDER BY e.created_at DESC LIMIT 300",
      [tenantId, dealId, proposalId],
    );
    return { events: events.rows, lots: lots.rows, allocations: lines.rows, balances, contractedItems: source.map((item: any, index: number) => ({ itemId: String(index), name: item.nome, unit: item.unidade ?? "un", group: item.etapaNome ?? null, contractedQuantity: Number(item.quantidade) })) };
  } finally {
    client.release();
  }
}

export async function transitionExecutionLot(input: {
  tenantId: string; dealId: string; lotId: string; actorId: string; nextStatus: LotStatus; reason?: string;
}) {
  const client = await pool.connect();
  let active = false;
  try {
    await client.query("BEGIN");
    active = true;
    const deal = await client.query("SELECT id FROM deals WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
      [input.dealId, input.tenantId]);
    if (!deal.rowCount) throw new Error("Negócio não localizado");
    const result = await client.query(
      "SELECT id, status FROM execution_lots WHERE id=$1 AND tenant_id=$2 AND deal_id=$3 FOR UPDATE",
      [input.lotId, input.tenantId, input.dealId],
    );
    if (!result.rowCount) throw new Error("Lote não localizado");
    const current = result.rows[0].status as LotStatus;
    assertLotTransition(current, input.nextStatus);
    if (input.nextStatus === "cancelled" && (!input.reason || input.reason.trim().length < 5)) {
      throw new Error("Cancelamento exige justificativa");
    }
    if (input.nextStatus === "completed" || input.nextStatus === "cancelled") {
      const progress = await client.query(
        "SELECT quantity, completed_quantity FROM execution_lot_items WHERE lot_id=$1 AND tenant_id=$2 AND deal_id=$3 FOR UPDATE",
        [input.lotId, input.tenantId, input.dealId],
      );
      if (input.nextStatus === "completed" &&
          (!progress.rowCount || progress.rows.some((item) => Number(item.quantity) !== Number(item.completed_quantity)))) {
        throw new Error("Existem quantidades pendentes no lote");
      }
      if (input.nextStatus === "cancelled" &&
          progress.rows.some((item) => Number(item.completed_quantity) > 0)) {
        throw new Error("Lote com execução registrada exige estorno");
      }
    }
    await client.query(
      "UPDATE execution_lots SET status=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3 AND deal_id=$4",
      [input.nextStatus, input.lotId, input.tenantId, input.dealId],
    );
    await client.query(
      "UPDATE execution_lot_items SET status=$1,updated_at=now() WHERE lot_id=$2 AND tenant_id=$3 AND deal_id=$4",
      [input.nextStatus, input.lotId, input.tenantId, input.dealId],
    );
    await client.query(
      `INSERT INTO execution_lot_events(id,tenant_id,lot_id,actor_id,event_type,payload)
       VALUES($1,$2,$3,$4,'status_changed',$5::jsonb)`,
      [randomUUID(), input.tenantId, input.lotId, input.actorId,
        JSON.stringify({ from: current, to: input.nextStatus, reason: input.reason ?? null })],
    );
    await client.query("COMMIT");
    active = false;
    return { id: input.lotId, status: input.nextStatus };
  } catch (error) {
    if (active) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
