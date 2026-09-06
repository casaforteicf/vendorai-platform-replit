import { and, count, eq } from "drizzle-orm";
import { db, produtosCatalogoTable } from "@workspace/db";

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
