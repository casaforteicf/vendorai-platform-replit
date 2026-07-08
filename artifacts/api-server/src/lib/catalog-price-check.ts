import { and, eq } from "drizzle-orm";
import { db, produtosCatalogoTable } from "@workspace/db";

export interface CatalogCheckItem {
  nome: string;
  sku?: string | null;
  quantidade: number;
  valorUnitario: number;
}

export interface CatalogCheckItemDetail {
  nome: string;
  sku?: string | null;
  quantidade: number;
  valorUnitarioProposta: number;
  precoCatalogo: number | null;
  subtotalProposta: number;
  subtotalCatalogo: number | null;
}

export interface CatalogCheckResult {
  /** true only if every item in `itens` was matched against a catalog product. */
  hasCatalogBasis: boolean;
  /** true when there is no catalog basis (nothing to compare) OR totals match within 1 cent. */
  matches: boolean;
  propostaTotal: number;
  catalogTotal: number;
  /** propostaTotal - catalogTotal */
  diferenca: number;
  itemDetails: CatalogCheckItemDetail[];
}

const CENT_TOLERANCE = 0.01;

/**
 * Compares the total value of a proposal/deal against the sum of catalog
 * base prices (produtos_catalogo.preco_base) for the involved items.
 *
 * Matching is done per-item, by SKU first (exact), falling back to
 * case-insensitive exact name match, scoped to the tenant's active catalog.
 *
 * If any item can't be matched to a catalog product, `hasCatalogBasis` is
 * false and the comparison is skipped (there's no reliable baseline to
 * enforce against) — callers should treat that as "no divergence to block".
 */
export async function checkCatalogMatch(
  tenantId: string,
  itens: CatalogCheckItem[],
  valorTotalOverride?: number
): Promise<CatalogCheckResult> {
  const itemDetails: CatalogCheckItemDetail[] = [];
  let catalogTotal = 0;
  let allMatched = itens.length > 0;

  for (const item of itens) {
    const quantidade = item.quantidade > 0 ? item.quantidade : 1;
    const valorUnitarioProposta = item.valorUnitario ?? 0;
    const subtotalProposta = quantidade * valorUnitarioProposta;

    let produto: { precoBase: string } | undefined;

    if (item.sku) {
      [produto] = await db
        .select({ precoBase: produtosCatalogoTable.precoBase })
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            eq(produtosCatalogoTable.sku, item.sku),
            eq(produtosCatalogoTable.ativo, true)
          )
        )
        .limit(1);
    }

    if (!produto && item.nome) {
      const candidates = await db
        .select({ nome: produtosCatalogoTable.nome, precoBase: produtosCatalogoTable.precoBase })
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            eq(produtosCatalogoTable.ativo, true)
          )
        );
      produto = candidates.find(
        (c) => c.nome.trim().toLowerCase() === item.nome.trim().toLowerCase()
      );
    }

    const precoCatalogo = produto ? Number(produto.precoBase) : null;
    const subtotalCatalogo = precoCatalogo !== null ? quantidade * precoCatalogo : null;

    if (precoCatalogo === null) {
      allMatched = false;
    } else {
      catalogTotal += subtotalCatalogo!;
    }

    itemDetails.push({
      nome: item.nome,
      sku: item.sku ?? null,
      quantidade,
      valorUnitarioProposta,
      precoCatalogo,
      subtotalProposta,
      subtotalCatalogo,
    });
  }

  const propostaTotal =
    valorTotalOverride ?? itemDetails.reduce((acc, i) => acc + i.subtotalProposta, 0);

  const hasCatalogBasis = allMatched;
  const diferenca = propostaTotal - catalogTotal;
  const matches = !hasCatalogBasis || Math.abs(diferenca) < CENT_TOLERANCE;

  return { hasCatalogBasis, matches, propostaTotal, catalogTotal, diferenca, itemDetails };
}
