import { Router, type IRouter } from "express";
import { and, eq, gt, gte, lt, lte, isNotNull, inArray } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignSentLogsTable,
  customerIntelligenceTable,
  leadsTable,
  dealsTable,
  insertCampaignSchema,
  updateCampaignSchema,
  segmentoFiltroSchema,
} from "@workspace/db";
import type { NumericFilter, SegmentoFiltro } from "@workspace/db";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { callOpenAI as generateCampaignText } from "../lib/ai-gateway.js";
import { callReplicateFlux11Pro, callReplicateFluxKontext } from "../lib/arch-render-pipeline.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { buildCampaignMarketingIntelligence } from "../services/campaign-marketing-intelligence.js";
import { recommendExistingLeadCaptureToolWithJarvis, syncTenantLeadCaptureToolsFromExistingCapabilities } from "../services/jarvis-tool-builder.js";

const router: IRouter = Router();

const deliveryToolRecommendationSchema = z.object({
  campaignName: z.string().max(200).optional(),
  campaignGoal: z.string().max(500).optional(),
  nicheName: z.string().max(200).optional(),
  audienceSegment: z.string().max(300).optional(),
  audienceNiche: z.string().max(300).optional(),
  productNames: z.array(z.string().max(200)).max(20).optional(),
  specificDetails: z.string().max(1000).optional(),
});

router.post("/tenants/:tenantId/campaigns/recommend-delivery-tool", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately validated against authenticated tenant or Super Admin
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return res.status(403).json({ error: "Access denied to this tenant" });
  }

  const parsed = deliveryToolRecommendationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const d = parsed.data;
  const brief = [
    d.campaignName ? `Campanha: ${d.campaignName}` : null,
    d.campaignGoal ? `Objetivo: ${d.campaignGoal}` : null,
    d.nicheName ? `Nicho: ${d.nicheName}` : null,
    d.audienceSegment ? `Segmento de público: ${d.audienceSegment}` : null,
    d.audienceNiche ? `Público/nicho: ${d.audienceNiche}` : null,
    d.productNames?.length ? `Produtos: ${d.productNames.join(", ")}` : null,
    d.specificDetails ? `Detalhes: ${d.specificDetails}` : null,
  ].filter(Boolean).join("\n") || "Campanha comercial sem contexto adicional.";

  try {
    await syncTenantLeadCaptureToolsFromExistingCapabilities(tenantId);
    const result = await recommendExistingLeadCaptureToolWithJarvis({ tenantId, brief });
    return res.json(result);
  } catch (err) {
    req.log.error({ err, tenantId }, "campaigns: delivery tool recommendation failed");
    return res.status(500).json({ error: "Não foi possível recomendar uma entrega agora." });
  }
});



function buildAudienceConditions(
  tenantId: string,
  filtro: SegmentoFiltro
): SQL[] {
  const conditions: SQL[] = [
    eq(customerIntelligenceTable.tenantId, tenantId),
  ];

  if (!filtro) return conditions;

  if (filtro.leadIds?.length) {
    conditions.push(inArray(customerIntelligenceTable.leadId, filtro.leadIds));
  }

  if (filtro.churnRisk !== undefined) {
    const f = filtro.churnRisk as NumericFilter;
    conditions.push(isNotNull(customerIntelligenceTable.churnRisk));
    if (typeof f === "number") {
      conditions.push(eq(customerIntelligenceTable.churnRisk, f));
    } else {
      if (f.gt !== undefined)
        conditions.push(gt(customerIntelligenceTable.churnRisk, f.gt));
      if (f.gte !== undefined)
        conditions.push(gte(customerIntelligenceTable.churnRisk, f.gte));
      if (f.lt !== undefined)
        conditions.push(lt(customerIntelligenceTable.churnRisk, f.lt));
      if (f.lte !== undefined)
        conditions.push(lte(customerIntelligenceTable.churnRisk, f.lte));
      if (f.eq !== undefined)
        conditions.push(eq(customerIntelligenceTable.churnRisk, f.eq));
    }
  }

  if (filtro.journeyStage !== undefined) {
    conditions.push(
      eq(customerIntelligenceTable.journeyStage, filtro.journeyStage)
    );
  }

  if (filtro.nextBestAction !== undefined) {
    conditions.push(
      eq(customerIntelligenceTable.nextBestAction, filtro.nextBestAction)
    );
  }

  if (filtro.intentAnalysis !== undefined) {
    conditions.push(
      eq(customerIntelligenceTable.intentAnalysis, filtro.intentAnalysis)
    );
  }

  return conditions;
}

// ── AI image generation for campaigns ────────────────────────────────────────
const generateImageSchema = z.object({
  descricao: z.string().min(1).max(1000),
  aspectRatio: z.enum(["1:1", "4:5", "16:9", "9:16"]).optional().default("1:1"),
});

router.post("/tenants/:tenantId/campaigns/generate-image", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = generateImageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { descricao, aspectRatio } = parsed.data;

  const prompt = `Marketing campaign visual: ${descricao}. Professional, high quality, vibrant colors, suitable for WhatsApp messaging.`;

  const outputUrl = await callReplicateFlux11Pro({ prompt, aspectRatio: aspectRatio as "1:1" | "4:5" | "16:9" | "9:16" });

  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  const storage = new ObjectStorageService();
  const objectPath = await storage.savePrivateBuffer(buf, "image/jpeg", `campaign-img-${crypto.randomUUID()}.jpg`, tenantId);
  const imageUrl = `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;

  res.json({ imageUrl, objectPath });
});

// ── AI image enhancement (edita foto enviada pelo lojista, sem gerar do zero) ─
const enhanceImageSchema = z.object({
  objectPath: z.string().min(1).max(500),
  instrucao: z.string().max(500).optional(),
});

router.post("/tenants/:tenantId/campaigns/enhance-image", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = enhanceImageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { objectPath, instrucao } = parsed.data;

  const storage = new ObjectStorageService();
  let sourceBuffer: Buffer;
  let sourceContentType: string;
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [buf] = await file.download();
    const [meta] = await file.getMetadata();
    sourceBuffer = buf;
    sourceContentType = meta.contentType || "image/jpeg";
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Imagem enviada não encontrada" });
      return;
    }
    throw err;
  }

  const imageDataUrl = `data:${sourceContentType};base64,${sourceBuffer.toString("base64")}`;
  const prompt = instrucao?.trim()
    ? `Melhore esta foto para uso em uma campanha de marketing: ${instrucao.trim()}. Preserve o produto/pessoa e o enquadramento original, só melhore luz, nitidez e apelo visual.`
    : "Melhore a qualidade desta foto para uso em uma campanha de marketing: mais nítida, bem iluminada, cores vibrantes. Preserve o produto/pessoa e o enquadramento original.";

  const outputBase64 = await callReplicateFluxKontext({ imageDataUrl, prompt });
  const buf = Buffer.from(outputBase64, "base64");

  const outObjectPath = await storage.savePrivateBuffer(buf, "image/png", `campaign-img-enhanced-${crypto.randomUUID()}.png`, tenantId);
  const imageUrl = `/api/storage/objects${outObjectPath.replace(/^\/objects/, "")}`;

  res.json({ imageUrl, objectPath: outObjectPath });
});

// ── AI copy generation for campaigns (retenção/conversão) ─────────────────────
const generateCopySchema = z.object({
  nome: z.string().min(1).max(200),
  tipo: z.enum(["whatsapp", "email", "instagram"]),
  objetivo: z.string().min(3).max(500),
  segmentoFiltro: z.unknown().optional(),
  gerarVariantesAB: z.boolean().optional().default(false),
});

function resumoSegmento(filtro?: SegmentoFiltro): string {
  if (!filtro) return "público geral, sem filtro de segmento definido";

  const partes: string[] = [];

  if (filtro.churnRisk !== undefined) {
    const f = filtro.churnRisk as NumericFilter;
    if (typeof f === "number") {
      partes.push(`risco de churn = ${f}`);
    } else {
      const trechos = [
        f.gte !== undefined ? `risco de churn >= ${f.gte}` : null,
        f.gt !== undefined ? `risco de churn > ${f.gt}` : null,
        f.lte !== undefined ? `risco de churn <= ${f.lte}` : null,
        f.lt !== undefined ? `risco de churn < ${f.lt}` : null,
        f.eq !== undefined ? `risco de churn = ${f.eq}` : null,
      ].filter((v): v is string => v !== null);
      partes.push(...trechos);
    }
  }

  if (filtro.journeyStage) partes.push(`estágio da jornada: ${filtro.journeyStage}`);
  if (filtro.nextBestAction) partes.push(`próxima ação recomendada: ${filtro.nextBestAction}`);
  if (filtro.intentAnalysis) partes.push(`intenção detectada: ${filtro.intentAnalysis}`);
  if (filtro.dealEtapas?.length) partes.push(`etapa(s) do funil: ${filtro.dealEtapas.join(", ")}`);
  if (filtro.leadIds?.length) partes.push(`${filtro.leadIds.length} prospect(s) selecionado(s) pelo Revenue Scout`);
  if (filtro.marketingContext?.audienceNiche) partes.push(`nicho: ${filtro.marketingContext.audienceNiche}`);

  return partes.length > 0 ? partes.join("; ") : "público geral, sem filtro de segmento definido";
}

const CHANNEL_GUIDE: Record<"whatsapp" | "email" | "instagram", string> = {
  whatsapp:
    "Mensagem de WhatsApp: até 300 caracteres, tom pessoal e direto, no máximo 1 emoji, 1 CTA claro no final. Sem linha de assunto.",
  email:
    "E-mail: a primeira linha deve ser 'Assunto: ...' (até 60 caracteres), seguida de uma linha em branco e o corpo do e-mail com saudação, desenvolvimento e CTA.",
  instagram:
    "Legenda de post do Instagram: parágrafos curtos, tom conversacional, até 3 hashtags relevantes ao final, CTA claro no fim do texto.",
};

function isChurnFocus(segmentoResumo: string): boolean {
  return /risco de churn (>=|>) [5-9]\b|risco de churn = (6|7|8|9|10)\b/.test(segmentoResumo);
}

function buildCopyPrompt(input: {
  nome: string;
  tipo: "whatsapp" | "email" | "instagram";
  objetivo: string;
  segmentoResumo: string;
  abTest: boolean;
}): string {
  const { nome, tipo, objetivo, segmentoResumo, abTest } = input;
  const churnFocus = isChurnFocus(segmentoResumo);

  return `Você é um copywriter especialista em marketing de retenção e conversão para pequenos e médios negócios brasileiros.

CAMPANHA: "${nome}"
CANAL: ${tipo}
OBJETIVO INFORMADO PELO LOJISTA: ${objetivo}
PÚBLICO-ALVO DESTA CAMPANHA: ${segmentoResumo}

DIRETRIZES DE CANAL:
${CHANNEL_GUIDE[tipo]}

${
    churnFocus
      ? "Este público tem risco de churn ALTO — use tom de reconquista, reconheça a ausência sem soar acusatório, ofereça um motivo concreto e de baixo atrito pra voltar (não apenas desconto genérico)."
      : "Escreva com foco em conversão direta, sem soar genérico — a mensagem deve parecer escrita especificamente pra esse público, não um template reaproveitado."
  }

MÉTODO (aplique implicitamente, sem citar o método no texto final):
Situação → reconheça o contexto do público. Problema → nomeie a dor/motivo real de agir agora. Implicação → o custo de não agir. Necessidade → a oferta como solução natural, com CTA de verbo de ação.

REGRAS:
- Português do Brasil, natural, sem parecer robótico ou genérico de IA.
- Nunca invente números, depoimentos ou nomes de clientes reais.
- CTA sempre com verbo de ação (ex: "Aproveitar agora", "Voltar e ganhar 10%").
${abTest ? '- Gere TAMBÉM duas variantes (A e B) com ângulos diferentes entre si (ex: uma focada em urgência, outra em benefício direto), pra teste A/B.' : ""}

Retorne APENAS um JSON válido, sem markdown, sem explicação, no formato exato:
{"mensagem": "texto principal aqui"${abTest ? ', "variantA": "texto da variante A", "variantB": "texto da variante B"' : ""}}`;
}

router.post("/tenants/:tenantId/campaigns/generate-copy", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = generateCopySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { nome, tipo, objetivo, segmentoFiltro, gerarVariantesAB } = parsed.data;
  const filtroResult = segmentoFiltroSchema.safeParse(segmentoFiltro);
  const segmentoResumo = resumoSegmento(filtroResult.success ? filtroResult.data : undefined);
  const prompt = buildCopyPrompt({ nome, tipo, objetivo, segmentoResumo, abTest: gerarVariantesAB });

  try {
    const message = await generateCampaignText(String(tenantId), "content_generator", [
      { role: "system", content: "Você responde SEMPRE em JSON válido. Use as informações aprovadas da empresa, respeite o público e não invente benefícios ou condições." },
      { role: "user", content: prompt },
    ], { maxTokens: 1500, responseFormat: { type: "json_object" }, log: req.log });
    const raw = message.content.trim();

    let result: { mensagem?: string; variantA?: string; variantB?: string };
    try {
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      result = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch {
      result = { mensagem: raw };
    }

    if (!result.mensagem) {
      res.status(502).json({ error: "IA não retornou uma mensagem válida" });
      return;
    }

    res.json({
      mensagem: result.mensagem,
      variantA: gerarVariantesAB ? result.variantA : undefined,
      variantB: gerarVariantesAB ? result.variantB : undefined,
      segmentoResumo,
    });
  } catch (err) {
    req.log.error({ err }, "campaigns: generate-copy failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

const marketingIntelligenceBodySchema = z.object({
  countryCode: z.string().trim().length(2).optional().default("BR"),
});

router.get("/tenants/:tenantId/campaigns/:id/marketing-intelligence", async (req, res) => {
  const { tenantId, id } = req.params;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [campaign] = await db
    .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId, contexto: campaignsTable.contexto })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.tenantId, tenantId)));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const contexto = (campaign.contexto ?? {}) as Record<string, unknown>;
  res.json({ marketingIntelligence: contexto["marketingIntelligence"] ?? null });
});

router.post("/tenants/:tenantId/campaigns/:id/marketing-intelligence", async (req, res) => {
  const { tenantId, id } = req.params;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = marketingIntelligenceBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.tenantId, tenantId)));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const segmentoFiltro = ((campaign.segmentoFiltro ?? {}) as Record<string, unknown>);
  const contexto = ((campaign.contexto ?? {}) as Record<string, unknown>);
  const nestedMarketing = segmentoFiltro["marketingContext"] ?? contexto["marketingContext"];
  const marketingContext = (
    nestedMarketing && typeof nestedMarketing === "object" && !Array.isArray(nestedMarketing)
      ? nestedMarketing
      : contexto
  ) as Record<string, unknown>;

  try {
    const pack = await buildCampaignMarketingIntelligence({
      tenantId,
      campaignId: campaign.id,
      campaignName: campaign.nome,
      context: marketingContext as any,
      countryCode: parsed.data.countryCode,
    });

    const enrichedMarketingContext = {
      ...marketingContext,
      marketingIntelligence: pack,
    };
    const nextSegmentoFiltro = {
      ...segmentoFiltro,
      marketingContext: enrichedMarketingContext,
    };
    const nextContexto = {
      ...contexto,
      marketingContext: enrichedMarketingContext,
      marketingIntelligence: pack,
    };

    await db
      .update(campaignsTable)
      .set({
        segmentoFiltro: nextSegmentoFiltro as any,
        contexto: nextContexto as any,
        updatedAt: new Date(),
      })
      .where(eq(campaignsTable.id, campaign.id));

    res.json({ marketingIntelligence: pack });
  } catch (err) {
    req.log.error({ err, tenantId, campaignId: id }, "campaigns: marketing intelligence failed");
    res.status(502).json({
      error: err instanceof Error ? err.message : "Falha ao montar pesquisa e estratégia da campanha",
    });
  }
});

router.post("/campaigns", async (req, res) => {
  const parsed = insertCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [campaign] = await db
    .insert(campaignsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(campaign);
});

router.get("/tenants/:tenantId/campaigns", async (req, res) => {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.tenantId, String(req.params.tenantId)))
    .orderBy(campaignsTable.createdAt);
  res.json(campaigns);
});

router.get(
  "/tenants/:tenantId/campaigns/:id/preview-audience",
  async (req, res) => {
    const { tenantId, id } = req.params;

    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(
        and(
          eq(campaignsTable.id, String(id)),
          eq(campaignsTable.tenantId, String(tenantId))
        )
      );

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const filtroResult = segmentoFiltroSchema.safeParse(
      campaign.segmentoFiltro
    );
    const filtro = filtroResult.success ? filtroResult.data : undefined;

    // Campanhas originadas no Revenue Scout preservam exatamente os prospects
    // escolhidos. A prévia não depende de customer_intelligence existir para
    // cada lead e nunca atravessa o tenant.
    if (filtro?.leadIds?.length) {
      const selectedLeads = await db
        .select({ id: leadsTable.id, nome: leadsTable.nome })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.tenantId, String(tenantId)),
            inArray(leadsTable.id, filtro.leadIds),
          ),
        );
      res.json({
        count: selectedLeads.length,
        filtersApplied: filtro,
        sample: selectedLeads.slice(0, 10).map((lead) => ({
          id: lead.id,
          leadId: lead.id,
          nome: lead.nome,
          churnRisk: null,
          journeyStage: null,
          nextBestAction: null,
          dealEtapa: null,
        })),
      });
      return;
    }

    const conditions = buildAudienceConditions(String(tenantId), filtro);

    // If dealEtapas filter is set, resolve matching leadIds from deals table
    let dealLeadIds: string[] | null = null;
    if (filtro?.dealEtapas && filtro.dealEtapas.length > 0) {
      const dealRows = await db
        .select({ leadId: dealsTable.leadId })
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.tenantId, String(tenantId)),
            inArray(dealsTable.etapa, filtro.dealEtapas as any[])
          )
        );
      dealLeadIds = dealRows.map((r) => r.leadId).filter((id): id is string => id != null);
      if (dealLeadIds.length === 0) {
        res.json({ count: 0, filtersApplied: filtro ?? null, sample: [] });
        return;
      }
    }

    const finalConditions = [...conditions];
    if (dealLeadIds !== null) {
      finalConditions.push(
        inArray(customerIntelligenceTable.leadId, dealLeadIds)
      );
    }

    const rows = await db
      .select({
        id: customerIntelligenceTable.id,
        leadId: customerIntelligenceTable.leadId,
        churnRisk: customerIntelligenceTable.churnRisk,
        journeyStage: customerIntelligenceTable.journeyStage,
        nextBestAction: customerIntelligenceTable.nextBestAction,
      })
      .from(customerIntelligenceTable)
      .where(and(...finalConditions));

    // For the sample, look up deal etapa for each lead
    const sampleRows = rows.slice(0, 10);
    const dealEtapaMap: Record<string, string> = {};
    if (sampleRows.length > 0) {
      const sampleLeadIds = sampleRows.map((r) => r.leadId);
      const deals = await db
        .select({ leadId: dealsTable.leadId, etapa: dealsTable.etapa })
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.tenantId, String(tenantId)),
            inArray(dealsTable.leadId, sampleLeadIds)
          )
        );
      for (const d of deals) {
        if (d.leadId) dealEtapaMap[d.leadId] = d.etapa;
      }
    }

    const sample = sampleRows.map((r) => ({
      ...r,
      dealEtapa: dealEtapaMap[r.leadId] ?? null,
    }));

    res.json({
      count: rows.length,
      filtersApplied: filtro ?? null,
      sample,
    });
  }
);

router.get("/campaigns/:id", async (req, res) => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, String(req.params.id)));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json(campaign);
});

router.patch("/campaigns/:id", async (req, res) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [campaign] = await db
    .update(campaignsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(campaignsTable.id, existing.id))
    .returning();

  res.json(campaign);
});

// ── POST /tenants/:tenantId/campaigns/:campaignId/leads/:leadId/conversion ────
// Marca que um lead converteu a partir de uma campanha (ex: efetuou compra).
// Atualiza converted_at no log de envio correspondente.
router.post(
  "/tenants/:tenantId/campaigns/:campaignId/leads/:leadId/conversion",
  async (req, res) => {
    const { tenantId, campaignId, leadId } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [campaign] = await db
      .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId })
      .from(campaignsTable)
      .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId)));

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const [updated] = await db
      .update(campaignSentLogsTable)
      .set({ convertedAt: new Date() })
      .where(
        and(
          eq(campaignSentLogsTable.campaignId, campaignId),
          eq(campaignSentLogsTable.leadId, leadId)
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Sent log not found for this lead/campaign" });
      return;
    }

    req.log.info({ tenantId, campaignId, leadId }, "campaigns: conversion registrada");
    res.json({ success: true, convertedAt: updated.convertedAt });
  }
);

router.delete("/campaigns/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(campaignsTable).where(eq(campaignsTable.id, existing.id));

  res.status(204).send();
});

export default router;
