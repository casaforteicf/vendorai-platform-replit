import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, archAiRendersTable, archRenderFidelityReviewsTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { reviewArqdorFidelity } from "../services/arqdor-fidelity-review.js";
import { archAiRenderRouter as legacyArchAiRenderRouter } from "./arch_ai_render_legacy.js";

export const archAiRenderRouter = Router();

function tenantId(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

async function findTenantRender(renderId: string, tid: string) {
  const [render] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, renderId),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);
  return render ?? null;
}

async function findRootBaseImage(render: typeof archAiRendersTable.$inferSelect, tid: string): Promise<string | null> {
  let current = render;
  const visited = new Set<string>();

  for (let depth = 0; depth < 20; depth += 1) {
    if (visited.has(current.id)) break;
    visited.add(current.id);

    if (!current.parentRenderId) return current.originalImageUrl ?? null;

    const parent = await findTenantRender(current.parentRenderId, tid);
    if (!parent) return current.originalImageUrl ?? null;
    current = parent;
  }

  return current.originalImageUrl ?? null;
}

archAiRenderRouter.get("/arch/ai-render/:id/reviews", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const renderId = req.params["id"] as string;
  const render = await findTenantRender(renderId, tid);
  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });

  const reviews = await db
    .select()
    .from(archRenderFidelityReviewsTable)
    .where(and(
      eq(archRenderFidelityReviewsTable.tenantId, tid),
      eq(archRenderFidelityReviewsTable.renderId, renderId),
    ))
    .orderBy(desc(archRenderFidelityReviewsTable.createdAt));

  return res.json({
    success: true,
    render_id: renderId,
    project_id: render.projectId,
    reviews: reviews.map((row) => ({
      id: row.id,
      render_id: row.renderId,
      project_id: row.projectId,
      base_image_url: row.baseImageUrl,
      render_image_url: row.renderImageUrl,
      requested_change: row.requestedChange,
      overall_score: row.overallScore,
      requires_human_review: row.requiresHumanReview,
      review: row.review,
      model: row.model,
      usage: {
        cost_usd: row.costUsd,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
      },
      reviewed_by: row.reviewedBy,
      created_at: row.createdAt,
    })),
  });
});

archAiRenderRouter.post("/arch/ai-render/:id/review", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const render = await findTenantRender(req.params["id"] as string, tid);
  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });
  if (render.status !== "concluido" || !render.resultImageUrl) {
    return res.status(400).json({ success: false, error: "O render precisa estar concluído antes do AI Review" });
  }

  const baseImageUrl = await findRootBaseImage(render, tid);
  if (!baseImageUrl) {
    return res.status(400).json({ success: false, error: "Imagem base do projeto não encontrada" });
  }

  try {
    const result = await reviewArqdorFidelity({
      tenantId: tid,
      baseImageUrl,
      renderImageUrl: render.resultImageUrl,
      requestedChange: render.prompt,
      log: req.log,
    });

    const [savedReview] = await db
      .insert(archRenderFidelityReviewsTable)
      .values({
        tenantId: tid,
        renderId: render.id,
        projectId: render.projectId,
        baseImageUrl,
        renderImageUrl: render.resultImageUrl,
        requestedChange: render.prompt,
        overallScore: Math.round(result.review.overallScore),
        requiresHumanReview: result.review.requiresHumanReview,
        review: result.review,
        model: result.model,
        costUsd: Number.isFinite(result.costUsd) ? String(result.costUsd) : null,
        inputTokens: Number.isFinite(result.inputTokens) ? result.inputTokens : null,
        outputTokens: Number.isFinite(result.outputTokens) ? result.outputTokens : null,
        reviewedBy: req.user?.sub ?? null,
      })
      .returning();

    return res.json({
      success: true,
      review_id: savedReview?.id,
      render_id: render.id,
      project_id: render.projectId,
      base_image_url: baseImageUrl,
      render_image_url: render.resultImageUrl,
      review: result.review,
      usage: {
        model: result.model,
        cost_usd: result.costUsd,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      },
      persisted: true,
      created_at: savedReview?.createdAt,
    });
  } catch (err: any) {
    req.log?.error?.({ err, renderId: render.id }, "arch fidelity review failed");
    return res.status(502).json({
      success: false,
      error: err?.message ?? "Falha ao executar AI Review",
    });
  }
});

archAiRenderRouter.use(legacyArchAiRenderRouter);
