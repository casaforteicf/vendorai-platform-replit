/**
 * Project Opportunity Engine (POE) routes — FASE 23
 * Identifies commercial opportunities from project context.
 * Every recommendation is technically justified — never ad-based.
 *
 * GET    /poe/opportunities                    — list opportunities for tenant
 * POST   /poe/opportunities                    — create opportunity
 * GET    /poe/opportunities/:id                — detail
 * PATCH  /poe/opportunities/:id               — update (status, dismissed, etc.)
 * DELETE /poe/opportunities/:id               — delete
 * POST   /poe/opportunities/:id/dismiss        — dismiss opportunity
 *
 * GET    /poe/opportunities/:id/recommendations — list recommendations
 * POST   /poe/opportunities/:id/recommendations — add recommendation
 * PATCH  /poe/recommendations/:recId           — update recommendation
 * POST   /poe/recommendations/:recId/select    — architect selects this option
 *
 * GET    /poe/quotations                        — list quotation requests for tenant
 * POST   /poe/quotations                        — create quotation request
 * GET    /poe/quotations/:id                    — quotation detail
 * PATCH  /poe/quotations/:id                   — update quotation
 * POST   /poe/quotations/:id/send               — send to supplier
 * POST   /poe/quotations/:id/responses          — add response (supplier)
 * PATCH  /poe/quotation-responses/:respId       — update response
 * POST   /poe/quotation-responses/:respId/select — architect chooses response
 *
 * POST   /poe/analyze                           — analyze project and generate opportunities
 * GET    /poe/matrix/:projectId                 — opportunity matrix for project
 * GET    /poe/analytics                         — analytics for tenant
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  poeOpportunitiesTable,
  poeRecommendationsTable,
  poeQuotationRequestsTable,
  poeQuotationResponsesTable,
  insertPoeOpportunitySchema,
  insertPoeRecommendationSchema,
  insertPoeQuotationRequestSchema,
  insertPoeQuotationResponseSchema,
} from "@workspace/db";

const router: IRouter = Router();

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json(data);
}
function err(res: Response, message: string, status = 400) {
  return res.status(status).json({ error: message });
}
function getTenantId(req: Request): string | null {
  return (req as unknown as Record<string, unknown>).tenantId as string ?? null;
}

// ─── Opportunities ────────────────────────────────────────────────────────────

router.get("/poe/opportunities", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const { projectId, status, type } = req.query;

    const conditions = [
      eq(poeOpportunitiesTable.tenantId, tenantId),
      eq(poeOpportunitiesTable.dismissed, false),
    ];
    if (projectId) conditions.push(eq(poeOpportunitiesTable.projectId, String(projectId)));
    if (status)    conditions.push(eq(poeOpportunitiesTable.status, String(status)));
    if (type)      conditions.push(eq(poeOpportunitiesTable.type, String(type)));

    const opportunities = await db.select().from(poeOpportunitiesTable)
      .where(and(...conditions))
      .orderBy(desc(poeOpportunitiesTable.priority), desc(poeOpportunitiesTable.createdAt))
      .limit(100);
    return ok(res, opportunities);
  } catch (e) {
    req.log?.error(e, "poe opportunities list error");
    return err(res, "Erro ao listar oportunidades", 500);
  }
});

router.post("/poe/opportunities", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const parsed = insertPoeOpportunitySchema.safeParse({ ...req.body, tenantId });
    if (!parsed.success) return err(res, parsed.error.message);
    const [opp] = await db.insert(poeOpportunitiesTable).values(parsed.data).returning();
    return ok(res, opp, 201);
  } catch (e) {
    req.log?.error(e, "poe opportunity create error");
    return err(res, "Erro ao criar oportunidade", 500);
  }
});

router.get("/poe/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const [opp] = await db.select().from(poeOpportunitiesTable).where(eq(poeOpportunitiesTable.id, req.params.id));
    if (!opp) return err(res, "Oportunidade não encontrada", 404);
    return ok(res, opp);
  } catch (e) {
    req.log?.error(e, "poe opportunity get error");
    return err(res, "Erro ao buscar oportunidade", 500);
  }
});

router.patch("/poe/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const parsed = insertPoeOpportunitySchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db.update(poeOpportunitiesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(poeOpportunitiesTable.id, req.params.id))
      .returning();
    if (!updated) return err(res, "Oportunidade não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe opportunity update error");
    return err(res, "Erro ao atualizar oportunidade", 500);
  }
});

router.delete("/poe/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const [del] = await db.delete(poeOpportunitiesTable).where(eq(poeOpportunitiesTable.id, req.params.id)).returning({ id: poeOpportunitiesTable.id });
    if (!del) return err(res, "Oportunidade não encontrada", 404);
    return ok(res, { deleted: true });
  } catch (e) {
    req.log?.error(e, "poe opportunity delete error");
    return err(res, "Erro ao deletar oportunidade", 500);
  }
});

router.post("/poe/opportunities/:id/dismiss", async (req: Request, res: Response) => {
  try {
    const [updated] = await db.update(poeOpportunitiesTable)
      .set({ dismissed: true, status: "dismissed", updatedAt: new Date() })
      .where(eq(poeOpportunitiesTable.id, req.params.id))
      .returning();
    if (!updated) return err(res, "Oportunidade não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe dismiss error");
    return err(res, "Erro ao dispensar oportunidade", 500);
  }
});

// ─── Recommendations ──────────────────────────────────────────────────────────

router.get("/poe/opportunities/:id/recommendations", async (req: Request, res: Response) => {
  try {
    const recs = await db.select().from(poeRecommendationsTable)
      .where(and(eq(poeRecommendationsTable.opportunityId, req.params.id), eq(poeRecommendationsTable.dismissed, false)))
      .orderBy(poeRecommendationsTable.rank);
    return ok(res, recs);
  } catch (e) {
    req.log?.error(e, "poe recommendations list error");
    return err(res, "Erro ao listar recomendações", 500);
  }
});

router.post("/poe/opportunities/:id/recommendations", async (req: Request, res: Response) => {
  try {
    const parsed = insertPoeRecommendationSchema.safeParse({ ...req.body, opportunityId: req.params.id });
    if (!parsed.success) return err(res, parsed.error.message);
    const [rec] = await db.insert(poeRecommendationsTable).values(parsed.data).returning();
    return ok(res, rec, 201);
  } catch (e) {
    req.log?.error(e, "poe recommendation create error");
    return err(res, "Erro ao criar recomendação", 500);
  }
});

router.patch("/poe/recommendations/:recId", async (req: Request, res: Response) => {
  try {
    const parsed = insertPoeRecommendationSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db.update(poeRecommendationsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(poeRecommendationsTable.id, req.params.recId))
      .returning();
    if (!updated) return err(res, "Recomendação não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe recommendation update error");
    return err(res, "Erro ao atualizar recomendação", 500);
  }
});

router.post("/poe/recommendations/:recId/select", async (req: Request, res: Response) => {
  try {
    const [rec] = await db.select({ opportunityId: poeRecommendationsTable.opportunityId })
      .from(poeRecommendationsTable).where(eq(poeRecommendationsTable.id, req.params.recId));
    if (!rec) return err(res, "Recomendação não encontrada", 404);

    // Deselect siblings first
    await db.update(poeRecommendationsTable)
      .set({ selected: false })
      .where(eq(poeRecommendationsTable.opportunityId, rec.opportunityId));

    const [updated] = await db.update(poeRecommendationsTable)
      .set({ selected: true, updatedAt: new Date() })
      .where(eq(poeRecommendationsTable.id, req.params.recId))
      .returning();

    // Update opportunity status to "quoted"
    await db.update(poeOpportunitiesTable)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(poeOpportunitiesTable.id, rec.opportunityId));

    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe recommendation select error");
    return err(res, "Erro ao selecionar recomendação", 500);
  }
});

// ─── Quotations ───────────────────────────────────────────────────────────────

router.get("/poe/quotations", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const { projectId, status } = req.query;
    const conditions = [eq(poeQuotationRequestsTable.tenantId, tenantId)];
    if (projectId) conditions.push(eq(poeQuotationRequestsTable.projectId, String(projectId)));
    if (status)    conditions.push(eq(poeQuotationRequestsTable.status, String(status)));
    const quotations = await db.select().from(poeQuotationRequestsTable)
      .where(and(...conditions))
      .orderBy(desc(poeQuotationRequestsTable.createdAt));
    return ok(res, quotations);
  } catch (e) {
    req.log?.error(e, "poe quotations list error");
    return err(res, "Erro ao listar cotações", 500);
  }
});

router.post("/poe/quotations", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const parsed = insertPoeQuotationRequestSchema.safeParse({ ...req.body, tenantId });
    if (!parsed.success) return err(res, parsed.error.message);
    const [quot] = await db.insert(poeQuotationRequestsTable).values(parsed.data).returning();
    return ok(res, quot, 201);
  } catch (e) {
    req.log?.error(e, "poe quotation create error");
    return err(res, "Erro ao criar cotação", 500);
  }
});

router.get("/poe/quotations/:id", async (req: Request, res: Response) => {
  try {
    const [quot] = await db.select().from(poeQuotationRequestsTable).where(eq(poeQuotationRequestsTable.id, req.params.id));
    if (!quot) return err(res, "Cotação não encontrada", 404);
    const responses = await db.select().from(poeQuotationResponsesTable).where(eq(poeQuotationResponsesTable.requestId, req.params.id));
    return ok(res, { ...quot, responses });
  } catch (e) {
    req.log?.error(e, "poe quotation get error");
    return err(res, "Erro ao buscar cotação", 500);
  }
});

router.patch("/poe/quotations/:id", async (req: Request, res: Response) => {
  try {
    const parsed = insertPoeQuotationRequestSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db.update(poeQuotationRequestsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(poeQuotationRequestsTable.id, req.params.id))
      .returning();
    if (!updated) return err(res, "Cotação não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe quotation update error");
    return err(res, "Erro ao atualizar cotação", 500);
  }
});

router.post("/poe/quotations/:id/send", async (req: Request, res: Response) => {
  try {
    const [updated] = await db.update(poeQuotationRequestsTable)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(poeQuotationRequestsTable.id, req.params.id))
      .returning();
    if (!updated) return err(res, "Cotação não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe quotation send error");
    return err(res, "Erro ao enviar cotação", 500);
  }
});

router.post("/poe/quotations/:id/responses", async (req: Request, res: Response) => {
  try {
    const parsed = insertPoeQuotationResponseSchema.safeParse({ ...req.body, requestId: req.params.id });
    if (!parsed.success) return err(res, parsed.error.message);
    const [resp] = await db.insert(poeQuotationResponsesTable).values(parsed.data).returning();
    // Update request status to "received"
    await db.update(poeQuotationRequestsTable)
      .set({ status: "received", updatedAt: new Date() })
      .where(eq(poeQuotationRequestsTable.id, req.params.id));
    return ok(res, resp, 201);
  } catch (e) {
    req.log?.error(e, "poe quotation response create error");
    return err(res, "Erro ao registrar resposta", 500);
  }
});

router.patch("/poe/quotation-responses/:respId", async (req: Request, res: Response) => {
  try {
    const parsed = insertPoeQuotationResponseSchema.partial().safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.message);
    const [updated] = await db.update(poeQuotationResponsesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(poeQuotationResponsesTable.id, req.params.respId))
      .returning();
    if (!updated) return err(res, "Resposta não encontrada", 404);
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe quotation response update error");
    return err(res, "Erro ao atualizar resposta", 500);
  }
});

router.post("/poe/quotation-responses/:respId/select", async (req: Request, res: Response) => {
  try {
    const [resp] = await db.select({ requestId: poeQuotationResponsesTable.requestId })
      .from(poeQuotationResponsesTable).where(eq(poeQuotationResponsesTable.id, req.params.respId));
    if (!resp) return err(res, "Resposta não encontrada", 404);
    // Deselect siblings
    await db.update(poeQuotationResponsesTable)
      .set({ selected: false })
      .where(eq(poeQuotationResponsesTable.requestId, resp.requestId));
    const [updated] = await db.update(poeQuotationResponsesTable)
      .set({ selected: true, updatedAt: new Date() })
      .where(eq(poeQuotationResponsesTable.id, req.params.respId))
      .returning();
    // Close quotation request
    await db.update(poeQuotationRequestsTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(poeQuotationRequestsTable.id, resp.requestId));
    return ok(res, updated);
  } catch (e) {
    req.log?.error(e, "poe quotation response select error");
    return err(res, "Erro ao selecionar resposta", 500);
  }
});

// ─── Analysis Engine (stub — will be backed by AI in next iteration) ──────────

router.post("/poe/analyze", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const { projectId, projectName, environments, materials, components } = req.body;

    // Generate opportunity stubs from the project inputs
    const opportunities: Array<{
      tenantId: string;
      projectId?: string;
      projectName?: string;
      type: string;
      title: string;
      description: string;
      environment?: string;
      category?: string;
      justification: string;
      technicalBasis: string[];
      priority: number;
      aiGenerated: boolean;
    }> = [];

    const envList: string[] = environments ?? ["Geral"];
    for (const env of envList) {
      if (!(components as string[] ?? []).some((c: string) => c.toLowerCase().includes("iluminação"))) {
        opportunities.push({
          tenantId,
          projectId,
          projectName,
          type:         "missing_category",
          title:        `Iluminação não especificada — ${env}`,
          description:  `O ambiente ${env} não possui especificação de iluminação.`,
          environment:  env,
          category:     "Iluminação",
          justification:"Todo ambiente habitável deve ter projeto luminotécnico. A norma NBR 5413 define os níveis mínimos de iluminância por tipo de uso.",
          technicalBasis: ["NBR 5413", "NBR ISO/CIE 8995-1"],
          priority:     7,
          aiGenerated:  true,
        });
      }
    }

    if (opportunities.length > 0) {
      await db.insert(poeOpportunitiesTable).values(opportunities);
    }

    return ok(res, {
      analyzed: true,
      opportunitiesGenerated: opportunities.length,
      projectId,
    });
  } catch (e) {
    req.log?.error(e, "poe analyze error");
    return err(res, "Erro na análise do projeto", 500);
  }
});

// ─── Opportunity Matrix ───────────────────────────────────────────────────────

router.get("/poe/matrix/:projectId", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const opportunities = await db.select().from(poeOpportunitiesTable)
      .where(and(
        eq(poeOpportunitiesTable.tenantId, tenantId),
        eq(poeOpportunitiesTable.projectId, req.params.projectId),
        eq(poeOpportunitiesTable.dismissed, false),
      ));
    // Group by environment + category
    const matrix: Record<string, Record<string, typeof opportunities>> = {};
    for (const opp of opportunities) {
      const env = opp.environment ?? "Geral";
      const cat = opp.category    ?? "Outros";
      if (!matrix[env]) matrix[env] = {};
      if (!matrix[env][cat]) matrix[env][cat] = [];
      matrix[env][cat].push(opp);
    }
    return ok(res, { matrix, total: opportunities.length });
  } catch (e) {
    req.log?.error(e, "poe matrix error");
    return err(res, "Erro ao gerar matriz", 500);
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get("/poe/analytics", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return err(res, "Tenant obrigatório", 401);
    const [opps, quots] = await Promise.all([
      db.select().from(poeOpportunitiesTable).where(eq(poeOpportunitiesTable.tenantId, tenantId)),
      db.select().from(poeQuotationRequestsTable).where(eq(poeQuotationRequestsTable.tenantId, tenantId)),
    ]);
    return ok(res, {
      opportunities: {
        total:     opps.length,
        detected:  opps.filter(o => o.status === "detected").length,
        ready:     opps.filter(o => o.status === "ready").length,
        quoted:    opps.filter(o => o.status === "quoted").length,
        dismissed: opps.filter(o => o.dismissed).length,
      },
      quotations: {
        total:    quots.length,
        draft:    quots.filter(q => q.status === "draft").length,
        sent:     quots.filter(q => q.status === "sent").length,
        received: quots.filter(q => q.status === "received").length,
        approved: quots.filter(q => q.status === "approved").length,
      },
    });
  } catch (e) {
    req.log?.error(e, "poe analytics error");
    return err(res, "Erro ao buscar analytics", 500);
  }
});

export default router;
