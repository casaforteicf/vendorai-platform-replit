import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  campaignsTable,
  facebookMarketplaceListingsTable,
  produtosCatalogoTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";

const router: IRouter = Router();

const statusSchema = z.enum([
  "draft",
  "ready",
  "published",
  "paused",
  "sold",
  "renewal_due",
  "failed",
]);

const createDraftSchema = z.object({
  productId: z.string().min(1),
  campaignId: z.string().min(1).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  category: z.string().trim().max(160).optional().nullable(),
  condition: z.string().trim().max(80).optional().default("new"),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
});

const createBulkDraftSchema = createDraftSchema
  .omit({ productId: true })
  .extend({
    productIds: z.array(z.string().min(1)).min(1).max(40),
  });

const updateListingSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(3).max(6000).optional(),
  price: z.union([z.string(), z.number()]).optional(),
  category: z.string().trim().max(160).optional().nullable(),
  condition: z.string().trim().max(80).optional(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  externalUrl: z.string().url().optional().nullable(),
  externalId: z.string().trim().max(240).optional().nullable(),
  status: statusSchema.optional(),
});

function hasTenantAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

export function uniqueMedia(product: {
  imagemUrl?: string | null;
  imagens?: string[] | null;
}, provided?: string[]) {
  const values = [
    ...(provided ?? []),
    product.imagemUrl ?? "",
    ...(Array.isArray(product.imagens) ? product.imagens : []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 10);
}

export function effectivePrice(product: {
  precoBase: string;
  precoPromocional?: string | null;
  promocaoAtivaAte?: Date | null;
}) {
  const promoStillValid =
    product.precoPromocional &&
    (!product.promocaoAtivaAte || new Date(product.promocaoAtivaAte).getTime() >= Date.now());
  return String(promoStillValid ? product.precoPromocional : product.precoBase);
}

export function fallbackDraft(product: {
  nome: string;
  marca?: string | null;
  descricao?: string | null;
  descricaoLonga?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  unidade?: string | null;
}, category?: string | null) {
  const title = [product.nome, product.marca].filter(Boolean).join(" · ").slice(0, 180);
  const details = [
    product.descricaoLonga || product.descricao || "",
    product.cor ? `Cor: ${product.cor}` : "",
    product.tamanho ? `Tamanho: ${product.tamanho}` : "",
    product.unidade ? `Unidade de venda: ${product.unidade}` : "",
    "Consulte disponibilidade, entrega e condições diretamente com o vendedor.",
  ].filter(Boolean);
  return {
    title,
    description: details.join("\n\n").slice(0, 6000),
    category: category || null,
  };
}

async function generateMarketplaceCopy(
  tenantId: string,
  product: {
    nome: string;
    marca?: string | null;
    descricao?: string | null;
    descricaoLonga?: string | null;
    cor?: string | null;
    tamanho?: string | null;
    unidade?: string | null;
    tags?: string[] | null;
  },
  category?: string | null,
) {
  const fallback = fallbackDraft(product, category);
  const prompt = [
    "Crie um anúncio para Facebook Marketplace em português do Brasil.",
    "Objetivo: texto claro, comercial e fiel aos dados do catálogo. Não invente especificações, garantia, estoque, desconto ou entrega.",
    "Retorne SOMENTE JSON válido com as chaves title, description e category.",
    "O title deve ser direto. A description deve destacar aplicação/benefícios apenas quando sustentados pelos dados.",
    `Produto: ${product.nome}`,
    product.marca ? `Marca: ${product.marca}` : "",
    product.descricao ? `Descrição: ${product.descricao}` : "",
    product.descricaoLonga ? `Descrição longa: ${product.descricaoLonga}` : "",
    product.cor ? `Cor: ${product.cor}` : "",
    product.tamanho ? `Tamanho: ${product.tamanho}` : "",
    product.unidade ? `Unidade: ${product.unidade}` : "",
    product.tags?.length ? `Tags: ${product.tags.join(", ")}` : "",
    category ? `Categoria sugerida: ${category}` : "",
  ].filter(Boolean).join("\n");

  try {
    const ai = await callOpenAI(
      tenantId,
      "content_generator",
      [
        { role: "system", content: "Você é o agente de catálogo e canais do VendorAI. Preserve os fatos do produto e nunca invente atributos." },
        { role: "user", content: prompt },
      ],
      {
        temperature: 0.4,
        maxTokens: 700,
        responseFormat: { type: "json_object" },
      },
    );
    const parsed = JSON.parse(ai.content || "{}") as Record<string, unknown>;
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 180) : fallback.title;
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim().slice(0, 6000)
        : fallback.description;
    const generatedCategory =
      typeof parsed.category === "string" && parsed.category.trim()
        ? parsed.category.trim().slice(0, 160)
        : fallback.category;
    return { title, description, category: generatedCategory, generatedBy: "ai" as const };
  } catch {
    return { ...fallback, generatedBy: "fallback" as const };
  }
}

router.get("/tenants/:tenantId/facebook-marketplace/capabilities", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json({
    channel: "facebook_marketplace",
    mode: "assisted",
    directPublishing: false,
    officialConnectorConnected: false,
    connectorContractReady: true,
    reason: "A publicação assistida é o modo padrão enquanto não existir uma API oficial elegível e conectada para a conta do tenant.",
  });
});

router.get("/tenants/:tenantId/facebook-marketplace/listings", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const listings = await db
    .select({
      id: facebookMarketplaceListingsTable.id,
      tenantId: facebookMarketplaceListingsTable.tenantId,
      productId: facebookMarketplaceListingsTable.productId,
      campaignId: facebookMarketplaceListingsTable.campaignId,
      publishMode: facebookMarketplaceListingsTable.publishMode,
      status: facebookMarketplaceListingsTable.status,
      title: facebookMarketplaceListingsTable.title,
      description: facebookMarketplaceListingsTable.description,
      price: facebookMarketplaceListingsTable.price,
      category: facebookMarketplaceListingsTable.category,
      condition: facebookMarketplaceListingsTable.condition,
      city: facebookMarketplaceListingsTable.city,
      state: facebookMarketplaceListingsTable.state,
      mediaUrls: facebookMarketplaceListingsTable.mediaUrls,
      externalId: facebookMarketplaceListingsTable.externalId,
      externalUrl: facebookMarketplaceListingsTable.externalUrl,
      metadata: facebookMarketplaceListingsTable.metadata,
      publishedAt: facebookMarketplaceListingsTable.publishedAt,
      lastRenewedAt: facebookMarketplaceListingsTable.lastRenewedAt,
      nextRenewalAt: facebookMarketplaceListingsTable.nextRenewalAt,
      createdAt: facebookMarketplaceListingsTable.createdAt,
      updatedAt: facebookMarketplaceListingsTable.updatedAt,
      productName: produtosCatalogoTable.nome,
      productImage: produtosCatalogoTable.imagemUrl,
      sku: produtosCatalogoTable.sku,
    })
    .from(facebookMarketplaceListingsTable)
    .innerJoin(
      produtosCatalogoTable,
      eq(produtosCatalogoTable.id, facebookMarketplaceListingsTable.productId),
    )
    .where(eq(facebookMarketplaceListingsTable.tenantId, tenantId))
    .orderBy(desc(facebookMarketplaceListingsTable.updatedAt));

  res.json(listings);
});

router.post("/tenants/:tenantId/facebook-marketplace/drafts", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = createDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(produtosCatalogoTable)
    .where(
      and(
        eq(produtosCatalogoTable.id, parsed.data.productId),
        eq(produtosCatalogoTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Produto não encontrado para esta empresa." });
    return;
  }

  if (parsed.data.campaignId) {
    const [campaign] = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(
        and(
          eq(campaignsTable.id, parsed.data.campaignId),
          eq(campaignsTable.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!campaign) {
      res.status(422).json({ error: "A campanha selecionada não pertence a esta empresa." });
      return;
    }
  }

  const copy = await generateMarketplaceCopy(tenantId, product, parsed.data.category);
  const mediaUrls = uniqueMedia(product, parsed.data.mediaUrls);

  const [listing] = await db
    .insert(facebookMarketplaceListingsTable)
    .values({
      tenantId,
      productId: product.id,
      campaignId: parsed.data.campaignId ?? null,
      publishMode: "assisted",
      status: "draft",
      title: copy.title,
      description: copy.description,
      price: effectivePrice(product),
      category: copy.category,
      condition: parsed.data.condition ?? "new",
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      mediaUrls,
      metadata: {
        generatedBy: copy.generatedBy,
        source: "catalog",
        productSku: product.sku ?? null,
      },
    })
    .returning();

  res.status(201).json(listing);
});


router.post("/tenants/:tenantId/facebook-marketplace/drafts/bulk", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = createBulkDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.campaignId) {
    const [campaign] = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(
        and(
          eq(campaignsTable.id, parsed.data.campaignId),
          eq(campaignsTable.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!campaign) {
      res.status(422).json({ error: "A campanha selecionada não pertence a esta empresa." });
      return;
    }
  }

  const productIds = [...new Set(parsed.data.productIds)];
  const products = await db
    .select()
    .from(produtosCatalogoTable)
    .where(
      and(
        eq(produtosCatalogoTable.tenantId, tenantId),
        inArray(produtosCatalogoTable.id, productIds),
      ),
    );

  const productById = new Map(products.map((product) => [product.id, product]));
  const missingProductIds = productIds.filter((id) => !productById.has(id));
  const created: Array<typeof facebookMarketplaceListingsTable.$inferSelect> = [];
  const failed: Array<{ productId: string; error: string }> = [];

  // Limita a concorrência para não disparar dezenas de gerações de IA ao
  // mesmo tempo em catálogos grandes. O lote aceita até 40 produtos.
  for (let index = 0; index < productIds.length; index += 5) {
    const chunk = productIds.slice(index, index + 5);
    const results = await Promise.all(
      chunk.map(async (productId) => {
        const product = productById.get(productId);
        if (!product) return { ok: false as const, productId, error: "Produto não encontrado para esta empresa." };

        try {
          const copy = await generateMarketplaceCopy(tenantId, product, parsed.data.category);
          const mediaUrls = uniqueMedia(product, parsed.data.mediaUrls);
          const [listing] = await db
            .insert(facebookMarketplaceListingsTable)
            .values({
              tenantId,
              productId: product.id,
              campaignId: parsed.data.campaignId ?? null,
              publishMode: "assisted",
              status: "draft",
              title: copy.title,
              description: copy.description,
              price: effectivePrice(product),
              category: copy.category,
              condition: parsed.data.condition ?? "new",
              city: parsed.data.city ?? null,
              state: parsed.data.state ?? null,
              mediaUrls,
              metadata: {
                generatedBy: copy.generatedBy,
                source: "catalog_bulk",
                productSku: product.sku ?? null,
              },
            })
            .returning();

          return { ok: true as const, listing };
        } catch (error) {
          return {
            ok: false as const,
            productId,
            error: error instanceof Error ? error.message : "Falha ao gerar anúncio.",
          };
        }
      }),
    );

    for (const result of results) {
      if (result.ok) created.push(result.listing);
      else failed.push({ productId: result.productId, error: result.error });
    }
  }

  for (const productId of missingProductIds) {
    if (!failed.some((item) => item.productId === productId)) {
      failed.push({ productId, error: "Produto não encontrado para esta empresa." });
    }
  }

  res.status(created.length > 0 ? 201 : 422).json({
    created,
    failed,
    summary: {
      requested: productIds.length,
      created: created.length,
      failed: failed.length,
    },
  });
});

router.patch("/tenants/:tenantId/facebook-marketplace/listings/:listingId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const listingId = String(req.params.listingId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(facebookMarketplaceListingsTable)
    .where(
      and(
        eq(facebookMarketplaceListingsTable.id, listingId),
        eq(facebookMarketplaceListingsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Anúncio não encontrado." });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.price !== undefined) {
    const value = Number(parsed.data.price);
    if (!Number.isFinite(value) || value < 0) {
      res.status(422).json({ error: "Preço inválido." });
      return;
    }
    data.price = value.toFixed(2);
  }
  if (parsed.data.status === "published" && !existing.publishedAt) {
    data.publishedAt = new Date();
  }

  const [listing] = await db
    .update(facebookMarketplaceListingsTable)
    .set(data as any)
    .where(
      and(
        eq(facebookMarketplaceListingsTable.id, listingId),
        eq(facebookMarketplaceListingsTable.tenantId, tenantId),
      ),
    )
    .returning();

  res.json(listing);
});

router.post("/tenants/:tenantId/facebook-marketplace/listings/:listingId/prepare", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const listingId = String(req.params.listingId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [existing] = await db
    .select()
    .from(facebookMarketplaceListingsTable)
    .where(
      and(
        eq(facebookMarketplaceListingsTable.id, listingId),
        eq(facebookMarketplaceListingsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Anúncio não encontrado." });
    return;
  }

  const metadata = {
    ...(existing.metadata ?? {}),
    lastPreparedAt: new Date().toISOString(),
    publishFlow: "assisted",
  };

  const [listing] = await db
    .update(facebookMarketplaceListingsTable)
    .set({ status: "ready", metadata, updatedAt: new Date() })
    .where(eq(facebookMarketplaceListingsTable.id, listingId))
    .returning();

  res.json({
    listing,
    handoff: {
      mode: "assisted",
      marketplaceCreateUrl: "https://www.facebook.com/marketplace/create/item",
      copyText: `${listing.title}\n\n${listing.description}`,
      mediaUrls: listing.mediaUrls,
    },
  });
});

router.delete("/tenants/:tenantId/facebook-marketplace/listings/:listingId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const listingId = String(req.params.listingId);
  if (!hasTenantAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [deleted] = await db
    .delete(facebookMarketplaceListingsTable)
    .where(
      and(
        eq(facebookMarketplaceListingsTable.id, listingId),
        eq(facebookMarketplaceListingsTable.tenantId, tenantId),
      ),
    )
    .returning({ id: facebookMarketplaceListingsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Anúncio não encontrado." });
    return;
  }

  res.status(204).send();
});

export default router;
