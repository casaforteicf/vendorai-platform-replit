import { eq } from "drizzle-orm";
import { db, categoriasProdutoTable } from "@workspace/db";

/** Taxonomia oficial de itens compartilhada com a vitrine do Praça.ai. */
export const ITEM_CATEGORIES = [
  "Acessórios para Veículos",
  "Agro",
  "Antiguidades e Coleções",
  "Arte, Papelaria e Armarinho",
  "Bebês",
  "Beleza e Cuidado Pessoal",
  "Brinquedos e Hobbies",
  "Calçados, Roupas e Bolsas",
  "Casa, Móveis e Decoração",
  "Celulares e Telefones",
  "Construção",
  "Câmeras e Acessórios",
  "Eletrodomésticos",
  "Eletrônicos, Áudio e Vídeo",
  "Esportes e Fitness",
  "Ferramentas",
  "Festas e Lembrancinhas",
  "Games",
  "Indústria e Comércio",
  "Informática",
  "Instrumentos Musicais",
  "Joias e Relógios",
  "Livros, Revistas e Comics",
  "Pet Shop",
  "Saúde",
] as const;

function normalizeCategoryName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const CATEGORY_BY_NORMALIZED_NAME = new Map(
  ITEM_CATEGORIES.map((name) => [normalizeCategoryName(name), name]),
);

export function findOfficialItemCategory(value: string): string | null {
  return CATEGORY_BY_NORMALIZED_NAME.get(normalizeCategoryName(value)) ?? null;
}

/**
 * Garante que todo parceiro veja as 25 categorias no cadastro de produtos.
 * Categorias antigas são preservadas para não invalidar produtos existentes.
 */
export async function ensureOfficialItemCategories(tenantId: string): Promise<void> {
  const existing = await db
    .select({ nome: categoriasProdutoTable.nome })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, tenantId));

  const existingNames = new Set(existing.map((category) => normalizeCategoryName(category.nome)));
  const missing = ITEM_CATEGORIES.filter((name) => !existingNames.has(normalizeCategoryName(name)));

  if (missing.length > 0) {
    await db.insert(categoriasProdutoTable).values(
      missing.map((nome) => ({ tenantId, nome, descontoMaximoPercentual: "0" })),
    );
  }
}