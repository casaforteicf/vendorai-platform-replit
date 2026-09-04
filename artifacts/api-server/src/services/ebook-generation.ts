import { eq } from "drizzle-orm";
import { db, businessProfilesTable, mediaAssetsTable } from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { generateProposalPDF } from "../lib/proposal-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

export interface MarketingContext {
  nicheId: string;
  nicheName: string;
  productIds: string[];
  productNames: string[];
  businessVertical?: string;
  businessVerticalSlug?: string;
  audienceSegment?: string;
  audienceNiche?: string;
  campaignGoal?: string;
  locationCity?: string;
  locationState?: string;
  locationRegion?: string;
  projectName?: string;
  specificDetails?: string;
  mandatoryDifferentiators?: string;
  restrictions?: string;
  primaryKpi?: string;
  researchEnabled?: boolean;
  seoTrackingEnabled?: boolean;
  campaignId?: string;
  campaignName?: string;
}

export interface EbookChapter {
  title: string;
  opening: string;
  sections: Array<{ heading: string; body: string }>;
  takeaway: string;
}

export interface CampaignLanguage {
  positioning: string;
  audience: string;
  promise: string;
  tone: string;
  vocabulary: string[];
  avoid: string[];
  primaryCta: string;
  visualDirection: string;
}

export interface CampaignKit {
  metaAd: string;
  feedPost: string;
  reelsScript: string;
  deliveryEmailSubject: string;
  deliveryEmailBody: string;
  whatsapp: string;
}

export interface EbookGenerationResult {
  title: string;
  subtitle: string;
  summary: string;
  campaignLanguage: CampaignLanguage;
  chapters: EbookChapter[];
  finalCta: string;
  landingHeadline: string;
  landingSubheadline: string;
  campaignKit: CampaignKit;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function renderEbookHtml(ebook: EbookGenerationResult, brandName: string, primaryColor: string, brandMission?: string): string {
  const safeColor = isValidHexColor(primaryColor) ? primaryColor : "#1f2937";
  const safeBrandName = escapeHtml(brandName);
  const safeTitle = escapeHtml(ebook.title);
  const safeSubtitle = escapeHtml(ebook.subtitle);
  const safeSummary = escapeHtml(ebook.summary);
  const safeFinalCta = escapeHtml(ebook.finalCta);
  const safeBrandMission = brandMission ? escapeHtml(brandMission) : "";

  const chapterTOC = ebook.chapters.map((ch, idx) => `<li><strong>Capítulo ${idx + 1}:</strong> ${escapeHtml(ch.title)}</li>`).join("");

  const chapterHtml = ebook.chapters.map((ch, idx) => {
    const sections = ch.sections.map((sec) => `<div style="margin: 1rem 0; border-left: 3px solid ${safeColor}; padding-left: 1rem;"><h4 style="margin: 0.5rem 0; font-size: 1.1rem; color: ${safeColor};">${escapeHtml(sec.heading)}</h4><p style="margin: 0.5rem 0; line-height: 1.6; color: #374151;">${escapeHtml(sec.body).replace(/\n/g, "<br />")}</p></div>`).join("");
    return `<div style="page-break-inside: avoid; margin-bottom: 2rem;"><h2 style="font-size: 1.8rem; margin: 1.5rem 0 1rem 0; color: ${safeColor}; border-bottom: 2px solid ${safeColor}; padding-bottom: 0.5rem;">Capítulo ${idx + 1}: ${escapeHtml(ch.title)}</h2><p style="margin: 1rem 0; font-style: italic; color: #6b7280;">${escapeHtml(ch.opening)}</p>${sections}<div style="margin-top: 1rem; padding: 1rem; background-color: #f3f4f6; border-radius: 0.5rem; border-left: 4px solid ${safeColor};"><strong style="color: ${safeColor};">Aprendizado-chave:</strong><p style="margin: 0.5rem 0 0 0; color: #374151;">${escapeHtml(ch.takeaway)}</p></div></div>`;
  }).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${safeTitle}</title><style>body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #fff; }.container { max-width: 21cm; margin: 0 auto; padding: 2cm; }.cover { page-break-after: always; text-align: center; padding: 4cm 0; background: linear-gradient(135deg, ${safeColor} 0%, ${safeColor}dd 100%); color: #fff; }.cover h1 { font-size: 2.5rem; margin: 0 0 1rem 0; font-weight: 700; }.cover h2 { font-size: 1.3rem; margin: 0 0 2rem 0; font-weight: 300; opacity: 0.95; }.toc { page-break-after: always; }.toc h3 { font-size: 1.5rem; color: ${safeColor}; margin-bottom: 1rem; }.summary { page-break-after: always; }.footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.9rem; color: #6b7280; }@media print { body { margin: 0; } }</style></head><body><div class="container"><div class="cover"><h1>${safeTitle}</h1><h2>${safeSubtitle}</h2><p style="opacity: 0.9;">Produzido por ${safeBrandName}</p></div><div class="toc"><h3>Índice</h3><ul>${chapterTOC}</ul></div><div class="summary"><h3>Resumo Executivo</h3><p>${safeSummary.replace(/\n/g, "<br />")}</p></div>${chapterHtml}<div style="page-break-before: always; text-align: center; padding: 2cm 0; color: #fff; background: ${safeColor};"><p style="font-size: 1.2rem;">${safeFinalCta}</p></div><div style="page-break-before: always;"><h3>Sobre ${safeBrandName}</h3>${safeBrandMission ? `<p>${safeBrandMission.replace(/\n/g, "<br />")}</p>` : ""}<p style="font-size: 0.9rem; color: #6b7280;">Este e-book foi gerado por VendorAI — plataforma de marketing e geração de conteúdo.</p></div><div class="footer"><p>© ${new Date().getFullYear()} ${safeBrandName}. Todos os direitos reservados.</p></div></div></body></html>`;
}

async function parseJsonResponse(text: string): Promise<EbookGenerationResult> {
  try {
    return JSON.parse(text);
  } catch {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        throw new Error("Resposta da IA contém JSON inválido no code fence");
      }
    }
    throw new Error("Resposta da IA não contém JSON válido");
  }
}

export async function generateEbook(tenantId: string, marketingContext: MarketingContext, options: { theme: string; objective: "lead_generation" | "educate" | "authority" | "sales" | "guide"; depth: "curto" | "médio" | "completo"; tone?: string; finalCta?: string }): Promise<EbookGenerationResult> {
  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  if (!profile) throw new Error("Perfil de negócio não encontrado para este tenant");

  const depthMap = { curto: 4, médio: 6, completo: 8 };
  const chapterCount = depthMap[options.depth];

  const prompt = `Você é um especialista em criação de e-books educativos e de marketing. CONTEXTO DA MARCA: Nome: ${profile.nomeFantasia || ""}, Vertical: ${profile.vertical || ""}, Missão: ${profile.missao || ""}, Público: ${profile.publicoAlvo || ""}, CONTEXTO DE MARKETING: Nicho: ${marketingContext.nicheName}, Produtos: ${marketingContext.productNames?.join(", ") || ""}, Objetivo: ${options.objective}, Profundidade: ${options.depth}, Tema: ${options.theme}, Tom (opcional): ${options.tone || "profissional"}, CTA Final: ${options.finalCta || "Contato com especialista"}, RETORNE APENAS JSON VÁLIDO (sem comentários): {"title": "string (máx 60 chars)", "subtitle": "string (máx 100 chars)", "summary": "string (3-5 linhas)", "campaignLanguage": {"positioning": "string", "audience": "string", "promise": "string", "tone": "string", "vocabulary": ["termo1", "termo2"], "avoid": ["evitar1"], "primaryCta": "string", "visualDirection": "string"}, "chapters": [{"title": "string", "opening": "string", "sections": [{"heading": "string", "body": "string com \\n para parágrafos"}], "takeaway": "string"}], "finalCta": "string", "landingHeadline": "string", "landingSubheadline": "string", "campaignKit": {"metaAd": "string (~50 chars)", "feedPost": "string (~150 chars)", "reelsScript": "string (30-45 seg)", "deliveryEmailSubject": "string", "deliveryEmailBody": "string (3-4 parágrafos)", "whatsapp": "string (~150 chars)"}}, Gere exatamente ${chapterCount} capítulos.`;

  const response = await callOpenAI(tenantId, "content_generator", [{ role: "user", content: prompt }], { model: "gpt-4o-mini", temperature: 0.7, maxTokens: 8000 });
  const ebook = await parseJsonResponse(response.content);
  return ebook;
}

export async function renderAndSaveEbook(tenantId: string, ebook: EbookGenerationResult, marketingContext: MarketingContext, options: { objective: "lead_generation" | "educate" | "authority" | "sales" | "guide"; depth: "curto" | "médio" | "completo" }): Promise<{ assetId: string; storageUrl: string; downloadUrl: string; mimeType: string; fileSize: number }> {
  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  if (!profile) throw new Error("Perfil de negócio não encontrado");

  const primaryColor = (profile.discoveryData as Record<string, unknown>)?.coresBrand?.[0] as string || "#1f2937";
  const htmlContent = renderEbookHtml(ebook, profile.nomeFantasia || "Empresa", primaryColor, profile.missao);

  let buffer: Buffer;
  let mimeType: string;

  try {
    buffer = await generateProposalPDF(htmlContent);
    if (buffer.toString("utf-8", 0, 4) === "%PDF") {
      mimeType = "application/pdf";
    } else {
      mimeType = "text/html; charset=utf-8";
      buffer = Buffer.from(htmlContent, "utf-8");
    }
  } catch {
    mimeType = "text/html; charset=utf-8";
    buffer = Buffer.from(htmlContent, "utf-8");
  }

  const filename = `ebook-${ebook.title.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}-${Date.now()}.${mimeType.includes("pdf") ? "pdf" : "html"}`;
  const storage = new ObjectStorageService();
  const storageUrl = await storage.savePrivateBuffer(buffer, mimeType, filename);

  const downloadUrl = storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl.startsWith("/") ? storageUrl : `/${storageUrl}`;

  const [asset] = await db.insert(mediaAssetsTable).values({
    tenantId,
    type: "document",
    role: "output",
    source: "generated",
    storageUrl,
    mimeType,
    fileSize: buffer.length,
    originalFilename: filename,
    metadata: {
      operation: "ebook_generate",
      title: ebook.title,
      subtitle: ebook.subtitle,
      summary: ebook.summary,
      objective: options.objective,
      depth: options.depth,
      campaignId: marketingContext.campaignId,
      campaignName: marketingContext.campaignName,
      campaignLanguage: ebook.campaignLanguage,
      campaignKit: ebook.campaignKit,
      finalCta: ebook.finalCta,
      landingHeadline: ebook.landingHeadline,
      landingSubheadline: ebook.landingSubheadline,
      createdAt: new Date().toISOString(),
    } as Record<string, unknown>,
  }).returning({ id: mediaAssetsTable.id });

  if (!asset) throw new Error("Falha ao registrar ativo de mídia");

  return { assetId: asset.id, storageUrl, downloadUrl, mimeType, fileSize: buffer.length };
}
