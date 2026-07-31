import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  db,
  produtosCatalogoTable,
  categoriasProdutoTable,
  insertProdutoCatalogoSchema,
  updateProdutoCatalogoSchema,
  inventoryItemsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── Join helper: attach categoriaNome + categoriaDescontoMaximoPercentual ────
async function attachCategoriaInfo<T extends { categoriaId: string | null }>(
  products: T[]
): Promise<(T & { categoriaNome: string | null; categoriaDescontoMaximoPercentual: string | null })[]> {
  const ids = [...new Set(products.map((p) => p.categoriaId).filter((id): id is string => !!id))];
  if (ids.length === 0) {
    return products.map((p) => ({ ...p, categoriaNome: null, categoriaDescontoMaximoPercentual: null }));
  }

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
}

// ── CSV parser (handles quoted fields) ───────────────────────────────────────
function parseCsvLine(line: string): string[] {
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

function normalizeCsvHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "_");
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

  const [product] = await db
    .insert(produtosCatalogoTable)
    .values(parsed.data as any)
    .returning();
  res.status(201).json(product);
});

router.get("/tenants/:tenantId/produtos-catalogo", async (req, res) => {
  const products = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.tenantId, String(req.params.tenantId)))
    .orderBy(produtosCatalogoTable.nome);
  res.json(await attachCategoriaInfo(products));
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
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  res.json(product);
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
  const { tenantId } = req.params;

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

  const updated = await db
    .update(produtosCatalogoTable)
    .set(updateData as any)
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), inArray(produtosCatalogoTable.id, productIds)))
    .returning({ id: produtosCatalogoTable.id });

  res.json({ atualizados: updated.length });
});


const importBodySchema = z.object({ csv: z.string().min(1) });

router.post("/tenants/:tenantId/produtos-catalogo/import", async (req, res) => {
  const { tenantId } = req.params;

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
  const iPreco     = idx(["preco_base", "precobase", "preco", "price", "valor"]);
  const iSku       = idx(["sku", "codigo", "referencia", "ref"]);
  const iCategoria = idx(["categoria", "category", "grupo", "tipo"]);
  const iUnidade   = idx(["unidade", "un", "unit"]);
  const iDesc      = idx(["descricao", "description", "obs", "observacao"]);
  const iImagem    = idx(["imagem_url", "imagem", "image", "image_url", "foto", "url_imagem"]);
  const iMarca         = idx(["marca", "brand"]);
  const iImagens       = idx(["imagens", "images", "fotos", "galeria"]);
  const iVideo          = idx(["video_url", "video", "url_video"]);
  const iEspecificacoes = idx(["especificacoes", "atributos", "specs", "ficha_tecnica"]);

  if (iNome < 0 || iPreco < 0) {
    res.status(422).json({ error: `Colunas obrigatórias não encontradas. Necessário: 'nome' e 'preco_base'. Encontrado: ${headers.join(", ")}` });
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
      .filter((p) => p.label && p.value);
    return pairs.length > 0 ? pairs : null;
  }

  const errors: { row: number; message: string }[] = [];
  const toInsert: typeof produtosCatalogoTable.$inferInsert[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = parseCsvLine(lines[i]);
    const nome = cols[iNome]?.trim() ?? "";
    const precoRaw = cols[iPreco]?.trim().replace(",", ".") ?? "";

    if (!nome) { errors.push({ row: rowNum, message: "Nome vazio" }); continue; }

    const preco = parseFloat(precoRaw);
    if (isNaN(preco) || preco < 0) {
      errors.push({ row: rowNum, message: `Preço inválido: "${precoRaw}"` }); continue;
    }

    const imagemUrl = iImagem >= 0 ? (cols[iImagem]?.trim() || null) : null;
    const categoriaNome = iCategoria >= 0 ? (cols[iCategoria]?.trim() || null) : null;
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
      ativo: true,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(produtosCatalogoTable).values(toInsert);
  }

  res.json({ imported: toInsert.length, errors });
});

// ── Promoções configuráveis ───────────────────────────────────────────────
const promocaoBodySchema = z.object({
  precoPromocional: z.union([z.string(), z.number()]).transform((v) => String(v)),
  ativaAte: z.string().datetime().or(z.string().min(1)), // aceita ISO ou data simples
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
