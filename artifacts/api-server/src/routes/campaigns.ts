import { Router, type IRouter } from "express";
import { and, eq, gt, gte, lt, lte, isNotNull } from "drizzle-orm";
import {
  db,
  campaignsTable,
  customerIntelligenceTable,
  insertCampaignSchema,
  updateCampaignSchema,
  segmentoFiltroSchema,
} from "@workspace/db";
import type { NumericFilter, SegmentoFiltro } from "@workspace/db";
import type { SQL } from "drizzle-orm";

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

router.post("/campaigns", async (req, res) => {
  const parsed = insertCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
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

    const rows = await db
      .select({
        id: customerIntelligenceTable.id,
        leadId: customerIntelligenceTable.leadId,
        churnRisk: customerIntelligenceTable.churnRisk,
        journeyStage: customerIntelligenceTable.journeyStage,
        nextBestAction: customerIntelligenceTable.nextBestAction,
      })
      .from(customerIntelligenceTable)
      .where(and(...conditions));

    res.json({
      count: rows.length,
      filtersApplied: filtro ?? null,
      sample: rows.slice(0, 10),
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

  const [campaign] = await db
    .update(campaignsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(campaignsTable.id, String(req.params.id)))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json(campaign);
});

router.delete("/campaigns/:id", async (req, res) => {
  const [deleted] = await db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, String(req.params.id)))
    .returning({ id: campaignsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.status(204).send();
});

export default router;
