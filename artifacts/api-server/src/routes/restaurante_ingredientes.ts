import { Router, type IRouter } from "express";
import { and, asc, eq, ilike } from "drizzle-orm";
import { z } from "zod/v4";
import { insumosTable } from "@workspace/db";
import { abAllowed, camposInvalidos, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();

/**
 * Restaurante — cadastro de ingredientes (insumos).
 *
 * Usa o catálogo central `insumos`, o mesmo que as fichas técnicas e o motor
 * preditivo consomem. É de propósito um CRUD enxuto: nome, unidade base,
 * preço, categoria e código. O vínculo com produto de estoque continua no
 * mapeamento produto→insumo (AB-05).
 */

const decimal = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Valor decimal inválido"));

const corpoIngrediente = z.object({
  nome: z.string().trim().min(1).max(500),
  unidade: z.string().trim().min(1).max(50),
  precoUnitario: decimal.nullable().optional(),
  categoria: z.string().trim().max(255).nullable().optional(),
  codigo: z.string().trim().max(100).nullable().optional(),
  descricao: z.string().trim().max(2000).nullable().optional(),
  fornecedorPreferencial: z.string().trim().max(255).nullable().optional(),
}).strict();

const corpoEdicao = corpoIngrediente.partial().strict();

function selectIngrediente() {
  return {
    id: insumosTable.id,
    nome: insumosTable.nome,
    unidade: insumosTable.unidade,
    precoUnitario: insumosTable.precoUnitario,
    categoria: insumosTable.categoria,
    codigo: insumosTable.codigo,
    descricao: insumosTable.descricao,
    fornecedorPreferencial: insumosTable.fornecedorPreferencial,
    createdAt: insumosTable.createdAt,
    updatedAt: insumosTable.updatedAt,
  };
}

router.get("/tenants/:tenantId/restaurante/ingredientes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const filtro = z.object({
    q: z.string().trim().max(120).optional(),
    categoria: z.string().trim().max(255).optional(),
  }).safeParse(req.query);
  if (!filtro.success) return res.status(422).json({ error: "Filtro inválido" });

  try {
    const ingredientes = await withTenantTx(tenantId, async (tx) => {
      const conditions = [eq(insumosTable.tenantId, tenantId)];
      if (filtro.data.q) conditions.push(ilike(insumosTable.nome, `%${filtro.data.q}%`));
      if (filtro.data.categoria) conditions.push(eq(insumosTable.categoria, filtro.data.categoria));
      return tx
        .select(selectIngrediente())
        .from(insumosTable)
        .where(and(...conditions))
        .orderBy(asc(insumosTable.nome))
        .limit(2000);
    });
    return res.json({ ingredientes });
  } catch (error) {
    console.error("[restaurante-ingredientes] list", error);
    return res.status(500).json({ error: "Não foi possível listar os ingredientes" });
  }
});

router.post("/tenants/:tenantId/restaurante/ingredientes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = corpoIngrediente.safeParse(req.body);
  if (!input.success) {
    return res.status(422).json({ error: "Ingrediente inválido", fields: camposInvalidos(input.error) });
  }

  try {
    const ingrediente = await withTenantTx(tenantId, async (tx) => {
      const [existente] = await tx
        .select({ id: insumosTable.id })
        .from(insumosTable)
        .where(and(eq(insumosTable.tenantId, tenantId), ilike(insumosTable.nome, input.data.nome)))
        .limit(1);
      if (existente) return { conflito: true as const };
      const [row] = await tx.insert(insumosTable).values({
        tenantId,
        nome: input.data.nome,
        unidade: input.data.unidade,
        precoUnitario: input.data.precoUnitario ?? null,
        categoria: input.data.categoria ?? null,
        codigo: input.data.codigo ?? null,
        descricao: input.data.descricao ?? null,
        fornecedorPreferencial: input.data.fornecedorPreferencial ?? null,
      }).returning(selectIngrediente());
      return row;
    });
    if ("conflito" in ingrediente) return res.status(409).json({ error: "Já existe um ingrediente com esse nome" });
    return res.status(201).json(ingrediente);
  } catch (error) {
    console.error("[restaurante-ingredientes] create", error);
    return res.status(500).json({ error: "Não foi possível criar o ingrediente" });
  }
});

router.put("/tenants/:tenantId/restaurante/ingredientes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().trim().min(1).max(100).safeParse(id).success) return res.status(422).json({ error: "Ingrediente inválido" });
  const input = corpoEdicao.safeParse(req.body);
  if (!input.success) {
    return res.status(422).json({ error: "Ingrediente inválido", fields: camposInvalidos(input.error) });
  }
  if (Object.keys(input.data).length === 0) return res.status(422).json({ error: "Nada para atualizar" });

  try {
    const row = await withTenantTx(tenantId, async (tx) => (
      await tx.update(insumosTable).set({ ...input.data }).where(and(eq(insumosTable.tenantId, tenantId), eq(insumosTable.id, id))).returning(selectIngrediente())
    )[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Ingrediente não encontrado" });
  } catch (error) {
    console.error("[restaurante-ingredientes] update", error);
    return res.status(500).json({ error: "Não foi possível atualizar o ingrediente" });
  }
});

router.delete("/tenants/:tenantId/restaurante/ingredientes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().trim().min(1).max(100).safeParse(id).success) return res.status(422).json({ error: "Ingrediente inválido" });
  try {
    const removed = await withTenantTx(tenantId, async (tx) => (
      await tx.delete(insumosTable).where(and(eq(insumosTable.tenantId, tenantId), eq(insumosTable.id, id))).returning({ id: insumosTable.id })
    ).length > 0);
    return removed ? res.status(204).send() : res.status(404).json({ error: "Ingrediente não encontrado" });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "23503") return res.status(409).json({ error: "Ingrediente em uso por ficha/cardápio e não pode ser excluído" });
    console.error("[restaurante-ingredientes] delete", error);
    return res.status(500).json({ error: "Não foi possível excluir o ingrediente" });
  }
});

export default router;
