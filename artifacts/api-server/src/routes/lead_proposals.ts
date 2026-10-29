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
  knowledgeBaseTable,
  dealsTable,
  tenantsTable,
} from "@workspace/db";
import { buildProposalPrompt, callProposalAI, renderProposalHtml, generateTheme, AI_PROVIDER, generateProposalPDF, learnFromProposalEdit, type ProposalStyleMemory } from "../lib/proposal-engine.js";
import { generateImage } from "../lib/ai-gateway.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import http from "node:http";
import { auditProposalBudget } from "../lib/budget-integrity.js";
import { loadApprovedBusinessContext } from "../services/business-plan.js";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const recentPaidImageActions = new Map<string, number>();
const PAID_IMAGE_ACTION_TTL_MS = 15 * 60 * 1000;

function reservePaidImageAction(key: string): boolean {
  const now = Date.now();
  for (const [existingKey, expiresAt] of recentPaidImageActions) {
    if (expiresAt <= now) recentPaidImageActions.delete(existingKey);
  }
  if (recentPaidImageActions.has(key)) return false;
  recentPaidImageActions.set(key, now + PAID_IMAGE_ACTION_TTL_MS);
  return true;
}


async function loadBudgetIntegrityForProposal(tenantId: string, leadId: string, propostaId: string) {
  const [budget] = await db
    .select()
    .from(propostasTable)
    .where(and(
      eq(propostasTable.id, propostaId),
      eq(propostasTable.tenantId, tenantId),
      eq(propostasTable.leadId, leadId),
    ))
    .limit(1);

  if (!budget) return null;
  const integrity = auditProposalBudget({
    itens: budget.itens,
    valorTotal: budget.valorTotal,
    validadeAte: budget.validadeAte,
    prazoEntrega: budget.prazoEntrega,
    apresentacao: budget.apresentacao,
  });
  return { budget, integrity };
}

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
      vertical: businessProfilesTable.vertical,
      diferenciais: businessProfilesTable.diferenciais,
      publicoAlvo: businessProfilesTable.publicoAlvo,
      produtos: businessProfilesTable.produtos,
      metodoVendas: businessProfilesTable.metodoVendas,
      canaisVenda: businessProfilesTable.canaisVenda,
      concorrentes: businessProfilesTable.concorrentes,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const knowledgeRows = await db
    .select({
      titulo: knowledgeBaseTable.titulo,
      conteudo: knowledgeBaseTable.conteudo,
      categoria: knowledgeBaseTable.categoria,
      tags: knowledgeBaseTable.tags,
    })
    .from(knowledgeBaseTable)
    .where(and(
      eq(knowledgeBaseTable.tenantId, tenantId),
      eq(knowledgeBaseTable.ativo, true),
    ))
    .orderBy(desc(knowledgeBaseTable.updatedAt))
    .limit(12);

  const discovery = (bp?.discoveryData ?? {}) as Record<string, unknown>;
  const discoveryText = (key: string) => {
    const value = discovery[key];
    if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join("; ");
    return "";
  };
  const tenantBusinessContext = [
    bp?.vertical ? `Segmento da empresa: ${bp.vertical}` : "",
    bp?.publicoAlvo ? `Público-alvo configurado: ${bp.publicoAlvo}` : "",
    bp?.diferenciais ? `Diferenciais oficiais configurados:\n${bp.diferenciais}` : "",
    bp?.metodoVendas ? `Método comercial: ${bp.metodoVendas}` : "",
    Array.isArray(bp?.canaisVenda) && bp.canaisVenda.length ? `Canais de venda: ${bp.canaisVenda.join(", ")}` : "",
    Array.isArray(bp?.produtos) && bp.produtos.length
      ? `Produtos/serviços do perfil: ${bp.produtos.map((item) => item?.nome).filter(Boolean).join(", ")}`
      : "",
    discoveryText("posicionamento") ? `Posicionamento: ${discoveryText("posicionamento")}` : "",
    discoveryText("mensagensChave") ? `Mensagens-chave:\n${discoveryText("mensagensChave")}` : "",
    discoveryText("missao") ? `Missão: ${discoveryText("missao")}` : "",
    discoveryText("visao") ? `Visão: ${discoveryText("visao")}` : "",
    discoveryText("valores") ? `Valores: ${discoveryText("valores")}` : "",
    discoveryText("tomVoz") ? `Tom de voz: ${discoveryText("tomVoz")}` : "",
    discoveryText("palavrasEvitar") ? `Palavras/afirmações a evitar: ${discoveryText("palavrasEvitar")}` : "",
    knowledgeRows.length
      ? `Base de conhecimento ativa:\n${knowledgeRows.map((row) => {
          const content = String(row.conteudo ?? "").replace(/\s+/g, " ").trim().slice(0, 1400);
          return `- [${row.categoria}] ${row.titulo}: ${content}`;
        }).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n").slice(0, 18000);

  const tenantName = bp?.nomeFantasia || bp?.razaoSocial || null;

  return {
    lead, briefing, intelligence, products, propostas, conversationSamples,
    tenantName, tenantPhone: bp?.telefone, tenantLogoUrl: bp?.logoUrl ?? null,
    tenantEmail: bp?.email ?? null, tenantInstagram: bp?.instagramUrl ?? null,
    proposalTemplateUrl: bp?.proposalTemplateUrl ?? null,
    discoveryData: bp?.discoveryData ?? null,
    tenantBusinessContext,
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
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  if (url.startsWith("/api/storage/")) return url;
  return url;
}

/** Replace any remaining relative /api/storage or /objects/ paths in HTML with absolute localhost URLs */
function absolutifyStorageUrls(html: string): string {
  const port = process.env.PORT ?? "8080";
  const base = process.env.BASE_PATH ?? "";
  const abs = (path: string) => `http://localhost:${port}${base}${path}`;
  return html
    .replace(/src="\/api\/storage\/public-objects\/objects\//g, `src="${abs("/api/storage/objects/")}`)
    .replace(/src="\/api\/storage\/objects\//g, `src="${abs("/api/storage/objects/")}`)
    .replace(/src="\/api\/storage\/public-objects\//g, `src="${abs("/api/storage/public-objects/")}`)
    .replace(/src="\/objects\//g, `src="${abs("/api/storage/objects/")}`);
}

/** Make a downloaded HTML proposal portable outside the app.
 * Relative storage URLs work in the public microsite, but break when the HTML
 * is opened from file://. Rewrite them to the same public origin that served
 * the download so logo and proposal images continue to load.
 */
function absolutifyStorageUrlsForDownload(html: string, req: any): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = forwardedHost || req.get?.("host") || req.headers.host || "";
  if (!host) return html;
  const origin = `${protocol}://${host}`;
  const toAbsolute = (path: string) => `${origin}${path}`;
  return html
    .replace(/src="\/api\/storage\/public-objects\/objects\//g, `src="${toAbsolute("/api/storage/objects/")}`)
    .replace(/src="\/api\/storage\/objects\//g, `src="${toAbsolute("/api/storage/objects/")}`)
    .replace(/src="\/api\/storage\/public-objects\//g, `src="${toAbsolute("/api/storage/public-objects/")}`)
    .replace(/src="\/objects\//g, `src="${toAbsolute("/api/storage/objects/")}`)
    .replace(/href="\/api\/storage\/public-objects\/objects\//g, `href="${toAbsolute("/api/storage/objects/")}`)
    .replace(/href="\/api\/storage\/objects\//g, `href="${toAbsolute("/api/storage/objects/")}`)
    .replace(/href="\/objects\//g, `href="${toAbsolute("/api/storage/objects/")}`);
}

/**
 * Inline tenant-owned storage images into standalone proposal exports.
 * Avoid server-side requests to arbitrary URLs (SSRF) and avoid exposing
 * authenticated/private object paths in portable HTML.
 */
async function embedProposalStorageImages(html: string, tenantId: string, requestHost?: string): Promise<string> {
  const references = new Set<string>();
  const imageAttribute = /\b(?:src|poster)\s*=\s*(["'])(.*?)\1/gi;
  const cssImage = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  const identify = (raw: string): string | null => {
    const value = raw.replace(/&amp;/g, "&").trim();
    let path = value;
    if (/^https?:\/\//i.test(value)) {
      // Only process URLs belonging to this API. Never fetch arbitrary hosts.
      try {
        const url = new URL(value);
        const allowed = [
          process.env.PUBLIC_API_URL, process.env.API_PUBLIC_URL,
          process.env.APP_URL, process.env.FRONTEND_URL,
        ].filter(Boolean).map(v => { try { return new URL(String(v)).host; } catch { return ""; } });
        if (!allowed.includes(url.host) && url.host !== requestHost) return null;
        path = url.pathname;
      } catch { return null; }
    }
    if (path.startsWith("/api/storage/public-objects/objects/")) path = path.replace("/api/storage/public-objects/objects/", "/objects/");
    else if (path.startsWith("/api/storage/objects/")) path = path.replace("/api/storage/objects/", "/objects/");
    else if (path.startsWith("/api/storage/public-objects/")) path = path.replace("/api/storage/public-objects/", "/objects/");
    if (!path.startsWith("/objects/")) return null;
    try { path = decodeURI(path.split("?")[0]); } catch { return null; }
    if (path.includes("..") || path.includes("\\")) return null;
    // Uploaded objects are normally stored under tenants/<tenantId>/.
    // Reject references that explicitly name another tenant.
    const owned = path.match(/\/tenants\/([^/]+)\//);
    if (owned && owned[1] !== tenantId) return null;
    return path;
  };
  for (const pattern of [imageAttribute, cssImage]) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[2];
      if (identify(raw)) references.add(raw);
    }
  }
  const resolved = new Map<string, string>();
  await Promise.all(Array.from(references).map(async raw => {
    const path = identify(raw);
    if (!path) return;
    const file = await objectStorage.getObjectEntityFile(path);
    const [metadata] = await file.getMetadata();
    const mime = (metadata.contentType || "").split(";")[0].trim().toLowerCase();
    const allowedMime = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"];
    if (!allowedMime.includes(mime)) throw new Error("Unsupported image format in proposal export");
    if (metadata.size && metadata.size > 12 * 1024 * 1024) throw new Error("Proposal image exceeds export size limit");
    const [buffer] = await file.download();
    if (buffer.length > 12 * 1024 * 1024) throw new Error("Proposal image exceeds export size limit");
    resolved.set(raw, `data:${mime};base64,${buffer.toString("base64")}`);
  }));
  return html.replace(imageAttribute, (full, quote, raw) =>
    resolved.has(raw) ? full.replace(raw, resolved.get(raw)!) : full
  ).replace(cssImage, (full, quote, raw) =>
    resolved.has(raw) ? full.replace(raw, resolved.get(raw)!) : full
  );
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
  res.send(absolutifyStorageUrlsForDownload(await embedProposalStorageImages(row.htmlContent, lead.tenantId, req.get("host")), req));
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
  const pdfBuffer = await generateProposalPDF(absolutifyStorageUrls(await embedProposalStorageImages(row.htmlContent, lead.tenantId, req.get("host"))));
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
type ProposalStageVisualRule = {
  key: string;
  visualType: string;
  promptBase: string;
  negativePrompt: string[];
  quickSuggestions: string[];
};

function normalizeStageVisualText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function proposalStageVisualRule(stageName: string, scopeContext = ""): ProposalStageVisualRule {
  const name = normalizeStageVisualText(stageName);
  const context = normalizeStageVisualText(scopeContext);

  // A classificação visual prioriza SEMPRE o nome da etapa. O escopo é usado
  // apenas para refinar a cena depois da classificação, evitando que palavras
  // como "estrutura", "obra" ou "fundação" dentro de uma descrição desviem a IA
  // para outra fase.
  if (/projeto|legaliza|aprovacao|alvara|documentacao|arquitet/.test(name)) {
    return {
      key: "projetos_legalizacao",
      visualType: "planejamento_aprovacao",
      promptBase:
        "Fotografia profissional hiper-realista de planejamento técnico e aprovação de projeto no Brasil. Representar a etapa de PROJETOS E LEGALIZAÇÃO em ambiente de escritório técnico, sala de reunião ou visita técnica leve. Mostrar arquiteto, engenheiro ou técnico analisando planta baixa, pranchas, desenhos técnicos, documentos, checklist de aprovação ou material de projeto. A cena deve comunicar planejamento, precisão, documentação e tomada de decisão — não execução física da obra.",
      negativePrompt: [
        "NÃO mostrar escavação, terraplenagem, fundações, ferragens, concretagem, alvenaria, ICF, telhado, revestimentos ou obra bruta como assunto principal.",
        "NÃO mostrar trabalhadores executando estrutura, operários usando ferramentas pesadas ou canteiro de obras em produção.",
        "NÃO usar computador genérico ou notebook como assunto principal; plantas, documentos técnicos e interação profissional devem ser visualmente predominantes.",
        "NÃO representar esta etapa como obra em execução.",
      ],
      quickSuggestions: [
        "Mostrar planta e documentação",
        "Reunião técnica com cliente",
        "Aprovação e legalização",
        "Arquiteto e engenheiro analisando projeto",
      ],
    };
  }

  if (/servicos preliminares|limpeza do terreno|preparacao do canteiro|canteiro|sondagem|spt|locacao/.test(name)) {
    return {
      key: "servicos_preliminares",
      visualType: "preparacao_inicial",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de SERVIÇOS PRELIMINARES. Mostrar preparação inicial do terreno, locação da obra, organização do canteiro, limpeza, tapume, gabarito ou sondagem quando compatível com o escopo.",
      negativePrompt: [
        "NÃO mostrar fundação concluída, estrutura avançada, cobertura ou acabamento final.",
        "NÃO mostrar residência pronta.",
      ],
      quickSuggestions: ["Preparação do terreno", "Locação da obra", "Organização do canteiro", "Mais técnico"],
    };
  }

  if (/terraplen|movimentacao de terra|nivelamento/.test(name)) {
    return {
      key: "terraplenagem",
      visualType: "movimento_terra",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de TERRAPLENAGEM. Mostrar movimentação de terra, escavação, nivelamento ou compactação com equipamento adequado e terreno coerente com esta fase.",
      negativePrompt: [
        "NÃO mostrar fundação pronta, pilares, paredes, cobertura ou acabamento.",
        "NÃO transformar a cena em reunião de projeto ou escritório.",
      ],
      quickSuggestions: ["Máquinas em operação", "Nivelamento do terreno", "Preparação do solo", "Mais realista"],
    };
  }

  if (/radier|fundac|sapata|baldrame|estaca/.test(name)) {
    return {
      key: "fundacoes",
      visualType: "fundacao",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de FUNDAÇÕES. Mostrar base estrutural, escavação técnica, preparação, armaduras, formas, passagens e concretagem somente quando compatíveis com o escopo real.",
      negativePrompt: [
        "NÃO mostrar telhado, revestimentos, interiores acabados ou residência pronta.",
        "NÃO substituir o sistema de fundação especificado por outro sistema.",
      ],
      quickSuggestions: ["Ferragem e formas", "Base estrutural", "Execução técnica da fundação", "Mais detalhado"],
    };
  }

  if (/laje/.test(name)) {
    return {
      key: "lajes",
      visualType: "laje",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de LAJES. Mostrar execução da laje, escoramento, vigotas/EPS, armações, passagens e concretagem apenas conforme o escopo.",
      negativePrompt: ["NÃO mostrar telhado ou fachada acabada como assunto principal.", "NÃO mostrar interiores decorados."],
      quickSuggestions: ["Execução da laje", "Ferragem e formas", "Mais técnico", "Mais realista"],
    };
  }

  if (/cobertura|telha|rufo|calha|telhado/.test(name)) {
    return {
      key: "cobertura",
      visualType: "cobertura",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de COBERTURA. Mostrar estrutura de cobertura, telhas, rufos, calhas ou impermeabilização conforme o escopo real.",
      negativePrompt: ["NÃO mostrar fundações ou terraplenagem.", "NÃO usar acabamento interno como assunto principal."],
      quickSuggestions: ["Estrutura do telhado", "Montagem da cobertura", "Mais comercial", "Mais técnico"],
    };
  }

  if (/hidraul|hidrossanit|tubulacao|esgoto|agua|pex|cisterna|boiler|pressur/.test(name)) {
    return {
      key: "instalacoes_hidraulicas",
      visualType: "instalacao_hidraulica",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de INSTALAÇÕES HIDRÁULICAS/HIDROSSANITÁRIAS. Mostrar tubulações, conexões, caixas, shafts e pontos de água/esgoto coerentes com o escopo.",
      negativePrompt: ["NÃO usar instalação elétrica como assunto principal.", "NÃO mostrar acabamento final como se a infraestrutura estivesse oculta."],
      quickSuggestions: ["Tubulações aparentes", "Pontos hidráulicos", "Infraestrutura técnica", "Mais detalhado"],
    };
  }

  if (/eletric|quadro|cabo|eletroduto|corrugad|fiacao|iluminacao/.test(name)) {
    return {
      key: "instalacoes_eletricas",
      visualType: "instalacao_eletrica",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de INSTALAÇÕES ELÉTRICAS. Mostrar eletrodutos, caixas, cabeamento, quadro e pontos elétricos coerentes com o escopo real.",
      negativePrompt: ["NÃO usar tubulação hidráulica como assunto principal.", "NÃO mostrar decoração como foco da imagem."],
      quickSuggestions: ["Eletrodutos e pontos", "Infraestrutura elétrica", "Mais técnico", "Mais detalhado"],
    };
  }

  if (/esquadria|porta|janela/.test(name)) {
    const pvc = /pvc/.test(name + " " + context);
    return {
      key: "esquadrias",
      visualType: "esquadrias",
      promptBase: pvc
        ? "Fotografia profissional hiper-realista da etapa de ESQUADRIAS EM PVC. Mostrar instalação ou detalhe técnico-comercial de porta ou janela de PVC, evidenciando perfil, marco, ferragens, vedação e acabamento."
        : "Fotografia profissional hiper-realista da etapa de ESQUADRIAS. Mostrar instalação ou detalhe técnico-comercial de portas e janelas coerentes com o material especificado no escopo.",
      negativePrompt: [
        pvc ? "NÃO substituir PVC por alumínio ou madeira." : "NÃO inventar material diferente do escopo.",
        "NÃO usar fachada completa como assunto principal quando o objetivo for mostrar a esquadria.",
      ],
      quickSuggestions: ["Instalação de esquadrias", "Detalhe de portas e janelas", "Mais premium", "Mais comercial"],
    };
  }

  if (/porcelanato|revestimento|ceramica/.test(name)) {
    return {
      key: "revestimentos",
      visualType: "revestimento_acabamento",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de REVESTIMENTOS. Mostrar aplicação ou acabamento de porcelanato/revestimento coerente com o escopo, com paginação, juntas, textura e qualidade de execução visíveis.",
      negativePrompt: ["NÃO mostrar fundação ou estrutura bruta.", "NÃO usar fachada genérica como substituto do revestimento especificado."],
      quickSuggestions: ["Aplicação de revestimentos", "Acabamento interno", "Mais premium", "Mais comercial"],
    };
  }

  if (/forro.*pintura|pintura.*forro/.test(name)) {
    return {
      key: "forro_pintura",
      visualType: "acabamento_interno",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de FORRO E PINTURA. Mostrar forro de gesso acabado e paredes com pintura residencial de alta qualidade no mesmo ambiente, com acabamento limpo e coerente.",
      negativePrompt: ["NÃO usar fachada externa ou telhado como substituto de forro.", "NÃO mostrar obra estrutural como foco principal."],
      quickSuggestions: ["Forro de gesso", "Parede pintada", "Acabamento premium", "Mais realista"],
    };
  }

  if (/forro|gesso/.test(name)) {
    return {
      key: "forro_gesso",
      visualType: "forro",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de FORRO DE GESSO. Mostrar planos de forro, recortes, sancas ou detalhes de execução coerentes com o escopo.",
      negativePrompt: ["NÃO usar cobertura/telhado como substituto de forro.", "NÃO usar fachada como assunto principal."],
      quickSuggestions: ["Forro de gesso", "Detalhe de acabamento", "Mais técnico", "Mais premium"],
    };
  }

  if (/massa corrida|pintura/.test(name)) {
    return {
      key: "pintura",
      visualType: "pintura",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de PINTURA. Mostrar preparação e acabamento uniforme de paredes, com foco na qualidade da superfície e aplicação.",
      negativePrompt: ["NÃO usar revestimento cerâmico como substituto.", "NÃO usar fachada completa como assunto principal."],
      quickSuggestions: ["Preparação de parede", "Pintura final", "Mais premium", "Mais realista"],
    };
  }

  if (/icf|estrutura|elevacao|paredes/.test(name)) {
    return {
      key: "estrutura",
      visualType: "estrutura",
      promptBase: /icf/.test(name + " " + context)
        ? "Fotografia profissional hiper-realista da etapa de ESTRUTURA EM ICF. Mostrar blocos/painéis brancos de ICF, armações e concretagem somente quando previstos, com o sistema construtivo claramente identificável."
        : "Fotografia profissional hiper-realista da etapa de ESTRUTURA. Mostrar o sistema estrutural real especificado no escopo, com materiais e estado construtivo coerentes.",
      negativePrompt: [
        /icf/.test(name + " " + context) ? "NÃO representar alvenaria cerâmica convencional como sistema principal." : "NÃO inventar sistema construtivo diferente do escopo.",
        "NÃO mostrar acabamento final como foco principal.",
      ],
      quickSuggestions: ["Montagem estrutural", "Paredes em execução", "Mostrar sistema construtivo", "Mais técnico"],
    };
  }

  if (/limpeza final|entrega/.test(name)) {
    return {
      key: "limpeza_entrega",
      visualType: "entrega_final",
      promptBase:
        "Fotografia profissional hiper-realista da etapa de LIMPEZA FINAL E ENTREGA. Mostrar ambiente ou residência concluída, limpa, revisada e pronta para uso.",
      negativePrompt: ["NÃO mostrar obra bruta, escavação ou estrutura inacabada."],
      quickSuggestions: ["Ambiente finalizado", "Entrega ao cliente", "Mais comercial", "Mais premium"],
    };
  }

  return {
    key: "generico",
    visualType: "etapa_generica",
    promptBase:
      "Fotografia profissional hiper-realista representando exatamente o serviço desta etapa. Usar o nome e os itens do orçamento como fonte de verdade visual e mostrar apenas o estado construtivo coerente com esta fase.",
    negativePrompt: [
      "NÃO mostrar elementos incompatíveis com o escopo real da etapa.",
      "NÃO usar cena genérica de obra quando o nome da etapa indicar uma atividade específica.",
    ],
    quickSuggestions: ["Mais técnico", "Mais comercial", "Mais realista"],
  };
}

function proposalHouseVisualDirection(input: {
  estiloCasa?: unknown;
  padraoCasa?: unknown;
  tipoCasa?: unknown;
  elementosVisuais?: unknown;
}): string {
  const estiloMap: Record<string, string> = {
    moderna: "arquitetura moderna brasileira de alto nível",
    contemporanea: "arquitetura contemporânea brasileira sofisticada",
    minimalista: "arquitetura minimalista refinada, volumes limpos e proporções elegantes",
    classica: "arquitetura clássica contemporânea, elegante e sóbria",
    industrial: "arquitetura industrial sofisticada com concreto, metal, vidro e madeira",
  };
  const padraoMap: Record<string, string> = {
    medio: "padrão residencial médio bem executado",
    alto_padrao: "CASA DE ALTO PADRÃO, materiais premium, paisagismo profissional, proporções arquitetônicas sofisticadas e acabamento impecável",
    luxo: "RESIDÊNCIA DE LUXO, arquitetura autoral, materiais nobres, paisagismo exuberante e acabamento excepcional",
  };
  const tipoMap: Record<string, string> = {
    terrea: "residência térrea",
    sobrado: "sobrado residencial",
  };
  const estilo = estiloMap[String(input.estiloCasa ?? "")] ?? estiloMap.contemporanea;
  const padrao = padraoMap[String(input.padraoCasa ?? "")] ?? padraoMap.alto_padrao;
  const tipo = tipoMap[String(input.tipoCasa ?? "")] ?? tipoMap.sobrado;
  const elementos = Array.isArray(input.elementosVisuais)
    ? input.elementosVisuais
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 12)
    : [];

  return [
    "DIREÇÃO VISUAL GLOBAL DA PROPOSTA:",
    `A linguagem arquitetônica deve remeter a ${tipo}, ${estilo}, ${padrao}.`,
    elementos.length ? `Elementos visuais desejados quando forem compatíveis com a cena: ${elementos.join(", ")}.` : "",
    "Mesmo em fotos de obra, o contexto deve parecer uma residência sofisticada, organizada e coerente com uma casa de alto padrão; evitar casas populares, obras precárias, alvenaria genérica mal-acabada e cenários visualmente pobres.",
    "A prioridade é: COERÊNCIA COM A ETAPA > PADRÃO ARQUITETÔNICO PREMIUM > FOTOREALISMO.",
  ].filter(Boolean).join("\n");
}

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
    ? req.body.stageIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const uniqueStageIds = Array.from(new Set(requestedStageIds));

  if (uniqueStageIds.length === 0) {
    res.status(422).json({
      error: "Selecione explicitamente pelo menos uma etapa. Geração automática de imagens foi desativada por segurança.",
    });
    return;
  }
  if (uniqueStageIds.length > 3) {
    res.status(422).json({
      error: "Por segurança de custos, é permitido gerar no máximo 3 imagens por ação.",
    });
    return;
  }

  const userActionId = typeof req.body?.userActionId === "string" ? req.body.userActionId.trim() : "";
  if (userActionId.length < 12) {
    res.status(422).json({
      error: "A geração de imagem precisa de uma ação explícita do usuário identificada por userActionId.",
    });
    return;
  }

  const customPrompt =
    typeof req.body?.customPrompt === "string"
      ? req.body.customPrompt.trim().slice(0, 1800)
      : "";

  const regenerate = req.body?.regenerate === true;
  if (regenerate && req.body?.confirmRegenerate !== true) {
    res.status(422).json({
      error: "Para regenerar imagens existentes, confirme explicitamente a regeneração.",
    });
    return;
  }

  const actionKey = `${lead.tenantId}:${proposta.id}:${userActionId}`;
  if (!reservePaidImageAction(actionKey)) {
    res.status(409).json({
      error: "Esta ação de geração já foi processada ou está em andamento. Evitamos cobrança duplicada.",
    });
    return;
  }

  const requestedSet = new Set(uniqueStageIds);
  const targetGroups = groups.filter((group) => requestedSet.has(group.id));

  if (!targetGroups.length) {
    res.status(422).json({ error: "Nenhuma etapa válida foi selecionada." });
    return;
  }

  const presentation = (proposta.apresentacao ?? {}) as Record<string, any>;
  const visualDirection = proposalHouseVisualDirection({
    estiloCasa: req.body?.estiloCasa ?? presentation.estiloCasa,
    padraoCasa: req.body?.padraoCasa ?? presentation.padraoCasa,
    tipoCasa: req.body?.tipoCasa ?? presentation.tipoCasa,
    elementosVisuais: Array.isArray(req.body?.elementosVisuais) ? req.body.elementosVisuais : presentation.elementosVisuais,
  });
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

    const visualRule = proposalStageVisualRule(group.nome, scope);

    const prompt = [
      visualRule.promptBase,
      `ETAPA: "${group.nome}".`,
      scope ? `ESCOPO REAL DESTA ETAPA — fonte de verdade:\n${scope}` : "",
      visualRule.key === "projetos_legalizacao"
        ? "Esta é uma fase de PLANEJAMENTO, PROJETO, DOCUMENTAÇÃO E APROVAÇÃO. Não trate esta etapa como execução física da obra."
        : "Mostrar somente o estado construtivo coerente com esta fase, sem antecipar etapas posteriores.",
      visualDirection,
      "Prioridade obrigatória: 1) nome da etapa, 2) escopo real do orçamento, 3) instrução do usuário, 4) direção visual global.",
      customPrompt ? `INSTRUÇÃO ADICIONAL DO USUÁRIO: ${customPrompt}` : "",
      "A instrução do usuário pode mudar enquadramento, ambiente, linguagem visual ou foco, mas NÃO pode transformar a etapa em outra atividade.",
      ...visualRule.negativePrompt,
      "Fotografia profissional realista, composição horizontal 3:2, luz natural coerente, escala correta, geometria consistente e sem objetos deformados.",
      visualRule.key !== "projetos_legalizacao"
        ? "Quando houver trabalhadores, usar EPI adequado e contexto organizado."
        : "Quando houver pessoas, priorizar interação profissional entre arquiteto, engenheiro, técnico e/ou cliente, sem ação de construção pesada.",
      "A imagem é representativa da etapa e não deve fingir ser fotografia do projeto real do cliente.",
      "Sem textos legíveis, sem logotipos, sem marcas d'água, sem molduras e sem antes/depois.",
    ].filter(Boolean).join("\n");

    try {
      const { urls } = await generateImage(lead.tenantId, "image_generator", prompt, {
        model: "gpt-image-1",
        size: "1536x1024",
        n: 1,
        log: req.log,
        requestId: `${userActionId}:${group.id}`,
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
        estiloCasa:
          ["moderna","contemporanea","minimalista","classica","industrial"].includes(String(req.body?.estiloCasa))
            ? req.body.estiloCasa
            : presentation.estiloCasa ?? "contemporanea",
        padraoCasa:
          ["medio","alto_padrao","luxo"].includes(String(req.body?.padraoCasa))
            ? req.body.padraoCasa
            : presentation.padraoCasa ?? "alto_padrao",
        tipoCasa: req.body?.tipoCasa === "terrea" ? "terrea" : (presentation.tipoCasa ?? "sobrado"),
        elementosVisuais: Array.isArray(req.body?.elementosVisuais)
          ? req.body.elementosVisuais.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12)
          : presentation.elementosVisuais ?? [],
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
    selectedStages: targetGroups.length,
    safety: {
      maxImagesPerAction: 3,
      explicitUserActionRequired: true,
      duplicateActionProtection: true,
    },
  });
});


router.post("/leads/:leadId/proposals/stage-image/manual", async (req, res) => {
  // tenant-audit: reviewed route validates lead/proposal ownership before mutating presentation images
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
  const stageId = typeof req.body?.stageId === "string" ? req.body.stageId.trim() : "";
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";

  if (!propostaId || !stageId) {
    res.status(400).json({ error: "propostaId e stageId são obrigatórios" });
    return;
  }
  if (imageUrl && !/^\/api\/storage\//.test(imageUrl) && !/^https?:\/\//i.test(imageUrl)) {
    res.status(422).json({ error: "URL de imagem inválida" });
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

  const presentation = (proposta.apresentacao ?? {}) as Record<string, any>;
  const stageImages: Record<string, string> = {
    ...((presentation.imagensEtapas && typeof presentation.imagensEtapas === "object")
      ? presentation.imagensEtapas
      : {}),
  };

  if (imageUrl) stageImages[stageId] = imageUrl;
  else delete stageImages[stageId];

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

  res.json({ stageId, imageUrl: imageUrl || null, removed: !imageUrl });
});


router.post("/leads/:leadId/proposals/cover-image", async (req, res) => {
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

  const userActionId = typeof req.body?.userActionId === "string" ? req.body.userActionId.trim() : "";
  if (userActionId.length < 12) {
    res.status(422).json({ error: "A geração da capa exige uma ação explícita identificada por userActionId." });
    return;
  }

  const actionKey = `${lead.tenantId}:${proposta.id}:cover:${userActionId}`;
  if (!reservePaidImageAction(actionKey)) {
    res.status(409).json({ error: "Esta ação já foi processada ou está em andamento." });
    return;
  }

  const presentation = (proposta.apresentacao ?? {}) as Record<string, any>;
  const estiloCasa = req.body?.estiloCasa ?? presentation.estiloCasa ?? "contemporanea";
  const padraoCasa = req.body?.padraoCasa ?? presentation.padraoCasa ?? "alto_padrao";
  const tipoCasa = req.body?.tipoCasa ?? presentation.tipoCasa ?? "sobrado";
  const elementosVisuais = Array.isArray(req.body?.elementosVisuais)
    ? req.body.elementosVisuais
    : presentation.elementosVisuais ?? [];
  const visualDirection = proposalHouseVisualDirection({
    estiloCasa,
    padraoCasa,
    tipoCasa,
    elementosVisuais,
  });

  const prompt = [
    "Fotografia arquitetônica hiper-realista de uma residência brasileira de alto padrão concluída, composição horizontal 16:9, enquadramento editorial premium para capa de proposta comercial de construtora.",
    visualDirection,
    "Mostrar a residência completa com fachada sofisticada, paisagismo profissional, materiais nobres e iluminação arquitetônica realista.",
    "A imagem deve parecer fotografia profissional de arquitetura, não ilustração, não desenho, não maquete 3D artificial.",
    "Evitar aparência de casa popular, obra inacabada, materiais baratos, proporções estranhas, excesso de elementos, carros deformados, pessoas em destaque, textos, logotipos e marcas d'água.",
    "Priorizar elegância, proporção, realismo, materiais premium, esquadrias amplas e composição de alto padrão coerente com o estilo selecionado.",
  ].filter(Boolean).join("\n");

  try {
    const { urls } = await generateImage(lead.tenantId, "image_generator", prompt, {
      model: "gpt-image-1",
      size: "1536x1024",
      n: 1,
      log: req.log,
      requestId: `${userActionId}:cover`,
    });
    const providerUrl = urls[0];
    if (!providerUrl) throw new Error("IA não retornou imagem");

    const imageResponse = await fetch(providerUrl);
    if (!imageResponse.ok) throw new Error(`Falha ao baixar imagem gerada (${imageResponse.status})`);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const objectPath = await objectStorage.savePrivateBuffer(
      buffer,
      contentType,
      `proposta-capa-${proposta.id}.png`,
    );
    const imageUrl = `/api/storage${objectPath}`;

    await db
      .update(propostasTable)
      .set({
        apresentacao: {
          ...(proposta.apresentacao ?? {}),
          estiloCasa,
          padraoCasa,
          tipoCasa,
          elementosVisuais: Array.isArray(elementosVisuais)
            ? elementosVisuais.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12)
            : [],
          imagemCapa: imageUrl,
        },
        updatedAt: new Date(),
      })
      .where(eq(propostasTable.id, proposta.id));

    res.json({ imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar imagem de capa";
    req.log.warn({ err, propostaId }, "proposal premium cover generation failed");
    res.status(502).json({ error: message });
  }
});


router.post("/leads/:leadId/proposals/cover-image/manual", async (req, res) => {
  // tenant-audit: reviewed route validates lead/proposal ownership before mutating cover image
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
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";

  if (!propostaId) {
    res.status(400).json({ error: "propostaId é obrigatório" });
    return;
  }
  if (imageUrl && !/^\/api\/storage\//.test(imageUrl) && !/^https?:\/\//i.test(imageUrl)) {
    res.status(422).json({ error: "URL de imagem inválida" });
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

  await db
    .update(propostasTable)
    .set({
      apresentacao: {
        ...(proposta.apresentacao ?? {}),
        imagemCapa: imageUrl || undefined,
      },
      updatedAt: new Date(),
    })
    .where(eq(propostasTable.id, proposta.id));

  res.json({ imageUrl: imageUrl || null, removed: !imageUrl });
});

// ── Async proposal generation ────────────────────────────────────────────────
// Cloudflare can terminate long-running HTTP requests with 524 before the AI
// finishes. The browser therefore starts a short job request, while the actual
// generation runs through an internal loopback request that never crosses
// Cloudflare. The UI polls the lightweight status endpoint below.
type ProposalGenerationJob = {
  tenantId: string;
  leadId: string;
  status: "processing" | "success" | "error";
  version?: number;
  error?: string;
  createdAt: number;
};

const proposalGenerationJobs = new Map<string, ProposalGenerationJob>();

function postLoopbackJson(url: string, authorization: string, payload: string): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        // Proposal generation can legitimately exceed Node fetch/undici's
        // ~5 minute headers timeout. Keep the internal loopback request alive;
        // the browser polls a separate lightweight status endpoint.
        timeout: 0,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 500,
            raw: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function scheduleProposalGenerationJobCleanup(jobId: string) {
  const timer = setTimeout(() => proposalGenerationJobs.delete(jobId), 15 * 60 * 1000);
  timer.unref?.();
}

router.get("/leads/:leadId/proposal-preflight", async (req, res) => {
  const leadId = String(req.params.leadId);
  const tenantId = req.user?.tenantId ?? "";
  const ctx = await loadProposalContext(leadId, tenantId);
  if (!ctx) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && ctx.lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const propostaId = typeof req.query.propostaId === "string" ? req.query.propostaId.trim() : "";
  const pending: Array<{
    code: string;
    severity: "blocker" | "warning";
    source: "business_plan" | "company" | "client" | "catalog" | "budget" | "media";
    field?: string;
    message: string;
  }> = [];

  let approvedBusinessPlanContext = "";
  try {
    approvedBusinessPlanContext = await loadApprovedBusinessContext(ctx.lead.tenantId, "closer");
  } catch {}

  if (!approvedBusinessPlanContext.trim()) {
    pending.push({ code: "BUSINESS_PLAN_APPROVED_CONTEXT_MISSING", severity: "warning", source: "business_plan", message: "Plano de Negócios ainda não possui contexto aprovado para o Closer." });
  }
  if (!ctx.tenantName) {
    pending.push({ code: "COMPANY_NAME_MISSING", severity: "warning", source: "company", message: "Nome da empresa não está preenchido." });
  }
  if (!ctx.briefing) {
    pending.push({ code: "CLIENT_BRIEFING_MISSING", severity: "warning", source: "client", message: "Briefing do cliente ainda não foi preenchido." });
  }

  let budget: any = null;
  let integrity: any = null;
  if (!propostaId) {
    pending.push({ code: "BUDGET_MISSING", severity: "blocker", source: "budget", field: "propostaId", message: "Selecione um orçamento/revisão antes de gerar a proposta." });
  } else {
    const audited = await loadBudgetIntegrityForProposal(ctx.lead.tenantId, leadId, propostaId);
    if (!audited) {
      pending.push({ code: "BUDGET_NOT_FOUND", severity: "blocker", source: "budget", field: "propostaId", message: "O orçamento selecionado não foi encontrado para este cliente." });
    } else {
      budget = audited.budget;
      integrity = audited.integrity;
      for (const issue of audited.integrity.issues ?? []) {
        pending.push({
          code: issue.code,
          severity: issue.severity,
          source: "budget",
          field: issue.field,
          message: issue.message,
        });
      }
      if (!budget.formaPagamento && !budget.condPagamento && !(budget.paymentCompositions?.length)) {
        pending.push({ code: "PAYMENT_TERMS_MISSING", severity: "warning", source: "budget", field: "condPagamento", message: "Condições de pagamento não estão preenchidas." });
      }
      if (!budget.prazoEntrega) {
        pending.push({ code: "DELIVERY_TERM_MISSING", severity: "warning", source: "budget", field: "prazoEntrega", message: "Prazo de entrega/execução não está preenchido." });
      }
      if (!budget.validadeAte) {
        pending.push({ code: "VALIDITY_MISSING", severity: "warning", source: "budget", field: "validadeAte", message: "Validade da proposta não está preenchida." });
      }
    }
  }

  const blockers = pending.filter((item) => item.severity === "blocker").length;
  const warnings = pending.filter((item) => item.severity === "warning").length;
  res.json({
    ready: blockers === 0,
    blockers,
    warnings,
    pending,
    budget: budget ? { id: budget.id, numero: budget.numero, titulo: budget.titulo, status: budget.status } : null,
    integrity,
  });
});

router.post("/leads/:leadId/proposals/async", async (req, res) => {
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

  const authorization = typeof req.headers.authorization === "string"
    ? req.headers.authorization
    : "";
  if (!authorization) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestedBudgetId = typeof req.body?.propostaId === "string" ? req.body.propostaId.trim() : "";
  if (!requestedBudgetId) {
    res.status(422).json({ error: "Selecione um orçamento antes de gerar a proposta." });
    return;
  }
  const auditedBudget = await loadBudgetIntegrityForProposal(ctx.lead.tenantId, leadId, requestedBudgetId);
  if (!auditedBudget) {
    res.status(404).json({ error: "Orçamento selecionado não encontrado para este lead." });
    return;
  }
  if (!auditedBudget.integrity.ok) {
    res.status(409).json({
      error: "O orçamento possui inconsistências críticas e precisa ser corrigido antes de gerar a proposta.",
      integrity: auditedBudget.integrity,
    });
    return;
  }

  // Encode the current proposal version + start time into the job id.
  // The status poll can then recover across rolling deploys / multiple replicas,
  // even when the in-memory Map lives on a different process.
  const [latestBeforeGeneration] = await db
    .select({ version: leadProposalsTable.version })
    .from(leadProposalsTable)
    .where(and(
      eq(leadProposalsTable.leadId, leadId),
      eq(leadProposalsTable.tenantId, ctx.lead.tenantId),
    ))
    .orderBy(desc(leadProposalsTable.version))
    .limit(1);
  const baselineVersion = Number(latestBeforeGeneration?.version ?? 0);
  const startedAt = Date.now();
  const jobId = `${baselineVersion}.${startedAt}.${crypto.randomUUID()}`;
  proposalGenerationJobs.set(jobId, {
    tenantId: ctx.lead.tenantId,
    leadId,
    status: "processing",
    createdAt: startedAt,
  });
  scheduleProposalGenerationJobCleanup(jobId);

  // Return immediately so the edge proxy never waits for the AI provider.
  res.status(202).json({ jobId, status: "processing" });

  const port = process.env.PORT ?? "8080";
  const basePath = process.env.BASE_PATH ?? "";
  const internalUrl = `http://127.0.0.1:${port}${basePath}/api/leads/${encodeURIComponent(leadId)}/proposals`;
  const payload = JSON.stringify(req.body ?? {});
  const log = req.log;

  setImmediate(() => {
    void postLoopbackJson(internalUrl, authorization, payload)
      .then(async ({ status, raw }) => {
        let body: any = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }

        if (status < 200 || status >= 300) {
          const message =
            body?.error
            || body?.message
            || (raw && !/^\s*</.test(raw) ? raw.slice(0, 500) : "")
            || `Falha ao gerar proposta (HTTP ${status})`;
          proposalGenerationJobs.set(jobId, {
            tenantId: ctx.lead.tenantId,
            leadId,
            status: "error",
            error: String(message),
            createdAt: Date.now(),
          });
          log.warn({ jobId, leadId, status, error: message }, "async proposal generation failed");
          return;
        }

        let version = Number(body?.version);
        if (!Number.isFinite(version) || version <= 0) {
          // The proposal may have been committed successfully even when the
          // loopback response body is incomplete. Recover the durable version
          // from the database before reporting a false failure to the UI.
          const [latestAfterGeneration] = await db
            .select({ version: leadProposalsTable.version })
            .from(leadProposalsTable)
            .where(and(
              eq(leadProposalsTable.leadId, leadId),
              eq(leadProposalsTable.tenantId, ctx.lead.tenantId),
            ))
            .orderBy(desc(leadProposalsTable.version))
            .limit(1);

          const recoveredVersion = Number(latestAfterGeneration?.version ?? 0);
          if (Number.isFinite(recoveredVersion) && recoveredVersion > baselineVersion) {
            version = recoveredVersion;
            log.warn(
              { jobId, leadId, baselineVersion, recoveredVersion },
              "async proposal generation recovered version from database",
            );
          } else {
            proposalGenerationJobs.set(jobId, {
              tenantId: ctx.lead.tenantId,
              leadId,
              status: "error",
              error: "A proposta foi processada, mas a versão gerada não foi identificada.",
              createdAt: Date.now(),
            });
            return;
          }
        }

        proposalGenerationJobs.set(jobId, {
          tenantId: ctx.lead.tenantId,
          leadId,
          status: "success",
          version,
          createdAt: Date.now(),
        });
        log.info({ jobId, leadId, version }, "async proposal generation completed");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Falha interna ao gerar proposta";
        proposalGenerationJobs.set(jobId, {
          tenantId: ctx.lead.tenantId,
          leadId,
          status: "error",
          error: message,
          createdAt: Date.now(),
        });
        log.error({ jobId, leadId, error: message }, "async proposal generation crashed");
      });
  });
});

router.get("/leads/:leadId/proposals/generation/:jobId", async (req, res) => {
  const leadId = String(req.params.leadId);
  const jobId = String(req.params.jobId);
  const job = proposalGenerationJobs.get(jobId);

  if (!job || job.leadId !== leadId) {
    // In-memory jobs are process-local. During a rolling deploy or with more
    // than one replica, the poll may land on another process. Recover from the
    // durable proposal table using the baseline encoded in the job id.
    const [baselineRaw, startedAtRaw] = jobId.split(".");
    const baselineVersion = Number(baselineRaw);
    const startedAt = Number(startedAtRaw);
    const recoverable =
      Number.isFinite(baselineVersion)
      && baselineVersion >= 0
      && Number.isFinite(startedAt)
      && startedAt > 0;

    const [lead] = await db
      .select({ tenantId: leadsTable.tenantId })
      .from(leadsTable)
      .where(eq(leadsTable.id, leadId))
      .limit(1);

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (recoverable) {
      const [latest] = await db
        .select({ version: leadProposalsTable.version })
        .from(leadProposalsTable)
        .where(and(
          eq(leadProposalsTable.leadId, leadId),
          eq(leadProposalsTable.tenantId, lead.tenantId),
        ))
        .orderBy(desc(leadProposalsTable.version))
        .limit(1);

      const latestVersion = Number(latest?.version ?? 0);
      if (latestVersion > baselineVersion) {
        res.json({ jobId, status: "success", version: latestVersion, recovered: true });
        return;
      }

      if (Date.now() - startedAt < 15 * 60 * 1000) {
        res.json({ jobId, status: "processing", recovered: true });
        return;
      }
    }

    res.status(404).json({ error: "Geração não encontrada ou expirada." });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && job.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json({
    jobId,
    status: job.status,
    ...(job.version ? { version: job.version } : {}),
    ...(job.error ? { error: job.error } : {}),
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

  let approvedBusinessPlanContext = "";
  try {
    approvedBusinessPlanContext = await loadApprovedBusinessContext(tenantId, "closer");
  } catch (err: any) {
    req.log.warn({ tenantId, error: err?.message }, "proposal snapshot: failed to load approved PN context");
  }

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

  // The selected budget is the commercial source of truth.
  // Load it before calling AI so the narrative is anchored to the same
  // orçamento that will be rendered deterministically later.
  const bodyPropostaId: string | null = req.body?.propostaId ? String(req.body.propostaId) : null;
  let selectedBudgetForAI: {
    titulo: string;
    valorTotal?: string | null;
    itens?: unknown[];
    observacoes?: string | null;
  } | null = null;

  if (bodyPropostaId) {
    const auditedBudget = await loadBudgetIntegrityForProposal(tenantId, leadId, bodyPropostaId);
    if (!auditedBudget) {
      res.status(404).json({ error: "Orçamento selecionado não encontrado para este lead." });
      return;
    }
    if (!auditedBudget.integrity.ok) {
      res.status(409).json({
        error: "O orçamento possui inconsistências críticas e precisa ser corrigido antes de gerar a proposta.",
        integrity: auditedBudget.integrity,
      });
      return;
    }
    selectedBudgetForAI = {
      titulo: auditedBudget.budget.titulo,
      valorTotal: auditedBudget.budget.valorTotal,
      itens: auditedBudget.budget.itens,
      observacoes: auditedBudget.budget.observacoes,
    };
  }

  const prompt = buildProposalPrompt({
    leadName: ctx.lead.nome,
    empresa: ctx.lead.empresa,
    objetivo: ctx.lead.objetivo,
    mercadoSegmento: ctx.lead.mercadoSegmento,
    logoUrl: ctx.lead.logoUrl,
    corDestaque: ctx.lead.corDestaque,
    products: ctx.products,
    propostas: selectedBudgetForAI ? [selectedBudgetForAI] : [],
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
    tenantBusinessContext: ctx.tenantBusinessContext,
    refinementNotes: req.body?.refinementNotes ? String(req.body.refinementNotes) : null,
    styleMemory,
    templateGuidance: await (async () => {
      const dd = (ctx.discoveryData ?? {}) as Record<string, unknown>;

      const raw = Array.isArray(dd["proposalTemplates"])
        ? dd["proposalTemplates"] as Array<Record<string, unknown>>
        : [];
      const requestedId = typeof req.body?.proposalTemplateId === "string"
        ? req.body.proposalTemplateId
        : null;
      const requested = requestedId ? raw.find((item) => item["id"] === requestedId) : null;
      const defaultModel = raw.find((item) => item["isDefault"] === true);
      const selectedLegacy = requested ?? defaultModel;
      const legacyUrl = typeof selectedLegacy?.["url"] === "string"
        ? selectedLegacy["url"] as string
        : ctx.proposalTemplateUrl;
      const legacyGuidance = await fetchTemplateGuidance(legacyUrl);

      const builderTemplates = Array.isArray(dd["proposalBuilderTemplates"])
        ? dd["proposalBuilderTemplates"] as Array<Record<string, unknown>>
        : [];
      const requestedBuilderId = typeof req.body?.proposalBuilderTemplateId === "string"
        ? req.body.proposalBuilderTemplateId
        : null;
      const activeBuilderId = typeof dd["activeProposalBuilderTemplateId"] === "string"
        ? dd["activeProposalBuilderTemplateId"] as string
        : null;
      const selectedBuilder =
        (requestedBuilderId
          ? builderTemplates.find((item) => item["id"] === requestedBuilderId)
          : null)
        ?? (activeBuilderId
          ? builderTemplates.find((item) => item["id"] === activeBuilderId)
          : null)
        ?? builderTemplates.find((item) => item["isDefault"] === true);

      const builderGuidance = selectedBuilder
        ? (() => {
            const modules = Array.isArray(selectedBuilder["modules"])
              ? (selectedBuilder["modules"] as Array<Record<string, unknown>>)
                  .filter((item) => item["enabled"] !== false)
                  .sort((a, b) => Number(a["order"] ?? 999) - Number(b["order"] ?? 999))
                  .map((item) => String(item["key"] ?? ""))
                  .filter(Boolean)
              : [];
            const aiRules = selectedBuilder["aiRules"] && typeof selectedBuilder["aiRules"] === "object"
              ? selectedBuilder["aiRules"] as Record<string, unknown>
              : {};
            const visualStyle = selectedBuilder["visualStyle"] && typeof selectedBuilder["visualStyle"] === "object"
              ? selectedBuilder["visualStyle"] as Record<string, unknown>
              : {};
            const list = (value: unknown) =>
              Array.isArray(value)
                ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                : [];
            const constructionV2Guidance = selectedBuilder["proposalKind"] === "construction_project"
              ? [
                  "REGRA CONSTRUÇÃO V2: permitir fases/subfases dentro da mesma etapa executiva sem duplicar custo contratado.",
                  "REGRA CONSTRUÇÃO V2: cronograma parte da primeira data definida e projeta etapas seguintes por duração/dependência; etapas independentes podem ocorrer simultaneamente.",
                  "REGRA CONSTRUÇÃO V2: físico-financeiro é mensal e deve mostrar planejamento físico e financeiro por período.",
                  "REGRA CONSTRUÇÃO V2: entrada/sinal é adiantamento contratual e não aumenta o valor total da obra.",
                  "REGRA CONSTRUÇÃO V2: quando houver amortização da entrada nas medições, apresentar medição bruta, desconto proporcional da entrada e parcela líquida.",
                  "REGRA CONSTRUÇÃO V2: não impor sequência rígida quando o planejamento permitir paralelismo.",
                ]
              : [];
            return [
              `MODELO MODULAR DO TENANT: ${String(selectedBuilder["name"] ?? "Modelo padrão")}`,
              modules.length ? `ORDEM DOS MÓDULOS: ${modules.join(" > ")}` : "",
              visualStyle["preset"] ? `PRESET VISUAL: ${String(visualStyle["preset"])}` : "",
              visualStyle["heroVariant"] ? `CAPA: ${String(visualStyle["heroVariant"])}` : "",
              visualStyle["stageVariant"] ? `APRESENTAÇÃO DAS ETAPAS: ${String(visualStyle["stageVariant"])}` : "",
              visualStyle["investmentVariant"] ? `APRESENTAÇÃO DO INVESTIMENTO: ${String(visualStyle["investmentVariant"])}` : "",
              visualStyle["density"] ? `DENSIDADE VISUAL: ${String(visualStyle["density"])}` : "",
              visualStyle["imageEmphasis"] ? `ÊNFASE EM IMAGENS: ${String(visualStyle["imageEmphasis"])}` : "",
              ...constructionV2Guidance,
              typeof aiRules["tone"] === "string" ? `TOM: ${aiRules["tone"]}` : "",
              typeof aiRules["technicalLevel"] === "string" ? `NÍVEL TÉCNICO: ${aiRules["technicalLevel"]}` : "",
              ...list(aiRules["contentRules"]).map((rule) => `REGRA DE CONTEÚDO: ${rule}`),
              ...list(aiRules["imageRules"]).map((rule) => `REGRA VISUAL: ${rule}`),
              ...list(aiRules["avoid"]).map((rule) => `EVITAR: ${rule}`),
            ].filter(Boolean).join("\n");
          })()
        : "";

      return [legacyGuidance, builderGuidance].filter(Boolean).join("\n\n");
    })(),
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

  const requestedImages: string[] = Array.isArray(req.body?.imagens)
    ? req.body.imagens
        .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value: string) => value.trim())
    : [];

  const proposalBuilderDiscoveryForImages = (ctx.discoveryData ?? {}) as Record<string, unknown>;
  const proposalBuilderTemplatesForImages = Array.isArray(proposalBuilderDiscoveryForImages.proposalBuilderTemplates)
    ? proposalBuilderDiscoveryForImages.proposalBuilderTemplates as Array<Record<string, unknown>>
    : [];
  const requestedBuilderTemplateIdForImages =
    typeof req.body?.proposalBuilderTemplateId === "string"
      ? req.body.proposalBuilderTemplateId
      : null;
  const activeBuilderTemplateIdForImages =
    typeof proposalBuilderDiscoveryForImages.activeProposalBuilderTemplateId === "string"
      ? proposalBuilderDiscoveryForImages.activeProposalBuilderTemplateId as string
      : null;
  const selectedBuilderTemplateForImages =
    (requestedBuilderTemplateIdForImages
      ? proposalBuilderTemplatesForImages.find((item) => item.id === requestedBuilderTemplateIdForImages)
      : null)
    ?? (activeBuilderTemplateIdForImages
      ? proposalBuilderTemplatesForImages.find((item) => item.id === activeBuilderTemplateIdForImages)
      : null)
    ?? proposalBuilderTemplatesForImages.find((item) => item.isDefault === true)
    ?? null;
  const builderWantsStageImages = Boolean(
    selectedBuilderTemplateForImages
      && Array.isArray(selectedBuilderTemplateForImages.modules)
      && (selectedBuilderTemplateForImages.modules as Array<Record<string, unknown>>).some(
        (item) => item && item.enabled !== false && String(item.key) === "imagem_por_etapa",
      ),
  );

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

  const rawPresentation = req.body?.apresentacao;
  const presentationModes = new Set(["completo", "resumo_etapa", "preco_medio"]);
  const bodyPresentation = rawPresentation && typeof rawPresentation === "object"
    ? {
        formato:
          rawPresentation.formato === "documento" || rawPresentation.formato === "hibrido"
            ? rawPresentation.formato
            : "site_interativo",
        estiloCasa:
          ["moderna","contemporanea","minimalista","classica","industrial"].includes(String(rawPresentation.estiloCasa))
            ? String(rawPresentation.estiloCasa)
            : "contemporanea",
        padraoCasa:
          ["medio","alto_padrao","luxo"].includes(String(rawPresentation.padraoCasa))
            ? String(rawPresentation.padraoCasa)
            : "alto_padrao",
        tipoCasa:
          rawPresentation.tipoCasa === "terrea" ? "terrea" : "sobrado",
        elementosVisuais:
          Array.isArray(rawPresentation.elementosVisuais)
            ? rawPresentation.elementosVisuais
                .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
                .map((item: string) => item.trim())
                .slice(0, 12)
            : [],
        imagemCapa:
          typeof rawPresentation.imagemCapa === "string" && rawPresentation.imagemCapa.trim()
            ? rawPresentation.imagemCapa.trim()
            : undefined,
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
        mostrarDetalhamentoTecnico:
          typeof rawPresentation.mostrarDetalhamentoTecnico === "boolean"
            ? rawPresentation.mostrarDetalhamentoTecnico
            : undefined,
        detalhamentoTecnicoEtapas:
          rawPresentation.detalhamentoTecnicoEtapas && typeof rawPresentation.detalhamentoTecnicoEtapas === "object"
            ? Object.fromEntries(
                Object.entries(rawPresentation.detalhamentoTecnicoEtapas)
                  .filter(([, value]) => typeof value === "boolean")
                  .map(([stageId, value]) => [String(stageId), Boolean(value)]),
              )
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
                      ...(typeof row.dependeDeEtapaId === "string" && row.dependeDeEtapaId.trim()
                        ? { dependeDeEtapaId: row.dependeDeEtapaId.trim() }
                        : {}),
                      ...(["FS","SS","FF","SF"].includes(String(row.tipoDependencia))
                        ? { tipoDependencia: String(row.tipoDependencia) as "FS" | "SS" | "FF" | "SF" }
                        : {}),
                      ...(Number.isFinite(Number(row.defasagemDias))
                        ? { defasagemDias: Math.round(Number(row.defasagemDias)) }
                        : {}),
                      ...(typeof row.inicioAutomatico === "boolean"
                        ? { inicioAutomatico: row.inicioAutomatico }
                        : {}),
                      ...(Array.isArray(row.fases)
                        ? { fases: row.fases
                            .filter((phase): phase is Record<string, unknown> => Boolean(phase) && typeof phase === "object")
                            .map((phase, phaseIndex) => ({
                              id: typeof phase.id === "string" && phase.id.trim() ? phase.id.trim() : `fase-${phaseIndex + 1}`,
                              nome: typeof phase.nome === "string" && phase.nome.trim() ? phase.nome.trim() : `Fase ${phaseIndex + 1}`,
                              ordem: Number.isFinite(Number(phase.ordem)) ? Math.max(1, Math.round(Number(phase.ordem))) : phaseIndex + 1,
                              ...(Number.isFinite(Number(phase.duracaoDias)) && Number(phase.duracaoDias) > 0 ? { duracaoDias: Math.round(Number(phase.duracaoDias)) } : {}),
                              ...(Number.isFinite(Number(phase.percentualEtapa)) ? { percentualEtapa: Math.min(100, Math.max(0, Number(phase.percentualEtapa))) } : {}),
                              ...(Number.isFinite(Number(phase.percentualFisico)) ? { percentualFisico: Math.min(100, Math.max(0, Number(phase.percentualFisico))) } : {}),
                              ...(typeof phase.inicioPrevisto === "string" && phase.inicioPrevisto.trim() ? { inicioPrevisto: phase.inicioPrevisto.trim() } : {}),
                              ...(typeof phase.fimPrevisto === "string" && phase.fimPrevisto.trim() ? { fimPrevisto: phase.fimPrevisto.trim() } : {}),
                              ...(typeof phase.dependeDeFaseId === "string" && phase.dependeDeFaseId.trim() ? { dependeDeFaseId: phase.dependeDeFaseId.trim() } : {}),
                              ...(["FS","SS","FF","SF"].includes(String(phase.tipoDependencia)) ? { tipoDependencia: String(phase.tipoDependencia) as "FS" | "SS" | "FF" | "SF" } : {}),
                              ...(Number.isFinite(Number(phase.defasagemDias)) ? { defasagemDias: Math.round(Number(phase.defasagemDias)) } : {}),
                              ...(typeof phase.observacao === "string" && phase.observacao.trim() ? { observacao: phase.observacao.trim() } : {}),
                            })) }
                        : {}),
                      ...(typeof row.marcoPagamento === "string" && row.marcoPagamento.trim()
                        ? { marcoPagamento: row.marcoPagamento.trim() }
                        : {}),
                      ...(Number.isFinite(Number(row.valorGlobalPrevisto)) && Number(row.valorGlobalPrevisto) > 0
                        ? { valorGlobalPrevisto: Number(row.valorGlobalPrevisto) }
                        : {}),
                      ...(Number.isFinite(Number(row.valorReferenciaM2)) && Number(row.valorReferenciaM2) > 0
                        ? { valorReferenciaM2: Number(row.valorReferenciaM2) }
                        : {}),
                      ...(typeof row.mostrarOrcamentoPrevisto === "boolean"
                        ? { mostrarOrcamentoPrevisto: row.mostrarOrcamentoPrevisto }
                        : {}),
                      ...(typeof row.reajusteSeAlteracao === "boolean"
                        ? { reajusteSeAlteracao: row.reajusteSeAlteracao }
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
        areaTotalConstruida:
          Number.isFinite(Number(rawPresentation.areaTotalConstruida)) && Number(rawPresentation.areaTotalConstruida) > 0
            ? Number(rawPresentation.areaTotalConstruida)
            : undefined,
        itensNaoInclusos:
          Array.isArray(rawPresentation.itensNaoInclusos)
            ? rawPresentation.itensNaoInclusos
                .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
                .map((item: string) => item.trim())
                .slice(0, 50)
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
      unidade?: string | null;
    }>;
    valorTotal?: string | null; observacoes?: string | null;
    formaPagamento?: string | null; condPagamento?: string | null; prazoEntrega?: string | null;
    validadeAte?: Date | string | null;
    paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
    apresentacao?: {
      formato?: "site_interativo" | "documento" | "hibrido";
      estiloCasa?: "moderna" | "contemporanea" | "minimalista" | "classica" | "industrial";
      padraoCasa?: "medio" | "alto_padrao" | "luxo";
      tipoCasa?: "terrea" | "sobrado";
      elementosVisuais?: string[];
      imagemCapa?: string;
      modoPadrao?: "completo" | "resumo_etapa" | "preco_medio";
      etapas?: Record<string, "completo" | "resumo_etapa" | "preco_medio">;
      mostrarTotalGeral?: boolean;
      mostrarDetalhamentoTecnico?: boolean;
      detalhamentoTecnicoEtapas?: Record<string, boolean>;
      previsaoInicio?: string;
      cronogramaEtapas?: Record<string, {
        duracaoDias?: number;
        percentualFisico?: number;
        inicioPrevisto?: string;
        fimPrevisto?: string;
        dependeDeEtapaId?: string;
        tipoDependencia?: "FS" | "SS" | "FF" | "SF";
        defasagemDias?: number;
        inicioAutomatico?: boolean;
        fases?: Array<{
          id: string;
          nome: string;
          ordem: number;
          duracaoDias?: number;
          percentualEtapa?: number;
          percentualFisico?: number;
          inicioPrevisto?: string;
          fimPrevisto?: string;
          dependeDeFaseId?: string;
          tipoDependencia?: "FS" | "SS" | "FF" | "SF";
          defasagemDias?: number;
          observacao?: string;
        }>;
        observacao?: string;
        marcoPagamento?: string;
      }>;
      imagensEtapas?: Record<string, string>;
      mostrarCronogramaExecucao?: boolean;
      mostrarFisicoFinanceiro?: boolean;
      areaTotalConstruida?: number;
      entradaPercentual?: number;
      amortizacaoEntradaPercentual?: number;
      mostrarAmortizacaoEntrada?: boolean;
      mostrarPortalCliente?: boolean;
      itensNaoInclusos?: string[];
    } | null;
  } | null = null;

  if (bodyPropostaId) {
    const [orc] = await db
      .select()
      .from(propostasTable)
      .where(and(eq(propostasTable.id, bodyPropostaId), eq(propostasTable.tenantId, tenantId)));
    if (orc) {
      const storedPresentation = (orc.apresentacao ?? {}) as {
        formato?: "site_interativo" | "documento" | "hibrido";
        estiloCasa?: "moderna" | "contemporanea" | "minimalista" | "classica" | "industrial";
        padraoCasa?: "medio" | "alto_padrao" | "luxo";
        tipoCasa?: "terrea" | "sobrado";
        elementosVisuais?: string[];
        imagemCapa?: string;
        modoPadrao?: "completo" | "resumo_etapa" | "preco_medio";
        etapas?: Record<string, "completo" | "resumo_etapa" | "preco_medio">;
        mostrarTotalGeral?: boolean;
        mostrarDetalhamentoTecnico?: boolean;
        detalhamentoTecnicoEtapas?: Record<string, boolean>;
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
        itensNaoInclusos?: string[];
      };

      let mergedPresentation = {
        ...storedPresentation,
        ...(bodyPresentation?.formato ? { formato: bodyPresentation.formato } : {}),
        ...(bodyPresentation?.estiloCasa ? { estiloCasa: bodyPresentation.estiloCasa } : {}),
        ...(bodyPresentation?.padraoCasa ? { padraoCasa: bodyPresentation.padraoCasa } : {}),
        ...(bodyPresentation?.tipoCasa ? { tipoCasa: bodyPresentation.tipoCasa } : {}),
        ...(Array.isArray(bodyPresentation?.elementosVisuais) ? { elementosVisuais: bodyPresentation.elementosVisuais } : {}),
        ...(bodyPresentation?.imagemCapa ? { imagemCapa: bodyPresentation.imagemCapa } : {}),
        ...(bodyPresentation?.modoPadrao ? { modoPadrao: bodyPresentation.modoPadrao } : {}),
        ...(bodyPresentation?.etapas ? {
          etapas: { ...(storedPresentation.etapas ?? {}), ...bodyPresentation.etapas },
        } : {}),
        ...(typeof bodyPresentation?.mostrarTotalGeral === "boolean"
          ? { mostrarTotalGeral: bodyPresentation.mostrarTotalGeral }
          : {}),
        ...(typeof bodyPresentation?.mostrarDetalhamentoTecnico === "boolean"
          ? { mostrarDetalhamentoTecnico: bodyPresentation.mostrarDetalhamentoTecnico }
          : {}),
        ...(bodyPresentation?.detalhamentoTecnicoEtapas ? {
          detalhamentoTecnicoEtapas: {
            ...(storedPresentation.detalhamentoTecnicoEtapas ?? {}),
            ...bodyPresentation.detalhamentoTecnicoEtapas,
          },
        } : {}),
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
        ...(Number.isFinite(Number(bodyPresentation?.areaTotalConstruida)) && Number(bodyPresentation?.areaTotalConstruida) > 0
          ? { areaTotalConstruida: Number(bodyPresentation.areaTotalConstruida) }
          : {}),
        ...(Number.isFinite(Number(bodyPresentation?.entradaPercentual))
          ? { entradaPercentual: Math.min(100, Math.max(0, Number(bodyPresentation.entradaPercentual))) }
          : {}),
        ...(Number.isFinite(Number(bodyPresentation?.amortizacaoEntradaPercentual))
          ? { amortizacaoEntradaPercentual: Math.min(100, Math.max(0, Number(bodyPresentation.amortizacaoEntradaPercentual))) }
          : {}),
        ...(typeof bodyPresentation?.mostrarAmortizacaoEntrada === "boolean"
          ? { mostrarAmortizacaoEntrada: bodyPresentation.mostrarAmortizacaoEntrada }
          : {}),
        ...(typeof bodyPresentation?.mostrarPortalCliente === "boolean"
          ? { mostrarPortalCliente: bodyPresentation.mostrarPortalCliente }
          : {}),
        ...(Array.isArray(bodyPresentation?.itensNaoInclusos)
          ? { itensNaoInclusos: bodyPresentation.itensNaoInclusos }
          : {}),
      };

      // Draft budgets may absorb presentation edits. Once emitted, the budget is
      // immutable: proposal-specific presentation choices live only in the
      // generated proposal snapshot and a commercial change requires R1/R2/...
      if (orc.status === "rascunho") {
        await db
          .update(propostasTable)
          .set({
            apresentacao: {
              ...(orc.apresentacao ?? {}),
              ...mergedPresentation,
            },
            updatedAt: new Date(),
          })
          .where(eq(propostasTable.id, orc.id));
      }

      if (builderWantsStageImages) {
        const stageImages =
          mergedPresentation.imagensEtapas && typeof mergedPresentation.imagensEtapas === "object"
            ? mergedPresentation.imagensEtapas as Record<string, string>
            : {};

        // Safety rule: proposal generation must NEVER create stage images implicitly.
        // Images are generated only by the explicit stage-image action, which is
        // limited to 3 selected stages per user action. Generation here only reuses
        // images that were already linked to the selected budget/proposal.
        for (const imageUrl of Object.values(stageImages)) {
          if (bodyImagens.length >= 2) break;
          if (imageUrl && !bodyImagens.includes(imageUrl)) bodyImagens.push(imageUrl);
        }
      }

      const presentationFormat =
        mergedPresentation.formato === "documento"
          ? "documento"
          : mergedPresentation.formato === "hibrido"
            ? "hibrido"
            : "site_interativo";

      // Interactive proposals are visual by design. Never fill a missing stage
      // with an unrelated cover/product image. Instead, require the correct
      // stage-specific visuals before publishing the microsite.
      if (presentationFormat !== "documento") {
        const itensOrcamento = orc.itens ?? [];
        const stageMap = new Map<string, { id: string; nome: string; ordem: number }>();
        itensOrcamento.forEach((item, index) => {
          const ordem = Number(item.etapaOrdem ?? index + 1);
          const nome = String(item.etapaNome ?? `Etapa ${ordem}`);
          const id = String(item.etapaId ?? `__stage_${ordem}_${nome}`);
          if (!stageMap.has(id)) stageMap.set(id, { id, nome, ordem });
        });
        const stageImages =
          mergedPresentation.imagensEtapas && typeof mergedPresentation.imagensEtapas === "object"
            ? mergedPresentation.imagensEtapas
            : {};
        const missingStages = Array.from(stageMap.values())
          .filter((stage) => !stageImages[stage.id])
          .sort((a, b) => a.ordem - b.ordem);

        if (missingStages.length > 0) {
          res.status(422).json({
            error: "A proposta interativa não será publicada com imagens desconexas. Gere e vincule as imagens específicas das etapas antes de gerar a proposta.",
            code: "PROPOSAL_STAGE_IMAGES_REQUIRED",
            missingStageImages: missingStages.map((stage) => ({
              stageId: stage.id,
              stageName: stage.nome,
              stageOrder: stage.ordem,
            })),
            safety: {
              maxImagesPerAction: 3,
              reason: "Mantemos o limite por ação para evitar consumo inesperado de IA.",
            },
          });
          return;
        }
      }

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
          unidade?: string | null;
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

  // Imagens são recomendadas, mas nunca bloqueiam a geração da proposta.
  // Se a automação de etapas conseguir criar imagens, elas entram acima;
  // caso contrário, o renderer produz uma proposta textual válida.
  const builderDiscovery = (ctx.discoveryData ?? {}) as Record<string, unknown>;
  const builderTemplates = Array.isArray(builderDiscovery.proposalBuilderTemplates)
    ? builderDiscovery.proposalBuilderTemplates as Array<Record<string, unknown>>
    : [];
  const requestedBuilderTemplateId =
    typeof req.body?.proposalBuilderTemplateId === "string"
      ? req.body.proposalBuilderTemplateId
      : null;
  const activeBuilderTemplateId =
    typeof builderDiscovery.activeProposalBuilderTemplateId === "string"
      ? builderDiscovery.activeProposalBuilderTemplateId as string
      : null;
  const selectedBuilderTemplate =
    (requestedBuilderTemplateId
      ? builderTemplates.find((item) => item.id === requestedBuilderTemplateId)
      : null)
    ?? (activeBuilderTemplateId
      ? builderTemplates.find((item) => item.id === activeBuilderTemplateId)
      : null)
    ?? builderTemplates.find((item) => item.isDefault === true)
    ?? null;

  const selectedBuilderModules = selectedBuilderTemplate && Array.isArray(selectedBuilderTemplate.modules)
    ? (selectedBuilderTemplate.modules as Array<Record<string, unknown>>)
        .filter((item) => item && item.enabled !== false && typeof item.key === "string")
        .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
    : [];

  const proposalBuilderRenderConfig = selectedBuilderTemplate
    ? {
        enabledModules: selectedBuilderModules.map((item) => String(item.key)),
        moduleOrder: selectedBuilderModules.map((item) => String(item.key)),
        proposalKind:
          typeof selectedBuilderTemplate.proposalKind === "string"
            ? String(selectedBuilderTemplate.proposalKind)
            : null,
        visualStyle:
          selectedBuilderTemplate.visualStyle && typeof selectedBuilderTemplate.visualStyle === "object"
            ? selectedBuilderTemplate.visualStyle as Record<string, unknown>
            : null,
        modules: selectedBuilderModules.map((item, index) => ({
          key: String(item.key),
          enabled: item.enabled !== false,
          order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
          title: typeof item.title === "string" ? item.title : undefined,
          description: typeof item.description === "string" ? item.description : undefined,
          dataSource: typeof item.dataSource === "string" ? item.dataSource : undefined,
          contentPrompt: typeof item.contentPrompt === "string" ? item.contentPrompt : undefined,
          image: item.image && typeof item.image === "object" ? item.image as Record<string, unknown> : undefined,
        })),
      }
    : null;

  let html = renderProposalHtml(
    json,
    theme,
    resolveStorageUrl(ctx.lead.logoUrl),
    ctx.lead.empresa || ctx.lead.nome,
    ctx.tenantName || undefined,
    ctx.lead.websiteUrl || undefined,
    resolveStorageUrl(ctx.tenantLogoUrl),
    bodyImagens,
    orcamentoEmbed,
    { phone: ctx.tenantPhone ?? null, email: ctx.tenantEmail ?? null, instagram: ctx.tenantInstagram ?? null },
    proposalBuilderRenderConfig,
  );

  const proposalAttachments = Array.isArray(req.body?.anexos)
    ? req.body.anexos
        .filter((item: unknown) => item && typeof item === "object")
        .map((item: any) => ({
          nome: String(item.nome ?? "Documento").slice(0, 180),
          url: String(item.url ?? "").trim(),
          mimeType: item.mimeType ? String(item.mimeType).slice(0, 120) : undefined,
          tamanho: Number.isFinite(Number(item.tamanho)) ? Number(item.tamanho) : undefined,
        }))
        .filter((item: { url: string }) => item.url.startsWith("/api/storage/") || /^https:\/\//i.test(item.url))
        .slice(0, 20)
    : [];

  if (proposalAttachments.length) {
    const escapeHtml = (value: string) => value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    const attachmentLinks = `
      <div style="display:grid;gap:10px;margin-top:18px;">
        ${proposalAttachments.map((item: { nome: string; url: string }) => `
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
             style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid rgba(100,116,139,.25);border-radius:10px;text-decoration:none;color:inherit;">
            <span style="font-size:18px;">📎</span>
            <span style="font-size:14px;font-weight:600;">${escapeHtml(item.nome)}</span>
          </a>
        `).join("")}
      </div>`;

    if (html.includes("<!-- STUDIO_ATTACHMENTS -->")) {
      // No Studio, anexos pertencem à página definida no modelo; nunca criamos
      // uma página extra fora da ordem configurada.
      html = html.replace("<!-- STUDIO_ATTACHMENTS -->", attachmentLinks);
    } else {
      // Compatibilidade com propostas legadas que ainda não usam o Studio.
      const attachmentsHtml = `
        <section class="page proposal-attachments" style="padding:48px 56px;font-family:inherit;">
          <div style="max-width:980px;margin:0 auto;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.65;margin-bottom:8px;">Documentos</div>
            <h2 style="margin:0 0 18px;font-size:28px;line-height:1.15;">Anexos da proposta</h2>
            ${attachmentLinks}
          </div>
        </section>`;
      html = html.includes("</body>")
        ? html.replace("</body>", `${attachmentsHtml}</body>`)
        : `${html}${attachmentsHtml}`;
    }
  }

  const proposalSourcePending: Array<{
    code: string;
    severity: "blocker" | "warning";
    source: "business_plan" | "company" | "client" | "catalog" | "budget" | "media";
    message: string;
  }> = [];

  if (!approvedBusinessPlanContext.trim()) {
    proposalSourcePending.push({ code: "BUSINESS_PLAN_APPROVED_CONTEXT_MISSING", severity: "warning", source: "business_plan", message: "Não havia contexto aprovado do Plano de Negócios para o Closer." });
  }
  if (!ctx.tenantName) {
    proposalSourcePending.push({ code: "COMPANY_NAME_MISSING", severity: "warning", source: "company", message: "Nome da empresa não estava preenchido." });
  }
  if (!ctx.briefing) {
    proposalSourcePending.push({ code: "CLIENT_BRIEFING_MISSING", severity: "warning", source: "client", message: "Briefing do cliente não estava preenchido." });
  }
  if (!ctx.products.length && !(orcamentoEmbed?.itens?.length)) {
    proposalSourcePending.push({ code: "CATALOG_OR_PRODUCT_SOURCE_MISSING", severity: "warning", source: "catalog", message: "Nenhum produto/serviço vinculado foi encontrado." });
  }
  if (!bodyPropostaId || !orcamentoEmbed) {
    proposalSourcePending.push({ code: "BUDGET_MISSING", severity: "blocker", source: "budget", message: "Nenhum orçamento foi vinculado como fonte comercial." });
  }

  const proposalSourceSnapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    immutableForVersion: true,
    businessPlan: { role: "closer", approvedContext: approvedBusinessPlanContext || null },
    company: {
      name: ctx.tenantName ?? null,
      phone: ctx.tenantPhone ?? null,
      email: ctx.tenantEmail ?? null,
      instagram: ctx.tenantInstagram ?? null,
      logoUrl: ctx.tenantLogoUrl ?? null,
      businessContext: ctx.tenantBusinessContext ?? null,
      discoveryData: ctx.discoveryData ?? null,
    },
    client: {
      lead: ctx.lead,
      briefing: ctx.briefing ?? null,
      intelligence: ctx.intelligence ?? null,
      conversationSamples: ctx.conversationSamples || null,
    },
    catalog: {
      linkedProducts: ctx.products,
      selectedBudgetItems: orcamentoEmbed?.itens ?? selectedBudgetForAI?.itens ?? [],
    },
    budget: {
      id: bodyPropostaId || null,
      title: orcamentoEmbed?.titulo ?? selectedBudgetForAI?.titulo ?? null,
      data: orcamentoEmbed ?? selectedBudgetForAI ?? null,
      sourceSnapshot: (orcamentoEmbed?.apresentacao as any)?.sourceSnapshot ?? null,
    },
    media: {
      clientLogoUrl: ctx.lead.logoUrl ?? null,
      tenantLogoUrl: ctx.tenantLogoUrl ?? null,
      proposalImages: bodyImagens,
      attachments: proposalAttachments,
      stageImages: (orcamentoEmbed?.apresentacao as any)?.imagensEtapas ?? {},
    },
    generation: {
      provider: result.provider,
      model: result.model,
      refinementNotes: req.body?.refinementNotes ? String(req.body.refinementNotes) : null,
      proposalBuilderTemplateId: requestedBuilderTemplateId ?? activeBuilderTemplateId ?? null,
    },
    pending: proposalSourcePending,
  };

  const [proposal] = await db
    .insert(leadProposalsTable)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      leadId,
      version: nextVersion,
      htmlContent: html,
      jsonContent: JSON.stringify({
        ...json,
        anexos: proposalAttachments,
        _proposalMeta: {
          sourcePropostaId: bodyPropostaId || null,
          presentationFormat: orcamentoEmbed?.apresentacao?.formato || "site_interativo",
          sourceSnapshotVersion: 1,
          hasPendingSourceData: proposalSourcePending.length > 0,
          pendingSourceCount: proposalSourcePending.length,
        },
        _sourceSnapshot: proposalSourceSnapshot,
      }),
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
// By default this can still update the current version for backwards compatibility.
// The UI sends createRevision=true so a client-facing proposal is never silently overwritten.
router.patch("/leads/:leadId/proposals/:version", async (req, res) => {
  const leadId = String(req.params.leadId);
  const version = parseInt(req.params.version, 10);
  const { htmlContent, createRevision } = req.body;
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

  const [existing] = await db
    .select()
    .from(leadProposalsTable)
    .where(and(
      eq(leadProposalsTable.leadId, leadId),
      eq(leadProposalsTable.tenantId, lead.tenantId),
      eq(leadProposalsTable.version, version),
    ));

  if (!existing) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  let savedVersion = version;
  let savedId = existing.id;

  if (createRevision === true) {
    const [latest] = await db
      .select({ version: leadProposalsTable.version })
      .from(leadProposalsTable)
      .where(and(eq(leadProposalsTable.leadId, leadId), eq(leadProposalsTable.tenantId, lead.tenantId)))
      .orderBy(desc(leadProposalsTable.version))
      .limit(1);

    savedVersion = Math.max(Number(latest?.version ?? 0), version) + 1;
    const [created] = await db
      .insert(leadProposalsTable)
      .values({
        tenantId: lead.tenantId,
        leadId,
        version: savedVersion,
        htmlContent,
        jsonContent: existing.jsonContent,
        status: "ready",
      })
      .returning({ id: leadProposalsTable.id });

    if (!created) {
      res.status(500).json({ error: "Não foi possível criar a revisão da proposta" });
      return;
    }
    savedId = created.id;
  } else {
    const [updated] = await db
      .update(leadProposalsTable)
      .set({ htmlContent, updatedAt: new Date() })
      .where(and(
        eq(leadProposalsTable.leadId, leadId),
        eq(leadProposalsTable.tenantId, lead.tenantId),
        eq(leadProposalsTable.version, version),
      ))
      .returning({ id: leadProposalsTable.id });

    if (!updated) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }
    savedId = updated.id;
  }

  res.json({ ok: true, id: savedId, version: savedVersion, createdRevision: createRevision === true });

  // Fire-and-forget: learn from this edit and update tenant style memory.
  if (existing.htmlContent !== htmlContent) {
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
        log.info({ tenantId, sourceVersion: version, savedVersion }, "proposal style memory persisted");
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
