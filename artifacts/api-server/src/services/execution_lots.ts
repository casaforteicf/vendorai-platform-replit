import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { validateExecutionLot, type ExecutionAllocation, type ExecutionItem, type ExecutionRequestItem } from "./partial_execution.js";

export type CreateExecutionLotInput = {
  tenantId: string;
  dealId: string;
  proposalId: string;
  requestKey: string;
  actorId: string;
  items: ExecutionRequestItem[];
  label?: string;
};

/**
 * Persistência serializada por negócio, com contrato vindo exclusivamente do banco.
 * Requer a migration 202610101230_execution_lots.sql.
 * Não expor este serviço sem middleware de autenticação/autorização do tenant.
 */
export async function createExecutionLot(input: CreateExecutionLotInput) {
  if (![input.tenantId, input.dealId, input.proposalId, input.requestKey, input.actorId]
      .every((value) => typeof value === "string" && value.trim().length > 0)) {
    throw new Error("Identificadores obrigatórios inválidos");
  }
  if (input.requestKey.length > 160) throw new Error("Chave de idempotência muito longa");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Bloquear o negócio serializa todas as reservas simultâneas deste contrato.
    const deal = await client.query(
      "SELECT id FROM deals WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
      [input.dealId, input.tenantId],
    );
    if (deal.rowCount !== 1) throw new Error("Negócio não localizado para o tenant");

    const replay = await client.query(
      "SELECT id, status FROM execution_lots WHERE tenant_id=$1 AND deal_id=$2 AND request_key=$3",
      [input.tenantId, input.dealId, input.requestKey],
    );
    if (replay.rows[0]) {
      await client.query("COMMIT");
      return { ...replay.rows[0], idempotentReplay: true };
    }

    const proposal = await client.query(
      "SELECT id, itens, status FROM propostas WHERE id=$1 AND deal_id=$2 AND tenant_id=$3 FOR UPDATE",
      [input.proposalId, input.dealId, input.tenantId],
    );
    if (proposal.rowCount !== 1 || proposal.rows[0].status !== "aceita") {
      throw new Error("Proposta aceita não encontrada para este negócio");
    }
    const rawItems = proposal.rows[0].itens;
    if (!Array.isArray(rawItems) || !rawItems.length) throw new Error("Proposta sem itens válidos");
    // Índice congelado na proposta aceita: não usar SKU, que pode repetir em ambientes.
    const contracted: ExecutionItem[] = rawItems.map((item: any, index: number) => ({
      itemId: String(index),
      contractedQuantity: item.quantidade,
      groupId: typeof item.etapaId === "string" ? item.etapaId : null,
      environmentId: typeof item.ambienteId === "string" ? item.ambienteId : null,
    }));
    const rows = await client.query(
      `SELECT i.lot_id, i.source_item_id, i.quantity, i.status
         FROM execution_lot_items i JOIN execution_lots l ON l.id=i.lot_id
        WHERE i.tenant_id=$1 AND i.deal_id=$2 AND l.proposal_id=$3`,
      [input.tenantId, input.dealId, input.proposalId],
    );
    const allocations: ExecutionAllocation[] = rows.rows.map((row) => ({
      lotId: row.lot_id, itemId: row.source_item_id,
      quantity: Number(row.quantity), status: row.status,
    }));
    // Conta também as reservas do caminho /deals/:id/execution-batches (lotes em work_cards),
    // indexadas pela posição do item na proposta (mesma identidade usada aqui: String(index)).
    // Sem isso, os dois caminhos alocariam o mesmo saldo em dobro.
    const legacyCards = await client.query(
      `SELECT metadata FROM work_cards
        WHERE tenant_id=$1 AND deal_id=$2 AND pipeline='execucao'`,
      [input.tenantId, input.dealId],
    );
    for (const row of legacyCards.rows) {
      const meta = row.metadata as Record<string, any> | null;
      if (!meta || meta.propostaId !== input.proposalId || meta.loteParcial !== true || !Array.isArray(meta.itensLote)) continue;
      for (const it of meta.itensLote as Array<{ indice?: unknown; quantidade?: unknown }>) {
        if (!Number.isInteger(it.indice) || typeof it.quantidade !== "number") continue;
        const idx = it.indice as number;
        // Só considera itens dentro do contrato atual e com quantidade positiva, para um
        // work_card legado/divergente não derrubar a validação do lote.
        if (idx < 0 || idx >= contracted.length || !(it.quantidade > 0)) continue;
        allocations.push({ lotId: `workcard:${String(idx)}`, itemId: String(idx), quantity: it.quantidade, status: "reserved" });
      }
    }
    const result = validateExecutionLot(contracted, allocations, input.items);
    const lotId = randomUUID();
    await client.query(
      `INSERT INTO execution_lots (id, tenant_id, deal_id, proposal_id, request_key, label, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [lotId, input.tenantId, input.dealId, input.proposalId, input.requestKey, input.label ?? null, input.actorId],
    );
    for (const item of result.items) {
      const source = contracted.find((row) => row.itemId === item.itemId)!;
      await client.query(
        `INSERT INTO execution_lot_items
           (id, lot_id, tenant_id, deal_id, source_item_id, group_id, environment_id, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), lotId, input.tenantId, input.dealId, item.itemId,
          source.groupId ?? null, source.environmentId ?? null, item.quantity],
      );
    }
    await client.query(
      `INSERT INTO execution_lot_events (id, tenant_id, lot_id, actor_id, event_type, payload)
       VALUES ($1,$2,$3,$4,'lot_reserved',$5::jsonb)`,
      [randomUUID(), input.tenantId, lotId, input.actorId,
        JSON.stringify({ proposalId: input.proposalId, items: result.items })],
    );
    await client.query("COMMIT");
    return { id: lotId, status: "reserved", idempotentReplay: false, balancesAfter: result.balancesAfter };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
