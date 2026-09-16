import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, archAiRendersTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { reviewArqdorFidelity } from "../services/arqdor-fidelity-review.js";
import { archAiRenderRouter as legacyArchAiRenderRouter } from "./arch_ai_render_legacy.js";

export const archAiRenderRouter = Router();

function tenantId(req: Request): string | null {
  return (req as any).user?.tenantId ?? null;
}

async function findRootBaseImage(render: typeof archAiRendersTable.$inferSelect, tid: string): Promise<string | null> {
  let current = render;
  const visited = new Set<string>();

  for (let depth = 0; depth < 20; depth += 1) {
    if (visited.has(current.id)) break;
    visited.add(current.id);

    if (!current.parentRenderId) return current.originalImageUrl ?? null;

    const [parent] = await db
      .select()
      .from(archAiRendersTable)
      .where(and(
        eq(archAiRendersTable.id, current.parentRenderId),
        eq(archAiRendersTable.tenantId, tid),
      ))
      .limit(1);

    if (!parent) return current.originalImageUrl ?? null;
    current = parent;
  }

  return current.originalImageUrl ?? null;
}

archAiRenderRouter.post("/arch/ai-render/:id/review", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [render] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, req.params["id"] as string),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);

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

    return res.json({
      success: true,
      render_id: render.id,
      project_id: render.projectId,
      base_image_url: baseImageUrl,
      render_image_url: render.resultImageUrl,
      review: result.review,
      usage: {
        cost_usd: result.costUsd,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      },
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
