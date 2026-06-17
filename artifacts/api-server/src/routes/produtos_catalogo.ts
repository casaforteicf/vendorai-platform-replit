import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  produtosCatalogoTable,
  insertProdutoCatalogoSchema,
  updateProdutoCatalogoSchema,
  inventoryItemsTable,
} from "@workspace/db";

const router: IRouter = Router();

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
    .values(parsed.data)
    .returning();
  res.status(201).json(product);
});

router.get("/tenants/:tenantId/produtos-catalogo", async (req, res) => {
  const products = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.tenantId, String(req.params.tenantId)))
    .orderBy(produtosCatalogoTable.nome);
  res.json(products);
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

  res.json(product);
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
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  res.json(product);
});

// ── POST /tenants/:tenantId/produtos-catalogo/import ─────────────────────────
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

  if (iNome < 0 || iPreco < 0) {
    res.status(422).json({ error: `Colunas obrigatórias não encontradas. Necessário: 'nome' e 'preco_base'. Encontrado: ${headers.join(", ")}` });
    return;
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

    toInsert.push({
      tenantId,
      nome,
      sku:       iSku       >= 0 ? (cols[iSku]?.trim()       || null) : null,
      categoria: iCategoria >= 0 ? (cols[iCategoria]?.trim() || null) : null,
      unidade:   iUnidade   >= 0 ? (cols[iUnidade]?.trim()   || "un") : "un",
      descricao: iDesc      >= 0 ? (cols[iDesc]?.trim()      || null) : null,
      imagemUrl,
      precoBase: preco.toFixed(2),
      ativo: true,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(produtosCatalogoTable).values(toInsert);
  }

  res.json({ imported: toInsert.length, errors });
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
