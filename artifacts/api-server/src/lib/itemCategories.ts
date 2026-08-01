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

export function normalizeCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Nomes recorrentes em ERPs e planilhas de fornecedores. */
export const ITEM_CATEGORY_ALIASES: Readonly<Record<string, (typeof ITEM_CATEGORIES)[number]>> = {
  "acessorios automotivos": "Acessórios para Veículos", autopecas: "Acessórios para Veículos", "pecas para veiculos": "Acessórios para Veículos",
  agricultura: "Agro", agropecuaria: "Agro",
  antiguidades: "Antiguidades e Coleções", colecionaveis: "Antiguidades e Coleções",
  artes: "Arte, Papelaria e Armarinho", armarinho: "Arte, Papelaria e Armarinho", papelaria: "Arte, Papelaria e Armarinho",
  bebe: "Bebês", "artigos para bebe": "Bebês",
  beleza: "Beleza e Cuidado Pessoal", cosmeticos: "Beleza e Cuidado Pessoal", "cuidados pessoais": "Beleza e Cuidado Pessoal",
  brinquedos: "Brinquedos e Hobbies", hobbies: "Brinquedos e Hobbies",
  moda: "Calçados, Roupas e Bolsas", roupas: "Calçados, Roupas e Bolsas", calcados: "Calçados, Roupas e Bolsas", bolsas: "Calçados, Roupas e Bolsas", vestuario: "Calçados, Roupas e Bolsas",
  casa: "Casa, Móveis e Decoração", moveis: "Casa, Móveis e Decoração", decoracao: "Casa, Móveis e Decoração",
  celulares: "Celulares e Telefones", smartphones: "Celulares e Telefones", telefonia: "Celulares e Telefones",
  "materiais de construcao": "Construção", "construcao civil": "Construção",
  cameras: "Câmeras e Acessórios", fotografia: "Câmeras e Acessórios",
  eletros: "Eletrodomésticos", "linha branca": "Eletrodomésticos",
  eletronicos: "Eletrônicos, Áudio e Vídeo", "audio e video": "Eletrônicos, Áudio e Vídeo", "tv e audio": "Eletrônicos, Áudio e Vídeo",
  esportes: "Esportes e Fitness", fitness: "Esportes e Fitness", academia: "Esportes e Fitness",
  ferragens: "Ferramentas", festas: "Festas e Lembrancinhas", lembrancinhas: "Festas e Lembrancinhas",
  jogos: "Games", videogames: "Games",
  industria: "Indústria e Comércio", comercio: "Indústria e Comércio",
  computadores: "Informática", notebooks: "Informática", ti: "Informática",
  instrumentos: "Instrumentos Musicais", musica: "Instrumentos Musicais",
  joias: "Joias e Relógios", relogios: "Joias e Relógios", relojoaria: "Joias e Relógios",
  livros: "Livros, Revistas e Comics", revistas: "Livros, Revistas e Comics", quadrinhos: "Livros, Revistas e Comics", comics: "Livros, Revistas e Comics",
  pets: "Pet Shop", animais: "Pet Shop",
  "saude e bem estar": "Saúde", "produtos de saude": "Saúde",
};

const CATEGORY_BY_NORMALIZED_NAME = new Map<string, (typeof ITEM_CATEGORIES)[number]>();
for (const name of ITEM_CATEGORIES) CATEGORY_BY_NORMALIZED_NAME.set(normalizeCategoryName(name), name);
for (const [alias, officialName] of Object.entries(ITEM_CATEGORY_ALIASES)) {
  CATEGORY_BY_NORMALIZED_NAME.set(normalizeCategoryName(alias), officialName);
}

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
