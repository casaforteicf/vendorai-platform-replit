import { and, eq } from "drizzle-orm";
import { db, produtosCatalogoTable } from "@workspace/db";

export type CatalogContextItem = {
  id: string;
  nome: string;
  descricao: string | null;
  precoBase: string;
  unidade: string;
  tipo: string | null;
};

/**
 * Fonte única e reutilizável de portfólio para contextos de IA.
 * Retorna somente itens ativos do Catálogo oficial do tenant.
 */
export async function loadActiveCatalogContext(tenantId: string, limit = 40): Promise<CatalogContextItem[]> {
  return db
    .select({
      id: produtosCatalogoTable.id,
      nome: produtosCatalogoTable.nome,
      descricao: produtosCatalogoTable.descricao,
      precoBase: produtosCatalogoTable.precoBase,
      unidade: produtosCatalogoTable.unidade,
      tipo: produtosCatalogoTable.tipo,
    })
    .from(produtosCatalogoTable)
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
    .limit(Math.max(1, Math.min(limit, 100)));
}
