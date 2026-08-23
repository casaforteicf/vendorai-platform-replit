import { Router, type IRouter } from "express";
import { and, eq, lte, desc, ilike } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  inventoryMovementsTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  tenantsTable,
  insertInventoryItemSchema,
  updateInventoryItemSchema,
  insertInventoryMovementSchema,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { z } from "zod/v4";

// ─── Enriquecimento de produto novo via IA (auto-cadastro do sync de ERP) ──────
// O ERP manda só o básico (sku, nome, quantidade, preço opcional). A IA
// preenche o que dá pra inferir só a partir do nome (categoria, descrição,
// unidade, tags de busca). Campos que ela genuinamente não pode inventar
// (foto real, spec técnica não implícita no nome) viram aviso em vez de
// dado inventado. Roda em background (fire-and-forget) — não bloqueia a
// resposta do sync pro ERP, que pode estar mandando até 500 itens de uma vez.
async function resolveCategoriaIdPorNome(tenantId: string, nomeCategoria: string): Promise<string | null> {
  const nome = nomeCategoria.trim();
  if (!nome) return null;
  const [existing] = await db
    .select({ id: categoriasProdutoTable.id })
    .from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.tenantId, tenantId), ilike(categoriasProdutoTable.nome, nome)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(categoriasProdutoTable)
    .values({ tenantId, nome })
    .returning({ id: categoriasProdutoTable.id });
  return created?.id ?? null;
}

const ENRICHMENT_SYSTEM_PROMPT = `Você enriquece o cadastro de um produto novo que acabou de chegar via
sincronização automática de um ERP externo, sabendo só o nome (e às vezes
preço). Responda APENAS com um objeto JSON válido, sem markdown, sem texto
antes ou depois, no formato exato:
{
  "categoria": string ou null,
  "descricao": string ou null (1 frase curta, objetiva),
  "unidade": string ou null (ex: "un", "m²", "kg", "cx"),
  "tags": string[] (3 a 6 termos de busca relevantes, minúsculas),
  "avisos": string[] (o que NÃO dá pra inferir com segurança pelo nome —
    ex: "precisa de foto real do produto", "confirmar especificação técnica
    exata" — só inclua se genuinamente necessário, senão deixe vazio)
}
NUNCA invente característica técnica específica (voltagem, medida exata,
composição) que não esteja implícita no nome — para isso, use "avisos" em
vez de chutar um valor.`;

async function enriquecerProdutoViaIA(produtoId: string, tenantId: string, nome: string): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: ENRICHMENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Nome do produto: ${nome}` }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
    if (!raw) return;

    const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();
    let parsed: { categoria?: string | null; descricao?: string | null; unidade?: string | null; tags?: string[]; avisos?: string[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[inventory] IA retornou JSON inválido no enriquecimento:", raw.slice(0, 200));
      return;
    }

    const categoriaId = parsed.categoria ? await resolveCategoriaIdPorNome(tenantId, parsed.categoria) : null;

    await db
      .update(produtosCatalogoTable)
      .set({
        categoriaId: categoriaId ?? undefined,
        descricao: parsed.descricao || undefined,
        unidade: parsed.unidade || undefined,
        tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : undefined,
        avisosRevisao: Array.isArray(parsed.avisos) && parsed.avisos.length > 0 ? parsed.avisos : null,
        updatedAt: new Date(),
      })
      .where(eq(produtosCatalogoTable.id, produtoId));
  } catch (err) {
    console.error("[inventory] erro no enriquecimento via IA:", err);
    // Best-effort: produto continua em pendente_revisao, sem dados extras.
    // Lojista revisa manualmente — não trava o fluxo de sync do ERP.
  }
}

const router: IRouter = Router();

// Separate router for the sync endpoint — registered BEFORE the authenticate
// middleware so that API-key callers (n8n, ERPs) don't need a JWT.
export const inventorySyncRouter: IRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function userTenantId(req: Express.Request) {
  return (req as any).user?.tenantId as string | undefined;
}

function canAccessTenant(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || userTenantId(req) === tenantId;
}

// ─── ERP Sync (API key auth) ──────────────────────────────────────────────────

const syncBodySchema = z.object({
  items: z
    .array(
      z.object({
        sku:        z.string().min(1),
        nome:       z.string().optional(),
        quantidade: z.number().nonnegative(),
        preco:      z.number().positive().optional(),
      }),
    )
    .min(1)
    .max(500),
});

// POST /tenants/:tenantId/inventory/sync
// Accepts x-api-key header (tenant apiKeyEstoque) OR regular JWT.
// External callers (n8n, ERPs) use the API key.
// Registered on inventorySyncRouter (before authenticate middleware).
inventorySyncRouter.post("/tenants/:tenantId/inventory/sync", async (req, res) => {
  const { tenantId } = req.params;

  // ── Auth: JWT (already set by authenticate middleware) OR API key ──────────
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const jwtUser = (req as any).user as { platformRole?: string; tenantId?: string } | undefined;

  if (!jwtUser && !apiKey) {
    res.status(401).json({ error: "Authentication required (Bearer token or x-api-key)" });
    return;
  }

  if (apiKey) {
    const [tenant] = await db
      .select({ id: tenantsTable.id, apiKeyEstoque: tenantsTable.apiKeyEstoque })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    if (!tenant.apiKeyEstoque || tenant.apiKeyEstoque !== apiKey) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }
  } else {
    // JWT path — check tenant access
    if (jwtUser?.platformRole !== "super_admin" && jwtUser?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }
  }

  const parsed = syncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { items } = parsed.data;
  let upserted = 0;
  let skipped = 0;
  const errors: Array<{ sku: string; error: string }> = [];
  const results: Array<{ sku: string; status: "updated" | "created_pending_review" | "skipped_no_name" }> = [];

  for (const item of items) {
    try {
      // Find existing inventory item by SKU (via produto with matching SKU)
      const [existing] = await db
        .select({
          id: inventoryItemsTable.id,
          produtoId: inventoryItemsTable.produtoId,
        })
        .from(inventoryItemsTable)
        .innerJoin(produtosCatalogoTable, eq(produtosCatalogoTable.id, inventoryItemsTable.produtoId))
        .where(
          and(
            eq(inventoryItemsTable.tenantId, tenantId),
            eq(produtosCatalogoTable.sku, item.sku),
          ),
        )
        .limit(1);

      if (existing) {
        // SKU já existente: atualização automática, sem aprovação — sem mudança de comportamento.
        await db
          .update(inventoryItemsTable)
          .set({ quantidadeAtual: String(item.quantidade), updatedAt: new Date() })
          .where(eq(inventoryItemsTable.id, existing.id));

        if (item.preco !== undefined) {
          await db
            .update(produtosCatalogoTable)
            .set({ precoBase: String(item.preco.toFixed(2)), updatedAt: new Date() })
            .where(eq(produtosCatalogoTable.id, existing.produtoId));
        }

        upserted++;
        results.push({ sku: item.sku, status: "updated" });
        continue;
      }

      // SKU não existe ainda no catálogo — nome é obrigatório pra criar,
      // senão o item é ignorado (não cria produto incompleto).
      let [produto] = await db
        .select()
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            eq(produtosCatalogoTable.sku, item.sku),
          ),
        )
        .limit(1);

      if (!produto) {
        if (!item.nome) {
          skipped++;
          results.push({ sku: item.sku, status: "skipped_no_name" });
          continue;
        }

        [produto] = await db
          .insert(produtosCatalogoTable)
          .values({
            tenantId,
            nome: item.nome,
            sku: item.sku,
            precoBase: item.preco != null ? String(item.preco.toFixed(2)) : "0.00",
            unidade: "un",
            // Auto-cadastro: entra pendente de revisão e invisível em
            // site/feed/anúncio (ativo=false) até o lojista aprovar.
            // A IA completa o que der pra inferir do nome em background.
            ativo: false,
            statusRevisao: "pendente_revisao",
          })
          .returning();

        void enriquecerProdutoViaIA(produto.id, tenantId, produto.nome);
      }

      await db.insert(inventoryItemsTable).values({
        tenantId,
        produtoId: produto.id,
        quantidadeAtual: String(item.quantidade),
        quantidadeMinima: "0",
        unidade: "un",
      });

      upserted++;
      results.push({ sku: item.sku, status: "created_pending_review" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      errors.push({ sku: item.sku, error: msg });
      skipped++;
    }
  }

  res.json({ upserted, skipped, errors, results });
});

// ─── Inventory Items ─────────────────────────────────────────────────────────

// POST /inventory-items
router.post("/inventory-items", async (req, res) => {
  const parsed = insertInventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (!canAccessTenant(req, parsed.data.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [item] = await db
    .insert(inventoryItemsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(item);
});

// GET /tenants/:tenantId/inventory-items
router.get("/tenants/:tenantId/inventory-items", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.tenantId, tenantId))
    .orderBy(inventoryItemsTable.createdAt);

  res.json(items);
});

// ─── CSV Import ──────────────────────────────────────────────────────────────

const importRowSchema = z.object({
  nome:             z.string().min(1),
  sku:              z.string().optional().nullable(),
  quantidade:       z.string().regex(/^\d+(\.\d+)?$/, "Quantidade inválida"),
  quantidadeMinima: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
  preco:            z.string().optional().nullable(),
  categoria:        z.string().optional().nullable(),
  unidade:          z.string().optional().nullable(),
  localizacao:      z.string().optional().nullable(),
});

const importBodySchema = z.object({
  rows: z.array(importRowSchema).min(1).max(1000),
});

// POST /tenants/:tenantId/inventory-items/import
// NOTE: declared before /:id to avoid route shadowing
router.post("/tenants/:tenantId/inventory-items/import", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = importBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { rows } = parsed.data;
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; nome: string; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nomeLower = row.nome.trim();

      // Find or create product in catalogue
      let [produto] = await db
        .select()
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, tenantId),
            ilike(produtosCatalogoTable.nome, nomeLower)
          )
        )
        .limit(1);

      if (!produto) {
        const precoBase = row.preco
          ? String(parseFloat(row.preco.replace(",", ".")).toFixed(2))
          : "0.00";

        let categoriaId: string | null = null;
        if (row.categoria) {
          const categoriaNome = row.categoria.trim();
          const [existingCategoria] = await db
            .select({ id: categoriasProdutoTable.id })
            .from(categoriasProdutoTable)
            .where(
              and(
                eq(categoriasProdutoTable.tenantId, tenantId),
                ilike(categoriasProdutoTable.nome, categoriaNome)
              )
            )
            .limit(1);
          if (existingCategoria) {
            categoriaId = existingCategoria.id;
          } else {
            const [created] = await db
              .insert(categoriasProdutoTable)
              .values({ tenantId, nome: categoriaNome })
              .returning({ id: categoriasProdutoTable.id });
            categoriaId = created.id;
          }
        }

        [produto] = await db
          .insert(produtosCatalogoTable)
          .values({
            tenantId,
            nome: row.nome.trim(),
            categoriaId,
            precoBase,
            unidade: row.unidade ?? "un",
          })
          .returning();
      }

      // Check if item already exists for this product
      const [existing] = await db
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.tenantId, tenantId),
            eq(inventoryItemsTable.produtoId, produto.id)
          )
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(inventoryItemsTable).values({
        tenantId,
        produtoId: produto.id,
        quantidadeAtual:  row.quantidade,
        quantidadeMinima: row.quantidadeMinima ?? "0",
        unidade:          row.unidade ?? "un",
        localizacao:      row.localizacao ?? null,
      });

      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      errors.push({ row: i + 1, nome: row.nome, error: msg });
    }
  }

  res.json({ imported, skipped, errors });
});

// GET /tenants/:tenantId/inventory-items/low-stock
// NOTE: must be declared before /:id to avoid route shadowing
router.get("/tenants/:tenantId/inventory-items/low-stock", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // quantidadeAtual <= quantidadeMinima (both stored as numeric strings)
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.tenantId, tenantId),
        lte(inventoryItemsTable.quantidadeAtual, inventoryItemsTable.quantidadeMinima)
      )
    )
    .orderBy(inventoryItemsTable.quantidadeAtual);

  res.json(items);
});

// GET /inventory-items/:id
router.get("/inventory-items/:id", async (req, res) => {
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, String(req.params.id)));

  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  if (!canAccessTenant(req, item.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(item);
});

// PATCH /inventory-items/:id
router.patch("/inventory-items/:id", async (req, res) => {
  const parsed = updateInventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [updated] = await db
    .update(inventoryItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(inventoryItemsTable.id, existing.id))
    .returning();

  res.json(updated);
});

// DELETE /inventory-items/:id
router.delete("/inventory-items/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db
    .delete(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, existing.id));

  res.status(204).send();
});

// ─── Movement ────────────────────────────────────────────────────────────────

const movementBodySchema = insertInventoryMovementSchema
  .omit({ tenantId: true, inventoryItemId: true })
  .extend({ forcarNegativo: z.boolean().optional().default(false) });

// POST /tenants/:tenantId/inventory-items/:id/movement
router.post("/tenants/:tenantId/inventory-items/:id/movement", async (req, res) => {
  const { tenantId, id } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = movementBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.id, id),
        eq(inventoryItemsTable.tenantId, tenantId)
      )
    );

  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  const { tipo, quantidade, motivo, referenciaId, responsavelId, forcarNegativo } = parsed.data;

  const qty = parseFloat(quantidade);
  const current = parseFloat(item.quantidadeAtual ?? "0");

  let newQty: number;
  if (tipo === "entrada") {
    newQty = current + qty;
  } else if (tipo === "saida") {
    newQty = current - qty;
    if (newQty < 0 && !forcarNegativo) {
      res.status(409).json({
        error: "Insufficient stock",
        quantidadeAtual: item.quantidadeAtual,
        quantidadeSolicitada: quantidade,
      });
      return;
    }
  } else {
    // ajuste: quantidade can be positive or negative — treat as absolute new value
    // Convention: ajuste sets the stock to the given value directly
    newQty = qty;
  }

  // Persist movement + update item in a single transaction
  const [movement, updatedItem] = await db.transaction(async (tx) => {
    const [mov] = await tx
      .insert(inventoryMovementsTable)
      .values({
        tenantId,
        inventoryItemId: id,
        tipo,
        quantidade,
        motivo,
        referenciaId: referenciaId ?? null,
        responsavelId: responsavelId ?? null,
      })
      .returning();

    const [upd] = await tx
      .update(inventoryItemsTable)
      .set({
        quantidadeAtual: String(newQty),
        updatedAt: new Date(),
      })
      .where(eq(inventoryItemsTable.id, id))
      .returning();

    return [mov, upd] as const;
  });

  res.status(201).json({ movement, item: updatedItem });
});

// ─── Inventory Movements (read) ───────────────────────────────────────────────

// GET /tenants/:tenantId/inventory-movements
router.get("/tenants/:tenantId/inventory-movements", async (req, res) => {
  const { tenantId } = req.params;
  const { inventoryItemId } = req.query;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(inventoryMovementsTable.tenantId, tenantId)];
  if (inventoryItemId && typeof inventoryItemId === "string") {
    conditions.push(eq(inventoryMovementsTable.inventoryItemId, inventoryItemId));
  }

  const movements = await db
    .select()
    .from(inventoryMovementsTable)
    .where(and(...conditions))
    .orderBy(desc(inventoryMovementsTable.createdAt));

  res.json(movements);
});

// GET /inventory-movements/:id
router.get("/inventory-movements/:id", async (req, res) => {
  const [movement] = await db
    .select()
    .from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.id, String(req.params.id)));

  if (!movement) {
    res.status(404).json({ error: "Movement not found" });
    return;
  }

  if (!canAccessTenant(req, movement.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(movement);
});

export default router;
