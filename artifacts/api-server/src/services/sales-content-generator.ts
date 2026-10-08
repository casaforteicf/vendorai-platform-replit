import { and, eq } from "drizzle-orm";
import {
  businessProfilesTable,
  contentLibraryTable,
  db,
  type Prospect,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { resolveContentContext } from "./contentContextLibrary.js";
import { resolveColdProspectingConfig } from "./cold-prospecting-config.js";
import { generateProposalPDF } from "../lib/proposal-engine.js";
import { captureGeneratedMedia } from "./media-library.js";
import type { SalesContentPlan } from "./sales-content-planner.js";

type GeneratedCommercialAsset = {
  format: "one_page";
  title: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  safetyNotes: string[];
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char] ?? char));
}

function buildOnePageHtml(input: {
  title: string; hook: string; body: string; cta: string;
  companyName?: string | null; logoUrl?: string | null;
}): string {
  const paragraphs = input.body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#172033;background:#fff}
.page{min-height:297mm;padding:24mm 20mm;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.brand img{max-height:48px;max-width:180px;object-fit:contain}.brand-name{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#526070}
h1{font-size:30px;line-height:1.1;margin:12px 0}.hook{font-size:18px;line-height:1.45;color:#3a4759;margin:0 0 22px}
.body{font-size:14px;line-height:1.6}.body p{margin:0 0 12px}.cta{margin-top:auto;border-top:1px solid #dfe4ea;padding-top:18px;font-size:15px;font-weight:700}
.footer{margin-top:18px;font-size:10px;color:#7b8794}
</style></head><body><main class="page">
<div class="brand">${input.logoUrl ? `<img src="${escapeHtml(input.logoUrl)}" alt="Logo"/>` : ""}<span class="brand-name">${escapeHtml(input.companyName || "")}</span></div>
<h1>${escapeHtml(input.title)}</h1>
<p class="hook">${escapeHtml(input.hook)}</p>
<div class="body">${paragraphs.map((p)=>`<p>${escapeHtml(p)}</p>`).join("")}</div>
<div class="cta">${escapeHtml(input.cta)}</div>
<div class="footer">Material comercial gerado pelo Vendor.ai a partir de fontes aprovadas do tenant.</div>
</main></body></html>`;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i)?.[1] ?? trimmed;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou JSON válido");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => asString(v)).filter(Boolean).slice(0, 20)
    : [];
}

export async function generateSalesContent(input: {
  tenantId: string;
  prospect: Prospect;
  plan: SalesContentPlan;
  logger?: { warn?: (o: unknown, m?: string) => void };
}): Promise<{ assetId: string; asset: GeneratedCommercialAsset; sourceIds: string[]; generatedMedia: { assetId: string; storageUrl: string; mimeType: string } | null }> {
  if (input.plan.action !== "generate" || !input.plan.generationBrief) {
    throw new Error("Plano de conteúdo não solicita geração");
  }

  const brief = input.plan.generationBrief;
  const [profile, context] = await Promise.all([
    db.select().from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, input.tenantId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    resolveContentContext({
      tenantId: input.tenantId,
      query: [
        brief.product,
        brief.segment,
        brief.persona,
        ...brief.pains,
        brief.objective,
      ].filter(Boolean).join(" "),
      limit: 10,
    }),
  ]);

  const brandContext = [
    profile?.nomeFantasia ? `Empresa: ${profile.nomeFantasia}` : null,
    profile?.vertical ? `Segmento do tenant: ${profile.vertical}` : null,
    profile?.publicoAlvo ? `Público-alvo: ${profile.publicoAlvo}` : null,
    profile?.diferenciais ? `Diferenciais aprovados: ${profile.diferenciais}` : null,
    profile?.metodoVendas ? `Método de vendas: ${profile.metodoVendas}` : null,
    profile?.logoUrl ? "Logo oficial disponível no Kit de Marca." : "Logo oficial não confirmado.",
  ].filter(Boolean).join("\n");

  const system = `Você é o Sales Content Engine do Vendor.ai.
Sua tarefa é criar material comercial B2B curto para PROSPECÇÃO FRIA.

REGRAS OBRIGATÓRIAS:
- Use SOMENTE fatos fornecidos nas fontes aprovadas abaixo.
- Não invente preço, case, cliente, número, resultado, garantia, integração, capacidade técnica ou promessa.
- Distingua claramente benefício potencial de resultado comprovado.
- Não faça texto de telemarketing genérico.
- O conteúdo deve estar ligado à dor/contexto informado.
- Não tente fechar venda; o objetivo é avançar a conversa para o próximo passo.
- Respeite a marca do tenant. Não recrie nem altere logo.
- Se faltarem fatos para uma afirmação, omita a afirmação.
- Responda SOMENTE JSON válido, sem markdown.

FORMATO:
{
  "title": "título curto",
  "hook": "abertura curta",
  "body": "corpo do material, objetivo e escaneável",
  "cta": "próximo passo natural",
  "hashtags": [],
  "safetyNotes": ["eventuais limitações ou informações que não puderam ser afirmadas"]
}`;

  const user = [
    "BRIEF COMERCIAL:",
    `Produto principal: ${brief.product}`,
    `Segmento: ${brief.segment ?? "não informado"}`,
    `Persona: ${brief.persona ?? "não informada"}`,
    `Dores: ${brief.pains.join(", ") || "não confirmadas"}`,
    `Etapa: ${brief.prospectStage}`,
    `Objetivo: ${brief.objective}`,
    `Canal: ${brief.channel}`,
    `Direção: ${brief.titleDirection}`,
    "",
    "CONTEXTO DE MARCA:",
    brandContext || "Sem contexto de marca suficiente; mantenha linguagem neutra.",
    "",
    context.promptBlock,
  ].join("\n");

  const ai = await gatewayCallOpenAI(
    input.tenantId,
    "content_generation",
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxTokens: 1200 },
  );

  const parsed = extractJsonObject(ai.content);
  const asset: GeneratedCommercialAsset = {
    format: "one_page",
    title: asString(parsed["title"], `Material comercial ${brief.product}`),
    hook: asString(parsed["hook"]),
    body: asString(parsed["body"]),
    cta: asString(parsed["cta"]),
    hashtags: asStringArray(parsed["hashtags"]),
    safetyNotes: asStringArray(parsed["safetyNotes"]),
  };

  if (!asset.body) throw new Error("A IA retornou material comercial vazio");

  let generatedMedia: { assetId: string; storageUrl: string; mimeType: string } | null = null;
  try {
    const html = buildOnePageHtml({
      title: asset.title,
      hook: asset.hook,
      body: asset.body,
      cta: asset.cta,
      companyName: profile?.nomeFantasia ?? profile?.razaoSocial ?? null,
      logoUrl: profile?.logoUrl ?? null,
    });
    const rendered = await generateProposalPDF(html);
    const isPdf = rendered.length >= 4
      && rendered[0] === 0x25 && rendered[1] === 0x50
      && rendered[2] === 0x44 && rendered[3] === 0x46;
    const mimeType = isPdf ? "application/pdf" : "text/html; charset=utf-8";
    const captured = await captureGeneratedMedia({
      tenantId: input.tenantId,
      title: asset.title,
      operation: "sales_enablement_one_page",
      buffer: rendered,
      mimeType,
      type: "document",
      originalFilename: isPdf ? `sales-${input.prospect.id}.pdf` : `sales-${input.prospect.id}.html`,
      kind: "sales_enablement",
      metadata: {
        prospectId: input.prospect.id,
        product: brief.product,
        generatedByAi: true,
        approvalStatus: "review",
      },
    });
    generatedMedia = { assetId: captured.assetId, storageUrl: captured.storageUrl, mimeType };
  } catch (error) {
    input.logger?.warn?.({ error, prospectId: input.prospect.id }, "sales-content: one-page rendering failed; structured content preserved");
  }

  const [saved] = await db.insert(contentLibraryTable).values({
    tenantId: input.tenantId,
    type: "linkedin",
    variation: {
      hook: asset.hook || asset.title,
      caption: [asset.body, asset.cta].filter(Boolean).join("\n\n"),
      hashtags: asset.hashtags,
    },
    theme: `sales_enablement:${brief.product}`,
    title: asset.title,
    commercialUse: true,
    products: [brief.product],
    segments: brief.segment ? [brief.segment] : [],
    personas: brief.persona ? [brief.persona] : [],
    pains: brief.pains,
    prospectStages: [brief.prospectStage],
    objectives: [brief.objective],
    channels: [brief.channel],
    autoSendAllowed: false,
    approvalStatus: "review",
    contentVersion: 1,
    generatedByAi: true,
    generationContext: {
      prospectId: input.prospect.id,
      factPolicy: brief.factPolicy,
      brandPolicy: brief.brandPolicy,
      sourceIds: context.sources.map((s) => s.id),
      sourceTitles: context.sources.map((s) => s.title),
      safetyNotes: asset.safetyNotes,
      format: asset.format,
      generatedMediaAssetId: generatedMedia?.assetId ?? null,
      generatedMediaStorageUrl: generatedMedia?.storageUrl ?? null,
      generatedMediaMimeType: generatedMedia?.mimeType ?? null,
      generatedAt: new Date().toISOString(),
    },
  }).returning({ id: contentLibraryTable.id });

  if (!saved) throw new Error("Falha ao salvar material na Biblioteca Comercial");

  return {
    assetId: saved.id,
    asset,
    sourceIds: context.sources.map((s) => s.id),
    generatedMedia,
  };
}

export async function approveSalesContent(input: {
  tenantId: string;
  assetId: string;
  autoSendAllowed?: boolean;
}): Promise<{ approved: boolean; autoSendAllowed: boolean }> {
  const runtime = await resolveColdProspectingConfig(input.tenantId);
  const requestedAutoSend = input.autoSendAllowed ?? false;
  const effectiveAutoSend =
    requestedAutoSend &&
    runtime.mode === "autonomous" &&
    runtime.autoSendApprovedContent;

  const [updated] = await db.update(contentLibraryTable)
    .set({
      approvalStatus: "approved",
      autoSendAllowed: effectiveAutoSend,
    })
    .where(and(
      eq(contentLibraryTable.id, input.assetId),
      eq(contentLibraryTable.tenantId, input.tenantId),
      eq(contentLibraryTable.commercialUse, true),
    ))
    .returning({ id: contentLibraryTable.id });

  return { approved: Boolean(updated), autoSendAllowed: Boolean(updated) && effectiveAutoSend };
}
