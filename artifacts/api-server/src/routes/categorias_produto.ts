import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  categoriasProdutoTable,
  produtosCatalogoTable,
  insertCategoriaProdutoSchema,
  updateCategoriaProdutoSchema,
} from "@workspace/db";
import { ensureOfficialItemCategories, findOfficialItemCategory, normalizeCategoryName, categoryNameSimilarity } from "../lib/itemCategories";

const router: IRouter = Router();

router.get("/tenants/:tenantId/categorias-produto", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await ensureOfficialItemCategories(String(tenantId));

  const categorias = await db
    .select()
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, String(tenantId)))
    .orderBy(categoriasProdutoTable.nome);
  res.json(categorias);
});

// Árvore completa (aninhada por parentId) -- pensada pra tela de gestão
// de categorias, que hoje não existe (só um menu simples dentro do
// formulário de produto).
router.get("/tenants/:tenantId/categorias-produto/arvore", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await ensureOfficialItemCategories(String(tenantId));

  const categorias = await db
    .select()
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, String(tenantId)))
    .orderBy(categoriasProdutoTable.ordem, categoriasProdutoTable.nome);

  type Categoria = typeof categorias[number];
  type CategoriaComFilhos = Categoria & { filhos: CategoriaComFilhos[] };

  const porId = new Map<string, CategoriaComFilhos>(
    categorias.map((c) => [c.id, { ...c, filhos: [] }])
  );
  const raizes: CategoriaComFilhos[] = [];
  for (const c of porId.values()) {
    if (c.parentId && porId.has(c.parentId)) {
      porId.get(c.parentId)!.filhos.push(c);
    } else {
      raizes.push(c);
    }
  }
  res.json(raizes);
});

// Categorias criadas fora do padrão oficial, aguardando revisão --
// hoje isso só se aplica a subníveis (subcategoria em diante), já que
// o nível "categoria" (topo) é sempre validado contra a lista oficial
// na hora de criar.
router.get("/tenants/:tenantId/categorias-produto/pendentes", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const pendentes = await db
    .select()
    .from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.tenantId, String(tenantId)), eq(categoriasProdutoTable.precisaAprovacao, true)))
    .orderBy(categoriasProdutoTable.createdAt);
  res.json(pendentes);
});

// Sugestão de categoria por similaridade -- usado tanto na importação
// quanto no formulário manual, pra evitar categoria quase-duplicada
// (ex: "Tinta Acrílica" vs "Tintas Acrílicas" criadas como 2 coisas
// diferentes por engano).
router.get("/tenants/:tenantId/categorias-produto/sugestao", async (req, res) => {
  const { tenantId } = req.params;
  const nome = String(req.query["nome"] ?? "").trim();

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!nome) {
    res.status(422).json({ error: "Informe o nome pra buscar sugestão" });
    return;
  }

  const oficial = findOfficialItemCategory(nome);

  const existentes = await db
    .select({ id: categoriasProdutoTable.id, nome: categoriasProdutoTable.nome, nivel: categoriasProdutoTable.nivel, parentId: categoriasProdutoTable.parentId })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, String(tenantId)));

  const exata = existentes.find((c) => c.nome.trim().toLowerCase() === nome.toLowerCase());

  const similares = existentes
    .map((c) => ({ ...c, score: categoryNameSimilarity(nome, c.nome) }))
    .filter((c) => c.score > 0.15 && c.nome.trim().toLowerCase() !== nome.toLowerCase())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  res.json({ exata: exata ?? null, oficial, similares });
});

router.post("/tenants/:tenantId/categorias-produto", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const nivel = req.body?.nivel ?? "categoria";
  const officialName = nivel === "categoria" ? findOfficialItemCategory(String(req.body?.nome ?? "")) : null;
  if (nivel === "categoria" && !officialName) {
    res.status(422).json({ error: "Categoria principal fora do padrão oficial do Vendor.ai." });
    return;
  }
  if (nivel !== "categoria" && !req.body?.parentId) {
    res.status(422).json({ error: `O nível ${nivel} precisa estar ligado a uma categoria superior.` });
    return;
  }

  const nome = officialName ?? String(req.body?.nome ?? "").trim();
  const parsed = insertCategoriaProdutoSchema.safeParse({
    ...req.body,
    tenantId,
    nome,
    nivel,
    slug: normalizeCategoryName(nome).replace(/\s+/g, "-"),
    oficial: nivel === "categoria",
  });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [categoria] = await db.insert(categoriasProdutoTable).values(parsed.data).returning();
  res.status(201).json(categoria);
});

router.patch("/categorias-produto/:id", async (req, res) => {
  const parsed = updateCategoriaProdutoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: categoriasProdutoTable.id, tenantId: categoriasProdutoTable.tenantId, oficial: categoriasProdutoTable.oficial })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (existing.oficial && (parsed.data.nome || parsed.data.nivel || parsed.data.parentId)) {
    res.status(422).json({ error: "Categorias oficiais não podem ter nome, nível ou vínculo alterados." });
    return;
  }

  const [categoria] = await db
    .update(categoriasProdutoTable)
    .set({
      ...parsed.data,
      ...(parsed.data.nome ? { slug: normalizeCategoryName(parsed.data.nome).replace(/\s+/g, "-") } : {}),
      updatedAt: new Date(),
    })
    .where(eq(categoriasProdutoTable.id, existing.id))
    .returning();

  res.json(categoria);
});

router.post("/categorias-produto/:id/aprovar", async (req, res) => {
  const [existing] = await db
    .select({ id: categoriasProdutoTable.id, tenantId: categoriasProdutoTable.tenantId })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [categoria] = await db
    .update(categoriasProdutoTable)
    .set({
      precisaAprovacao: false,
      aprovadoPor: req.user?.sub ?? null,
      aprovadoEm: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(categoriasProdutoTable.id, existing.id))
    .returning();

  res.json(categoria);
});

router.delete("/categorias-produto/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: categoriasProdutoTable.id, tenantId: categoriasProdutoTable.tenantId, oficial: categoriasProdutoTable.oficial })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (existing.oficial) {
    res.status(422).json({ error: "Categorias oficiais não podem ser excluídas." });
    return;
  }

  const [produtoVinculado] = await db
    .select({ id: produtosCatalogoTable.id })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.categoriaId, existing.id))
    .limit(1);
  if (produtoVinculado) {
    res.status(409).json({ error: "Esta categoria possui produtos. Reclassifique-os antes de excluir a categoria." });
    return;
  }
  await db.delete(categoriasProdutoTable).where(eq(categoriasProdutoTable.id, existing.id));

  res.status(204).send();
});

export default router;
