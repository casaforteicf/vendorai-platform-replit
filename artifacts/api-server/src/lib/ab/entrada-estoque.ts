import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { abRecebimentosTable, db, tenantsTable } from "@workspace/db";
import { withTenantTx } from "./escopo.js";
import { converterDeBase, ErroConversao } from "./unidades.js";

/**
 * Entrada em estoque do recebimento (AB-07).
 *
 * Fecha o ciclo físico: recebimento aprovado → `hotel_stock_location_balances`
 * → sync (AB-04) → `ab_estoque_saldos` → motor preditivo.
 *
 * Três decisões:
 *
 *  1. **Roda em transação separada do INSERT do recebimento.** Assim uma falha
 *     na soma (produto sem item de estoque, unidade sem fator) NÃO apaga o
 *     recebimento: ele fica gravado com `motivo_nao_aplicado` e entra na fila de
 *     reprocessamento. Perder a evidência do que chegou seria pior que atrasar
 *     o saldo.
 *  2. **Conversão base → unidade do item** (inverso do AB-04). O recebimento
 *     está em g/ml/un; o saldo do hotel está na unidade do `inventory_items`
 *     (kg, saco, caixa…). Somar 20000 g como "20000 kg" seria erro de 1000×.
 *  3. **Idempotência por `estoque_aplicado_em`.** A rotina só aplica recebimento
 *     com essa coluna nula. Repetir a chamada não soma duas vezes.
 */

export type ResultadoEntradaEstoque =
  | {
      aplicado: true;
      locationId: string;
      inventoryItemId: string;
      quantidadeEstoque: number;
      unidadeEstoque: string;
    }
  | { aplicado: false; motivo: string };

type LinhaLocal = { id: string };
type LinhaItem = { inventory_item_id: string; unidade_estoque: string | null; fator: string | null };

function linhasDe<T>(resultado: unknown): T[] {
  return ((resultado as { rows?: T[] }).rows ?? []) as T[];
}

/** Local de destino: o informado, ou o primeiro ativo priorizando câmara/central. */
async function resolverLocal(
  tx: Parameters<Parameters<typeof withTenantTx>[1]>[0],
  tenantId: string,
  locationId?: string | null,
): Promise<string | null> {
  if (locationId) {
    const encontrados = linhasDe<LinhaLocal>(
      await tx.execute(
        sql`SELECT id FROM hotel_stock_locations
             WHERE tenant_id = ${tenantId} AND id = ${locationId} AND active = true LIMIT 1`,
      ),
    );
    return encontrados[0]?.id ?? null;
  }

  const padrao = linhasDe<LinhaLocal>(
    await tx.execute(sql`
      SELECT id FROM hotel_stock_locations
       WHERE tenant_id = ${tenantId} AND active = true
       ORDER BY CASE kind
                  WHEN 'central' THEN 0
                  WHEN 'camara_fria' THEN 1
                  WHEN 'freezer' THEN 2
                  WHEN 'seco' THEN 3
                  ELSE 4
                END,
                created_at
       LIMIT 1
    `),
  );
  return padrao[0]?.id ?? null;
}

/**
 * Aplica UM recebimento aprovado no saldo físico.
 * Nunca lança: devolve o motivo quando não consegue, para o chamador gravar.
 */
export async function aplicarEntradaNoEstoque(params: {
  tenantId: string;
  recebimentoId: string;
  produtoCatalogoId: string;
  quantidadeBase: number;
  unidadeBase: "g" | "ml" | "un";
  locationId?: string | null;
}): Promise<ResultadoEntradaEstoque> {
  const { tenantId, recebimentoId, produtoCatalogoId, quantidadeBase, unidadeBase } = params;

  try {
    return await withTenantTx(tenantId, async (tx) => {
      const localId = await resolverLocal(tx, tenantId, params.locationId);
      if (!localId) {
        throw new Error(
          "Nenhum local de estoque ativo no hotel. Cadastre um local (central, câmara fria…) antes de receber.",
        );
      }

      // Item de estoque do produto: prefere o que já tem saldo no local de destino.
      const itens = linhasDe<LinhaItem>(
        await tx.execute(sql`
          SELECT inv.id                AS inventory_item_id,
                 inv.unidade           AS unidade_estoque,
                 mapa.fator_embalagem::text AS fator
            FROM inventory_items inv
            LEFT JOIN ab_insumo_produto mapa
              ON mapa.tenant_id = inv.tenant_id
             AND mapa.produto_catalogo_id = inv.produto_id
           WHERE inv.tenant_id = ${tenantId} AND inv.produto_id = ${produtoCatalogoId}
           ORDER BY EXISTS (
                      SELECT 1 FROM hotel_stock_location_balances b
                       WHERE b.tenant_id = inv.tenant_id
                         AND b.inventory_item_id = inv.id
                         AND b.location_id = ${localId}
                    ) DESC,
                    inv.created_at
           LIMIT 1
        `),
      );

      const item = itens[0];
      if (!item) {
        throw new Error(
          "Produto não tem item de estoque cadastrado (inventory_items). Cadastre o produto no estoque antes de receber.",
        );
      }

      const quantidadeEstoque = converterDeBase(
        quantidadeBase,
        unidadeBase,
        item.unidade_estoque,
        { fatorEmbalagem: item.fator ? Number(item.fator) : null },
      );

      if (!(quantidadeEstoque > 0)) {
        throw new Error(
          `Quantidade convertida inválida (${quantidadeEstoque}) para a unidade "${item.unidade_estoque}".`,
        );
      }

      await tx.execute(sql`
        INSERT INTO hotel_stock_location_balances (tenant_id, location_id, inventory_item_id, quantity)
        VALUES (${tenantId}, ${localId}, ${item.inventory_item_id}, ${String(quantidadeEstoque)})
        ON CONFLICT (tenant_id, location_id, inventory_item_id)
        DO UPDATE SET quantity = hotel_stock_location_balances.quantity + EXCLUDED.quantity,
                      updated_at = now()
      `);

      await tx
        .update(abRecebimentosTable)
        .set({
          locationId: localId,
          estoqueAplicadoEm: new Date(),
          motivoNaoAplicado: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(abRecebimentosTable.tenantId, tenantId),
            eq(abRecebimentosTable.id, recebimentoId),
          ),
        );

      return {
        aplicado: true as const,
        locationId: localId,
        inventoryItemId: item.inventory_item_id,
        quantidadeEstoque,
        unidadeEstoque: item.unidade_estoque ?? "un",
      };
    });
  } catch (erro) {
    const motivo =
      erro instanceof ErroConversao || erro instanceof Error
        ? erro.message
        : String(erro);

    // Grava o motivo numa transação nova (a anterior foi revertida).
    try {
      await withTenantTx(tenantId, async (tx) =>
        tx
          .update(abRecebimentosTable)
          .set({ motivoNaoAplicado: motivo.slice(0, 500), updatedAt: new Date() })
          .where(
            and(
              eq(abRecebimentosTable.tenantId, tenantId),
              eq(abRecebimentosTable.id, recebimentoId),
            ),
          ),
      );
    } catch (falhaAoGravar) {
      console.error("[ab-entrada-estoque] não consegui gravar o motivo", falhaAoGravar);
    }

    return { aplicado: false, motivo };
  }
}

export type ResumoReprocessamento = {
  analisados: number;
  aplicados: number;
  falharam: number;
  detalhes: Array<{ recebimentoId: string; aplicado: boolean; motivo?: string }>;
};

/**
 * Repassa a fila de recebimentos aprovados que ainda não entraram no estoque.
 * Rodar depois de corrigir cadastro (item de estoque, fator de embalagem, local).
 */
export async function reprocessarRecebimentosPendentes(opcoes: {
  tenantIds?: string[];
  limite?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
} = {}): Promise<ResumoReprocessamento> {
  const log = opcoes.logger ?? console;
  const limite = opcoes.limite ?? 200;
  const resumo: ResumoReprocessamento = {
    analisados: 0,
    aplicados: 0,
    falharam: 0,
    detalhes: [],
  };

  const tenantIds =
    opcoes.tenantIds ?? (await db.select({ id: tenantsTable.id }).from(tenantsTable)).map((t) => t.id);

  for (const tenantId of tenantIds) {
    const pendentes = await withTenantTx(tenantId, async (tx) =>
      tx
        .select({
          id: abRecebimentosTable.id,
          produtoCatalogoId: abRecebimentosTable.produtoCatalogoId,
          quantidade: abRecebimentosTable.quantidade,
          unidade: abRecebimentosTable.unidade,
          locationId: abRecebimentosTable.locationId,
        })
        .from(abRecebimentosTable)
        .where(
          and(
            eq(abRecebimentosTable.tenantId, tenantId),
            eq(abRecebimentosTable.status, "aprovado"),
            isNull(abRecebimentosTable.estoqueAplicadoEm),
          ),
        )
        .limit(limite),
    );

    for (const pendente of pendentes) {
      resumo.analisados += 1;
      const resultado = await aplicarEntradaNoEstoque({
        tenantId,
        recebimentoId: pendente.id,
        produtoCatalogoId: pendente.produtoCatalogoId,
        quantidadeBase: Number(pendente.quantidade),
        unidadeBase: pendente.unidade as "g" | "ml" | "un",
        locationId: pendente.locationId,
      });

      if (resultado.aplicado) {
        resumo.aplicados += 1;
        resumo.detalhes.push({ recebimentoId: pendente.id, aplicado: true });
      } else {
        resumo.falharam += 1;
        resumo.detalhes.push({
          recebimentoId: pendente.id,
          aplicado: false,
          motivo: resultado.motivo,
        });
        log.warn?.(`[ab-entrada-estoque] ${pendente.id}: ${resultado.motivo}`);
      }
    }
  }

  return resumo;
}
