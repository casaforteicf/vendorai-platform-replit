import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { findOfficialItemCategory, ITEM_CATEGORIES, categoryNameSimilarity } from "../lib/itemCategories";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { callOpenAI, callOpenAIFileExtraction, generateImage } from "../lib/ai-gateway.js";
import multer from "multer";
import sharp from "sharp";
import { resolverContextoNegocio } from "../services/resolvedorContextoNegocio.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  db,
  produtosCatalogoTable,
  categoriasProdutoTable,
  insertProdutoCatalogoSchema,
  updateProdutoCatalogoSchema,
  inventoryItemsTable,
  produtoComposicoesTable,
  archMarketplaceItemsTable,
  tenantNavModulesTable,
} from "@workspace/db";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const catalogPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      cb(new Error("Envie um arquivo PDF."));
      return;
    }
    cb(null, true);
  },
});

function routeTenantId(req: any): string {
  // tenant-audit: reviewed tenant route; callers enforce same-tenant or super-admin access before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

function canAccessTenant(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

async function categoriaPertenceAoTenant(categoriaId: string, tenantId: string): Promise<boolean> {
  const [categoria] = await db
    .select({ id: categoriasProdutoTable.id })
    .from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.id, categoriaId), eq(categoriasProdutoTable.tenantId, tenantId)));
  return Boolean(categoria);
}

async function syncArqdorMarketplaceProduct(product: typeof produtosCatalogoTable.$inferSelect): Promise<void> {
  const [existing] = await db
    .select({ id: archMarketplaceItemsTable.id })
    .from(archMarketplaceItemsTable)
    .where(and(
      eq(archMarketplaceItemsTable.vendedorTenantId, product.tenantId),
      eq(archMarketplaceItemsTable.masterProductId, product.id),
    ))
    .limit(1);

  const imagens = Array.from(new Set([
    product.imagemUrl,
    ...((product.imagens as string[] | null) ?? []),
  ].filter((value): value is string => Boolean(value))));
  const preco = product.precoArqdor ?? product.precoBase;

  const [archModule] = await db
    .select({ isEnabled: tenantNavModulesTable.isEnabled })
    .from(tenantNavModulesTable)
    .where(and(
      eq(tenantNavModulesTable.tenantId, product.tenantId),
      eq(tenantNavModulesTable.moduleKey, "arch"),
      eq(tenantNavModulesTable.isEnabled, true),
    ))
    .limit(1);

  // Regra oficial: todo produto ativo da Biblioteca de Projeto de um cliente
  // com Arqdor habilitado fica disponível no ecossistema Arqdor.
  // O switch vendeNoArqdor continua aceito como publicação explícita.
  const availableInArqdor = Boolean(
    product.ativo &&
    product.projectLibraryEnabled &&
    (product.vendeNoArqdor || archModule?.isEnabled),
  );

  if (!availableInArqdor) {
    if (existing) {
      await db.update(archMarketplaceItemsTable)
        .set({ ativo: false })
        .where(eq(archMarketplaceItemsTable.id, existing.id));
    }
    return;
  }

  let categoriaNome: string | null = null;
  if (product.categoriaId) {
    const [categoria] = await db
      .select({ nome: categoriasProdutoTable.nome })
      .from(categoriasProdutoTable)
      .where(and(
        eq(categoriasProdutoTable.id, product.categoriaId),
        eq(categoriasProdutoTable.tenantId, product.tenantId),
      ))
      .limit(1);
    categoriaNome = categoria?.nome ?? null;
  }

  const marketplaceData = {
    masterProductId: product.id,
    nome: product.nome,
    descricao: product.descricao ?? null,
    categoria: categoriaNome,
    preco: preco == null ? null : String(preco),
    imagens,
    especificacoes: {
      source: "produtos_catalogo",
      masterProductId: product.id,
      model3dUrl: product.model3dUrl ?? null,
      textureUrl: product.textureUrl ?? null,
      projectLibraryEnabled: product.projectLibraryEnabled,
    },
    ativo: availableInArqdor,
  };

  if (existing) {
    await db.update(archMarketplaceItemsTable)
      .set(marketplaceData)
      .where(eq(archMarketplaceItemsTable.id, existing.id));
    return;
  }

  await db.insert(archMarketplaceItemsTable)
    .values({
      vendedorTenantId: product.tenantId,
      ...marketplaceData,
    });
}

// ── Join helper: attach categoriaNome + categoriaDescontoMaximoPercentual ────
async function attachCategoriaInfo<T extends { categoriaId: string | null }>(
  products: T[]
): Promise<(T & { categoriaNome: string | null; categoriaDescontoMaximoPercentual: string | null })[]> {
  const ids = [...new Set(products.map((p) => p.categoriaId).filter((id): id is string => !!id))];
  if (ids.length === 0) {
    return products.map((p) => ({ ...p, categoriaNome: null, categoriaDescontoMaximoPercentual: null }));
  }

  try {
    const categorias = await db
      .select({
        id: categoriasProdutoTable.id,
        nome: categoriasProdutoTable.nome,
        descontoMaximoPercentual: categoriasProdutoTable.descontoMaximoPercentual,
      })
      .from(categoriasProdutoTable);

    const map = new Map(categorias.map((c) => [c.id, c]));

    return products.map((p) => {
      const cat = p.categoriaId ? map.get(p.categoriaId) : undefined;
      return {
        ...p,
        categoriaNome: cat?.nome ?? null,
        categoriaDescontoMaximoPercentual: cat?.descontoMaximoPercentual ?? null,
      };
    });
  } catch (error) {
    console.error("[produtos_catalogo] falha ao enriquecer categorias; retornando catálogo sem metadados de categoria", error);
    return products.map((p) => ({
      ...p,
      categoriaNome: null,
      categoriaDescontoMaximoPercentual: null,
    }));
  }
}

// ── CSV parser (handles quoted fields) ───────────────────────────────────────
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      fields.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

export function normalizeCsvHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type PricingFields = {
  precoBase?: string | number | null;
  custoFornecedor?: string | number | null;
  margemPercentual?: string | number | null;
  fretePercentual?: string | number | null;
  comissaoPercentual?: string | number | null;
  custoFinanceiroPercentual?: string | number | null;
};

function withCalculatedPrice(data: PricingFields): PricingFields {
  // Sem custo informado, precoBase é um preço comercial manual e deve ser
  // preservado. Number(null) === 0 fazia produtos/serviços sem custo fixo
  // serem gravados por R$ 0,00 em qualquer PATCH subsequente.
  if (data.custoFornecedor === null || data.custoFornecedor === undefined || data.custoFornecedor === "") {
    return data;
  }

  const custo = Number(data.custoFornecedor);
  if (!Number.isFinite(custo) || custo < 0) return data;

  const percentuais = [
    data.margemPercentual,
    data.fretePercentual,
    data.comissaoPercentual,
    data.custoFinanceiroPercentual,
  ].map((value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  const precoFinal = custo * (1 + percentuais.reduce((total, value) => total + value, 0) / 100);
  return { ...data, precoBase: precoFinal.toFixed(2) };
}

router.post("/produtos-catalogo", async (req, res) => {
  const parsed = insertProdutoCatalogoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!parsed.data.tenantId) {
    res.status(422).json({ error: "O produto deve pertencer a uma empresa." });
    return;
  }

  if (!parsed.data.categoriaId) {
    res.status(422).json({ error: "Selecione uma categoria para cadastrar o produto." });
    return;
  }
  if (!(await categoriaPertenceAoTenant(parsed.data.categoriaId, parsed.data.tenantId))) {
    res.status(422).json({ error: "A categoria selecionada não pertence a esta empresa." });
    return;
  }

  const [product] = await db
    .insert(produtosCatalogoTable)
    .values(withCalculatedPrice(parsed.data) as any)
    .returning();
  await syncArqdorMarketplaceProduct(product);
  res.status(201).json(product);
});

router.get("/tenants/:tenantId/produtos-catalogo", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const products = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.tenantId, tenantId))
    .orderBy(produtosCatalogoTable.nome);
  res.json(await attachCategoriaInfo(products));
});

// GET /tenants/:tenantId/produtos-catalogo/pendentes-revisao — fila de
// produtos criados automaticamente pelo sync do ERP, aguardando o lojista
// conferir/editar e aprovar antes de entrarem ativos no catálogo.
router.get("/tenants/:tenantId/produtos-catalogo/pendentes-revisao", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const products = await db
    .select()
    .from(produtosCatalogoTable)
    .where(
      and(
        eq(produtosCatalogoTable.tenantId, tenantId),
        eq(produtosCatalogoTable.statusRevisao, "pendente_revisao"),
      ),
    )
    .orderBy(produtosCatalogoTable.createdAt);
  res.json(await attachCategoriaInfo(products));
});

// POST /produtos-catalogo/:id/aprovar — lojista aprova o produto pendente:
// vira ativo e sai da fila de revisão. Editar campos continua sendo o
// PATCH normal (/produtos-catalogo/:id) — este endpoint só muda o status.
router.post("/produtos-catalogo/:id/aprovar", async (req, res) => {
  const [existing] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [updated] = await db
    .update(produtosCatalogoTable)
    .set({ ativo: true, statusRevisao: "ok", avisosRevisao: null, updatedAt: new Date() })
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  res.json(updated);
});

router.post("/produtos-catalogo/:id/inteligencia-comercial/sugerir", async (req, res) => {
  const id = String(req.params.id);
  const [product] = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, id));

  if (!product) {
    res.status(404).json({ error: "Produto não encontrado" });
    return;
  }

  const tenantId = product.tenantId;
  if (!tenantId) {
    res.status(422).json({ error: "Produto sem empresa vinculada" });
    return;
  }
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Acesso negado a esta empresa" });
    return;
  }

  try {
    const contexto = await resolverContextoNegocio({
      tenantId,
      query: [
        product.nome,
        product.descricao,
        product.descricaoLonga,
        ...(product.tags ?? []),
      ].filter(Boolean).join(" | "),
      productIds: [product.id],
      limit: 12,
    });

    const especificacoes = Array.isArray(product.especificacoes)
      ? product.especificacoes.slice(0, 60)
      : [];

    const result = await callOpenAI(
      tenantId,
      "agent_onboarding",
      [
        {
          role: "system",
          content:
            "Você organiza inteligência comercial de produtos sem inventar fatos. " +
            "Use somente os dados e fontes fornecidos. Quando não houver evidência suficiente, deixe o campo vazio. " +
            "Não crie números, garantias, certificações, desempenho, comparações, prazos ou promessas não documentadas. " +
            "Responda somente JSON válido.",
        },
        {
          role: "user",
          content: `Analise o produto e proponha uma estrutura comercial que será revisada por uma pessoa antes de ser aprovada.

PRODUTO:
${JSON.stringify({
  nome: product.nome,
  marca: product.marca,
  descricao: product.descricao,
  descricaoLonga: product.descricaoLonga,
  tags: product.tags,
  especificacoes,
  prazoEntregaDias: product.prazoEntregaDias,
})}

CONTEXTO APROVADO RECUPERADO:
${contexto.blocoPrompt || "Nenhum contexto adicional aprovado encontrado."}

Retorne:
{
  "caracteristicas": [],
  "diferenciais": [],
  "beneficios": [],
  "doresAtendidas": [],
  "casosUso": [],
  "personas": [],
  "objecoes": [{"objecao":"","resposta":""}],
  "afirmacoesProibidas": [],
  "notasComerciais": [],
  "duvidasFrequentes": [],
  "garantia": "",
  "instalacaoUso": "",
  "entregaPrazo": "",
  "orientacoesIa": []
}

Regras adicionais:
- Diferencial só existe se houver base concreta para sustentá-lo.
- Benefício deve ser consequência plausível de característica/diferencial documentado, sem exagero.
- Se houver dúvida, prefira deixar vazio.
- Em afirmacoesProibidas, registre riscos claros de extrapolação percebidos no material.`,
        },
      ],
      {
        temperature: 0.2,
        maxTokens: 1800,
        responseFormat: { type: "json_object" },
        log: req.log,
      },
    );

    let sugestoes: Record<string, unknown> = {};
    try {
      sugestoes = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) sugestoes = JSON.parse(match[0]);
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      sugestoes,
      fontes: contexto.fontes,
      idsProdutos: contexto.idsProdutos,
      idsMidias: contexto.idsMidias,
      status: "rascunho",
      aviso: "Sugestões geradas por IA. Revise e salve para aprovar o uso.",
    });
  } catch (error) {
    req.log?.error({ error, tenantId, productId: id }, "inteligencia-comercial: falha ao sugerir");
    res.status(500).json({ error: "Não foi possível gerar sugestões agora." });
  }
});

router.get("/produtos-catalogo/:id", async (req, res) => {
  const [product] = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [withCategoria] = await attachCategoriaInfo([product]);
  res.json(withCategoria);
});

router.patch("/produtos-catalogo/:id", async (req, res) => {
  const parsed = updateProdutoCatalogoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({
      id: produtosCatalogoTable.id,
      tenantId: produtosCatalogoTable.tenantId,
      categoriaId: produtosCatalogoTable.categoriaId,
      precoBase: produtosCatalogoTable.precoBase,
      custoFornecedor: produtosCatalogoTable.custoFornecedor,
      margemPercentual: produtosCatalogoTable.margemPercentual,
      fretePercentual: produtosCatalogoTable.fretePercentual,
      comissaoPercentual: produtosCatalogoTable.comissaoPercentual,
      custoFinanceiroPercentual: produtosCatalogoTable.custoFinanceiroPercentual,
    })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!existing.tenantId) {
    res.status(422).json({ error: "O produto não está vinculado a uma empresa válida." });
    return;
  }

  const categoriaIdFinal = parsed.data.categoriaId === undefined ? existing.categoriaId : parsed.data.categoriaId;
  if (!categoriaIdFinal) {
    res.status(422).json({ error: "Todo produto deve permanecer vinculado a uma categoria." });
    return;
  }
  if (!(await categoriaPertenceAoTenant(categoriaIdFinal, existing.tenantId))) {
    res.status(422).json({ error: "A categoria selecionada não pertence a esta empresa." });
    return;
  }

  const [product] = await db
    .update(produtosCatalogoTable)
    .set({
      ...withCalculatedPrice({
        precoBase: parsed.data.precoBase ?? existing.precoBase,
        custoFornecedor: parsed.data.custoFornecedor ?? existing.custoFornecedor,
        margemPercentual: parsed.data.margemPercentual ?? existing.margemPercentual,
        fretePercentual: parsed.data.fretePercentual ?? existing.fretePercentual,
        comissaoPercentual: parsed.data.comissaoPercentual ?? existing.comissaoPercentual,
        custoFinanceiroPercentual: parsed.data.custoFinanceiroPercentual ?? existing.custoFinanceiroPercentual,
      }),
      ...parsed.data,
      precoBase: withCalculatedPrice({
        precoBase: parsed.data.precoBase ?? existing.precoBase,
        custoFornecedor: parsed.data.custoFornecedor ?? existing.custoFornecedor,
        margemPercentual: parsed.data.margemPercentual ?? existing.margemPercentual,
        fretePercentual: parsed.data.fretePercentual ?? existing.fretePercentual,
        comissaoPercentual: parsed.data.comissaoPercentual ?? existing.comissaoPercentual,
        custoFinanceiroPercentual: parsed.data.custoFinanceiroPercentual ?? existing.custoFinanceiroPercentual,
      }).precoBase,
      updatedAt: new Date(),
    } as any)
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  await syncArqdorMarketplaceProduct(product);
  res.json(product);
});

// ── Composição de N itens pra cálculo de orçamento por área/m² ───────────────
// Ver produto_composicoes.ts (schema) — generaliza "1 acessório por
// Coleção+Cor" pra qualquer número de itens, cada um por área ou perímetro.
const composicaoItemSchema = z.object({
  itemProdutoId: z.string().min(1),
  baseCalculo: z.enum(["area", "perimetro"]).default("area"),
});
const composicaoBodySchema = z.object({ itens: z.array(composicaoItemSchema).max(20) });

router.get("/produtos-catalogo/:id/composicao", async (req, res) => {
  const [produto] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));
  if (!produto) return res.status(404).json({ error: "Product not found" });
  if (req.user?.platformRole !== "super_admin" && produto.tenantId !== req.user?.tenantId) {
    return res.status(403).json({ error: "Access denied to this tenant" });
  }
  if (!produto.tenantId) return res.status(422).json({ error: "O produto não está vinculado a uma empresa válida." });

  const itens = await db
    .select({
      id: produtoComposicoesTable.id,
      itemProdutoId: produtoComposicoesTable.itemProdutoId,
      baseCalculo: produtoComposicoesTable.baseCalculo,
      ordem: produtoComposicoesTable.ordem,
      nome: produtosCatalogoTable.nome,
    })
    .from(produtoComposicoesTable)
    .innerJoin(produtosCatalogoTable, eq(produtosCatalogoTable.id, produtoComposicoesTable.itemProdutoId))
    .where(eq(produtoComposicoesTable.produtoPrincipalId, produto.id))
    .orderBy(produtoComposicoesTable.ordem);

  return res.json(itens);
});

// Substitui a composição inteira do produto (apaga tudo e recria na ordem
// enviada) — mais simples e seguro do que tentar diffar item a item numa
// lista curta (no máximo 20 itens).
router.put("/produtos-catalogo/:id/composicao", async (req, res) => {
  const parsed = composicaoBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [produto] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));
  if (!produto) return res.status(404).json({ error: "Product not found" });
  if (req.user?.platformRole !== "super_admin" && produto.tenantId !== req.user?.tenantId) {
    return res.status(403).json({ error: "Access denied to this tenant" });
  }
  if (!produto.tenantId) return res.status(422).json({ error: "O produto não está vinculado a uma empresa válida." });

  if (parsed.data.itens.some((i) => i.itemProdutoId === produto.id)) {
    return res.status(422).json({ error: "Um produto não pode compor a si mesmo." });
  }

  await db.delete(produtoComposicoesTable).where(eq(produtoComposicoesTable.produtoPrincipalId, produto.id));

  if (parsed.data.itens.length > 0) {
    await db.insert(produtoComposicoesTable).values(
      parsed.data.itens.map((item, ordem) => ({
        tenantId: produto.tenantId as string,
        produtoPrincipalId: produto.id,
        itemProdutoId: item.itemProdutoId,
        baseCalculo: item.baseCalculo,
        ordem,
      }))
    );
  }

  return res.json({ success: true, count: parsed.data.itens.length });
});

// ── PATCH /tenants/:tenantId/produtos-catalogo/praca-ai-bulk ─────────────────
// Ajusta visibilidade e/ou preço específico do Praça.ai pra vários produtos
// de uma vez (ex: "tirar essa lista toda da vitrine" ou "embutir a comissão
// no preço desses 40 produtos"). Cada campo é opcional — só atualiza o que
// vier preenchido, os outros produtos/campos não selecionados ficam intactos.
const bulkPracaAiBodySchema = z.object({
  productIds: z.array(z.string()).min(1),
  vendeNoPracaAi: z.boolean().nullable().optional(),
  precoPracaAi: z.union([z.string(), z.number()]).nullable().optional(),
});

router.patch("/tenants/:tenantId/produtos-catalogo/praca-ai-bulk", async (req, res) => {
  const tenantId = routeTenantId(req);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = bulkPracaAiBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { productIds, vendeNoPracaAi, precoPracaAi } = parsed.data;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (vendeNoPracaAi !== undefined) updateData.vendeNoPracaAi = vendeNoPracaAi;
  if (precoPracaAi !== undefined) updateData.precoPracaAi = precoPracaAi === null ? null : String(precoPracaAi);

  if (Object.keys(updateData).length === 1) {
    res.status(422).json({ error: "Informe vendeNoPracaAi e/ou precoPracaAi." });
    return;
  }

  if (vendeNoPracaAi === true) {
    const [semCategoria] = await db
      .select({ id: produtosCatalogoTable.id })
      .from(produtosCatalogoTable)
      .where(and(
        eq(produtosCatalogoTable.tenantId, tenantId),
        inArray(produtosCatalogoTable.id, productIds),
        isNull(produtosCatalogoTable.categoriaId),
      ))
      .limit(1);
    if (semCategoria) {
      res.status(422).json({ error: "Classifique todos os produtos antes de publicá-los na Praça.ai." });
      return;
    }
  }

  const updated = await db
    .update(produtosCatalogoTable)
    .set(updateData as any)
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), inArray(produtosCatalogoTable.id, productIds)))
    .returning({ id: produtosCatalogoTable.id });

  res.json({ atualizados: updated.length });
});



type CatalogPdfPreviewProduct = {
  nome: string;
  sku: string | null;
  categoria: string;
  precoBase: number | null;
  unidade: string;
  descricao: string | null;
  marca: string | null;
  fornecedor: string | null;
  cor: string | null;
  especificacoes: Array<{ label: string; value: string }>;
  confianca: number;
  avisos: string[];
  duplicate?: { id: string; nome: string; sku: string | null } | null;
};

function cleanAiJson(raw: string): string {
  return raw.trim().replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/i, "");
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

router.post(
  "/tenants/:tenantId/produtos-catalogo/import-pdf/preview",
  (req, res, next) => {
    catalogPdfUpload.single("file")(req, res, (error: any) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: "O catálogo PDF ultrapassa o limite de 50 MB. Comprima o PDF ou divida o catálogo em partes menores.",
          code: "CATALOG_PDF_TOO_LARGE",
          maxSizeMb: 50,
        });
        return;
      }
      if (error instanceof multer.MulterError) {
        res.status(422).json({ error: "Não foi possível receber o catálogo PDF.", code: error.code });
        return;
      }
      res.status(422).json({ error: error?.message || "Arquivo PDF inválido." });
    });
  },
  async (req, res) => {
    const tenantId = routeTenantId(req);
    if (!canAccessTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (!req.file) {
      res.status(422).json({ error: "Selecione um catálogo em PDF." });
      return;
    }

    try {
      const existing = await db
        .select({
          id: produtosCatalogoTable.id,
          nome: produtosCatalogoTable.nome,
          sku: produtosCatalogoTable.sku,
          categoriaId: produtosCatalogoTable.categoriaId,
        })
        .from(produtosCatalogoTable)
        .where(eq(produtosCatalogoTable.tenantId, tenantId));

      const instruction = [
        "Você interpreta catálogos comerciais e os converte para o padrão oficial de produtos do Vendor.ai.",
        "Leia o PDF inteiro, incluindo tabelas, títulos, famílias, linhas, variantes e especificações técnicas.",
        "NÃO copie a estrutura visual do PDF. Normalize cada produto/variante em um registro utilizável no catálogo.",
        "Não invente preço, SKU, medida, material, cor, marca ou fornecedor. Quando não existir, use null.",
        "Quando uma tabela representar variações reais (medida, cor, modelo, voltagem, acabamento), gere registros distintos somente quando fizer sentido comercial.",
        "Evite transformar cabeçalhos, textos institucionais, índices, legendas e acessórios citados apenas como referência em produtos.",
        "Preço: use o preço unitário/comercial explicitamente associado ao item. Não calcule preço ausente.",
        "Categoria: escolha SOMENTE uma destas categorias oficiais, usando a mais adequada: " + ITEM_CATEGORIES.join(" | "),
        "Unidade: normalize para valores curtos como un, m, m², m³, kg, cx, pct, kit, serviço quando houver evidência.",
        "Especificações: preserve atributos técnicos relevantes como pares label/value; não repita nome, SKU, categoria, preço, marca ou cor.",
        "Confianca deve estar entre 0 e 1. Em avisos, explique apenas incertezas reais que o usuário precisa revisar.",
        "Retorne SOMENTE JSON válido no formato:",
        JSON.stringify({
          fabricante: "string|null",
          produtos: [{
            nome: "string",
            sku: "string|null",
            categoria: "categoria oficial",
            precoBase: "number|null",
            unidade: "string",
            descricao: "string|null",
            marca: "string|null",
            fornecedor: "string|null",
            cor: "string|null",
            especificacoes: [{ label: "string", value: "string" }],
            confianca: 0.9,
            avisos: ["string"]
          }]
        }),
        "Extraia o máximo de produtos reais possível dentro do limite de resposta, sem resumir vários SKUs em um único item quando o PDF os distingue."
      ].join("\n");

      const ai = await callOpenAIFileExtraction(
        tenantId,
        "document_extraction",
        { buffer: req.file.buffer, mimeType: "application/pdf", filename: req.file.originalname },
        instruction,
        { model: "gpt-4.1-mini", maxTokens: 10000, log: req.log },
      );

      const parsed = JSON.parse(cleanAiJson(ai.content || "{}")) as {
        fabricante?: string | null;
        produtos?: Array<Record<string, unknown>>;
      };
      const rawProducts = Array.isArray(parsed.produtos) ? parsed.produtos : [];
      if (rawProducts.length === 0) {
        res.status(422).json({ error: "Não foi possível identificar produtos reais neste PDF. Revise o arquivo ou tente um catálogo com texto/tabelas mais legíveis." });
        return;
      }

      const norm = (value: unknown) => typeof value === "string" ? value.trim() : "";
      const normKey = (value: unknown) => norm(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const existingBySku = new Map(existing.filter((p) => p.sku).map((p) => [normKey(p.sku), p]));
      const existingByName = new Map(existing.map((p) => [normKey(p.nome), p]));
      const seen = new Set<string>();
      const products: CatalogPdfPreviewProduct[] = [];

      for (const raw of rawProducts) {
        const nome = norm(raw.nome);
        if (!nome) continue;
        const sku = norm(raw.sku) || null;
        const categoryRaw = norm(raw.categoria);
        const categoria = findOfficialItemCategory(categoryRaw)
          ?? ITEM_CATEGORIES.map((item) => ({ item, score: categoryNameSimilarity(categoryRaw || nome, item) })).sort((a, b) => b.score - a.score)[0]?.item
          ?? ITEM_CATEGORIES[0];
        const priceValue = typeof raw.precoBase === "number" ? raw.precoBase : Number(raw.precoBase);
        const precoBase = Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : null;
        const key = sku ? `sku:${normKey(sku)}` : `nome:${normKey(nome)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const specs = Array.isArray(raw.especificacoes)
          ? raw.especificacoes
              .map((item: any) => ({ label: norm(item?.label), value: norm(item?.value) }))
              .filter((item: { label: string; value: string }) => item.label && item.value)
              .slice(0, 40)
          : [];
        const duplicate = (sku ? existingBySku.get(normKey(sku)) : undefined) ?? existingByName.get(normKey(nome)) ?? null;
        const avisos = Array.isArray(raw.avisos) ? raw.avisos.map(norm).filter(Boolean).slice(0, 8) : [];
        if (precoBase == null) avisos.push("Preço não identificado no PDF; revise antes de importar.");
        if (duplicate) avisos.push(`Já existe produto semelhante no catálogo: ${duplicate.nome}.`);

        products.push({
          nome,
          sku,
          categoria,
          precoBase,
          unidade: norm(raw.unidade) || "un",
          descricao: norm(raw.descricao) || null,
          marca: norm(raw.marca) || norm(parsed.fabricante) || null,
          fornecedor: norm(raw.fornecedor) || norm(parsed.fabricante) || null,
          cor: norm(raw.cor) || null,
          especificacoes: specs,
          confianca: Math.min(1, Math.max(0, Number(raw.confianca ?? 0.5) || 0.5)),
          avisos: Array.from(new Set(avisos)),
          duplicate: duplicate ? { id: duplicate.id, nome: duplicate.nome, sku: duplicate.sku } : null,
        });
      }

      const importable = products.filter((p) => p.precoBase != null && !p.duplicate);
      const header = ["nome","sku","categoria","preco_base","unidade","descricao","marca","fornecedor","cor","especificacoes"];
      const rows = importable.map((p) => [
        p.nome,
        p.sku ?? "",
        p.categoria,
        p.precoBase!.toFixed(2),
        p.unidade,
        p.descricao ?? "",
        p.marca ?? "",
        p.fornecedor ?? "",
        p.cor ?? "",
        p.especificacoes.map((s) => `${s.label}:${s.value}`).join(";"),
      ].map(csvEscape).join(","));
      const csv = [header.join(","), ...rows].join("\n");

      res.json({
        fileName: req.file.originalname,
        fabricante: norm(parsed.fabricante) || null,
        products,
        importableCount: importable.length,
        duplicateCount: products.filter((p) => p.duplicate).length,
        reviewCount: products.filter((p) => p.precoBase == null || p.avisos.length > 0).length,
        csv,
      });
    } catch (error: any) {
      req.log?.error?.({ err: error, tenantId }, "catalog-pdf-preview failed");
      res.status(502).json({
        error: error?.message || "Não foi possível interpretar o catálogo PDF.",
      });
    }
  },
);


type CatalogPriceMatchRow = CatalogPdfPreviewProduct & {
  colecao: string | null;
  imagemUrl: string | null;
  visualRegion: { x: number; y: number; width: number; height: number } | null;
  paginaCatalogo: number | null;
  tipoCalculo: string | null;
  fechamentoPacote: number | null;
  quantidadePacote: number | null;
  precoPacote: number | null;
  embalagemMestreQuantidade: number | null;
  quantidadeMinimaVenda: number | null;
  multiploVenda: number | null;
  permiteFracionarEmbalagemMestre: boolean;
  priceMatch: {
    score: number;
    sourceName: string | null;
    sourceSku: string | null;
    reason: string;
  } | null;
};

function catalogMatchKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const aa = new Set(catalogMatchKey(a).split(/\s+/).filter((x) => x.length > 1));
  const bb = new Set(catalogMatchKey(b).split(/\s+/).filter((x) => x.length > 1));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection++;
  return intersection / Math.max(aa.size, bb.size);
}

function nullablePositiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  const n = nullablePositiveNumber(value);
  return n == null ? null : Math.max(1, Math.trunc(n));
}

function clamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeVisualRegion(value: unknown): { x: number; y: number; width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  const width = clamp01(raw.width);
  const height = clamp01(raw.height);
  if (width < 0.04 || height < 0.04) return null;
  return {
    x: Math.min(x, 1 - width),
    y: Math.min(y, 1 - height),
    width,
    height,
  };
}

async function extractCatalogVisual(
  pdf: Buffer,
  tenantId: string,
  pageNumber: number | null,
  region: { x: number; y: number; width: number; height: number } | null,
  filename: string,
): Promise<string | null> {
  if (!pageNumber || !region) return null;
  try {
    // Sharp usa índice de página zero-based. Em ambientes sem suporte de PDF no
    // libvips, a falha cai no fallback de referência por página sem bloquear a importação.
    const page = sharp(pdf, { page: Math.max(0, pageNumber - 1), density: 160 }).png();
    const metadata = await page.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) return null;

    const left = Math.max(0, Math.floor(region.x * width));
    const top = Math.max(0, Math.floor(region.y * height));
    const cropWidth = Math.max(64, Math.min(width - left, Math.ceil(region.width * width)));
    const cropHeight = Math.max(64, Math.min(height - top, Math.ceil(region.height * height)));
    if (cropWidth <= 0 || cropHeight <= 0) return null;

    const cropped = await page
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
      .toBuffer();

    const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    const objectPath = await objectStorage.savePrivateBuffer(
      cropped,
      "image/jpeg",
      `catalogo-produto-${safe}-p${pageNumber}-${Date.now()}.jpg`,
      tenantId,
    );
    return `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;
  } catch {
    return null;
  }
}

const catalogPriceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const pdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    cb(pdf ? null : new Error("Apenas arquivos PDF são aceitos."), pdf);
  },
});

router.post(
  "/tenants/:tenantId/produtos-catalogo/import-catalog-price/preview",
  (req, res, next) => {
    catalogPriceUpload.fields([
      { name: "catalog", maxCount: 1 },
      { name: "priceTable", maxCount: 1 },
    ])(req, res, (error: any) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Cada PDF pode ter no máximo 100 MB.", code: "CATALOG_PRICE_PDF_TOO_LARGE" });
      }
      return res.status(422).json({ error: error?.message || "Não foi possível receber os PDFs." });
    });
  },
  async (req, res) => {
    const tenantId = routeTenantId(req);
    if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Access denied" });

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const catalog = files?.catalog?.[0];
    const priceTable = files?.priceTable?.[0];
    if (!catalog || !priceTable) {
      return res.status(422).json({ error: "Envie o catálogo PDF e a tabela de preços PDF." });
    }

    try {
      const [catalogObjectPath, priceObjectPath] = await Promise.all([
        objectStorage.savePrivateBuffer(catalog.buffer, "application/pdf", `catalogo-original-${Date.now()}.pdf`, tenantId),
        objectStorage.savePrivateBuffer(priceTable.buffer, "application/pdf", `tabela-precos-${Date.now()}.pdf`, tenantId),
      ]);
      const catalogSourceUrl = `/api/storage/objects${catalogObjectPath.replace(/^\/objects/, "")}`;
      const priceTableSourceUrl = `/api/storage/objects${priceObjectPath.replace(/^\/objects/, "")}`;

      const [catalogAi, priceAi, existing] = await Promise.all([
        callOpenAIFileExtraction(
          tenantId,
          "document_extraction",
          { buffer: catalog.buffer, mimeType: "application/pdf", filename: catalog.originalname },
          [
            "Extraia produtos e variações reais deste catálogo comercial.",
            "O catálogo é a fonte VISUAL e TÉCNICA, não a fonte principal de preço.",
            "Preserve coleção/linha, acabamento/cor, medidas, unidade, especificações e a página onde o produto/variação aparece.",
            "Quando uma página mostrar uma família com várias cores/acabamentos, gere uma linha por variação comercial.",
            "Não invente SKU, preço, embalagem ou medida.",
            "Para visualRegion, marque a menor região retangular da página que represente visualmente aquele produto/acabamento (foto, amostra ou swatch), com coordenadas normalizadas de 0 a 1. Se não houver uma região visual inequívoca, use null.",
            "Retorne SOMENTE JSON válido no formato:",
            JSON.stringify({ fabricante:"string|null", produtos:[{
              nome:"string", sku:"string|null", colecao:"string|null", cor:"string|null",
              categoria:"string|null", unidade:"string|null", descricao:"string|null",
              pagina:"number|null", tipoCalculo:"string|null",
              fechamentoPacote:"number|null", quantidadePacote:"number|null",
              visualRegion:{x:"0..1",y:"0..1",width:"0..1",height:"0..1"} ,
              especificacoes:[{label:"string",value:"string"}], confianca:0.9
            }]})
          ].join("\n"),
          { model: "gpt-4.1-mini", maxTokens: 12000, log: req.log },
        ),
        callOpenAIFileExtraction(
          tenantId,
          "document_extraction",
          { buffer: priceTable.buffer, mimeType: "application/pdf", filename: priceTable.originalname },
          [
            "Extraia cada item/linha comercial desta tabela de preços.",
            "Esta é a fonte oficial de PREÇO e REGRAS DE VENDA.",
            "Preserve SKU/código, nome, coleção, cor/acabamento, unidade, preço, IPI, fechamento/rendimento, quantidade por pacote e qualquer mínimo/múltiplo/embalagem mestre explicitamente informado.",
            "Não invente embalagem mestre quando ela não estiver escrita.",
            "Retorne SOMENTE JSON válido no formato:",
            JSON.stringify({ tabela:"string|null", vigencia:"string|null", itens:[{
              nome:"string", sku:"string|null", colecao:"string|null", cor:"string|null",
              unidade:"string|null", precoBase:"number|null", ipiPercentual:"number|null",
              fechamentoPacote:"number|null", quantidadePacote:"number|null", precoPacote:"number|null",
              embalagemMestreQuantidade:"number|null", quantidadeMinimaVenda:"number|null",
              multiploVenda:"number|null", permiteFracionarEmbalagemMestre:"boolean|null",
              tipoCalculo:"string|null", observacoes:["string"]
            }]})
          ].join("\n"),
          { model: "gpt-4.1-mini", maxTokens: 10000, log: req.log },
        ),
        db.select({
          id: produtosCatalogoTable.id,
          nome: produtosCatalogoTable.nome,
          sku: produtosCatalogoTable.sku,
        }).from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId)),
      ]);

      const catalogParsed = JSON.parse(cleanAiJson(catalogAi.content || "{}")) as any;
      const priceParsed = JSON.parse(cleanAiJson(priceAi.content || "{}")) as any;
      const catalogRows = Array.isArray(catalogParsed.produtos) ? catalogParsed.produtos : [];
      const priceRows = Array.isArray(priceParsed.itens) ? priceParsed.itens : [];
      if (!catalogRows.length) return res.status(422).json({ error: "Nenhum produto foi identificado no catálogo." });
      if (!priceRows.length) return res.status(422).json({ error: "Nenhum item de preço foi identificado na tabela." });

      const existingBySku = new Map(existing.filter((p) => p.sku).map((p) => [catalogMatchKey(p.sku), p]));
      const existingByName = new Map(existing.map((p) => [catalogMatchKey(p.nome), p]));

      const products: CatalogPriceMatchRow[] = catalogRows.map((raw: any) => {
        const nome = String(raw.nome ?? "").trim();
        const sku = String(raw.sku ?? "").trim() || null;
        const colecao = String(raw.colecao ?? "").trim() || null;
        const cor = String(raw.cor ?? "").trim() || null;
        const catalogIdentity = [nome, colecao, cor].filter(Boolean).join(" ");

        let best: { row: any; score: number; reason: string } | null = null;
        for (const candidate of priceRows) {
          const cSku = String(candidate.sku ?? "").trim();
          const candidateIdentity = [candidate.nome, candidate.colecao, candidate.cor].filter(Boolean).join(" ");
          let score = 0;
          let reason = "similaridade";
          if (sku && cSku && catalogMatchKey(sku) === catalogMatchKey(cSku)) {
            score = 1;
            reason = "SKU exato";
          } else {
            const nameScore = tokenSimilarity(catalogIdentity, candidateIdentity);
            const collectionScore = colecao && candidate.colecao
              ? (catalogMatchKey(colecao) === catalogMatchKey(candidate.colecao) ? 1 : tokenSimilarity(colecao, candidate.colecao))
              : 0;
            const colorScore = cor && candidate.cor
              ? (catalogMatchKey(cor) === catalogMatchKey(candidate.cor) ? 1 : tokenSimilarity(cor, candidate.cor))
              : 0;
            score = Math.min(0.98, nameScore * 0.65 + collectionScore * 0.25 + colorScore * 0.10);
          }
          if (!best || score > best.score) best = { row: candidate, score, reason };
        }

        const matched = best && best.score >= 0.58 ? best : null;
        const price = matched?.row ?? {};
        const duplicate = (sku ? existingBySku.get(catalogMatchKey(sku)) : undefined)
          ?? existingByName.get(catalogMatchKey(nome))
          ?? null;
        const categoriaRaw = String(raw.categoria ?? "");
        const categoria = findOfficialItemCategory(categoriaRaw)
          ?? ITEM_CATEGORIES.map((item) => ({ item, score: categoryNameSimilarity(categoriaRaw || nome, item) }))
            .sort((a, b) => b.score - a.score)[0]?.item
          ?? ITEM_CATEGORIES[0];

        const specs = Array.isArray(raw.especificacoes)
          ? raw.especificacoes
              .map((s: any) => ({ label: String(s?.label ?? "").trim(), value: String(s?.value ?? "").trim() }))
              .filter((s: any) => s.label && s.value)
              .slice(0, 40)
          : [];
        const paginaCatalogo = nullablePositiveInteger(raw.pagina);
        const visualRegion = normalizeVisualRegion(raw.visualRegion);
        if (paginaCatalogo) specs.push({ label: "Página do catálogo", value: String(paginaCatalogo) });
        specs.push({ label: "Fonte visual", value: catalog.originalname });
        specs.push({ label: "Fonte de preço", value: priceTable.originalname });

        const avisos: string[] = [];
        if (!matched) avisos.push("Preço sem correspondência segura na tabela; revisar vínculo.");
        else if (matched.score < 0.85) avisos.push("Correspondência provável; revisar antes de confirmar.");
        if (duplicate) avisos.push(`Produto já existente no catálogo: ${duplicate.nome}.`);

        return {
          nome,
          sku,
          categoria,
          precoBase: nullablePositiveNumber(price.precoBase),
          unidade: String(price.unidade ?? raw.unidade ?? "un").trim() || "un",
          descricao: String(raw.descricao ?? "").trim() || null,
          marca: String(catalogParsed.fabricante ?? "").trim() || null,
          fornecedor: String(catalogParsed.fabricante ?? "").trim() || null,
          cor,
          colecao,
          imagemUrl: null,
          visualRegion,
          paginaCatalogo,
          tipoCalculo: String(price.tipoCalculo ?? raw.tipoCalculo ?? "").trim() || null,
          fechamentoPacote: nullablePositiveNumber(price.fechamentoPacote ?? raw.fechamentoPacote),
          quantidadePacote: nullablePositiveInteger(price.quantidadePacote ?? raw.quantidadePacote),
          precoPacote: nullablePositiveNumber(price.precoPacote),
          embalagemMestreQuantidade: nullablePositiveInteger(price.embalagemMestreQuantidade),
          quantidadeMinimaVenda: nullablePositiveInteger(price.quantidadeMinimaVenda),
          multiploVenda: nullablePositiveInteger(price.multiploVenda),
          permiteFracionarEmbalagemMestre: price.permiteFracionarEmbalagemMestre === true,
          especificacoes: specs,
          confianca: Number(raw.confianca ?? 0.7),
          avisos,
          duplicate: duplicate ? { id: duplicate.id, nome: duplicate.nome, sku: duplicate.sku } : null,
          priceMatch: matched ? {
            score: Number(matched.score.toFixed(3)),
            sourceName: String(price.nome ?? "").trim() || null,
            sourceSku: String(price.sku ?? "").trim() || null,
            reason: matched.reason,
          } : null,
        };
      }).filter((p: CatalogPriceMatchRow) => p.nome);

      for (const product of products) {
        product.imagemUrl = await extractCatalogVisual(
          catalog.buffer,
          tenantId,
          product.paginaCatalogo,
          product.visualRegion,
          product.sku || product.nome,
        );
        if (!product.imagemUrl && product.paginaCatalogo && product.visualRegion) {
          product.avisos.push("Referência visual localizada no catálogo, mas o recorte automático não ficou disponível neste ambiente; a página de origem foi preservada.");
        }
      }

      const importable = products.filter((p) => p.precoBase != null && !p.duplicate && (p.priceMatch?.score ?? 0) >= 0.58);
      const header = [
        "nome","sku","categoria","preco_base","unidade","descricao","marca","fornecedor","cor","colecao",
        "tipo_calculo","fechamento_pacote","quantidade_pacote","preco_pacote",
        "embalagem_mestre_quantidade","quantidade_minima_venda","multiplo_venda",
        "permite_fracionar_embalagem_mestre","imagem_url","especificacoes"
      ];
      const rows = importable.map((p) => [
        p.nome,p.sku ?? "",p.categoria,p.precoBase!.toFixed(2),p.unidade,p.descricao ?? "",p.marca ?? "",p.fornecedor ?? "",
        p.cor ?? "",p.colecao ?? "",p.tipoCalculo ?? "",p.fechamentoPacote ?? "",p.quantidadePacote ?? "",p.precoPacote ?? "",
        p.embalagemMestreQuantidade ?? "",p.quantidadeMinimaVenda ?? "",p.multiploVenda ?? "",
        p.permiteFracionarEmbalagemMestre ? "sim" : "nao",
        p.imagemUrl ?? "",
        p.especificacoes.map((s) => `${s.label}:${s.value}`).join(";"),
      ].map(csvEscape).join(","));

      res.json({
        catalogFileName: catalog.originalname,
        priceTableFileName: priceTable.originalname,
        fabricante: catalogParsed.fabricante ?? null,
        tabela: priceParsed.tabela ?? null,
        vigencia: priceParsed.vigencia ?? null,
        products,
        importableCount: importable.length,
        updateableCount: products.filter((p) => p.precoBase != null && p.duplicate && (p.priceMatch?.score ?? 0) >= 0.58).length,
        exactOrHighConfidenceCount: products.filter((p) => (p.priceMatch?.score ?? 0) >= 0.85).length,
        reviewCount: products.filter((p) => !p.priceMatch || (p.priceMatch.score < 0.85)).length,
        duplicateCount: products.filter((p) => p.duplicate).length,
        csv: [header.join(","), ...rows].join("\n"),
        sourceFiles: {
          catalogOriginalUrl: catalogSourceUrl,
          priceTableOriginalUrl: priceTableSourceUrl,
        },
        visualSource: {
          strategy: "catalog_crop_with_page_fallback",
          extractedCount: products.filter((p) => Boolean(p.imagemUrl)).length,
          referencedCount: products.filter((p) => Boolean(p.paginaCatalogo)).length,
          note: "Quando a página e a região visual são identificadas, o sistema tenta recortar a imagem real do PDF e salva no storage. Se o runtime não suportar rasterização PDF, mantém a página de origem sem gerar imagem sintética.",
        },
      });
    } catch (error: any) {
      req.log?.error?.({ err: error, tenantId }, "catalog-price-preview failed");
      return res.status(502).json({ error: error?.message || "Falha ao compatibilizar catálogo e tabela de preços." });
    }
  },
);

const importBodySchema = z.object({ csv: z.string().min(1) });

router.post("/tenants/:tenantId/produtos-catalogo/import", async (req, res) => {
  const tenantId = routeTenantId(req);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = importBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.data });
    return;
  }

  const lines = parsed.data.csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    res.status(422).json({ error: "CSV deve ter cabeçalho + ao menos uma linha de dados" });
    return;
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);
  // Required: nome + preco_base (accept precobase / preco_base / preco base)
  const idx = (aliases: string[]) => {
    for (const a of aliases) { const i = headers.indexOf(a); if (i >= 0) return i; }
    return -1;
  };
  const iNome      = idx(["nome", "name", "produto", "descricao_produto"]);
  const iPreco     = idx(["preco_base", "preco_final_r", "preco_final", "precobase", "preco", "price", "valor"]);
  const iCusto     = idx(["custo", "custo_r", "custo_fornecedor", "cost"]);
  const iMargem    = idx(["margem_percentual", "margem", "markup"]);
  const iFrete     = idx(["frete_percentual", "frete"]);
  const iComissao  = idx(["comissao_percentual", "comissao"]);
  const iFinanceiro = idx(["custo_financeiro_percentual", "custo_financeiro", "financeiro"]);
  const iRendimento = idx(["rendimento_por_unidade", "rendimento_m2", "rendimento"]);
  const iUnidadeRendimento = idx(["unidade_rendimento", "unidade_do_rendimento"]);
  const iFornecedor = idx(["fornecedor", "supplier"]);
  const iPrazoEntrega = idx(["prazo_entrega_dias", "prazo_entrega", "lead_time"]);
  const iControlaEstoque = idx(["controla_estoque", "estoque_controlado"]);
  const iSku       = idx(["sku", "codigo", "referencia", "ref"]);
  const iCategoria = idx(["categoria", "category", "grupo", "tipo"]);
  const iUnidade   = idx(["unidade", "unidade_vendida", "un", "unit"]);
  const iDesc      = idx(["descricao", "description", "obs", "observacao"]);
  const iImagem    = idx(["imagem_url", "imagem", "image", "image_url", "foto", "url_imagem"]);
  const iMarca         = idx(["marca", "brand"]);
  const iImagens       = idx(["imagens", "images", "fotos", "galeria"]);
  const iVideo          = idx(["video_url", "video", "url_video"]);
  const iEspecificacoes = idx(["especificacoes", "atributos", "specs", "ficha_tecnica"]);
  // Cálculo por m² (teto vinílico / revestimento) — colunas opcionais.
  const iTipoCalculo      = idx(["tipo_calculo", "tipocalculo", "tipo_de_calculo", "calculo"]);
  const iColecao          = idx(["colecao", "coleção", "collection"]);
  const iCor              = idx(["cor", "color"]);
  const iFechamentoPacote = idx(["fechamento_pacote", "rendimento_pacote", "rendimento", "m2_por_pacote", "m_por_pacote"]);
  const iQuantidadePacote = idx(["quantidade_pacote", "pecas_por_pacote", "qtd_pacote"]);
  const iPrecoPacote      = idx(["preco_pacote", "preco_do_pacote", "valor_pacote"]);
  const iLarguraPecaM     = idx(["largura_peca_m", "largura_peca", "largura_m"]);
  const iEmbalagemMestre  = idx(["embalagem_mestre_quantidade", "embalagem_mestre", "pacotes_por_embalagem_mestre", "qtd_embalagem_mestre"]);
  const iQuantidadeMinima = idx(["quantidade_minima_venda", "minimo_venda", "qtd_minima", "moq"]);
  const iMultiploVenda    = idx(["multiplo_venda", "multiplo_pedido", "order_multiple"]);
  const iFracionaMestre   = idx(["permite_fracionar_embalagem_mestre", "fraciona_embalagem_mestre", "permite_fracionar"]);

  if (iNome < 0 || (iPreco < 0 && iCusto < 0) || iCategoria < 0) {
    res.status(422).json({ error: `Colunas obrigatórias não encontradas. Necessário: 'nome', 'categoria' e 'custo' ou 'preco_base'. Encontrado: ${headers.join(", ")}` });
    return;
  }

  // Categories arrive as free-text in the CSV (e.g. "Materiais elétricos") — resolve to
  // categoriaId, creating the category (with 0% discount ceiling) if it doesn't exist yet.
  const existingCategorias = await db
    .select({ id: categoriasProdutoTable.id, nome: categoriasProdutoTable.nome })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, tenantId));
  const categoriaByNome = new Map(existingCategorias.map((c) => [c.nome.trim().toLowerCase(), c.id]));

  async function resolveCategoriaId(nomeCategoria: string | null): Promise<string | null> {
    if (!nomeCategoria) return null;
    const key = nomeCategoria.trim().toLowerCase();
    const existing = categoriaByNome.get(key);
    if (existing) return existing;
    const [created] = await db
      .insert(categoriasProdutoTable)
      .values({ tenantId, nome: nomeCategoria.trim() })
      .returning({ id: categoriasProdutoTable.id });
    categoriaByNome.set(key, created.id);
    return created.id;
  }

  // "https://a.jpg|https://b.jpg" -> ["https://a.jpg", "https://b.jpg"]
  function parseImagensCell(raw: string | undefined): string[] | null {
    if (!raw?.trim()) return null;
    const urls = raw.split("|").map((u) => u.trim()).filter(Boolean);
    return urls.length > 0 ? urls : null;
  }

  // "Marca:Genérica;Cor:Branco" -> [{label:"Marca",value:"Genérica"}, {label:"Cor",value:"Branco"}]
  function parseEspecificacoesCell(raw: string | undefined): { label: string; value: string }[] | null {
    if (!raw?.trim()) return null;
    const pairs = raw
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [label, ...rest] = p.split(":");
        return { label: label?.trim() ?? "", value: rest.join(":").trim() };
      })
      .filter((p) => {
        if (!p.label || !p.value) return false;
        const normalizedLabel = p.label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
        return normalizedLabel !== "margem" && !normalizedLabel.startsWith("regra de preco");
      });
    return pairs.length > 0 ? pairs : null;
  }

  const TIPOS_CALCULO_VALIDOS = new Set([
    "area_simples",
    "area_com_acabamento_perimetro",
    "acabamento_perimetro",
    "linear",
    "peca_avulsa",
  ]);

  function parseTipoCalculoCell(raw: string | undefined): string | null {
    if (!raw?.trim()) return null;
    const key = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    return TIPOS_CALCULO_VALIDOS.has(key) ? key : null;
  }

  function parseDecimalCell(raw: string | undefined): number | null {
    if (!raw?.trim()) return null;
    let value = raw.trim().replace(/R\$/gi, "").replace(/\s|%/g, "");
    if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseIntCell(raw: string | undefined): number | null {
    if (!raw?.trim()) return null;
    const n = parseInt(raw.trim(), 10);
    return isNaN(n) ? null : n;
  }

  const errors: { row: number; message: string }[] = [];
  const toInsert: typeof produtosCatalogoTable.$inferInsert[] = [];
  const normalizedCategories = new Map<string, { official: string; rows: number }>();

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = parseCsvLine(lines[i]);
    const nome = cols[iNome]?.trim() ?? "";
    const precoRaw = iPreco >= 0 ? (cols[iPreco]?.trim().replace(",", ".") ?? "") : "";
    const custo = iCusto >= 0 ? parseDecimalCell(cols[iCusto]) : null;
    const margem = iMargem >= 0 ? (parseDecimalCell(cols[iMargem]) ?? 0) : 0;
    const frete = iFrete >= 0 ? (parseDecimalCell(cols[iFrete]) ?? 0) : 0;
    const comissao = iComissao >= 0 ? (parseDecimalCell(cols[iComissao]) ?? 0) : 0;
    const financeiro = iFinanceiro >= 0 ? (parseDecimalCell(cols[iFinanceiro]) ?? 0) : 0;

    if (!nome) { errors.push({ row: rowNum, message: "Nome vazio" }); continue; }

    const precoInformado = parseDecimalCell(precoRaw) ?? Number.NaN;
    const preco = custo != null
      ? custo * (1 + (margem + frete + comissao + financeiro) / 100)
      : precoInformado;
    if (!Number.isFinite(preco) || preco < 0) {
      errors.push({ row: rowNum, message: "Informe um custo válido ou um preço base válido" }); continue;
    }

    const imagemUrl = iImagem >= 0 ? (cols[iImagem]?.trim() || null) : null;
    const categoriaInformada = iCategoria >= 0 ? (cols[iCategoria]?.trim() || null) : null;
    if (!categoriaInformada) {
      errors.push({ row: rowNum, message: "Categoria vazia" });
      continue;
    }
    const categoriaNome = findOfficialItemCategory(categoriaInformada);
    if (!categoriaNome) {
      const sugestao = ITEM_CATEGORIES
        .map((nome) => ({ nome, score: categoryNameSimilarity(categoriaInformada, nome) }))
        .sort((a, b) => b.score - a.score)[0];
      const dica = sugestao && sugestao.score > 0.15 ? ` Você quis dizer "${sugestao.nome}"?` : "";
      errors.push({ row: rowNum, message: `Categoria fora do padrão oficial: "${categoriaInformada}".${dica}` });
      continue;
    }
    if (categoriaInformada !== categoriaNome) {
      const current = normalizedCategories.get(categoriaInformada);
      normalizedCategories.set(categoriaInformada, {
        official: categoriaNome,
        rows: (current?.rows ?? 0) + 1,
      });
    }
    const categoriaId = await resolveCategoriaId(categoriaNome);

    toInsert.push({
      tenantId,
      nome,
      sku:        iSku     >= 0 ? (cols[iSku]?.trim()     || null) : null,
      categoriaId,
      unidade:    iUnidade >= 0 ? (cols[iUnidade]?.trim() || "un") : "un",
      descricao:  iDesc    >= 0 ? (cols[iDesc]?.trim()    || null) : null,
      imagemUrl,
      marca:          iMarca         >= 0 ? (cols[iMarca]?.trim() || null) : null,
      imagens:        iImagens       >= 0 ? parseImagensCell(cols[iImagens]) : null,
      videoUrl:       iVideo          >= 0 ? (cols[iVideo]?.trim() || null) : null,
      especificacoes: iEspecificacoes >= 0 ? parseEspecificacoesCell(cols[iEspecificacoes]) : null,
      precoBase: preco.toFixed(2),
      custoFornecedor: custo?.toFixed(2) ?? null,
      margemPercentual: custo != null ? margem.toFixed(2) : null,
      fretePercentual: custo != null ? frete.toFixed(2) : null,
      comissaoPercentual: custo != null ? comissao.toFixed(2) : null,
      custoFinanceiroPercentual: custo != null ? financeiro.toFixed(2) : null,
      rendimentoPorUnidade: iRendimento >= 0 ? parseDecimalCell(cols[iRendimento])?.toFixed(3) ?? null : null,
      unidadeRendimento: iUnidadeRendimento >= 0 ? (cols[iUnidadeRendimento]?.trim() || null) : null,
      fornecedor: iFornecedor >= 0 ? (cols[iFornecedor]?.trim() || null) : null,
      prazoEntregaDias: iPrazoEntrega >= 0 ? parseIntCell(cols[iPrazoEntrega]) : null,
      controlaEstoque: iControlaEstoque >= 0
        ? ["sim", "true", "1"].includes((cols[iControlaEstoque] ?? "").trim().toLowerCase())
        : false,
      estoqueQuantidade: null,
      ativo: true,
      tipoCalculo:      iTipoCalculo      >= 0 ? parseTipoCalculoCell(cols[iTipoCalculo]) : null,
      colecao:          iColecao          >= 0 ? (cols[iColecao]?.trim() || null) : null,
      cor:              iCor              >= 0 ? (cols[iCor]?.trim() || null) : null,
      fechamentoPacote: iFechamentoPacote >= 0 ? parseDecimalCell(cols[iFechamentoPacote])?.toFixed(2) ?? null : null,
      quantidadePacote: iQuantidadePacote >= 0 ? parseIntCell(cols[iQuantidadePacote]) : null,
      precoPacote:      iPrecoPacote      >= 0 ? parseDecimalCell(cols[iPrecoPacote])?.toFixed(2) ?? null : null,
      larguraPecaM:     iLarguraPecaM     >= 0 ? parseDecimalCell(cols[iLarguraPecaM])?.toFixed(2) ?? null : null,
      embalagemMestreQuantidade: iEmbalagemMestre >= 0 ? parseIntCell(cols[iEmbalagemMestre]) : null,
      quantidadeMinimaVenda: iQuantidadeMinima >= 0 ? parseIntCell(cols[iQuantidadeMinima]) : null,
      multiploVenda: iMultiploVenda >= 0 ? parseIntCell(cols[iMultiploVenda]) : null,
      permiteFracionarEmbalagemMestre: iFracionaMestre >= 0
        ? ["sim", "true", "1", "yes"].includes((cols[iFracionaMestre] ?? "").trim().toLowerCase())
        : false,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(produtosCatalogoTable).values(toInsert);
  }

  res.json({
    imported: toInsert.length,
    errors,
    normalizedCategories: Array.from(normalizedCategories, ([received, value]) => ({
      received,
      official: value.official,
      rows: value.rows,
    })),
  });
});

// ── Promoções configuráveis ───────────────────────────────────────────────
const promocaoBodySchema = z.object({
  precoPromocional: z.union([z.string(), z.number()]).transform((v) => String(v)),
  ativaAte: z.string().datetime().or(z.string().min(1)), // aceita ISO ou data simples
});

// ── Gera uma imagem do produto via IA (DALL-E/gpt-image-1 pelo gateway já
// existente) -- prompt montado a partir de nome/descrição/categoria do
// produto. Baixa o resultado (URL temporária da OpenAI) e salva no nosso
// próprio storage, pra não depender de um link que expira.
const gerarImagemIaSchema = z.object({
  nome: z.string().optional(),
  descricao: z.string().optional(),
  categoriaNome: z.string().optional(),
  prompt: z.string().max(1200).optional(),
}).refine(
  (data) => Boolean(data.nome?.trim() || data.prompt?.trim()),
  { message: "Informe o nome do produto ou descreva a imagem que deseja gerar." },
);

router.post("/tenants/:tenantId/produtos-catalogo/gerar-imagem-ia", async (req, res) => {
  const parsed = gerarImagemIaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const tenantId = routeTenantId(req);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const { nome, descricao, categoriaNome, prompt: promptManual } = parsed.data;

  const promptParts = [
    promptManual?.trim()
      ? `Crie uma fotografia comercial profissional deste produto seguindo esta direção: ${promptManual.trim()}.`
      : `Fotografia de produto profissional, fundo neutro claro, iluminação de estúdio, foco nítido: ${nome?.trim() || "produto"}.`,
  ];
  if (categoriaNome) promptParts.push(`Categoria: ${categoriaNome}.`);
  if (descricao) promptParts.push(descricao.slice(0, 300));
  promptParts.push("Sem texto, sem marca d'água, sem logotipo.");
  const prompt = promptParts.join(" ");

  try {
    const { urls } = await generateImage(tenantId, "image_generator", prompt, {
      model: "gpt-image-1",
      size: "1024x1024",
      n: 1,
      log: req.log,
    });
    const openaiUrl = urls[0];
    if (!openaiUrl) {
      res.status(502).json({ error: "IA não retornou nenhuma imagem" });
      return;
    }
    // Baixa e salva no nosso storage -- a URL da OpenAI expira.
    const imgRes = await fetch(openaiUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") ?? "image/png";
    const objectPath = await objectStorage.savePrivateBuffer(buffer, contentType, `produto-ia-${Date.now()}.png`, tenantId);
    const baseOrigin = `${req.protocol}://${req.get("host")}`;
    res.json({ imagemUrl: `${baseOrigin}/api/storage${objectPath}` });
  } catch (err) {
    req.log.error({ err, tenantId }, "produtos-catalogo: falha ao gerar imagem via IA");
    const message = err instanceof Error ? err.message : "Falha ao gerar imagem";
    res.status(502).json({ error: message });
  }
});

router.post("/produtos-catalogo/:id/promocao", async (req, res) => {
  const parsed = promocaoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId, precoBase: produtosCatalogoTable.precoBase })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (Number(parsed.data.precoPromocional) >= Number(existing.precoBase)) {
    res.status(422).json({ error: "Preço promocional precisa ser menor que o preço base." });
    return;
  }

  const [product] = await db
    .update(produtosCatalogoTable)
    .set({
      precoPromocional: parsed.data.precoPromocional,
      promocaoAtivaAte: new Date(parsed.data.ativaAte),
      updatedAt: new Date(),
    })
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  res.json(product);
});

router.delete("/produtos-catalogo/:id/promocao", async (req, res) => {
  const [existing] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [product] = await db
    .update(produtosCatalogoTable)
    .set({ precoPromocional: null, promocaoAtivaAte: null, updatedAt: new Date() })
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  res.json(product);
});

// ── Pergunta de produto respondida por IA (chamado pelo Praça.ai) ──────────
const perguntaProdutoBodySchema = z.object({ pergunta: z.string().min(1).max(1000) });

const PRODUTO_QA_SYSTEM_PROMPT = `Você responde perguntas de clientes sobre um produto específico, no
contexto de um marketplace (Praça.ai). Use APENAS as informações do produto
fornecidas — nunca invente característica, preço, prazo ou disponibilidade que
não esteja nos dados. Se a pergunta não puder ser respondida com o que foi
fornecido, diga isso claramente e sugira que o cliente use o chat direto com
o vendedor para tirar a dúvida. Responda em português brasileiro, direto e
em no máximo 3 frases — sem saudação, sem se apresentar, só a resposta.`;

router.post("/produtos-catalogo/:id/responder-pergunta", async (req, res) => {
  const parsed = perguntaProdutoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const contexto = [
    `Nome: ${product.nome}`,
    product.descricaoLonga ? `Descrição: ${product.descricaoLonga}` : product.descricao ? `Descrição: ${product.descricao}` : null,
    product.marca ? `Marca: ${product.marca}` : null,
    `Preço: R$ ${product.precoBase}`,
    product.precoPromocional ? `Preço promocional ativo: R$ ${product.precoPromocional}` : null,
    product.unidade ? `Unidade de venda: ${product.unidade}` : null,
    product.peso ? `Peso: ${product.peso}kg` : null,
  ].filter(Boolean).join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: PRODUTO_QA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Dados do produto:\n${contexto}\n\nPergunta do cliente: ${parsed.data.pergunta}` }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const resposta = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;

    if (!resposta) {
      res.status(502).json({ error: "IA não retornou resposta de texto." });
      return;
    }

    res.json({ resposta });
  } catch (err) {
    console.error("[produtos_catalogo] erro ao responder pergunta via IA:", err);
    res.status(500).json({ error: "Não foi possível gerar a resposta agora." });
  }
});

router.delete("/produtos-catalogo/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Delete inventory items first (FK restrict → cascade in DB not yet applied)
  await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.produtoId, existing.id));
  await db.delete(produtosCatalogoTable).where(eq(produtosCatalogoTable.id, existing.id));

  res.status(204).send();
});

export default router;
