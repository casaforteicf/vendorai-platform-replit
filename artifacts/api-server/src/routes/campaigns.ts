import { Router, type IRouter } from "express";
import { and, eq, gt, gte, lt, lte, isNotNull, inArray } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignSentLogsTable,
  customerIntelligenceTable,
  dealsTable,
  insertCampaignSchema,
  updateCampaignSchema,
  segmentoFiltroSchema,
} from "@workspace/db";
import type { NumericFilter, SegmentoFiltro } from "@workspace/db";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { callReplicateFlux11Pro } from "../lib/arch-render-pipeline.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();

function buildAudienceConditions(
  tenantId: string,
  filtro: SegmentoFiltro
): SQL[] {
  const conditions: SQL[] = [
    eq(customerIntelligenceTable.tenantId, tenantId),
  ];

  if (!filtro) return conditions;

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
  const objectPath = await storage.savePrivateBuffer(buf, "image/jpeg", `campaign-img-${crypto.randomUUID()}.jpg`);
  const imageUrl = `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;

  res.json({ imageUrl, objectPath });
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
      dealLeadIds = dealRows.map((r) => r.leadId);
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
        dealEtapaMap[d.leadId] = d.etapa;
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
