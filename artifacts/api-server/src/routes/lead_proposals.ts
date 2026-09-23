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
import { generateImage } from "../lib/ai-gateway.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

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

// ── POST /leads/:leadId/proposals/stage-images ───────────────────────────────
// Gera uma fotografia representativa para cada etapa do orçamento selecionado.
// As imagens ficam salvas na própria apresentação do orçamento, então são
// reutilizadas na proposta, no PDF e em futuras reaberturas sem depender da URL
// temporária retornada pelo provedor de IA.
router.post("/leads/:leadId/proposals/stage-images", async (req, res) => {
  const leadId = String(req.params.leadId);
  const tenantId = req.user?.tenantId ?? "";
  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead || (req.user?.platformRole !== "super_admin" && lead.tenantId !== tenantId)) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const propostaId = typeof req.body?.propostaId === "string" ? req.body.propostaId.trim() : "";
  if (!propostaId) {
    res.status(400).json({ error: "propostaId é obrigatório" });
    return;
  }

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(and(
      eq(propostasTable.id, propostaId),
      eq(propostasTable.tenantId, lead.tenantId),
      eq(propostasTable.leadId, leadId),
    ));

  if (!proposta) {
    res.status(404).json({ error: "Orçamento não encontrado para este lead" });
    return;
  }

  const itens = proposta.itens ?? [];
  const hasStages = itens.some((item) => item.etapaId || item.etapaNome || item.etapaOrdem);
  if (!hasStages) {
    res.status(422).json({ error: "Este orçamento não possui etapas estruturadas." });
    return;
  }

  const groups = Array.from(
    itens.reduce((map, item, index) => {
      const ordem = Number(item.etapaOrdem ?? index + 1);
      const nome = String(item.etapaNome ?? `Etapa ${ordem}`);
      const id = String(item.etapaId ?? `__stage_${ordem}_${nome}`);
      const current = map.get(id) ?? {
        id,
        ordem,
        nome,
        itens: [] as typeof itens,
      };
      current.itens.push(item);
      map.set(id, current);
      return map;
    }, new Map<string, { id: string; ordem: number; nome: string; itens: typeof itens }>()),
  )
    .map(([, group]) => group)
    .sort((a, b) => a.ordem - b.ordem);

  const requestedStageIds = Array.isArray(req.body?.stageIds)
    ? new Set(req.body.stageIds.filter((value: unknown): value is string => typeof value === "string"))
    : null;
  const regenerate = req.body?.regenerate === true;
  const targetGroups = groups
    .filter((group) => !requestedStageIds || requestedStageIds.has(group.id))
    .slice(0, 20);

  if (!targetGroups.length) {
    res.status(422).json({ error: "Nenhuma etapa válida foi selecionada." });
    return;
  }

  const presentation = (proposta.apresentacao ?? {}) as Record<string, any>;
  const stageImages: Record<string, string> = {
    ...((presentation.imagensEtapas && typeof presentation.imagensEtapas === "object")
      ? presentation.imagensEtapas
      : {}),
  };
  const generated: Array<{ stageId: string; stageName: string; imageUrl: string }> = [];
  const skipped: Array<{ stageId: string; stageName: string; imageUrl: string }> = [];
  const errors: Array<{ stageId: string; stageName: string; error: string }> = [];

  for (const group of targetGroups) {
    const existing = stageImages[group.id];
    if (existing && !regenerate) {
      skipped.push({ stageId: group.id, stageName: group.nome, imageUrl: existing });
      continue;
    }

    const scope = group.itens
      .slice(0, 10)
      .map((item) => {
        const desc = item.descricao ? String(item.descricao).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
        return `- ${item.nome}${desc ? `: ${desc.slice(0, 180)}` : ""}`;
      })
      .join("\n");

    const prompt = [
      "Fotografia documental hiper-realista de construção civil no Brasil, composição horizontal 3:2, aparência de fotografia profissional de obra real.",
      `Representar visualmente a etapa "${group.nome}" de uma obra residencial de padrão alto, sem transformar a imagem em render conceitual e sem inventar elementos incompatíveis com a etapa.`,
      "Mostrar somente o estado construtivo coerente com esta fase: materiais, sistemas, equipamentos e profissionais que normalmente estariam presentes neste momento da execução.",
      "Trabalhadores com EPI adequado, canteiro organizado, luz natural realista, materiais com escala correta, geometria consistente, sem objetos deformados.",
      scope ? `Escopo contratado desta etapa:\n${scope}` : "",
      "A imagem é apenas representativa da etapa, não deve fingir ser foto do projeto real do cliente.",
      "Sem textos, sem letras, sem placas legíveis, sem logotipos, sem marcas d'água, sem molduras e sem antes/depois.",
    ].filter(Boolean).join("\n");

    try {
      const { urls } = await generateImage(lead.tenantId, "image_generator", prompt, {
        model: "gpt-image-1",
        size: "1536x1024",
        n: 1,
        log: req.log,
      });
      const providerUrl = urls[0];
      if (!providerUrl) throw new Error("IA não retornou imagem");

      const imageResponse = await fetch(providerUrl);
      if (!imageResponse.ok) {
        throw new Error(`Falha ao baixar imagem gerada (${imageResponse.status})`);
      }
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const contentType = imageResponse.headers.get("content-type") ?? "image/png";
      const objectPath = await objectStorage.savePrivateBuffer(
        buffer,
        contentType,
        `proposta-etapa-${proposta.id}-${group.ordem}.png`,
      );
      const imageUrl = `/api/storage${objectPath}`;
      stageImages[group.id] = imageUrl;
      generated.push({ stageId: group.id, stageName: group.nome, imageUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao gerar imagem";
      errors.push({ stageId: group.id, stageName: group.nome, error: message });
      req.log.warn({ err, propostaId, stageId: group.id }, "proposal stage image generation failed");
    }
  }

  await db
    .update(propostasTable)
    .set({
      apresentacao: {
        ...(proposta.apresentacao ?? {}),
        imagensEtapas: stageImages,
      },
      updatedAt: new Date(),
    })
    .where(eq(propostasTable.id, proposta.id));

  if (!generated.length && !skipped.length && errors.length) {
    res.status(502).json({
      error: "Não foi possível gerar imagens para as etapas.",
      errors,
    });
    return;
  }

  res.json({
    images: [...generated, ...skipped],
    generated: generated.length,
    reused: skipped.length,
    errors,
    totalStages: groups.length,
    limitedTo: targetGroups.length,
  });
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

  const bodyPropostaId: string | null = req.body?.propostaId ? String(req.body.propostaId) : null;
  const requestedImages: string[] = Array.isArray(req.body?.imagens)
    ? req.body.imagens
        .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value: string) => value.trim())
    : [];

  // Toda proposta precisa ter base visual. A seleção manual tem prioridade e,
  // quando necessário, imagens dos produtos vinculados completam o mínimo.
  const bodyImagens = Array.from(new Set(requestedImages));
  const productImages = (ctx.products as any[])
    .map((product) => typeof product?.imagemUrl === "string" ? product.imagemUrl.trim() : "")
    .filter((url): url is string => Boolean(url));

  for (const imageUrl of productImages) {
    if (bodyImagens.length >= 2) break;
    if (!bodyImagens.includes(imageUrl)) bodyImagens.push(imageUrl);
  }

  if (bodyImagens.length < 2) {
    res.status(400).json({
      error: "A apresentação precisa de pelo menos 2 imagens. Importe imagens, selecione renders ou vincule produtos com imagem.",
    });
    return;
  }
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
        previsaoInicio:
          typeof rawPresentation.previsaoInicio === "string" && rawPresentation.previsaoInicio.trim()
            ? rawPresentation.previsaoInicio.trim()
            : undefined,
        cronogramaEtapas:
          rawPresentation.cronogramaEtapas && typeof rawPresentation.cronogramaEtapas === "object"
            ? Object.fromEntries(
                Object.entries(rawPresentation.cronogramaEtapas)
                  .filter(([, value]) => value && typeof value === "object")
                  .map(([stageId, value]) => {
                    const row = value as Record<string, unknown>;
                    return [String(stageId), {
                      ...(Number.isFinite(Number(row.duracaoDias)) && Number(row.duracaoDias) > 0
                        ? { duracaoDias: Math.round(Number(row.duracaoDias)) }
                        : {}),
                      ...(Number.isFinite(Number(row.percentualFisico))
                        ? { percentualFisico: Math.min(100, Math.max(0, Number(row.percentualFisico))) }
                        : {}),
                      ...(typeof row.inicioPrevisto === "string" && row.inicioPrevisto.trim()
                        ? { inicioPrevisto: row.inicioPrevisto.trim() }
                        : {}),
                      ...(typeof row.fimPrevisto === "string" && row.fimPrevisto.trim()
                        ? { fimPrevisto: row.fimPrevisto.trim() }
                        : {}),
                      ...(typeof row.observacao === "string" && row.observacao.trim()
                        ? { observacao: row.observacao.trim() }
                        : {}),
                      ...(typeof row.marcoPagamento === "string" && row.marcoPagamento.trim()
                        ? { marcoPagamento: row.marcoPagamento.trim() }
                        : {}),
                    }];
                  }),
              )
            : undefined,
        mostrarCronogramaExecucao:
          typeof rawPresentation.mostrarCronogramaExecucao === "boolean"
            ? rawPresentation.mostrarCronogramaExecucao
            : undefined,
        mostrarFisicoFinanceiro:
          typeof rawPresentation.mostrarFisicoFinanceiro === "boolean"
            ? rawPresentation.mostrarFisicoFinanceiro
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
    validadeAte?: Date | string | null;
    paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
    apresentacao?: {
      modoPadrao?: "completo" | "resumo_etapa" | "preco_medio";
      etapas?: Record<string, "completo" | "resumo_etapa" | "preco_medio">;
      mostrarTotalGeral?: boolean;
      previsaoInicio?: string;
      cronogramaEtapas?: Record<string, {
        duracaoDias?: number;
        percentualFisico?: number;
        inicioPrevisto?: string;
        fimPrevisto?: string;
        observacao?: string;
        marcoPagamento?: string;
      }>;
      imagensEtapas?: Record<string, string>;
      mostrarCronogramaExecucao?: boolean;
      mostrarFisicoFinanceiro?: boolean;
    } | null;
  } | null = null;

  if (bodyPropostaId) {
    const [orc] = await db
      .select()
      .from(propostasTable)
      .where(and(eq(propostasTable.id, bodyPropostaId), eq(propostasTable.tenantId, tenantId)));
    if (orc) {
      const storedPresentation = (orc.apresentacao ?? {}) as {
        modoPadrao?: "completo" | "resumo_etapa" | "preco_medio";
        etapas?: Record<string, "completo" | "resumo_etapa" | "preco_medio">;
        mostrarTotalGeral?: boolean;
        previsaoInicio?: string;
        cronogramaEtapas?: Record<string, {
          duracaoDias?: number;
          percentualFisico?: number;
          inicioPrevisto?: string;
          fimPrevisto?: string;
          observacao?: string;
          marcoPagamento?: string;
        }>;
        imagensEtapas?: Record<string, string>;
        mostrarCronogramaExecucao?: boolean;
        mostrarFisicoFinanceiro?: boolean;
      };

      const mergedPresentation = {
        ...storedPresentation,
        ...(bodyPresentation?.modoPadrao ? { modoPadrao: bodyPresentation.modoPadrao } : {}),
        ...(bodyPresentation?.etapas ? {
          etapas: { ...(storedPresentation.etapas ?? {}), ...bodyPresentation.etapas },
        } : {}),
        ...(typeof bodyPresentation?.mostrarTotalGeral === "boolean"
          ? { mostrarTotalGeral: bodyPresentation.mostrarTotalGeral }
          : {}),
        ...(bodyPresentation?.previsaoInicio ? { previsaoInicio: bodyPresentation.previsaoInicio } : {}),
        ...(bodyPresentation?.cronogramaEtapas ? {
          cronogramaEtapas: {
            ...(storedPresentation.cronogramaEtapas ?? {}),
            ...bodyPresentation.cronogramaEtapas,
          },
        } : {}),
        ...(typeof bodyPresentation?.mostrarCronogramaExecucao === "boolean"
          ? { mostrarCronogramaExecucao: bodyPresentation.mostrarCronogramaExecucao }
          : {}),
        ...(typeof bodyPresentation?.mostrarFisicoFinanceiro === "boolean"
          ? { mostrarFisicoFinanceiro: bodyPresentation.mostrarFisicoFinanceiro }
          : {}),
      };

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
        validadeAte: orc.validadeAte,
        paymentCompositions: (orc.paymentCompositions ?? []) as Array<{
          forma: string;
          valor: string | number;
          comprovanteUrl?: string | null;
        }>,
        apresentacao: mergedPresentation,
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
