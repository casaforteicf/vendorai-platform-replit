import { and, eq, gte, inArray } from "drizzle-orm";
import {
  abEstoqueSaldosTable,
  abHistoricoConsumoTable,
  abOrdemCompraItensTable,
  abOrdensCompraTable,
  db,
  insumosTable,
  tenantsTable,
} from "@workspace/db";
import { withTenantTx } from "../lib/ab/escopo.js";
import {
  calcularSugestoesCompra,
  type ConsumoRegistrado,
  type SaldoPolitica,
  type SugestaoCompra,
} from "../lib/ab/estoque-preditivo.js";

/**
 * Execução do motor preditivo contra o banco (AB-03 / FASE 3).
 *
 * Roda por tenant, cada um na própria transação com `set_config('app.tenant_id')`
 * — sem isso a RLS de `ab_estoque_saldos` não devolve nada e o motor acharia que
 * nenhum hotel tem saldo.
 *
 * Idempotência: se já existe uma ordem `sugerida` com o mesmo período de
 * cobertura, nada é criado. Rodar o job duas vezes no mesmo dia não duplica
 * pedido de compra.
 */

export type ResumoMotorPreditivo = {
  dataReferencia: string;
  coberturaFim: string;
  tenantsAvaliados: number;
  tenantsComSugestao: number;
  ordensGeradas: number;
  itensGerados: number;
  ordensJaExistentes: number;
  seco: boolean;
  erros: Array<{ tenantId: string; erro: string }>;
};

export type OpcoesMotorPreditivo = {
  /** Quando omitido, roda para todos os tenants. */
  tenantIds?: string[];
  janelaDias?: number;
  diasCobertura?: number;
  dataReferencia?: string;
  /** Calcula e devolve o que SERIA criado, sem gravar. */
  dryRun?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

const JANELA_PADRAO = 30;
const COBERTURA_PADRAO = 7;

function comoDataLocal(agora: Date): string {
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function somarDias(iso: string, dias: number): string {
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function subtrairDias(iso: string, dias: number): string {
  return somarDias(iso, -dias);
}

export async function executarMotorPreditivo(
  opcoes: OpcoesMotorPreditivo = {},
): Promise<ResumoMotorPreditivo> {
  const log = opcoes.logger ?? console;
  const janelaDias = opcoes.janelaDias ?? JANELA_PADRAO;
  const diasCobertura = opcoes.diasCobertura ?? COBERTURA_PADRAO;
  const dataReferencia = opcoes.dataReferencia ?? comoDataLocal(new Date());
  const coberturaFim = somarDias(dataReferencia, diasCobertura);
  const desdeConsumo = subtrairDias(dataReferencia, janelaDias);

  const resumo: ResumoMotorPreditivo = {
    dataReferencia,
    coberturaFim,
    tenantsAvaliados: 0,
    tenantsComSugestao: 0,
    ordensGeradas: 0,
    itensGerados: 0,
    ordensJaExistentes: 0,
    seco: opcoes.dryRun === true,
    erros: [],
  };

  const tenantIds =
    opcoes.tenantIds ?? (await db.select({ id: tenantsTable.id }).from(tenantsTable)).map((t) => t.id);

  for (const tenantId of tenantIds) {
    resumo.tenantsAvaliados += 1;
    try {
      const sugestoes = await withTenantTx(tenantId, async (tx) => {
        const saldos = await tx
          .select()
          .from(abEstoqueSaldosTable)
          .where(eq(abEstoqueSaldosTable.tenantId, tenantId));
        if (saldos.length === 0) return [];

        const nomes = await tx
          .select({ id: insumosTable.id, nome: insumosTable.nome })
          .from(insumosTable)
          .where(
            inArray(
              insumosTable.id,
              saldos.map((s) => s.insumoId),
            ),
          );
        const nomePorInsumo = new Map(nomes.map((n) => [n.id, n.nome]));

        const consumos = await tx
          .select({
            insumoId: abHistoricoConsumoTable.insumoId,
            data: abHistoricoConsumoTable.data,
            quantidade: abHistoricoConsumoTable.quantidade,
          })
          .from(abHistoricoConsumoTable)
          .where(
            and(
              eq(abHistoricoConsumoTable.tenantId, tenantId),
              gte(abHistoricoConsumoTable.data, desdeConsumo),
            ),
          );

        const politicas: SaldoPolitica[] = saldos.map((s) => ({
          insumoId: s.insumoId,
          insumoNome: nomePorInsumo.get(s.insumoId) ?? s.insumoId,
          unidade: s.unidade,
          saldoAtual: Number(s.saldoAtual),
          estoqueMinimo: Number(s.estoqueMinimo),
          pontoPedido: Number(s.pontoPedido),
          leadTimeDias: s.leadTimeDias,
        }));

        const registros: ConsumoRegistrado[] = consumos.map((c) => ({
          insumoId: c.insumoId,
          data: c.data,
          quantidade: Number(c.quantidade),
        }));

        const calculadas = calcularSugestoesCompra({
          saldos: politicas,
          consumos: registros,
          janelaDias,
          diasCobertura,
        });
        if (calculadas.length === 0) return [];

        const [existente] = await tx
          .select({ id: abOrdensCompraTable.id })
          .from(abOrdensCompraTable)
          .where(
            and(
              eq(abOrdensCompraTable.tenantId, tenantId),
              eq(abOrdensCompraTable.status, "sugerida"),
              eq(abOrdensCompraTable.coberturaInicio, dataReferencia),
              eq(abOrdensCompraTable.coberturaFim, coberturaFim),
            ),
          );
        if (existente) {
          resumo.ordensJaExistentes += 1;
          return [];
        }

        if (opcoes.dryRun) return calculadas;

        const [ordem] = await tx
          .insert(abOrdensCompraTable)
          .values({
            tenantId,
            coberturaInicio: dataReferencia,
            coberturaFim,
            status: "sugerida",
            observacao: `Gerada pelo motor preditivo (janela de ${janelaDias} dias, cobertura de ${diasCobertura}).`,
          })
          .returning();

        await tx.insert(abOrdemCompraItensTable).values(
          calculadas.map((sugestao) => ({
            tenantId,
            ordemId: ordem!.id,
            insumoId: sugestao.insumoId,
            insumoNome: sugestao.insumoNome,
            quantidade: String(sugestao.quantidadeSugerida),
            unidade: sugestao.unidade,
          })),
        );

        return calculadas;
      });

      if (sugestoes.length > 0) {
        resumo.tenantsComSugestao += 1;
        if (!opcoes.dryRun) {
          resumo.ordensGeradas += 1;
          resumo.itensGerados += sugestoes.length;
        }
        log.info?.(`[ab-preditivo] tenant ${tenantId}: ${sugestoes.length} insumo(s)`);
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      resumo.erros.push({ tenantId, erro: mensagem });
      log.error?.(`[ab-preditivo] tenant ${tenantId} falhou: ${mensagem}`);
    }
  }

  return resumo;
}

export type { SugestaoCompra };
