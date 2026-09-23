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
  dealsTable,
  tenantsTable,
} from "@workspace/db";
import { buildProposalPrompt, callProposalAI, renderProposalHtml, generateTheme, AI_PROVIDER, generateProposalPDF, learnFromProposalEdit, type ProposalStyleMemory } from "../lib/proposal-engine.js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

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
    .select({
      nomeFantasia: businessProfilesTable.nomeFantasia,
      razaoSocial: businessProfilesTable.razaoSocial,
      telefone: businessProfilesTable.telefone,
      email: businessProfilesTable.email,
      instagramUrl: businessProfilesTable.instagramUrl,
      proposalTemplateUrl: businessProfilesTable.proposalTemplateUrl,
      discoveryData: businessProfilesTable.discoveryData,
      logoUrl: businessProfilesTable.logoUrl,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const tenantName = bp?.nomeFantasia || bp?.razaoSocial || null;

  return {
    lead, briefing, intelligence, products, propostas, conversationSamples,
    tenantName, tenantPhone: bp?.telefone, tenantLogoUrl: bp?.logoUrl ?? null,
    tenantEmail: bp?.email ?? null, tenantInstagram: bp?.instagramUrl ?? null,
    proposalTemplateUrl: bp?.proposalTemplateUrl ?? null,
    discoveryData: bp?.discoveryData ?? null,
  };
}

/** Fetch uploaded proposal model content for AI guidance (max 6000 chars).
 * Supports text/HTML, PDF and DOCX using dependencies already present in the API. */
async function fetchTemplateGuidance(templateUrl: string | null | undefined): Promise<string | null> {
  if (!templateUrl) return null;
  try {
    const port = process.env.PORT ?? "8080";
    const base = process.env.BASE_PATH ?? "";
    const url = templateUrl.startsWith("/objects/")
      ? `http://localhost:${port}${base}/api/storage${templateUrl}`
      : templateUrl;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const lowerUrl = url.toLowerCase();
    let text = "";

    if (ct.includes("pdf") || lowerUrl.endsWith(".pdf")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      text = (await pdfParse(buffer)).text ?? "";
    } else if (ct.includes("officedocument") || lowerUrl.endsWith(".docx")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      text = (await mammoth.extractRawText({ buffer })).value ?? "";
    } else {
      text = await res.text();
      if (ct.includes("html") || lowerUrl.endsWith(".html") || lowerUrl.endsWith(".htm")) {
        text = text.replace(/<[^>]+>/g, " ");
      }
    }

    const normalized = text.replace(/\s{2,}/g, " ").trim();
    return normalized ? normalized.slice(0, 6000) : null;
  } catch {
    return null;
  }
}

/** Resolve object-storage relative paths to absolute URLs for HTML/PDF embedding */
function resolveStorageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const port = process.env.PORT ?? "8080";
  const base = process.env.BASE_PATH ?? "";
  if (url.startsWith("/objects/")) return `http://localhost:${port}${base}/api/storage${url}`;
  return url;
}

/** Replace any remaining relative /api/storage or /objects/ paths in HTML with absolute localhost URLs */
function absolutifyStorageUrls(html: string): string {
  const port = process.env.PORT ?? "8080";
  const base = process.env.BASE_PATH ?? "";
  const abs = (path: string) => `http://localhost:${port}${base}${path}`;
  return html
    .replace(/src="\/api\/storage\/public-objects\/objects\//g, abs("/api/storage/objects/"))
    .replace(/src="\/api\/storage\/objects\//g, abs("/api/storage/objects/"))
    .replace(/src="\/api\/storage\/public-objects\//g, abs("/api/storage/public-objects/"))
    .replace(/src="\/objects\//g, abs("/api/storage/objects/"));
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

// ── GET /leads/:leadId/proposals/:version/pdf
router.get("/leads/:leadId/proposals/:version/pdf", async (req, res) => {
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
  const filename = `Proposta_${clientName.replace(/\s+/g, "_")}_v${version}.pdf`;
  const pdfBuffer = await generateProposalPDF(absolutifyStorageUrls(row.htmlContent));
  const isPdf = pdfBuffer.length > 0 && pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50 && pdfBuffer[2] === 0x44 && pdfBuffer[3] === 0x46; // %PDF
  if (isPdf) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  } else {
    // Fallback: puppeteer failed, return HTML
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Proposta_${clientName.replace(/\s+/g, "_")}_v${version}.html"`);
  }
  res.send(pdfBuffer);
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

  // Fetch tenant's accumulated style memory
  const [tenantRow] = await db
    .select({ proposalStyleMemory: tenantsTable.proposalStyleMemory })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  const styleMemory = (tenantRow?.proposalStyleMemory ?? null) as ProposalStyleMemory | null;

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
    refinementNotes: req.body?.refinementNotes ? String(req.body.refinementNotes) : null,
    styleMemory,
    templateGuidance: await fetchTemplateGuidance((() => {
      const dd = (ctx.discoveryData ?? {}) as Record<string, unknown>;
      const raw = Array.isArray(dd["proposalTemplates"]) ? dd["proposalTemplates"] as Array<Record<string, unknown>> : [];
      const requestedId = typeof req.body?.proposalTemplateId === "string" ? req.body.proposalTemplateId : null;
      const requested = requestedId ? raw.find((item) => item["id"] === requestedId) : null;
      const defaultModel = raw.find((item) => item["isDefault"] === true);
      const selected = requested ?? defaultModel;
      return typeof selected?.["url"] === "string" ? selected["url"] as string : ctx.proposalTemplateUrl;
    })()),
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

  const bodyImagens: string[] | null = Array.isArray(req.body?.imagens) ? req.body.imagens : null;
  const bodyPropostaId: string | null = req.body?.propostaId ? String(req.body.propostaId) : null;
  const rawPresentation = req.body?.apresentacao;
  const presentationModes = new Set(["completo", "resumo_etapa", "preco_medio"]);
  const bodyPresentation = rawPresentation && typeof rawPresentation === "object"
    ? {
        modoPadrao: presentationModes.has(String(rawPresentation.modoPadrao))
          ? String(rawPresentation.modoPadrao) as "completo" | "resumo_etapa" | "preco_medio"
          : undefined,
        etapas:
          rawPresentation.etapas && typeof rawPresentation.etapas === "object"
            ? Object.fromEntries(
                Object.entries(rawPresentation.etapas)
                  .filter(([, mode]) => presentationModes.has(String(mode)))
                  .map(([stageId, mode]) => [
                    String(stageId),
                    String(mode) as "completo" | "resumo_etapa" | "preco_medio",
                  ]),
              )
            : undefined,
        mostrarTotalGeral:
          typeof rawPresentation.mostrarTotalGeral === "boolean"
            ? rawPresentation.mostrarTotalGeral
            : undefined,
      }
    : null;

  let orcamentoEmbed: {
    titulo: string; numero?: string | null;
    itens: Array<{
      nome: string;
      quantidade: number;
      valorUnitario: number;
      sku?: string | null;
      descricao?: string | null;
      etapaId?: string | null;
      etapaNome?: string | null;
      etapaOrdem?: number | null;
    }>;
    valorTotal?: string | null; observacoes?: string | null;
    formaPagamento?: string | null; condPagamento?: string | null; prazoEntrega?: string | null;
    apresentacao?: {
      modoPadrao?: "completo" | "resumo_etapa" | "preco_medio";
      etapas?: Record<string, "completo" | "resumo_etapa" | "preco_medio">;
      mostrarTotalGeral?: boolean;
    } | null;
  } | null = null;

  if (bodyPropostaId) {
    const [orc] = await db
      .select()
      .from(propostasTable)
      .where(and(eq(propostasTable.id, bodyPropostaId), eq(propostasTable.tenantId, tenantId)));
    if (orc) {
      orcamentoEmbed = {
        titulo: orc.titulo,
        numero: orc.numero,
        itens: (orc.itens || []) as Array<{
          nome: string;
          quantidade: number;
          valorUnitario: number;
          sku?: string | null;
          descricao?: string | null;
          etapaId?: string | null;
          etapaNome?: string | null;
          etapaOrdem?: number | null;
        }>,
        valorTotal: orc.valorTotal,
        observacoes: orc.observacoes,
        formaPagamento: orc.formaPagamento,
        condPagamento: orc.condPagamento,
        prazoEntrega: orc.prazoEntrega,
        apresentacao: bodyPresentation ?? orc.apresentacao,
      };
    }
  }

  const html = renderProposalHtml(
    json,
    theme,
    resolveStorageUrl(ctx.lead.logoUrl),
    ctx.lead.empresa || ctx.lead.nome,
    ctx.tenantName || undefined,
    ctx.lead.websiteUrl || undefined,
    resolveStorageUrl(ctx.tenantLogoUrl),
    bodyImagens,
    orcamentoEmbed,
    { phone: ctx.tenantPhone ?? null, email: ctx.tenantEmail ?? null, instagram: ctx.tenantInstagram ?? null }
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

  // Promote deal from em_aquecimento → novo when first proposal is created
  await db
    .update(dealsTable)
    .set({ etapa: "novo", updatedAt: new Date() })
    .where(and(eq(dealsTable.leadId, leadId), eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "em_aquecimento")));

  res.status(201).json({ ...proposal, _provider: result.provider, _model: result.model });
});

// ── PATCH /leads/:leadId/proposals/:version — save manually edited HTML ───────
router.patch("/leads/:leadId/proposals/:version", async (req, res) => {
  const leadId = String(req.params.leadId);
  const version = parseInt(req.params.version, 10);
  const { htmlContent } = req.body;
  if (typeof htmlContent !== "string" || !htmlContent.trim()) {
    res.status(400).json({ error: "htmlContent é obrigatório" });
    return;
  }
  const [lead] = await db.select({ tenantId: leadsTable.tenantId }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Fetch original HTML for learning diff (before overwriting)
  const [existing] = await db
    .select({ htmlContent: leadProposalsTable.htmlContent })
    .from(leadProposalsTable)
    .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, lead.tenantId), eq(leadProposalsTable.version, version)));

  const [updated] = await db
    .update(leadProposalsTable)
    .set({ htmlContent })
    .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, lead.tenantId), eq(leadProposalsTable.version, version)))
    .returning({ id: leadProposalsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  res.json({ ok: true });

  // Fire-and-forget: learn from this edit and update tenant style memory
  if (existing?.htmlContent && existing.htmlContent !== htmlContent) {
    const tenantId = lead.tenantId;
    const log = req.log;
    (async () => {
      try {
        const [tenant] = await db.select({ proposalStyleMemory: tenantsTable.proposalStyleMemory }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
        const newMemory = await learnFromProposalEdit(
          tenantId,
          existing.htmlContent,
          htmlContent,
          (tenant?.proposalStyleMemory ?? null) as ProposalStyleMemory | null,
          log,
        );
        await db.update(tenantsTable).set({ proposalStyleMemory: newMemory } as any).where(eq(tenantsTable.id, tenantId));
        log.info({ tenantId }, "proposal style memory persisted");
      } catch (err: any) {
        log.warn({ err: err?.message, tenantId }, "proposal style memory update failed (non-fatal)");
      }
    })();
  }
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
