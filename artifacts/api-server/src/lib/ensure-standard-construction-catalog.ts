import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  composicoesTable,
  composicaoInsumosTable,
  insumosTable,
  insertComposicaoSchema,
  insertInsumoSchema,
} from "@workspace/db";
import { STANDARD_CONSTRUCTION_COMPOSITIONS } from "../data/construction-composition-catalog-universal";

export type StandardCatalogBootstrapResult = {
  catalogVersion: string;
  totalCatalogo: number;
  insumosCriados: number;
  composicoesCriadas: number;
  composicoesExistentes: number;
};

export async function ensureStandardConstructionCatalog(
  tenantId: string,
): Promise<StandardCatalogBootstrapResult> {
  const [tenant] = await db
    .select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!/constru/i.test(String(tenant?.vertical ?? ""))) {
    return {
      catalogVersion: "2026-10-07-universal-v1",
      totalCatalogo: 0,
      insumosCriados: 0,
      composicoesCriadas: 0,
      composicoesExistentes: 0,
    };
  }

  const existingInsumos = await db
    .select()
    .from(insumosTable)
    .where(eq(insumosTable.tenantId, tenantId));

  const byCodigo = new Map(
    existingInsumos
      .filter((item) => item.codigo?.trim())
      .map((item) => [item.codigo!.trim().toLowerCase(), item] as const),
  );
  const byNome = new Map(
    existingInsumos.map((item) => [item.nome.trim().toLowerCase(), item] as const),
  );

  let insumosCriados = 0;
  let composicoesCriadas = 0;
  let composicoesExistentes = 0;

  const getOrCreateInsumo = async (
    item: (typeof STANDARD_CONSTRUCTION_COMPOSITIONS)[number]["itens"][number],
  ) => {
    const codeKey = item.codigo.trim().toLowerCase();
    const nameKey = item.nome.trim().toLowerCase();
    const found = byCodigo.get(codeKey) ?? byNome.get(nameKey);
    if (found) return found;

    const payload = insertInsumoSchema.safeParse({
      tenantId,
      codigo: item.codigo,
      nome: item.nome,
      descricao: "Insumo do catálogo padrão Arqdor. Preço deve ser definido/atualizado na Tabela Mestre de Preços.",
      unidade: item.unidade,
      tipo: item.tipo,
      categoria: item.categoria,
    });
    if (!payload.success) {
      throw new Error(`Falha ao preparar insumo ${item.codigo}: ${payload.error.message}`);
    }

    const [created] = await db.insert(insumosTable).values(payload.data).returning();
    if (!created) throw new Error(`Falha ao criar insumo ${item.codigo}`);
    byCodigo.set(codeKey, created);
    byNome.set(nameKey, created);
    insumosCriados += 1;
    return created;
  };

  for (const template of STANDARD_CONSTRUCTION_COMPOSITIONS) {
    const [existingComposition] = await db
      .select({ id: composicoesTable.id })
      .from(composicoesTable)
      .where(and(
        eq(composicoesTable.tenantId, tenantId),
        eq(composicoesTable.codigo, template.codigo),
      ));

    if (existingComposition) {
      composicoesExistentes += 1;
      continue;
    }

    const insumosDaComposicao = [];
    for (const item of template.itens) {
      const insumo = await getOrCreateInsumo(item);
      insumosDaComposicao.push({ item, insumo });
    }

    const custoTotal = insumosDaComposicao.reduce((sum, { item, insumo }) => (
      sum + Number(item.quantidade) * Number(insumo.precoUnitario ?? 0)
    ), 0);

    const parsed = insertComposicaoSchema.safeParse({
      tenantId,
      codigo: template.codigo,
      nome: template.nome,
      descricao: template.descricao,
      unidade: template.unidade,
      etapaKey: template.etapaKey,
      sistemasConstrutivos: template.sistemasConstrutivos,
      comumTodosSistemas: template.comumTodosSistemas,
      ativo: true,
      ordem: template.ordem,
      custoTotal: custoTotal.toFixed(4),
    });
    if (!parsed.success) {
      throw new Error(`Falha ao preparar composição ${template.codigo}: ${parsed.error.message}`);
    }

    await db.transaction(async (tx) => {
      const [created] = await tx.insert(composicoesTable).values(parsed.data).returning();
      if (!created) throw new Error(`Falha ao criar composição ${template.codigo}`);

      await tx.insert(composicaoInsumosTable).values(
        insumosDaComposicao.map(({ item, insumo }) => ({
          composicaoId: created.id,
          insumoId: insumo.id,
          quantidade: item.quantidade,
        })),
      );
    });

    composicoesCriadas += 1;
  }

  return {
    catalogVersion: "2026-10-07-universal-v1",
    totalCatalogo: STANDARD_CONSTRUCTION_COMPOSITIONS.length,
    insumosCriados,
    composicoesCriadas,
    composicoesExistentes,
  };
}
