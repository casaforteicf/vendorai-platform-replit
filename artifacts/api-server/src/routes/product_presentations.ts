import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadBriefingsTable,
  customerIntelligenceTable,
  productPresentationsTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  businessProfilesTable,
} from "@workspace/db";
import { generateProductPresentation } from "../lib/product-presentation-engine.js";
import { generateTheme } from "../lib/proposal-engine.js";
import { searchProductInfo } from "../lib/web-search.js";

const router: IRouter = Router();

// ── Helper: load presentation context ───────────────────────────────────────
async function loadPresentationContext(leadId: string, tenantId: string) {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead || lead.tenantId !== tenantId) return null;

  const [briefing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, leadId));

  const [intelligence] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(and(eq(customerIntelligenceTable.leadId, leadId), eq(customerIntelligenceTable.tenantId, tenantId)));

  const [bp] = await db
    .select({
      nomeFantasia: businessProfilesTable.nomeFantasia,
      razaoSocial: businessProfilesTable.razaoSocial,
      telefone: businessProfilesTable.telefone,
      logoUrl: businessProfilesTable.logoUrl,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const tenantName = bp?.nomeFantasia || bp?.razaoSocial || null;

  return { lead, briefing, intelligence, tenantName, tenantPhone: bp?.telefone, tenantLogoUrl: bp?.logoUrl ?? null };
}

// ── GET /leads/:leadId/product-presentations ─────────────────────────────────
router.get("/leads/:leadId/product-presentations", async (req, res) => {
  const leadId = String(req.params.leadId);
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const rows = await db
    .select()
    .from(productPresentationsTable)
    .where(and(eq(productPresentationsTable.leadId, leadId), eq(productPresentationsTable.tenantId, lead.tenantId)))
    .orderBy(desc(productPresentationsTable.createdAt));
  res.json(rows);
});

// ── POST /leads/:leadId/product-presentations ────────────────────────────────
router.post("/leads/:leadId/product-presentations", async (req, res) => {
  const leadId = String(req.params.leadId);
  const body = req.body as { productName: string; catalogProductId?: string; corDestaque?: string; logoUrl?: string };
  const ctx = await loadPresentationContext(leadId, req.user?.tenantId ?? "");
  if (!ctx) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && ctx.lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const tenantId = ctx.lead.tenantId;
  const productName = body.productName;
  const catalogProductId = body.catalogProductId;

  // 1. Search catalog first
  let catalogProduct = null;
  if (catalogProductId) {
    const [cp] = await db
      .select()
      .from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.id, catalogProductId), eq(produtosCatalogoTable.tenantId, tenantId)));
    catalogProduct = cp;
  } else {
    // fuzzy match by name
    const products = await db
      .select()
      .from(produtosCatalogoTable)
      .where(eq(produtosCatalogoTable.tenantId, tenantId));
    catalogProduct = products.find((p) =>
      p.nome.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.nome.toLowerCase())
    ) || null;
  }

  let catalogCategoriaNome: string | null = null;
  if (catalogProduct?.categoriaId) {
    const [cat] = await db
      .select({ nome: categoriasProdutoTable.nome })
      .from(categoriasProdutoTable)
      .where(eq(categoriasProdutoTable.id, catalogProduct.categoriaId));
    catalogCategoriaNome = cat?.nome ?? null;
  }

  // 2. Determine if web search is needed
  const hasCatalogDescription = catalogProduct && catalogProduct.descricao && catalogProduct.descricao.length > 30;
  let webResult = null;
  if (!hasCatalogDescription) {
    req.log.info({ productName, catalogFound: !!catalogProduct }, "Catalog insufficient, triggering web search");
    webResult = await searchProductInfo(productName, catalogCategoriaNome, tenantId, req.log);
  }

  // 3. Check if we have enough data
  const features = catalogProduct?.descricao
    ? catalogProduct.descricao.split(/[.\n]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const allFeatures = [...features, ...(webResult?.features || [])];

  if (allFeatures.length === 0 && (!catalogProduct || !catalogProduct.descricao)) {
    res.status(422).json({ error: "Informações insuficientes sobre o produto. Cadastre a descrição no catálogo ou forneça mais detalhes." });
    return;
  }

  // 4. Build context
  const leadBriefing = ctx.briefing
    ? `Situação: ${(ctx.briefing.situationAnswers as any)?.map((a: any) => a.answer).filter(Boolean).join("; ") || "Não informado"}
Problemas: ${(ctx.briefing.problemAnswers as any)?.map((a: any) => a.answer).filter(Boolean).join("; ") || "Não informado"}
Necessidades: ${(ctx.briefing.needAnswers as any)?.map((a: any) => a.answer).filter(Boolean).join("; ") || "Não informado"}`
    : null;

  const leadIntelligence = ctx.intelligence
    ? `Razões de churn: ${(ctx.intelligence.churnReasons as string[])?.join("; ") || "Não identificado"}
Oportunidades: ${(ctx.intelligence.opportunities as string[])?.join("; ") || "Não identificado"}
Intenção: ${ctx.intelligence.intentAnalysis || "Não identificado"}`
    : null;

  const presentationCtx = {
    productName: catalogProduct?.nome || productName,
    productDescription: catalogProduct?.descricao || webResult?.description || null,
    productFeatures: allFeatures,
    productPrice: catalogProduct?.precoBase ? `R$ ${catalogProduct.precoBase}` : webResult?.price || null,
    productImageUrl: catalogProduct?.imagemUrl || webResult?.imageUrl || null,
    productBrand: catalogCategoriaNome || webResult?.brand || null,
    webSources: webResult?.sources || undefined,
    leadName: ctx.lead.nome,
    leadEmpresa: ctx.lead.empresa,
    leadSegmento: ctx.lead.mercadoSegmento,
    leadBriefing: leadBriefing || null,
    leadIntelligence: leadIntelligence || null,
    tenantName: ctx.tenantName,
    tenantPhone: ctx.tenantPhone,
    tenantLogoUrl: ctx.tenantLogoUrl,
    logoUrl: body.logoUrl || null,
    corDestaque: body.corDestaque || ctx.lead.corDestaque || "#6366F1",
  };

  // 5. Generate
  let result;
  try {
    result = await generateProductPresentation(presentationCtx, tenantId, req.log);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao gerar apresentação";
    req.log.error({ error: msg, tenantId, leadId }, "Product presentation generation failed");
    res.status(502).json({ error: `Erro na geração: ${msg}` });
    return;
  }

  // 6. Save
  const [row] = await db
    .insert(productPresentationsTable)
    .values({
      tenantId,
      leadId,
      productName: presentationCtx.productName,
      catalogProductId: catalogProduct?.id || null,
      status: "draft",
      htmlContent: result.html,
      jsonContent: JSON.stringify(result.json),
      webSources: result.sources.length ? result.sources : null,
    })
    .returning();

  req.log.info({ presentationId: row.id, tenantId, leadId }, "Product presentation generated");
  res.status(201).json(row);
});

// ── GET /product-presentations/:presentationId ──────────────────────────────
router.get("/product-presentations/:presentationId", async (req, res) => {
  const presentationId = String(req.params.presentationId);
  const [row] = await db.select().from(productPresentationsTable).where(eq(productPresentationsTable.id, presentationId));
  if (!row) {
    res.status(404).json({ error: "Presentation not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && row.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json(row);
});

// ── POST /product-presentations/:presentationId/send ─────────────────────────
router.post("/product-presentations/:presentationId/send", async (req, res) => {
  const presentationId = String(req.params.presentationId);
  const [row] = await db.select().from(productPresentationsTable).where(eq(productPresentationsTable.id, presentationId));
  if (!row) {
    res.status(404).json({ error: "Presentation not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && row.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Update status
  await db
    .update(productPresentationsTable)
    .set({
      status: "sent",
      sentAt: new Date(),
      reviewedBy: req.user?.sub || null,
    })
    .where(eq(productPresentationsTable.id, presentationId));

  req.log.info({ presentationId, userId: req.user?.sub }, "Product presentation sent");
  res.json({ success: true });
});

export default router;
