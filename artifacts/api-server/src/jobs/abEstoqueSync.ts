import { sql } from "drizzle-orm";
import { abEstoqueSaldosTable, db, tenantsTable } from "@workspace/db";
import { withTenantTx } from "../lib/ab/escopo.js";
import {
  converterParaBase,
  ErroConversao,
  unidadeBaseDoInsumo,
} from "../lib/ab/unidades.js";

/**
 * Sincronização de saldos de A&B (AB-04).
 *
 * Fonte: `hotel_stock_location_balances` (soma de todos os locais do hotel).
 * Destino: `ab_estoque_saldos.saldo_atual`, na unidade base do insumo.
 *
 * O caminho é:
 *   balance (quantidade + unidade do item)
 *     → inventory_items (unidade de estoque)
 *     → ab_insumo_produto (mapa produto → insumo + fator de embalagem)
 *     → insumos (unidade base)
 *
 * **Este job é o único escritor de `saldo_atual`.** A política de reposição
 * (`estoque_minimo`, `ponto_pedido`, `lead_time_dias`) é preservada no upsert —
 * sincronizar saldo nunca pode zerar a configuração do gerente.
 *
 * Linhas que não convertem NÃO são chutadas: entram no relatório como
 * pendência, porque um saldo errado é pior que um saldo ausente.
 */

export type ResumoAbSync = {
  dryRun: boolean;
  tenantsAvaliados: number;
  linhasLidas: number;
  insumosAtualizados: number;
  produtosSemMapa: Array<{ tenantId: string; produtoId: string }>;
  errosConversao: Array<{ tenantId: string; produtoId: string; erro: string }>;
  erros: Array<{ tenantId: string; erro: string }>;
};

export type OpcoesAbSync = {
  tenantIds?: string[];
  dryRun?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

type LinhaSaldo = {
  produto_id: string;
  unidade_estoque: string | null;
  quantidade: string;
  insumo_id: string | null;
  fator_embalagem: string | null;
  unidade_insumo: string | null;
  insumo_nome: string | null;
};

function arredondar(valor: number): number {
  return Math.round(valor * 10_000) / 10_000;
}

export async function sincronizarSaldosAb(opcoes: OpcoesAbSync = {}): Promise<ResumoAbSync> {
  const log = opcoes.logger ?? console;
  const dryRun = opcoes.dryRun === true;

  const resumo: ResumoAbSync = {
    dryRun,
    tenantsAvaliados: 0,
    linhasLidas: 0,
    insumosAtualizados: 0,
    produtosSemMapa: [],
    errosConversao: [],
    erros: [],
  };

  const tenantIds =
    opcoes.tenantIds ??
    (await db.select({ id: tenantsTable.id }).from(tenantsTable)).map((t) => t.id);

  for (const tenantId of tenantIds) {
    resumo.tenantsAvaliados += 1;
    try {
      await withTenantTx(tenantId, async (tx) => {
        // Uma leitura só: saldo por local + unidade do item + mapa + unidade base.
        // LEFT JOIN no mapa de propósito — produto sem mapa TEM que aparecer no
        // relatório, senão o estoque "desaparece" sem ninguém notar.
        const resultado = await tx.execute(sql`
          SELECT
            inv.produto_id                AS produto_id,
            inv.unidade                   AS unidade_estoque,
            b.quantity::text              AS quantidade,
            mapa.insumo_id                AS insumo_id,
            mapa.fator_embalagem::text    AS fator_embalagem,
            ins.unidade                   AS unidade_insumo,
            ins.nome                      AS insumo_nome
          FROM hotel_stock_location_balances b
          JOIN inventory_items inv
            ON inv.tenant_id = b.tenant_id AND inv.id = b.inventory_item_id
          LEFT JOIN ab_insumo_produto mapa
            ON mapa.tenant_id = b.tenant_id AND mapa.produto_catalogo_id = inv.produto_id
          LEFT JOIN insumos ins
            ON ins.tenant_id = mapa.tenant_id AND ins.id = mapa.insumo_id
          WHERE b.tenant_id = ${tenantId}
        `);

        const linhas = (resultado as unknown as { rows: LinhaSaldo[] }).rows ?? [];
        resumo.linhasLidas += linhas.length;
        if (linhas.length === 0) return;

        const porInsumo = new Map<string, { unidade: string; total: number }>();

        for (const linha of linhas) {
          if (!linha.insumo_id) {
            resumo.produtosSemMapa.push({ tenantId, produtoId: linha.produto_id });
            continue;
          }

          const unidade = unidadeBaseDoInsumo(linha.unidade_insumo);
          if (!unidade) {
            resumo.errosConversao.push({
              tenantId,
              produtoId: linha.produto_id,
              erro: `Insumo com unidade base inválida: "${linha.unidade_insumo ?? ""}"`,
            });
            continue;
          }

          try {
            const quantidade = converterParaBase(
              Number(linha.quantidade),
              linha.unidade_estoque,
              unidade,
              {
                fatorEmbalagem: linha.fator_embalagem ? Number(linha.fator_embalagem) : null,
              },
            );
            const atual = porInsumo.get(linha.insumo_id) ?? { unidade, total: 0 };
            atual.total = arredondar(atual.total + quantidade);
            porInsumo.set(linha.insumo_id, atual);
          } catch (erro) {
            resumo.errosConversao.push({
              tenantId,
              produtoId: linha.produto_id,
              erro: erro instanceof ErroConversao ? erro.message : String(erro),
            });
          }
        }

        if (dryRun) {
          resumo.insumosAtualizados += porInsumo.size;
          return;
        }

        for (const [insumoId, dados] of porInsumo) {
          await tx
            .insert(abEstoqueSaldosTable)
            .values({
              tenantId,
              insumoId,
              saldoAtual: String(dados.total),
              unidade: dados.unidade,
            })
            .onConflictDoUpdate({
              target: [abEstoqueSaldosTable.tenantId, abEstoqueSaldosTable.insumoId],
              // Só saldo e unidade. Mínimo / ponto de pedido / lead time são do
              // gerente e NÃO podem ser sobrescritos pela sincronização.
              set: {
                saldoAtual: String(dados.total),
                unidade: dados.unidade,
                atualizadoEm: new Date(),
                updatedAt: new Date(),
              },
            });
          resumo.insumosAtualizados += 1;
        }

        log.info?.(`[ab-sync] tenant ${tenantId}: ${porInsumo.size} insumo(s) sincronizado(s)`);
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      resumo.erros.push({ tenantId, erro: mensagem });
      log.error?.(`[ab-sync] tenant ${tenantId} falhou: ${mensagem}`);
    }
  }

  if (resumo.produtosSemMapa.length > 0) {
    log.warn?.(
      `[ab-sync] ${resumo.produtosSemMapa.length} produto(s) sem mapa (ab_insumo_produto) — saldo não sincronizado`,
    );
  }
  if (resumo.errosConversao.length > 0) {
    log.warn?.(`[ab-sync] ${resumo.errosConversao.length} conversão(ões) recusada(s)`);
  }

  return resumo;
}
