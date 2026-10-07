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
import type { SalesContentPlan } from "./sales-content-planner.js";

type GeneratedCommercialAsset = {
  title: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  safetyNotes: string[];
};

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
}): Promise<{ assetId: string; asset: GeneratedCommercialAsset; sourceIds: string[] }> {
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
    title: asString(parsed["title"], `Material comercial ${brief.product}`),
    hook: asString(parsed["hook"]),
    body: asString(parsed["body"]),
    cta: asString(parsed["cta"]),
    hashtags: asStringArray(parsed["hashtags"]),
    safetyNotes: asStringArray(parsed["safetyNotes"]),
  };

  if (!asset.body) throw new Error("A IA retornou material comercial vazio");

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
      generatedAt: new Date().toISOString(),
    },
  }).returning({ id: contentLibraryTable.id });

  if (!saved) throw new Error("Falha ao salvar material na Biblioteca Comercial");

  return {
    assetId: saved.id,
    asset,
    sourceIds: context.sources.map((s) => s.id),
  };
}

export async function approveSalesContent(input: {
  tenantId: string;
  assetId: string;
  autoSendAllowed?: boolean;
}): Promise<boolean> {
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

  return Boolean(updated);
}
