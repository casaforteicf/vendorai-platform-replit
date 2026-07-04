/**
 * contentGenerator — Geração de materiais de prospecção por IA.
 *
 * Gera HTML, PDF e imagens personalizados para leads do Prospector,
 * salva no Object Storage e retorna a URL pública do arquivo.
 *
 * Toda chamada de IA passa pelo AI Gateway (ai-gateway.ts).
 */
import { randomUUID } from "crypto";
import {
  callAnthropic,
  generateImage as gatewayGenerateImage,
} from "../lib/ai-gateway.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";
import type { PartnerLead, ProspectorFlowStep } from "@workspace/db";

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_HTML =
  "Você é um especialista em marketing B2B brasileiro. " +
  "Gere APENAS HTML completo e válido, sem markdown, sem explicações. " +
  "O HTML deve ser responsivo, profissional e persuasivo.";

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Mirrors the private parseObjectPath in objectStorage.ts */
function parsePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error(`Caminho inválido para Object Storage: ${path}`);
  return { bucketName: parts[1]!, objectName: parts.slice(2).join("/") };
}

/**
 * Salva um buffer no Object Storage sob o subdiretório `prospector-materials`
 * e retorna a URL HTTPS pública servida pelo API Server.
 */
async function saveToStorage(
  buffer: Buffer,
  contentType: string,
  subPath: string,
): Promise<string> {
  const privateDir = process.env["PRIVATE_OBJECT_DIR"];
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR não configurado");

  const fullPath = `${privateDir}/prospector-materials/${subPath}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const apiPath = `/api/storage/objects/prospector-materials/${subPath}`;
  return domain ? `https://${domain}${apiPath}` : apiPath;
}

/** Constrói o subpath de armazenamento no formato /{tenantId}/{leadId}/{stepId}/{timestamp}.ext */
function buildStoragePath(lead: PartnerLead, stepId: string, ext: string): string {
  return `${lead.tenantId ?? "no-tenant"}/${lead.id}/${stepId}/${Date.now()}.${ext}`;
}

/** Garante que tenantId está presente — obrigatório para chamadas de IA */
function assertTenantId(lead: PartnerLead): string {
  if (!lead.tenantId) {
    throw new Error(
      `Lead ${lead.id} não possui tenantId — não é possível chamar a IA`,
    );
  }
  return lead.tenantId;
}

// ── 1. renderPrompt ───────────────────────────────────────────────────────────

/**
 * Substitui placeholders {{nome}}, {{empresa}}, {{cidade}},
 * {{segmento}} e {{telefone}} no template.
 */
export function renderPrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template
    .replace(/\{\{nome\}\}/g, vars["nome"] ?? "")
    .replace(/\{\{empresa\}\}/g, vars["empresa"] ?? "")
    .replace(/\{\{cidade\}\}/g, vars["cidade"] ?? "")
    .replace(/\{\{segmento\}\}/g, vars["segmento"] ?? "")
    .replace(/\{\{telefone\}\}/g, vars["telefone"] ?? "");
}

// ── 2. generateHTML ───────────────────────────────────────────────────────────

/**
 * Gera HTML completo via Claude Sonnet, salva no Object Storage
 * e retorna a URL pública do arquivo .html.
 *
 * @param prompt  Prompt já renderizado (com variáveis substituídas)
 * @param lead    Lead do parceiro (usado para montar o path de storage e extrair tenantId)
 * @param stepId  ID do step (usado no path — default: UUID aleatório)
 */
export async function generateHTML(
  prompt: string,
  lead: PartnerLead,
  stepId: string = randomUUID(),
): Promise<string> {
  const tenantId = assertTenantId(lead);

  const result = await callAnthropic(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { system: SYSTEM_HTML, maxTokens: 8000 },
  );

  if (!result.content.trim()) {
    throw new Error("Claude não retornou conteúdo HTML");
  }

  const subPath = buildStoragePath(lead, stepId, "html");
  return saveToStorage(
    Buffer.from(result.content.trim(), "utf-8"),
    "text/html; charset=utf-8",
    subPath,
  );
}

// ── 3. generatePDF ────────────────────────────────────────────────────────────

/**
 * Gera HTML via Claude, converte para PDF com Puppeteer/Chromium
 * e salva no Object Storage. Retorna URL pública do .pdf.
 *
 * Em caso de falha do Puppeteer, salva o HTML com extensão .pdf como fallback.
 */
export async function generatePDF(
  prompt: string,
  lead: PartnerLead,
  stepId: string = randomUUID(),
): Promise<string> {
  const tenantId = assertTenantId(lead);

  const htmlResult = await callAnthropic(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { system: SYSTEM_HTML, maxTokens: 8000 },
  );

  if (!htmlResult.content.trim()) {
    throw new Error("Claude não retornou HTML para conversão em PDF");
  }

  const htmlContent = htmlResult.content.trim();

  let pdfBuffer: Buffer;
  let mimeType = "application/pdf";

  try {
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      });
      pdfBuffer = Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } catch (err) {
    logger.warn(
      { err, leadId: lead.id, stepId },
      "contentGenerator: Puppeteer falhou — usando HTML como fallback",
    );
    pdfBuffer = Buffer.from(htmlContent, "utf-8");
    mimeType = "text/html; charset=utf-8";
  }

  const subPath = buildStoragePath(lead, stepId, "pdf");
  return saveToStorage(pdfBuffer, mimeType, subPath);
}

// ── 4. generateImage ──────────────────────────────────────────────────────────

/**
 * Gera imagem via gpt-image-1, baixa o resultado, salva no Object Storage
 * e retorna a URL pública do .png.
 */
export async function generateImage(
  prompt: string,
  lead: PartnerLead,
  stepId: string = randomUUID(),
): Promise<string> {
  const tenantId = assertTenantId(lead);

  const { urls } = await gatewayGenerateImage(tenantId, "image_generator", prompt, {
    model: "gpt-image-1",
    size: "1024x1024",
  });

  if (!urls.length) {
    throw new Error("Geração de imagem não retornou URL — verifique cota e configurações do modelo");
  }

  const imgUrl = urls[0]!;
  let imgBuffer: Buffer;

  try {
    const res = await fetch(imgUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao baixar imagem de ${imgUrl}`);
    }
    imgBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Falha ao baixar imagem gerada: ${msg}`);
  }

  const subPath = buildStoragePath(lead, stepId, "png");
  return saveToStorage(imgBuffer, "image/png", subPath);
}

// ── 5. generateMaterial ───────────────────────────────────────────────────────

/**
 * Função principal — decide o gerador correto com base em step.materialTipo.
 *
 * Fluxo:
 *  - Se materialFonte = 'upload': retorna materialUploadUrl diretamente.
 *  - Se materialFonte = 'ia' (ou não definido): gera via IA.
 *    - 'html'   → generateHTML
 *    - 'pdf'    → generatePDF
 *    - 'imagem' → generateImage
 *
 * @returns URL pública do material gerado ou URL de upload pré-existente
 */
export async function generateMaterial(
  step: ProspectorFlowStep,
  lead: PartnerLead,
): Promise<string> {
  // ── Caso upload: retornar diretamente ────────────────────────────────────
  if (step.materialFonte === "upload") {
    if (!step.materialUploadUrl) {
      throw new Error(
        `Step ${step.id} tem materialFonte='upload' mas materialUploadUrl está vazio`,
      );
    }
    return step.materialUploadUrl;
  }

  // ── Caso IA: validar e renderizar prompt ─────────────────────────────────
  if (!step.materialPrompt) {
    throw new Error(
      `Step ${step.id} não tem materialPrompt configurado`,
    );
  }

  const leadVars: Record<string, string> = {
    nome: lead.nome,
    empresa: lead.empresa ?? "",
    telefone: lead.telefone ?? "",
    cidade: "",
    segmento: "",
  };

  // Mescla vars do prompt com dados do lead (prompt vars têm precedência)
  const promptVars = (step.materialPromptVars ?? {}) as Record<string, unknown>;
  const mergedVars: Record<string, string> = {
    ...leadVars,
    ...Object.fromEntries(
      Object.entries(promptVars).map(([k, v]) => [k, String(v ?? "")]),
    ),
  };

  const renderedPrompt = renderPrompt(step.materialPrompt, mergedVars);

  // ── Despachar para o gerador correto ─────────────────────────────────────
  switch (step.materialTipo) {
    case "html":
      return generateHTML(renderedPrompt, lead, step.id);
    case "pdf":
      return generatePDF(renderedPrompt, lead, step.id);
    case "imagem":
      return generateImage(renderedPrompt, lead, step.id);
    default:
      throw new Error(
        `materialTipo desconhecido: '${step.materialTipo}'. Valores válidos: html, pdf, imagem`,
      );
  }
}
