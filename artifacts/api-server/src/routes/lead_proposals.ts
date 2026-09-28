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
import http from "node:http";

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
    .replace(/src="\/api\/storage\/public-objects\/objects\//g, abs("/api/storage/objects/"))
    .replace(/src="\/api\/storage\/objects\//g, abs("/api/storage/objects/"))
    .replace(/src="\/api\/storage\/public-objects\//g, abs("/api/storage/public-objects/"))
    .replace(/src="\/objects\//g, abs("/api/storage/objects/"));
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
    .replace(/src="\/api\/storage\/public-objects\/objects\//g, toAbsolute("/api/storage/objects/"))
    .replace(/src="\/api\/storage\/objects\//g, toAbsolute("/api/storage/objects/"))
    .replace(/src="\/api\/storage\/public-objects\//g, toAbsolute("/api/storage/public-objects/"))
    .replace(/src="\/objects\//g, toAbsolute("/api/storage/objects/"))
    .replace(/href="\/api\/storage\/public-objects\/objects\//g, toAbsolute("/api/storage/objects/"))
    .replace(/href="\/api\/storage\/objects\//g, toAbsolute("/api/storage/objects/"))
    .replace(/href="\/objects\//g, toAbsolute("/api/storage/objects/"));
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
  res.send(absolutifyStorageUrlsForDownload(row.htmlContent, req));
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
function proposalStageImageRule(normalizedStageContext: string): string {
  if (/esquadria|porta pvc|janela pvc/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: para a etapa de esquadrias, usar como assunto principal UMA ÚNICA PORTA MODERNA DE PVC instalada ou em instalação, mostrando claramente perfil, marco, ferragens e vedação. Não usar fachada completa como assunto principal e não trocar PVC por alumínio ou madeira.";
  }
  if (/(forro.*pintura|pintura.*forro)/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar claramente um FORRO DE GESSO acabado e uma PAREDE PINTADA no mesmo ambiente, com acabamento residencial realista. O teto de gesso e a pintura devem ser os assuntos principais; não usar fachada externa ou imagem genérica de casa pronta.";
  }
  if (/porcelanato|revestimento/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar PORCELANATO como assunto principal, preferencialmente piso residencial assentado e acabado, com paginação, juntas e superfície visíveis. Não usar fachada ou tijolos como representação de revestimentos.";
  }
  if (/forro|gesso/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar FORRO DE GESSO residencial como assunto principal, com planos, recortes ou sancas e acabamento coerente. Não usar cobertura/telhado como substituto de forro.";
  }
  if (/massa corrida|pintura/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar PAREDE PINTADA com acabamento uniforme como assunto principal, podendo evidenciar preparação e acabamento final. Não usar fachada completa ou revestimento cerâmico como substituto.";
  }
  if (/terraplen|movimentacao de terra/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: representar TERRAPLENAGEM, com terreno sendo escavado, nivelado ou compactado por equipamento adequado. Não mostrar pilares, fundações ou estrutura pronta como assunto principal.";
  }
  if (/servicos preliminares|limpeza do terreno|preparacao do canteiro|canteiro|sondagem|spt/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: representar SERVIÇOS PRELIMINARES, com terreno limpo, locação/canteiro organizado, tapume, apoio provisório ou sondagem quando prevista. Não mostrar alvenaria ou estrutura avançada.";
  }
  if (/radier|fundac/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: representar fundação em RADIER/laje de fundação, com base preparada, malhas/armaduras e passagens. NÃO mostrar baldrame, paredes de tijolo, pilares isolados ou solução diferente do radier quando o escopo indicar radier.";
  }
  if (/laje/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar execução de LAJE como assunto principal, com escoramento, vigotas/EPS ou armações e concretagem conforme o escopo. Não usar telhado ou fachada acabada.";
  }
  if (/cobertura|telha|rufo|calha/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar COBERTURA em execução, com estrutura, telhas, rufos ou calhas compatíveis com o escopo. Não usar imagem de instalações ou acabamento interno.";
  }
  if (/hidraul|tubo|esgoto|pex|cisterna|boiler|pressur|vaso|chuveiro|registro/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: destacar as INSTALAÇÕES HIDRÁULICAS/HIDROSSANITÁRIAS em execução, com tubulações de água e esgoto, conexões, caixas, shafts e equipamentos previstos. Não usar instalação elétrica como assunto principal.";
  }
  if (/eletric|quadro|cabo|eletroduto|corrugad|carro eletrico|frigorigena/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: destacar as INSTALAÇÕES ELÉTRICAS em execução, com eletrodutos, conduítes corrugados, caixas, cabeamento, quadro e pontos previstos. Não usar tubulação hidráulica como assunto principal.";
  }
  if (/icf|estrutura/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: mostrar claramente a ESTRUTURA EM ICF correspondente ao escopo, incluindo blocos/painéis brancos de ICF, armações e concretagem quando previstos. Não representar alvenaria cerâmica convencional como sistema principal.";
  }
  if (/projeto|legaliza|arquitet/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: representar PROJETOS E LEGALIZAÇÃO com plantas arquitetônicas, desenhos técnicos, documentos de aprovação e material de projeto. Não usar apenas uma casa pronta ou obra em execução.";
  }
  if (/limpeza final|entrega/.test(normalizedStageContext)) {
    return "REGRA TÉCNICA OBRIGATÓRIA: representar LIMPEZA FINAL E ENTREGA, com residência concluída, ambiente limpo, revisado e pronto para uso. Não mostrar obra bruta.";
  }
  return "REGRA TÉCNICA OBRIGATÓRIA: a fotografia deve representar exatamente o serviço e o estado construtivo desta etapa, usando os itens do orçamento como fonte de verdade visual.";
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

    const normalizedStageContext = `${group.nome} ${scope}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const technicalImageRule = proposalStageImageRule(normalizedStageContext);

    const prompt = [
      "Fotografia documental hiper-realista de construção civil no Brasil, composição horizontal 3:2, aparência de fotografia profissional de obra real.",
      `Representar visualmente a etapa "${group.nome}" de uma obra residencial de padrão alto, sem transformar a imagem em render conceitual e sem inventar elementos incompatíveis com a etapa.`,
      "Mostrar somente o estado construtivo coerente com esta fase: materiais, sistemas, equipamentos e profissionais que normalmente estariam presentes neste momento da execução.",
      "Trabalhadores com EPI adequado, canteiro organizado, luz natural realista, materiais com escala correta, geometria consistente, sem objetos deformados.",
      scope ? `Escopo contratado desta etapa:\n${scope}` : "",
      technicalImageRule,
      "A imagem precisa representar o conteúdo REAL desta etapa do orçamento. Não introduza método construtivo, material ou serviço incompatível com o escopo informado.",
      "A imagem é apenas representativa da etapa, não deve fingir ser foto do projeto real do cliente.",
      "Sem textos, sem letras, sem placas legíveis, sem logotipos, sem marcas d'água, sem molduras e sem antes/depois.",
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
    const [selectedBudget] = await db
      .select({
        titulo: propostasTable.titulo,
        valorTotal: propostasTable.valorTotal,
        itens: propostasTable.itens,
        observacoes: propostasTable.observacoes,
      })
      .from(propostasTable)
      .where(and(
        eq(propostasTable.id, bodyPropostaId),
        eq(propostasTable.tenantId, tenantId),
        eq(propostasTable.leadId, leadId),
      ))
      .limit(1);

    if (!selectedBudget) {
      res.status(404).json({ error: "Orçamento selecionado não encontrado para este lead." });
      return;
    }
    selectedBudgetForAI = selectedBudget;
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
    }>;
    valorTotal?: string | null; observacoes?: string | null;
    formaPagamento?: string | null; condPagamento?: string | null; prazoEntrega?: string | null;
    validadeAte?: Date | string | null;
    paymentCompositions?: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }>;
    apresentacao?: {
      formato?: "site_interativo" | "documento" | "hibrido";
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

      // Persist presentation choices made in the proposal screen, including
      // the manually informed total built area. This keeps the orçamento as the
      // single source of truth for future proposal versions.
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

      if (builderWantsStageImages) {
        const itensOrcamento = orc.itens ?? [];
        const hasStructuredStages = itensOrcamento.some(
          (item) => item.etapaId || item.etapaNome || item.etapaOrdem,
        );

        if (hasStructuredStages) {
          const stageImages: Record<string, string> = {
            ...((storedPresentation.imagensEtapas && typeof storedPresentation.imagensEtapas === "object")
              ? storedPresentation.imagensEtapas
              : {}),
          };

          const groups = Array.from(
            itensOrcamento.reduce((map, item, index) => {
              const ordem = Number(item.etapaOrdem ?? index + 1);
              const nome = String(item.etapaNome ?? `Etapa ${ordem}`);
              const id = String(item.etapaId ?? `__stage_${ordem}_${nome}`);
              const current = map.get(id) ?? {
                id,
                ordem,
                nome,
                itens: [] as typeof itensOrcamento,
              };
              current.itens.push(item);
              map.set(id, current);
              return map;
            }, new Map<string, { id: string; ordem: number; nome: string; itens: typeof itensOrcamento }>()),
          )
            .map(([, group]) => group)
            .sort((a, b) => a.ordem - b.ordem);

          const missingGroups = groups.filter((group) => !stageImages[group.id]).slice(0, 12);
          let generatedAny = false;

          for (const group of missingGroups) {
            const scope = group.itens
              .slice(0, 10)
              .map((item) => {
                const desc = item.descricao
                  ? String(item.descricao).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
                  : "";
                return `- ${item.nome}${desc ? `: ${desc.slice(0, 180)}` : ""}`;
              })
              .join("\n");

            const normalizedStageContext = `${group.nome} ${scope}`
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase();

            const technicalImageRule = proposalStageImageRule(normalizedStageContext);

            const stagePrompt = [
              "Fotografia documental hiper-realista de construção civil no Brasil, composição horizontal 3:2, aparência de fotografia profissional de obra real.",
              `Representar visualmente a etapa "${group.nome}" de uma obra residencial de padrão alto, sem transformar a imagem em render conceitual e sem inventar elementos incompatíveis com a etapa.`,
              "Mostrar somente o estado construtivo coerente com esta fase: materiais, sistemas, equipamentos e profissionais que normalmente estariam presentes neste momento da execução.",
              "Trabalhadores com EPI adequado, canteiro organizado, luz natural realista, materiais com escala correta, geometria consistente, sem objetos deformados.",
              scope ? `Escopo contratado desta etapa:\n${scope}` : "",
              technicalImageRule,
              "A imagem precisa representar o conteúdo REAL desta etapa do orçamento. Não introduza método construtivo, material ou serviço incompatível com o escopo informado.",
              "A imagem é apenas representativa da etapa, não deve fingir ser foto do projeto real do cliente.",
              "Sem textos, sem letras, sem placas legíveis, sem logotipos, sem marcas d'água, sem molduras e sem antes/depois.",
            ].filter(Boolean).join("\n");

            try {
              const { urls } = await generateImage(tenantId, "image_generator", stagePrompt, {
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
                `proposta-etapa-${orc.id}-${group.ordem}.png`,
              );
              stageImages[group.id] = `/api/storage${objectPath}`;
              generatedAny = true;
            } catch (err) {
              req.log.warn(
                { err, propostaId: orc.id, stageId: group.id },
                "automatic proposal stage image generation failed (non-fatal)",
              );
            }
          }

          mergedPresentation = {
            ...mergedPresentation,
            imagensEtapas: stageImages,
          };

          if (generatedAny) {
            await db
              .update(propostasTable)
              .set({
                apresentacao: {
                  ...(orc.apresentacao ?? {}),
                  ...mergedPresentation,
                  imagensEtapas: stageImages,
                },
                updatedAt: new Date(),
              })
              .where(eq(propostasTable.id, orc.id));
          }

          for (const imageUrl of Object.values(stageImages)) {
            if (bodyImagens.length >= 2) break;
            if (imageUrl && !bodyImagens.includes(imageUrl)) bodyImagens.push(imageUrl);
          }
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
    const attachmentsHtml = `
      <section class="page proposal-attachments" style="padding:48px 56px;font-family:inherit;">
        <div style="max-width:980px;margin:0 auto;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.65;margin-bottom:8px;">Documentos</div>
          <h2 style="margin:0 0 18px;font-size:28px;line-height:1.15;">Anexos da proposta</h2>
          <div style="display:grid;gap:10px;">
            ${proposalAttachments.map((item: { nome: string; url: string }) => `
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
                 style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid rgba(100,116,139,.25);border-radius:10px;text-decoration:none;color:inherit;">
                <span style="font-size:18px;">📎</span>
                <span style="font-size:14px;font-weight:600;">${escapeHtml(item.nome)}</span>
              </a>
            `).join("")}
          </div>
        </div>
      </section>`;
    html = html.includes("</body>")
      ? html.replace("</body>", `${attachmentsHtml}</body>`)
      : `${html}${attachmentsHtml}`;
  }

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
        },
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
