import { and, asc, count, eq } from "drizzle-orm";
import { db, produtosCatalogoTable } from "@workspace/db";

export type ActiveCatalogPreviewItem = {
  id: string;
  nome: string;
  descricao: string | null;
  precoBase: string | number;
  unidade: string | null;
  productType: string | null;
};

export type CatalogProductContractItem = {
  nome: string;
  descricao: string | null;
  preco: number | null;
};

/**
 * Fonte única para critérios operacionais de readiness do Catálogo.
 * Somente itens ativos contam como catálogo configurado; a lista legada
 * business_profiles.produtos não deve satisfazer gates de implantação.
 */
export async function getActiveCatalogCount(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.tenantId, tenantId),
      eq(produtosCatalogoTable.ativo, true),
    ));

  return Number(row?.value ?? 0);
}

export async function hasActiveCatalogItems(tenantId: string): Promise<boolean> {
  return (await getActiveCatalogCount(tenantId)) > 0;
}

/**
 * Preview determinístico do Catálogo oficial para contextos curtos de IA,
 * onboarding, CRM e geradores. Consumidores não devem consultar
 * business_profiles.produtos quando houver itens ativos aqui.
 */
export async function getActiveCatalogPreview(
  tenantId: string,
  limit = 20,
): Promise<ActiveCatalogPreviewItem[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 20));
  return db
    .select({
      id: produtosCatalogoTable.id,
      nome: produtosCatalogoTable.nome,
      descricao: produtosCatalogoTable.descricao,
      precoBase: produtosCatalogoTable.precoBase,
      unidade: produtosCatalogoTable.unidade,
      productType: produtosCatalogoTable.productType,
    })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.tenantId, tenantId),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .orderBy(asc(produtosCatalogoTable.nome), asc(produtosCatalogoTable.id))
    .limit(safeLimit);
}

/**
 * Adapta o Catálogo oficial para contratos legados que ainda expõem
 * { nome, descricao, preco }, sem reintroduzir uma segunda fonte de dados.
 */
export function toCatalogProductContract(
  items: Array<Pick<ActiveCatalogPreviewItem, "nome" | "descricao" | "precoBase">>,
): CatalogProductContractItem[] {
  return items.map((item) => {
    const parsedPrice = Number(item.precoBase);
    return {
      nome: item.nome,
      descricao: item.descricao ?? null,
      preco: Number.isFinite(parsedPrice) ? parsedPrice : null,
    };
  });
}

export function compactCatalogNames(
  items: Array<Pick<ActiveCatalogPreviewItem, "nome">>,
  limit = 8,
): string[] {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit) || 8));
  return items
    .map((item) => item.nome.replace(/\s+/g, " ").trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, safeLimit);
}
