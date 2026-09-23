import { Router, type NextFunction, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, archAiRendersTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { inferOperationType, renderOperationTypeSchema } from "../lib/arqdor-render-version-metadata.js";
import { syncApprovedRenderSpecifications } from "../lib/arqdor-approved-render-spec.js";
import { archAiRenderRouter as legacyArchAiRenderRouter } from "./arch_ai_render_legacy.js";

export const archAiRenderRouter = Router();

function tenantId(req: Request): string | null {
  return (req as any).user?.tenantId ?? null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function materialNameFromPrompt(prompt: string): string | null {
  const match = prompt.match(/Material selecionado:\s*([^\n(]+?)(?:\s*\(|\.|$)/i);
  return match?.[1]?.trim() || null;
}

function captureJson(
  req: Request,
  res: Response,
  onSuccess: (body: any) => Promise<void>,
  next: NextFunction,
) {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (res.statusCode < 400) {
      void onSuccess(body).catch((err) => {
        req.log?.error?.({ err }, "arch/ai-render metadata wrapper: persistência pós-resposta falhou");
      });
    }
    return originalJson(body);
  }) as Response["json"];
  next();
}

function normalizeSelectionMetadata(body: any) {
  const coordinates = Array.isArray(body?.mask_coordinates) ? body.mask_coordinates : [];
  const labels = Array.isArray(body?.mask_zones) ? body.mask_zones : [];
  return coordinates
    .filter((item: any) => item && [item.x, item.y, item.w, item.h].every((value) => typeof value === "number" && Number.isFinite(value)))
    .map((item: any, index: number) => ({
      label: typeof labels[index] === "string" ? labels[index] : `Região ${index + 1}`,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
}

// O pipeline legado continua responsável por gerar/processar a imagem.
// Estes interceptadores persistem metadados sem duplicar o pipeline.
archAiRenderRouter.post("/arch/ai-render", authenticate, (req, res, next) => {
  const tid = tenantId(req);
  captureJson(req, res, async (body) => {
    const renderId = asOptionalString(body?.render_id);
    if (!tid || !renderId) return;
    await db.update(archAiRendersTable)
      .set({ operationType: "initial" })
      .where(and(eq(archAiRendersTable.id, renderId), eq(archAiRendersTable.tenantId, tid)));
  }, next);
});

archAiRenderRouter.post("/arch/ai-render/:id/adjust", authenticate, (req, res, next) => {
  const tid = tenantId(req);
  const adjustmentPrompt = asOptionalString(req.body?.ajuste_prompt) ?? "";
  const materialId = asOptionalString(req.body?.material_id);
  const materialName = asOptionalString(req.body?.material_name) ?? materialNameFromPrompt(adjustmentPrompt);
  const explicitOperation = renderOperationTypeSchema.safeParse(req.body?.operation_type);
  const operationType = inferOperationType({
    explicit: explicitOperation.success ? explicitOperation.data : undefined,
    materialId,
    materialName,
    lightingChanged: /ajuste de ilumina[cç][aã]o/i.test(adjustmentPrompt),
  });
  const selectionMetadata = normalizeSelectionMetadata(req.body);

  captureJson(req, res, async (body) => {
    const renderId = asOptionalString(body?.render_id);
    if (!tid || !renderId) return;
    await db.update(archAiRendersTable)
      .set({
        operationType,
        materialId,
        materialName,
        selectionMetadata: selectionMetadata.length > 0 ? selectionMetadata : null,
      })
      .where(and(eq(archAiRendersTable.id, renderId), eq(archAiRendersTable.tenantId, tid)));
  }, next);
});

archAiRenderRouter.post("/arch/ai-render/:id/approve", authenticate, (req, res, next) => {
  const tid = tenantId(req);
  const approvalNote = asOptionalString(req.body?.notes ?? req.body?.approval_note);
  captureJson(req, res, async (body) => {
    const renderId = asOptionalString(body?.render_id) ?? asOptionalString(req.params["id"]);
    if (!tid || !renderId) return;
    await db.update(archAiRendersTable)
      .set({ operationType: "approved", approvalNote })
      .where(and(eq(archAiRendersTable.id, renderId), eq(archAiRendersTable.tenantId, tid)));

    const specSync = await syncApprovedRenderSpecifications({ tenantId: tid, renderId });
    req.log?.info?.({ renderId, ...specSync }, "arch/ai-render approve: especificações sincronizadas");
  }, next);
});

// Fonte oficial do histórico persistente. Registrada antes do router legado para
// expor todos os metadados adicionados à tabela sem alterar o pipeline grande.
archAiRenderRouter.get("/arch/ai-renders", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const projectId = String(req.query["project_id"] ?? "").trim();
  const conceptProjectId = String(req.query["concept_project_id"] ?? "").trim();
  const ambiente = String(req.query["ambiente"] ?? "").trim();
  if (!projectId && !conceptProjectId) {
    return res.status(400).json({ success: false, error: "project_id ou concept_project_id obrigatório" });
  }

  const conditions = [
    eq(archAiRendersTable.tenantId, tid),
    conceptProjectId
      ? eq(archAiRendersTable.conceptProjectId, conceptProjectId)
      : eq(archAiRendersTable.projectId, projectId),
  ];
  if (ambiente) conditions.push(eq(archAiRendersTable.ambiente, ambiente));

  const renders = await db.select().from(archAiRendersTable)
    .where(and(...conditions))
    .orderBy(asc(archAiRendersTable.createdAt));

  return res.json({
    success: true,
    project_id: projectId || null,
    concept_project_id: conceptProjectId || null,
    versions: renders.map((render, index) => ({
      id: render.id,
      project_id: render.projectId,
      concept_project_id: render.conceptProjectId,
      parent_render_id: render.parentRenderId,
      ambiente: render.ambiente,
      mode: render.mode,
      status: render.status,
      erro_msg: render.erroMsg,
      iluminacao: render.iluminacao,
      version_tag: render.versionTag,
      operation_type: render.operationType,
      material_id: render.materialId,
      material_name: render.materialName,
      selection_metadata: render.selectionMetadata,
      cost_estimate_usd: render.costEstimateUsd,
      approval_note: render.approvalNote,
      prompt: render.prompt,
      motor: render.motor,
      original_image_url: render.originalImageUrl,
      result_image_url: render.resultImageUrl,
      mask_zones: render.maskZones,
      mask_file_url: render.maskFileUrl,
      composited: render.composited,
      segmentation_confidence: render.segmentationConfidence,
      approved_by: render.approvedBy,
      approved_at: render.approvedAt,
      created_at: render.createdAt,
      concluido_em: render.concluidoEm,
      version_number: index + 1,
    })),
  });
});

archAiRenderRouter.get("/arch/ai-render/:id", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [render] = await db.select().from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, req.params["id"] as string),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);

  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });

  return res.json({
    success: render.status === "concluido",
    render_id: render.id,
    project_id: render.projectId,
    concept_project_id: render.conceptProjectId,
    parent_render_id: render.parentRenderId,
    status: render.status,
    result_image_url: render.resultImageUrl,
    original_image_url: render.originalImageUrl,
    mode: render.mode,
    ambiente: render.ambiente,
    version_tag: render.versionTag,
    operation_type: render.operationType,
    material_id: render.materialId,
    material_name: render.materialName,
    selection_metadata: render.selectionMetadata,
    cost_estimate_usd: render.costEstimateUsd,
    approval_note: render.approvalNote,
    mask_zones: render.maskZones,
    mask_file_url: render.maskFileUrl,
    composited: render.composited,
    segmentation_confidence: render.segmentationConfidence,
    erro_msg: render.erroMsg,
    prompt: render.prompt,
    motor: render.motor,
    approved_by: render.approvedBy,
    approved_at: render.approvedAt,
    created_at: render.createdAt,
    concluido_em: render.concluidoEm,
  });
});

archAiRenderRouter.use(legacyArchAiRenderRouter);

