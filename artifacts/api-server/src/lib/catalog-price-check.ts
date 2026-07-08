import { and, eq } from "drizzle-orm";
import { db, produtosCatalogoTable, categoriasProdutoTable } from "@workspace/db";

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
  /** Effective max discount % applied to this item (product override, else category, else 0). */
  tetoDescontoPercentual: number;
  /** precoCatalogo * (1 - tetoDescontoPercentual/100). Null when there's no catalog price. */
  precoMinimoPermitido: number | null;
  /** true when valorUnitarioProposta is within the allowed discount ceiling for this item. */
  dentroDoTeto: boolean;
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
  let allWithinCeiling = true;

  // Categorias com teto de desconto ficam em cache por tenant (poucas linhas, evita N+1).
  const categoriaTetoById = new Map<string, number>();
  const loadCategoriaTeto = async (): Promise<void> => {
    if (categoriaTetoById.size > 0) return;
    const categorias = await db
      .select({ id: categoriasProdutoTable.id, descontoMaximoPercentual: categoriasProdutoTable.descontoMaximoPercentual })
      .from(categoriasProdutoTable)
      .where(eq(categoriasProdutoTable.tenantId, tenantId));
    for (const c of categorias) {
      categoriaTetoById.set(c.id, Number(c.descontoMaximoPercentual));
    }
  };

  for (const item of itens) {
    const quantidade = item.quantidade > 0 ? item.quantidade : 1;
    const valorUnitarioProposta = item.valorUnitario ?? 0;
    const subtotalProposta = quantidade * valorUnitarioProposta;

    let produto:
      | { precoBase: string; categoriaId: string | null; descontoMaximoPercentual: string | null }
      | undefined;

    if (item.sku) {
      [produto] = await db
        .select({
          precoBase: produtosCatalogoTable.precoBase,
          categoriaId: produtosCatalogoTable.categoriaId,
          descontoMaximoPercentual: produtosCatalogoTable.descontoMaximoPercentual,
        })
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
        .select({
          nome: produtosCatalogoTable.nome,
          precoBase: produtosCatalogoTable.precoBase,
          categoriaId: produtosCatalogoTable.categoriaId,
          descontoMaximoPercentual: produtosCatalogoTable.descontoMaximoPercentual,
        })
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

    let tetoDescontoPercentual = 0;
    let precoMinimoPermitido: number | null = null;
    let dentroDoTeto = true;

    if (precoCatalogo === null) {
      allMatched = false;
    } else {
      catalogTotal += subtotalCatalogo!;

      if (produto!.descontoMaximoPercentual !== null) {
        // Product-level override always wins, regardless of category.
        tetoDescontoPercentual = Number(produto!.descontoMaximoPercentual);
      } else if (produto!.categoriaId) {
        await loadCategoriaTeto();
        tetoDescontoPercentual = categoriaTetoById.get(produto!.categoriaId) ?? 0;
      }

      precoMinimoPermitido = precoCatalogo * (1 - tetoDescontoPercentual / 100);
      dentroDoTeto = valorUnitarioProposta >= precoMinimoPermitido - CENT_TOLERANCE;
      if (!dentroDoTeto) allWithinCeiling = false;
    }

    itemDetails.push({
      nome: item.nome,
      sku: item.sku ?? null,
      quantidade,
      valorUnitarioProposta,
      precoCatalogo,
      subtotalProposta,
      subtotalCatalogo,
      tetoDescontoPercentual,
      precoMinimoPermitido,
      dentroDoTeto,
    });
  }

  const propostaTotal =
    valorTotalOverride ?? itemDetails.reduce((acc, i) => acc + i.subtotalProposta, 0);

  const hasCatalogBasis = allMatched;
  const diferenca = propostaTotal - catalogTotal;
  // Auto-close only when every matched item is within its effective discount ceiling
  // (or exceeds the catalog price — no ceiling on markups). Without a catalog basis,
  // there's nothing to enforce, so we don't block.
  const matches = !hasCatalogBasis || (allWithinCeiling && itemDetails.every((i) => i.dentroDoTeto));

  return { hasCatalogBasis, matches, propostaTotal, catalogTotal, diferenca, itemDetails };
}
