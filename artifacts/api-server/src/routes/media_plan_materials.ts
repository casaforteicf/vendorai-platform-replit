import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  adCampaignsTable,
  adCreativesTable,
  businessProfilesTable,
  contentGenerationsTable,
  db,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { generateImagesForContent } from "../lib/content-generation.js";

const router: IRouter = Router();

const TEXT_TYPES = ["whatsapp", "email", "blog", "sms"] as const;
const AD_TYPES = ["meta_ad", "search_ad", "display_ad", "performance_max"] as const;

const draftSchema = z.object({
  type: z.enum([...TEXT_TYPES, ...AD_TYPES]),
  theme: z.string().min(3),
  campaignName: z.string().min(1),
  objective: z.string().min(1),
  productService: z.string().min(1),
  audience: z.string().min(1),
  offer: z.string().default(""),
  messageCentral: z.string().default(""),
  region: z.string().optional().nullable(),
  channel: z.string().min(1),
  scheduledDate: z.string().optional().nullable(),
  marketingContext: z.record(z.string(), z.unknown()).optional().default({}),
  imageUrls: z.array(z.string().min(1)).max(10).optional().default([]),
});

type DraftInput = z.infer<typeof draftSchema>;

function canAccess(req: import("express").Request, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function commonBrief(input: DraftInput) {
  return [
    `Campanha: ${input.campaignName}`,
    `Tema: ${input.theme}`,
    `Objetivo: ${input.objective}`,
    `Produto/serviço: ${input.productService}`,
    `Público: ${input.audience}`,
    input.offer ? `Oferta/CTA: ${input.offer}` : "",
    input.messageCentral ? `Mensagem central: ${input.messageCentral}` : "",
    input.region ? `Região: ${input.region}` : "",
    `Canal: ${input.channel}`,
    input.scheduledDate ? `Data planejada: ${input.scheduledDate}` : "",
  ].filter(Boolean).join("\n");
}

async function createTextDraft(tenantId: string, input: DraftInput) {
  const brief = commonBrief(input);
  const formatRule = input.type === "whatsapp"
    ? `Crie uma mensagem de WhatsApp curta, humana e comercial. Retorne JSON: {"text":"...","cta":"..."}. Não use blocos longos.`
    : input.type === "email"
      ? `Crie um e-mail completo. Retorne JSON: {"subject":"...","body":"...","cta":"..."}. O assunto deve ser específico e o corpo pronto para envio.`
      : input.type === "blog"
        ? `Crie um artigo de blog completo, útil e escaneável, com introdução, subtítulos e conclusão. Retorne JSON: {"title":"...","article":"...","hashtags":["..."]}. Não invente estatísticas.`
        : `Crie um SMS objetivo com no máximo 300 caracteres. Retorne JSON: {"text":"...","cta":"..."}.`;

  const ai = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [
      { role: "system", content: "Você é o executor de conteúdo do Plano de Mídia do VendorAI. Gere material final pronto para revisão, sem pedir novamente dados que já estão no briefing." },
      { role: "user", content: `${brief}\n\n${formatRule}` },
    ],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.75 },
  );

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(ai.content || "{}"); } catch { parsed = {}; }

  const variation = input.type === "email"
    ? {
        hook: String(parsed["subject"] ?? `Sobre ${input.productService}`),
        caption: String(parsed["body"] ?? input.theme),
        cta: String(parsed["cta"] ?? input.offer ?? ""),
      }
    : input.type === "blog"
      ? {
          hook: String(parsed["title"] ?? input.theme),
          caption: String(parsed["article"] ?? input.theme),
          hashtags: Array.isArray(parsed["hashtags"]) ? parsed["hashtags"].map(String) : [],
        }
      : {
          text: String(parsed["text"] ?? input.theme),
          cta: String(parsed["cta"] ?? input.offer ?? ""),
        };

  const [row] = await db.insert(contentGenerationsTable).values({
    tenantId,
    type: input.type,
    productName: input.productService,
    theme: input.theme,
    result: { variations: [variation] } as any,
    tokensUsed: ai.inputTokens + ai.outputTokens,
  }).returning();

  if (!row) throw new Error("Não foi possível persistir o material gerado.");
  return { kind: "content" as const, contentGenerationId: row.id, preview: variation };
}

async function createAdDraft(tenantId: string, input: DraftInput) {
  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  const isMeta = input.type === "meta_ad";
  const needsImage = isMeta || input.type === "display_ad" || input.type === "performance_max";
  const brief = commonBrief(input);
  const ai = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [
      { role: "system", content: "Você cria rascunhos de anúncios para revisão humana. Nunca publique, nunca invente preço, prazo ou promessa não informada." },
      { role: "user", content: `${brief}\n\nRetorne JSON com {"headlines":[...],"descriptions":[...],"primaryText":"..."}. Gere até 8 headlines curtas e até 4 descrições. O texto deve estar pronto para o canal planejado.` },
    ],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.7 },
  );
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(ai.content || "{}"); } catch { parsed = {}; }
  const headlines = Array.isArray(parsed["headlines"]) ? parsed["headlines"].map(String).filter(Boolean).slice(0, 15) : [input.theme];
  const descriptions = Array.isArray(parsed["descriptions"]) ? parsed["descriptions"].map(String).filter(Boolean).slice(0, 4) : [String(parsed["primaryText"] ?? input.messageCentral ?? input.theme)];

  let images = input.imageUrls.slice(0, 10);
  if (needsImage && images.length === 0) {
    images = await generateImagesForContent(
      profile ?? {},
      tenantId,
      `${input.theme}. ${input.messageCentral}`,
      input.productService,
      "feed",
      input.type === "performance_max" ? 3 : 1,
      undefined,
      undefined,
      undefined,
      "4:5",
    );
  }

  const plataforma = isMeta ? "meta" : "google";
  const tipoAnuncio = needsImage && input.type !== "performance_max" ? "imagem" : "rsa_pmax";
  const segmentacao = {
    marketingContext: input.marketingContext,
    mediaPlanDraft: {
      source: "media-plan",
      type: input.type,
      campaignName: input.campaignName,
      objective: input.objective,
      audience: input.audience,
      offer: input.offer,
      scheduledDate: input.scheduledDate,
      requiresBudgetBeforePublish: true,
      generatedAt: new Date().toISOString(),
    },
  } as any;

  const [campaign] = await db.insert(adCampaignsTable).values({
    tenantId,
    plataforma,
    tipoAnuncio,
    vertical: profile?.vertical || "Marketing",
    itemTipo: "livre",
    itemLabel: input.theme.slice(0, 180),
    modo: "unico",
    destinoClique: "formulario_lead",
    orcamentoDiario: "0.00",
    segmentacao,
  }).returning();
  if (!campaign) throw new Error("Não foi possível criar o rascunho do anúncio.");

  const [creative] = await db.insert(adCreativesTable).values({
    campaignId: campaign.id,
    headlines,
    descriptions,
    imagens: images,
  }).returning();
  if (!creative) throw new Error("Não foi possível criar o criativo do anúncio.");

  return {
    kind: "ad" as const,
    adCampaignId: campaign.id,
    creativeId: creative.id,
    preview: { headlines, descriptions, images },
  };
}

router.post("/tenants/:tenantId/media-plan/materials/draft", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = (TEXT_TYPES as readonly string[]).includes(parsed.data.type)
      ? await createTextDraft(tenantId, parsed.data)
      : await createAdDraft(tenantId, parsed.data);
    res.status(201).json(result);
  } catch (error) {
    req.log.error({ err: error, tenantId, type: parsed.data.type }, "media-plan-materials: falha ao materializar rascunho");
    res.status(502).json({ error: error instanceof Error ? error.message : "Falha ao materializar o conteúdo." });
  }
});

export default router;
