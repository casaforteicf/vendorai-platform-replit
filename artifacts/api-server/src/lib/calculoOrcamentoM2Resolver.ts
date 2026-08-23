// Resolve produto(s) do catálogo + roda o motor de cálculo — extraído da
// rota POST /tenants/:tenantId/propostas/calcular-orcamento pra ser
// reutilizável também pelo agente SDR (ver agent-dispatch.ts), sem
// duplicar a lógica de busca de produto e sugestão automática de
// acessório por Coleção+Cor.
import { and, eq } from "drizzle-orm";
import { db, produtosCatalogoTable } from "@workspace/db";
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
  acessorioNome: string | null;
  acessorioSugeridoAutomaticamente: boolean;
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
  };
}

/**
 * Busca o produto (e, se aplicável, o acessório de perímetro — informado
 * ou sugerido automaticamente por Coleção+Cor) e roda o cálculo real.
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

  let acessorioCalculo: ProdutoCalculo | undefined;
  let acessorioSugeridoAutomaticamente = false;

  if (produtoCalculo.tipoCalculo === "area_com_acabamento_perimetro") {
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

    if (acessorio) acessorioCalculo = produtoParaCalculo(acessorio);
  }

  const resultado = calcularOrcamentoProdutoArea(produtoCalculo, entrada.superficies, acessorioCalculo);

  return {
    resultado,
    produtoNome: produto.nome,
    acessorioNome: acessorioCalculo?.nome ?? null,
    acessorioSugeridoAutomaticamente,
  };
}
