import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadBriefingsTable,
  leadProposalsTable,
  leadProductsTable,
  propostasTable,
  conversationsTable,
  messagesTable,
  customerIntelligenceTable,
  businessProfilesTable,
} from "@workspace/db";
import { buildProposalPrompt, callProposalAI, renderProposalHtml, generateTheme, AI_PROVIDER } from "../lib/proposal-engine.js";

const router: IRouter = Router();

// ── Helper: load proposal context ──────────────────────────────────────────────
async function loadProposalContext(leadId: string, tenantId: string) {
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

  const products = await db
    .select()
    .from(leadProductsTable)
    .where(and(eq(leadProductsTable.leadId, leadId), eq(leadProductsTable.tenantId, tenantId)))
    .orderBy(leadProductsTable.createdAt);

  const propostas = await db
    .select({ titulo: propostasTable.titulo, valorTotal: propostasTable.valorTotal, itens: propostasTable.itens, observacoes: propostasTable.observacoes })
    .from(propostasTable)
    .where(and(eq(propostasTable.leadId, leadId), eq(propostasTable.tenantId, tenantId)));

  // Load last 5 conversation messages for tone analysis
  const convs = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.leadId, leadId), eq(conversationsTable.tenantId, tenantId)))
    .orderBy(desc(conversationsTable.ultimaMensagemEm))
    .limit(3);

  let conversationSamples = "";
  if (convs.length) {
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, convs[0].id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(10);
    conversationSamples = msgs.reverse().map((m) => `${m.enviadoPor}: ${m.conteudo.slice(0, 200)}`).join("\n");
  }

  const [bp] = await db
    .select({ nomeFantasia: businessProfilesTable.nomeFantasia, telefone: businessProfilesTable.telefone })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  return { lead, briefing, intelligence, products, propostas, conversationSamples, tenantName: bp?.nomeFantasia, tenantPhone: bp?.telefone };
}

// ── GET /leads/:leadId/proposals ─────────────────────────────────────────────────
router.get("/leads/:leadId/proposals", async (req, res) => {
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
    .select({ id: leadProposalsTable.id, version: leadProposalsTable.version, status: leadProposalsTable.status, createdAt: leadProposalsTable.createdAt })
    .from(leadProposalsTable)
    .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, lead.tenantId)))
    .orderBy(desc(leadProposalsTable.version));
  res.json(rows);
});

// ── GET /leads/:leadId/proposals/:version ─────────────────────────────────────────────
router.get("/leads/:leadId/proposals/:version", async (req, res) => {
  const leadId = String(req.params.leadId);
  const version = parseInt(req.params.version, 10);
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [row] = await db
    .select()
    .from(leadProposalsTable)
    .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, lead.tenantId), eq(leadProposalsTable.version, version)));
  if (!row) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  res.json(row);
});

// ── GET /leads/:leadId/proposals/:version/download ────────────────────────────
router.get("/leads/:leadId/proposals/:version/download", async (req, res) => {
  const leadId = String(req.params.leadId);
  const version = parseInt(req.params.version, 10);
  const [lead] = await db.select({ tenantId: leadsTable.tenantId, nome: leadsTable.nome, empresa: leadsTable.empresa }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [row] = await db
    .select()
    .from(leadProposalsTable)
    .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, lead.tenantId), eq(leadProposalsTable.version, version)));
  if (!row) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  const clientName = lead.empresa || lead.nome || "Cliente";
  const filename = `Proposta_${clientName.replace(/\s+/g, "_")}_v${version}.html`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(row.htmlContent);
});

// ── POST /leads/:leadId/proposals ─────────────────────────────────────────────────
router.post("/leads/:leadId/proposals", async (req, res) => {
  const leadId = String(req.params.leadId);
  const ctx = await loadProposalContext(leadId, req.user?.tenantId ?? "");
  if (!ctx) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && ctx.lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const tenantId = ctx.lead.tenantId;

  // Auto-generate briefing if missing
  if (!ctx.briefing) {
    // Trigger a lightweight background briefing (just save an empty one so the flow continues)
    await db.insert(leadBriefingsTable).values({
      tenantId,
      leadId,
      approachedBy: req.user?.sub ?? null,
    }).onConflictDoNothing({ target: leadBriefingsTable.leadId });
  }

  // Determine next version
  const [last] = await db
    .select({ version: leadProposalsTable.version })
    .from(leadProposalsTable)
    .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, tenantId)))
    .orderBy(desc(leadProposalsTable.version))
    .limit(1);
  const nextVersion = (last?.version ?? 0) + 1;

  const prompt = buildProposalPrompt({
    leadName: ctx.lead.nome,
    empresa: ctx.lead.empresa,
    objetivo: ctx.lead.objetivo,
    mercadoSegmento: ctx.lead.mercadoSegmento,
    logoUrl: ctx.lead.logoUrl,
    corDestaque: ctx.lead.corDestaque,
    products: ctx.products,
    propostas: ctx.propostas,
    briefing: ctx.briefing
      ? {
          situationAnswers: ctx.briefing.situationAnswers as any,
          problemAnswers: ctx.briefing.problemAnswers as any,
          implicationAnswers: ctx.briefing.implicationAnswers as any,
          needAnswers: ctx.briefing.needAnswers as any,
          freeNotes: ctx.briefing.freeNotes,
        }
      : null,
    intelligence: ctx.intelligence
      ? {
          churnReasons: (ctx.intelligence.churnReasons as string[]) || [],
          opportunities: (ctx.intelligence.opportunities as string[]) || [],
          intentAnalysis: ctx.intelligence.intentAnalysis,
        }
      : null,
    conversationSamples: ctx.conversationSamples,
    tenantName: ctx.tenantName,
    tenantPhone: ctx.tenantPhone,
  });

  let result;
  try {
    result = await callProposalAI([{ role: "user", content: prompt }], tenantId, req.log);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao chamar a IA";
    req.log.error({ error: msg, provider: AI_PROVIDER }, "Proposal generation failed");
    res.status(502).json({ error: `Erro na geração: ${msg}` });
    return;
  }

  req.log.info({ provider: result.provider, model: result.model, tenantId, leadId }, "Proposal generated successfully");

  // Validate JSON
  let json: any;
  try {
    const cleaned = result.content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    json = JSON.parse(cleaned);
  } catch {
    req.log.error({ rawPreview: result.content.slice(0, 300), provider: result.provider }, "Proposal generation returned invalid JSON");
    res.status(502).json({ error: "Resposta da IA inválida: JSON malformado" });
    return;
  }

  // Generate theme
  const primaryColor = ctx.lead.corDestaque || "#A78BFA";
  const theme = generateTheme(primaryColor);

  const html = renderProposalHtml(
    json,
    theme,
    ctx.lead.logoUrl || undefined,
    ctx.lead.empresa || ctx.lead.nome,
    ctx.tenantName || undefined
  );

  const [proposal] = await db
    .insert(leadProposalsTable)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      leadId,
      version: nextVersion,
      htmlContent: html,
      jsonContent: JSON.stringify(json),
      status: "ready",
    })
    .returning();

  res.status(201).json({ ...proposal, _provider: result.provider, _model: result.model });
});

// ── Lead products CRUD ─────────────────────────────────────────────────────────
router.get("/leads/:leadId/products", async (req, res) => {
  const leadId = String(req.params.leadId);
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead || (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await db
    .select()
    .from(leadProductsTable)
    .where(and(eq(leadProductsTable.leadId, leadId), eq(leadProductsTable.tenantId, lead.tenantId)))
    .orderBy(leadProductsTable.createdAt);
  res.json(rows);
});

router.post("/leads/:leadId/products", async (req, res) => {
  const leadId = String(req.params.leadId);
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead || (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { nome, imagemUrl } = req.body;
  if (!nome || typeof nome !== "string") {
    res.status(400).json({ error: "nome é obrigatório" });
    return;
  }
  const [product] = await db
    .insert(leadProductsTable)
    .values({ id: crypto.randomUUID(), tenantId: lead.tenantId, leadId, nome, imagemUrl: imagemUrl || null })
    .returning();
  res.status(201).json(product);
});

router.delete("/leads/:leadId/products/:productId", async (req, res) => {
  const leadId = String(req.params.leadId);
  const productId = String(req.params.productId);
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead || (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .delete(leadProductsTable)
    .where(and(eq(leadProductsTable.id, productId), eq(leadProductsTable.leadId, leadId), eq(leadProductsTable.tenantId, lead.tenantId)));
  res.status(204).send();
});

export default router;
