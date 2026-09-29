import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  categoriasProdutoTable,
  produtosCatalogoTable,
  insertCategoriaProdutoSchema,
  updateCategoriaProdutoSchema,
} from "@workspace/db";
import { ensureOfficialItemCategories, findOfficialItemCategory, normalizeCategoryName, categoryNameSimilarity, ITEM_CATEGORIES } from "../lib/itemCategories";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";

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


// Padronização assistida por IA para o cadastro manual de categorias.
// A IA nunca grava direto: ela devolve uma sugestão para o usuário confirmar.
router.post("/tenants/:tenantId/categorias-produto/padronizar-ia", async (req, res) => {
  const { tenantId } = req.params;
  const entrada = String(req.body?.entrada ?? "").trim();

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!entrada) {
    res.status(422).json({ error: "Descreva a categoria ou o tipo de produto." });
    return;
  }

  await ensureOfficialItemCategories(String(tenantId));

  const existentes = await db
    .select({
      id: categoriasProdutoTable.id,
      nome: categoriasProdutoTable.nome,
      nivel: categoriasProdutoTable.nivel,
      parentId: categoriasProdutoTable.parentId,
    })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, String(tenantId)));

  const exata = existentes.find(
    (categoria) => normalizeCategoryName(categoria.nome) === normalizeCategoryName(entrada),
  );
  if (exata) {
    res.json({
      acao: "usar_existente",
      existingId: exata.id,
      nome: exata.nome,
      nivel: exata.nivel,
      parentId: exata.parentId,
      parentNome: exata.parentId ? existentes.find((c) => c.id === exata.parentId)?.nome ?? null : null,
      justificativa: "Já existe uma categoria equivalente no catálogo.",
      motor: "regra",
    });
    return;
  }

  const similares = existentes
    .map((categoria) => ({ ...categoria, score: categoryNameSimilarity(entrada, categoria.nome) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const categoriasPrompt = existentes.slice(0, 250).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
    nivel: categoria.nivel,
    parentId: categoria.parentId,
  }));

  try {
    const ai = await gatewayCallOpenAI(
      String(tenantId),
      "content_generator",
      [
        {
          role: "system",
          content:
            "Você padroniza taxonomias de catálogo comercial. Evite duplicações e nomes vagos. " +
            "Prefira reutilizar uma categoria existente quando semanticamente equivalente. " +
            "Quando precisar criar, crie apenas UMA categoria por vez, normalmente como subcategoria ligada a uma categoria principal oficial já existente. " +
            "O nome deve ser curto, substantivo, em português do Brasil, singular/plural conforme uso comercial consagrado e sem marca/modelo. " +
            "Não transforme nome de produto em categoria. Responda somente JSON válido.",
        },
        {
          role: "user",
          content: JSON.stringify({
            entrada,
            categoriasPrincipaisOficiais: ITEM_CATEGORIES,
            categoriasExistentes: categoriasPrompt,
            similaresDeterministicos: similares,
            formato: {
              acao: "usar_existente | criar",
              existingId: "string|null",
              nome: "string",
              nivel: "categoria|subcategoria|nicho|linha|aplicacao|sublinha|utilidade|familia",
              parentId: "string|null",
              justificativa: "string curta",
            },
            regras: [
              "Se acao=usar_existente, existingId deve ser o id exato de categoriasExistentes.",
              "Se acao=criar, parentId deve apontar para uma categoria existente e nivel deve ser subcategoria, salvo caso excepcional.",
              "Nunca invente IDs.",
            ],
          }),
        },
      ],
      {
        maxTokens: 500,
        temperature: 0.1,
        responseFormat: { type: "json_object" },
        log: req.log,
      },
    );

    const parsed = JSON.parse(ai.content || "{}") as {
      acao?: "usar_existente" | "criar";
      existingId?: string | null;
      nome?: string;
      nivel?: string;
      parentId?: string | null;
      justificativa?: string;
    };

    if (parsed.acao === "usar_existente" && parsed.existingId) {
      const existente = existentes.find((categoria) => categoria.id === parsed.existingId);
      if (existente) {
        res.json({
          acao: "usar_existente",
          existingId: existente.id,
          nome: existente.nome,
          nivel: existente.nivel,
          parentId: existente.parentId,
          parentNome: existente.parentId ? existentes.find((c) => c.id === existente.parentId)?.nome ?? null : null,
          justificativa: parsed.justificativa || "A IA encontrou uma categoria existente equivalente.",
          motor: "ia",
        });
        return;
      }
    }

    const nomeSugerido = String(parsed.nome ?? "").trim();
    const parent = parsed.parentId ? existentes.find((categoria) => categoria.id === parsed.parentId) : null;
    if (!nomeSugerido || !parent) {
      throw new Error("Sugestão da IA sem nome ou categoria superior válida.");
    }

    const equivalente = existentes
      .map((categoria) => ({ categoria, score: categoryNameSimilarity(nomeSugerido, categoria.nome) }))
      .sort((a, b) => b.score - a.score)[0];
    if (equivalente && equivalente.score >= 0.85) {
      res.json({
        acao: "usar_existente",
        existingId: equivalente.categoria.id,
        nome: equivalente.categoria.nome,
        nivel: equivalente.categoria.nivel,
        parentId: equivalente.categoria.parentId,
        parentNome: equivalente.categoria.parentId
          ? existentes.find((c) => c.id === equivalente.categoria.parentId)?.nome ?? null
          : null,
        justificativa: "A sugestão da IA foi consolidada com uma categoria já existente para evitar duplicação.",
        motor: "ia",
      });
      return;
    }

    res.json({
      acao: "criar",
      existingId: null,
      nome: nomeSugerido,
      nivel: parsed.nivel && parsed.nivel !== "categoria" ? parsed.nivel : "subcategoria",
      parentId: parent.id,
      parentNome: parent.nome,
      justificativa: parsed.justificativa || "Nova categoria padronizada sugerida pela IA.",
      motor: "ia",
    });
  } catch (error) {
    req.log?.warn({ err: error, tenantId, entrada }, "category standardizer AI failed; using deterministic fallback");

    const melhorSimilar = similares[0];
    if (melhorSimilar && melhorSimilar.score >= 0.5) {
      res.json({
        acao: "usar_existente",
        existingId: melhorSimilar.id,
        nome: melhorSimilar.nome,
        nivel: melhorSimilar.nivel,
        parentId: melhorSimilar.parentId,
        parentNome: melhorSimilar.parentId ? existentes.find((c) => c.id === melhorSimilar.parentId)?.nome ?? null : null,
        justificativa: "Categoria semelhante encontrada pelo padronizador.",
        motor: "fallback",
      });
      return;
    }

    const oficial = findOfficialItemCategory(entrada);
    if (oficial) {
      const existenteOficial = existentes.find((categoria) => categoria.nome === oficial);
      if (existenteOficial) {
        res.json({
          acao: "usar_existente",
          existingId: existenteOficial.id,
          nome: existenteOficial.nome,
          nivel: existenteOficial.nivel,
          parentId: null,
          parentNome: null,
          justificativa: "Correspondência encontrada na taxonomia oficial.",
          motor: "fallback",
        });
        return;
      }
    }

    res.status(502).json({ error: "Não foi possível padronizar esta categoria agora. Tente novamente." });
  }
});

router.post("/tenants/:tenantId/categorias-produto", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately compared with the authenticated tenant before any tenant-scoped write.
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
