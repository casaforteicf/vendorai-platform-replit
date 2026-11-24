import { and, eq, sql } from "drizzle-orm";
import { abRequisicoesTable } from "@workspace/db";
import { withTenantTx } from "./escopo.js";
import { converterDeBase, ErroConversao } from "./unidades.js";

/**
 * Baixa de estoque da requisição (AB-08) — o caminho inverso do AB-07.
 *
 * Decisões:
 *  1. **O status vira 'entregue' e a baixa acontecem na MESMA transação.** Se o
 *     saldo não bastar, o rollback desfaz o status: a requisição continua
 *     pendente. Nada de "entregue sem baixa" nem "baixa sem entrega".
 *  2. **Idempotência pelo UPDATE condicional**: só transiciona quem ainda não
 *     tem `baixa_aplicada_em` e está pendente/aprovada. Chamar duas vezes
 *     devolve 409 na segunda.
 *  3. **Escolha do item de estoque**: um insumo pode estar ligado a vários
 *     produtos (`ab_insumo_produto`). A rotina prefere o item que tem saldo
 *     suficiente convertido — nunca mistura unidades diferentes na mesma soma.
 */

export type LinhaSaldoEstoque = {
  locationId: string;
  inventoryItemId: string;
  quantidade: number;
};

export type AlocacaoBaixa = {
  locationId: string;
  inventoryItemId: string;
  quantidade: number;
};

export type ResultadoPlanoBaixa =
  | { ok: true; alocacoes: AlocacaoBaixa[]; disponivel: number }
  | { ok: false; motivo: string; disponivel: number; necessario: number };

function arredondar(valor: number): number {
  return Math.round(valor * 10_000) / 10_000;
}

/**
 * Decide de onde tirar (função pura, testável sem banco).
 *
 * Aloca do maior saldo para o menor — concentra a baixa em menos locais e
 * reduz a chance de deixar saldo inutilizável espalhado.
 */
export function planejarBaixa(params: {
  linhas: LinhaSaldoEstoque[];
  quantidadeNecessaria: number;
  unidadeBase?: string;
}): ResultadoPlanoBaixa {
  const { linhas, quantidadeNecessaria } = params;
  // Saldo negativo não existe (CHECK quantity >= 0), mas se aparecer não pode
  // reduzir o disponível nem virar "alocação negativa" — trata como zero.
  const sanitas = linhas.map((linha) => ({
    ...linha,
    quantidade: Number.isFinite(linha.quantidade) ? Math.max(0, linha.quantidade) : 0,
  }));
  const disponivel = arredondar(sanitas.reduce((soma, linha) => soma + linha.quantidade, 0));

  if (!(quantidadeNecessaria > 0)) {
    return {
      ok: false,
      motivo: "Quantidade de baixa inválida (precisa ser maior que zero).",
      disponivel,
      necessario: quantidadeNecessaria,
    };
  }

  if (disponivel < quantidadeNecessaria) {
    return {
      ok: false,
      motivo:
        `Saldo insuficiente: disponível ${disponivel} na unidade do estoque, ` +
        `necessário ${quantidadeNecessaria}.`,
      disponivel,
      necessario: quantidadeNecessaria,
    };
  }

  let restante = quantidadeNecessaria;
  const alocacoes: AlocacaoBaixa[] = [];

  for (const linha of [...sanitas].sort((a, b) => b.quantidade - a.quantidade)) {
    if (restante <= 0) break;
    if (!(linha.quantidade > 0)) continue;
    const tirar = Math.min(linha.quantidade, restante);
    const quantidade = arredondar(tirar);
    if (quantidade <= 0) continue;
    alocacoes.push({
      locationId: linha.locationId,
      inventoryItemId: linha.inventoryItemId,
      quantidade,
    });
    restante = arredondar(restante - quantidade);
  }

  if (restante > 0) {
    return {
      ok: false,
      motivo: `Saldo insuficiente após o rateio (faltam ${restante}).`,
      disponivel,
      necessario: quantidadeNecessaria,
    };
  }

  return { ok: true, alocacoes, disponivel };
}

export class EstoqueInsuficiente extends Error {
  constructor(
    message: string,
    readonly disponivel: number,
    readonly necessario: number,
  ) {
    super(message);
    this.name = "EstoqueInsuficiente";
  }
}

export type ResultadoBaixa =
  | {
      entregue: true;
      inventoryItemId: string;
      quantidadeEstoque: number;
      unidadeEstoque: string;
      locais: string[];
    }
  | { entregue: false; jaEntregue: true }
  | { entregue: false; motivo: string; disponivel?: number; necessario?: number };

type LinhaItem = {
  inventory_item_id: string;
  unidade_estoque: string | null;
  fator: string | null;
  total: string;
};

function linhasDe<T>(resultado: unknown): T[] {
  return ((resultado as { rows?: T[] }).rows ?? []) as T[];
}

/**
 * Dá baixa na requisição. Nunca lança: devolve o motivo para o chamador
 * responder com a mensagem certa (409 se já entregue, 422 se faltou saldo).
 */
export async function darBaixaNaRequisicao(params: {
  tenantId: string;
  requisicaoId: string;
  insumoId: string;
  quantidadeBase: number;
  unidadeBase: "g" | "ml" | "un";
}): Promise<ResultadoBaixa> {
  const { tenantId, requisicaoId, insumoId, quantidadeBase, unidadeBase } = params;

  try {
    return await withTenantTx(tenantId, async (tx) => {
      // 1. Transição atômica: só quem ainda não teve baixa.
      const transicionadas = linhasDe<{ id: string }>(
        await tx.execute(sql`
          UPDATE ab_requisicoes
             SET status = 'entregue', baixa_aplicada_em = now(), updated_at = now()
           WHERE tenant_id = ${tenantId}
             AND id = ${requisicaoId}
             AND status IN ('pendente', 'aprovada')
             AND baixa_aplicada_em IS NULL
           RETURNING id
        `),
      );
      if (transicionadas.length === 0) return { entregue: false as const, jaEntregue: true as const };

      // 2. Candidatos: itens de estoque ligados ao insumo, com o total atual.
      const candidatos = linhasDe<LinhaItem>(
        await tx.execute(sql`
          SELECT inv.id                     AS inventory_item_id,
                 inv.unidade                AS unidade_estoque,
                 mapa.fator_embalagem::text AS fator,
                 COALESCE((
                   SELECT SUM(b.quantity)
                     FROM hotel_stock_location_balances b
                    WHERE b.tenant_id = inv.tenant_id AND b.inventory_item_id = inv.id
                 ), 0)::text                 AS total
            FROM ab_insumo_produto mapa
            JOIN inventory_items inv
              ON inv.tenant_id = mapa.tenant_id
             AND inv.produto_id = mapa.produto_catalogo_id
           WHERE mapa.tenant_id = ${tenantId} AND mapa.insumo_id = ${insumoId}
        `),
      );

      if (candidatos.length === 0) {
        throw new EstoqueInsuficiente(
          "Insumo sem produto de estoque mapeado (de-para produto → insumo). Nada a baixar.",
          0,
          quantidadeBase,
        );
      }

      // 3. Escolhe o item que consegue atender, convertendo a necessidade.
      let escolhido: { item: LinhaItem; necessario: number } | null = null;
      let melhorDisponivel = 0;

      for (const item of candidatos) {
        try {
          const necessario = converterDeBase(quantidadeBase, unidadeBase, item.unidade_estoque, {
            fatorEmbalagem: item.fator ? Number(item.fator) : null,
          });
          const total = Number(item.total ?? 0);
          melhorDisponivel = Math.max(melhorDisponivel, total);
          if (total >= necessario) {
            escolhido = { item, necessario };
            break;
          }
        } catch (erro) {
          if (erro instanceof ErroConversao) continue; // tenta o próximo item
          throw erro;
        }
      }

      if (!escolhido) {
        throw new EstoqueInsuficiente(
          `Saldo insuficiente para entregar ${quantidadeBase} ${unidadeBase}. ` +
            `Disponível no maior item: ${melhorDisponivel}.`,
          melhorDisponivel,
          quantidadeBase,
        );
      }

      // 4. Saldos por local do item escolhido.
      const saldos = linhasDe<{ location_id: string; quantity: string }>(
        await tx.execute(sql`
          SELECT location_id, quantity::text AS quantity
            FROM hotel_stock_location_balances
           WHERE tenant_id = ${tenantId} AND inventory_item_id = ${escolhido.item.inventory_item_id}
        `),
      );

      const plano = planejarBaixa({
        linhas: saldos.map((s) => ({
          locationId: s.location_id,
          inventoryItemId: escolhido!.item.inventory_item_id,
          quantidade: Number(s.quantity),
        })),
        quantidadeNecessaria: escolhido.necessario,
        unidadeBase,
      });

      if (!plano.ok) {
        throw new EstoqueInsuficiente(plano.motivo, plano.disponivel, plano.necessario);
      }

      // 5. Subtrai de cada local.
      for (const alocacao of plano.alocacoes) {
        await tx.execute(sql`
          UPDATE hotel_stock_location_balances
             SET quantity = quantity - ${String(alocacao.quantidade)}, updated_at = now()
           WHERE tenant_id = ${tenantId}
             AND location_id = ${alocacao.locationId}
             AND inventory_item_id = ${alocacao.inventoryItemId}
        `);
      }

      // 6. Registra o rastro da baixa na requisição.
      await tx
        .update(abRequisicoesTable)
        .set({
          baixaInventoryItemId: escolhido.item.inventory_item_id,
          baixaLocationId: plano.alocacoes[0]?.locationId ?? null,
          baixaMotivo: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(abRequisicoesTable.tenantId, tenantId),
            eq(abRequisicoesTable.id, requisicaoId),
          ),
        );

      return {
        entregue: true as const,
        inventoryItemId: escolhido.item.inventory_item_id,
        quantidadeEstoque: escolhido.necessario,
        unidadeEstoque: escolhido.item.unidade_estoque ?? "un",
        locais: plano.alocacoes.map((a) => a.locationId),
      };
    });
  } catch (erro) {
    if (erro instanceof EstoqueInsuficiente) {
      return {
        entregue: false,
        motivo: erro.message,
        disponivel: erro.disponivel,
        necessario: erro.necessario,
      };
    }
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { entregue: false, motivo };
  }
}
