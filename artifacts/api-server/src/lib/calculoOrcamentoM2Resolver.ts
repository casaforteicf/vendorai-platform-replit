// Resolve produto(s) do catálogo + roda o motor de cálculo — extraído da
// rota POST /tenants/:tenantId/propostas/calcular-orcamento pra ser
// reutilizável também pelo agente SDR (ver agent-dispatch.ts), sem
// duplicar a lógica de busca de produto e sugestão automática de
// acessório por Coleção+Cor.
import { and, eq } from "drizzle-orm";
import { db, produtosCatalogoTable, produtoComposicoesTable } from "@workspace/db";
import {
  calcularOrcamentoProdutoArea,
  type ProdutoCalculo,
  type TipoCalculo,
  type SuperficieAmbiente,
  type SuperficieParede,
  type ResultadoCalculoOrcamento,
} from "./calculoOrcamentoM2.js";

export class ErroResolucaoOrcamento extends Error {}

export interface EntradaCalculoOrcamento {
  produtoId: string;
  superficies: (SuperficieAmbiente | SuperficieParede)[];
  acessorioProdutoId?: string | null;
}

export interface SaidaCalculoOrcamento {
  resultado: ResultadoCalculoOrcamento;
  produtoNome: string;
  /** @deprecated use itensComposicao — mantido só pra não quebrar quem já lê esse campo. */
  acessorioNome: string | null;
  acessorioSugeridoAutomaticamente: boolean;
  /** Nome de cada item da composição, na mesma ordem de resultado.composicao. */
  itensComposicao: { produtoId: string; nome: string; baseCalculo: "area" | "perimetro" }[];
}

export function produtoParaCalculo(produto: typeof produtosCatalogoTable.$inferSelect): ProdutoCalculo {
  return {
    id: produto.id,
    nome: produto.nome,
    tipoCalculo: (produto.tipoCalculo as TipoCalculo | null) ?? null,
    precoBase: parseFloat(produto.precoBase as unknown as string),
    fechamentoPacote:
      produto.fechamentoPacote != null ? parseFloat(produto.fechamentoPacote as unknown as string) : null,
    precoPacote: produto.precoPacote != null ? parseFloat(produto.precoPacote as unknown as string) : null,
    embalagemMestreQuantidade: produto.embalagemMestreQuantidade ?? null,
    quantidadeMinimaVenda: produto.quantidadeMinimaVenda ?? null,
    multiploVenda: produto.multiploVenda ?? null,
    permiteFracionarEmbalagemMestre: produto.permiteFracionarEmbalagemMestre ?? false,
  };
}

/**
 * Busca o produto e sua composição de cálculo, e roda o motor real.
 *
 * Ordem de resolução da composição (do mais explícito pro mais implícito):
 * 1. produto_composicoes — itens configurados explicitamente pro produto,
 *    cada um com sua própria base de cálculo (área ou perímetro). Caminho
 *    recomendado, suporta qualquer número de itens.
 * 2. Fallback legado: acessorioProdutoId informado na chamada, OU
 *    auto-match por Coleção+Cor (produto tipo "acabamento_perimetro" com
 *    mesma Coleção+Cor do produto principal) — só 1 item, sempre por
 *    perímetro. Mantido pra não quebrar produtos já configurados assim
 *    antes da tabela de composição existir.
 *
 * Lança ErroResolucaoOrcamento em erros de resolução (produto não
 * encontrado/inativo); ErroCalculoOrcamento (do motor) propaga direto
 * pra quem chamar tratar.
 */
export async function resolverECalcularOrcamento(
  tenantId: string,
  entrada: EntradaCalculoOrcamento
): Promise<SaidaCalculoOrcamento> {
  const [produto] = await db
    .select()
    .from(produtosCatalogoTable)
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.id, entrada.produtoId)));

  if (!produto) throw new ErroResolucaoOrcamento(`Produto not found: ${entrada.produtoId}`);
  if (!produto.ativo) throw new ErroResolucaoOrcamento(`Produto inativo: ${produto.nome}`);

  const produtoCalculo = produtoParaCalculo(produto);

  let composicaoItens: { produto: ProdutoCalculo; baseCalculo: "area" | "perimetro" }[] = [];
  let itensComposicao: SaidaCalculoOrcamento["itensComposicao"] = [];
  let acessorioSugeridoAutomaticamente = false;

  if (produtoCalculo.tipoCalculo === "area_com_acabamento_perimetro" || produtoCalculo.tipoCalculo === "area_simples") {
    const composicaoRows = await db
      .select({
        itemProdutoId: produtoComposicoesTable.itemProdutoId,
        baseCalculo: produtoComposicoesTable.baseCalculo,
      })
      .from(produtoComposicoesTable)
      .where(and(eq(produtoComposicoesTable.tenantId, tenantId), eq(produtoComposicoesTable.produtoPrincipalId, produto.id)))
      .orderBy(produtoComposicoesTable.ordem);

    if (composicaoRows.length > 0) {
      for (const row of composicaoRows) {
        const [itemProduto] = await db
          .select()
          .from(produtosCatalogoTable)
          .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.id, row.itemProdutoId)));
        if (!itemProduto || !itemProduto.ativo) continue; // item desativado: pula em silêncio, não trava o orçamento inteiro
        const baseCalculo = row.baseCalculo === "perimetro" ? "perimetro" : "area";
        composicaoItens.push({ produto: produtoParaCalculo(itemProduto), baseCalculo });
        itensComposicao.push({ produtoId: itemProduto.id, nome: itemProduto.nome, baseCalculo });
      }
    } else if (produtoCalculo.tipoCalculo === "area_com_acabamento_perimetro") {
      // Fallback legado — só pra area_com_acabamento_perimetro, só 1 item por perímetro.
      let acessorio: typeof produto | null = null;
      if (entrada.acessorioProdutoId) {
        const [found] = await db
          .select()
          .from(produtosCatalogoTable)
          .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.id, entrada.acessorioProdutoId)));
        acessorio = found ?? null;
      } else if (produto.colecao && produto.cor) {
        const [found] = await db
          .select()
          .from(produtosCatalogoTable)
          .where(
            and(
              eq(produtosCatalogoTable.tenantId, tenantId),
              eq(produtosCatalogoTable.tipoCalculo, "acabamento_perimetro"),
              eq(produtosCatalogoTable.colecao, produto.colecao),
              eq(produtosCatalogoTable.cor, produto.cor),
              eq(produtosCatalogoTable.ativo, true)
            )
          );
        acessorio = found ?? null;
        acessorioSugeridoAutomaticamente = !!found;
      }
      if (acessorio) {
        composicaoItens.push({ produto: produtoParaCalculo(acessorio), baseCalculo: "perimetro" });
        itensComposicao.push({ produtoId: acessorio.id, nome: acessorio.nome, baseCalculo: "perimetro" });
      }
    }
  }

  const resultado = calcularOrcamentoProdutoArea(produtoCalculo, entrada.superficies, composicaoItens);

  return {
    resultado,
    produtoNome: produto.nome,
    acessorioNome: itensComposicao[0]?.nome ?? null,
    acessorioSugeridoAutomaticamente,
    itensComposicao,
  };
}
