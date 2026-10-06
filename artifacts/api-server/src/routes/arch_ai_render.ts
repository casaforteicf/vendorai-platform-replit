import { Router, type NextFunction, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { db, pool, archAiRendersTable, archRenderFidelityReviewsTable, aiUsageLogsTable, tenantsTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { inferOperationType, renderOperationTypeSchema } from "../lib/arqdor-render-version-metadata.js";
import { syncApprovedRenderSpecifications } from "../lib/arqdor-approved-render-spec.js";
import { archAiRenderRouter as legacyArchAiRenderRouter } from "./arch_ai_render_legacy.js";

import { RenderGalleryError, updateConceptRenderGallery } from "../services/arch-concept-render-gallery.js";
import { getArqdorRenderVideo, startArqdorRenderVideo } from "../services/arqdor-render-video.js";
import type { ArqdorVideoMovement } from "../lib/arqdor-render-prompts.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { reviewArqdorFidelity } from "../services/arqdor-fidelity-review.js";

export const archAiRenderRouter = Router();
const renderStorage = new ObjectStorageService();

function renderObjectPath(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return raw;
  if (raw.startsWith("/api/storage/objects/")) {
    return `/objects/${raw.slice("/api/storage/objects/".length)}`;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/api/storage/objects/")) {
      return `/objects/${parsed.pathname.slice("/api/storage/objects/".length)}`;
    }
    if (parsed.pathname.startsWith("/objects/")) return parsed.pathname;
  } catch {
    // relative/legacy value
  }
  return null;
}

async function renderAccessUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const objectPath = renderObjectPath(raw);
  if (!objectPath) return raw;
  try {
    return await renderStorage.getObjectEntitySignedUrl(objectPath, 900);
  } catch {
    return null;
  }
}

async function renderFileAvailable(value: string | null | undefined): Promise<boolean> {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (raw.startsWith("data:")) return true;
  const objectPath = renderObjectPath(raw);
  if (!objectPath) return /^https?:\/\//i.test(raw);
  try {
    await renderStorage.getObjectEntityFile(objectPath);
    return true;
  } catch {
    return false;
  }
}

function tenantId(req: Request): string | null {
  return (req as any).user?.tenantId ?? null;
}

async function findTenantRender(renderId: string, tid: string) {
  const [render] = await db.select().from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, renderId), eq(archAiRendersTable.tenantId, tid)))
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
  const surfaceKey = asOptionalString(body?.surface_key);
  return coordinates
    .filter((item: any) => item && [item.x, item.y, item.w, item.h].every((value) => typeof value === "number" && Number.isFinite(value)))
    .map((item: any, index: number) => ({
      label: typeof labels[index] === "string" ? labels[index] : `Região ${index + 1}`,
      surfaceKey: asOptionalString(item?.surfaceKey) ?? surfaceKey ?? undefined,
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

archAiRenderRouter.post("/arch/ai-render/:id/approve", authenticate, async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [candidate] = await db.select().from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, req.params["id"] as string),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);

  if (!candidate) return res.status(404).json({ success: false, error: "Render não encontrado" });
  if (candidate.status !== "concluido" || !candidate.resultImageUrl) {
    return res.status(409).json({ success: false, error: "Finalize o render antes de aprovar" });
  }
  if (!(await renderFileAvailable(candidate.resultImageUrl))) {
    return res.status(409).json({
      success: false,
      error: "O arquivo desta versão não está disponível no Storage. Gere ou recupere uma nova versão antes de aprovar.",
      code: "RENDER_FILE_MISSING",
    });
  }

  const renderId = String(req.params["id"]);
  const approvalNote = asOptionalString(req.body?.notes ?? req.body?.approval_note);
  const authenticatedUser = (req as any).user ?? {};
  const approvedBy = String(authenticatedUser.id ?? authenticatedUser.email ?? authenticatedUser.name ?? "authenticated-user");
  const approvedAt = new Date();

  try {
    const scope = candidate.projectId
      ? and(
          eq(archAiRendersTable.tenantId, tid),
          eq(archAiRendersTable.projectId, candidate.projectId),
          eq(archAiRendersTable.ambiente, candidate.ambiente),
          ne(archAiRendersTable.id, renderId),
        )
      : candidate.conceptProjectId
        ? and(
            eq(archAiRendersTable.tenantId, tid),
            eq(archAiRendersTable.conceptProjectId, candidate.conceptProjectId),
            eq(archAiRendersTable.ambiente, candidate.ambiente),
            ne(archAiRendersTable.id, renderId),
          )
        : null;

    if (scope) {
      await db.update(archAiRendersTable)
        .set({ approvedBy: null, approvedAt: null, approvalNote: null })
        .where(scope);
    }

    const [updated] = await db.update(archAiRendersTable)
      .set({
        approvedBy,
        approvedAt,
        approvalNote,
        versionTag: "aprovado",
      })
      .where(and(eq(archAiRendersTable.id, renderId), eq(archAiRendersTable.tenantId, tid)))
      .returning();

    const specSync = await syncApprovedRenderSpecifications({ tenantId: tid, renderId });
    req.log?.info?.({ renderId, approvedBy, ...specSync }, "arch/ai-render approve: aprovação e especificações persistidas");

    return res.json({
      success: true,
      render_id: updated?.id ?? candidate.id,
      status: updated?.status ?? candidate.status,
      result_image_url: updated?.resultImageUrl ?? candidate.resultImageUrl,
      version_tag: updated?.versionTag ?? "aprovado",
      approved_by: updated?.approvedBy ?? approvedBy,
      approved_at: updated?.approvedAt ?? approvedAt,
      approval_note: updated?.approvalNote ?? approvalNote,
      specification_sync: specSync,
    });
  } catch (error) {
    req.log?.error?.({ err: error, renderId }, "arch/ai-render approve: falha ao persistir aprovação");
    return res.status(500).json({
      success: false,
      error: "Não foi possível concluir a aprovação desta versão. Nenhuma confirmação foi enviada ao Studio.",
    });
  }
});

// These actions operate only on tenant-owned concept renders.
for (const action of ["primary", "regenerate"] as const) {
  archAiRenderRouter.post(`/arch/ai-render/:id/${action}`, authenticate, async (req, res) => {
    const tid = tenantId(req);
    if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });
    try {
      const result = await updateConceptRenderGallery(pool, {
        tenantId: tid,
        renderId: req.params["id"] as string,
        action,
        lighting: req.body?.lighting,
        requestId: typeof req.body?.request_id === "string" ? req.body.request_id : undefined,
      });
      return res.status(action === "regenerate" ? 202 : 200).json({
        success: true, render_id: result.id, status: result.status,
      });
    } catch (error) {
      if (error instanceof RenderGalleryError) return res.status(error.status).json({ success: false, error: error.message });
      req.log?.error?.({ err: error, action }, "arch/concept-render: falha na ação da galeria");
      return res.status(500).json({ success: false, error: "Não foi possível salvar esta ação. Tente novamente." });
    }
  });
}


const ARQDOR_VIDEO_MOVEMENTS = new Set<ArqdorVideoMovement>([
  "zoom_in_soft", "zoom_out_soft", "pan_left_soft", "pan_right_soft",
  "tilt_up_soft", "tilt_down_soft", "orbit_left_soft", "orbit_right_soft",
  "parallax_soft", "cinematic_micro_movement",
]);

archAiRenderRouter.post("/arch/ai-render/:id/video-5s", authenticate, async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });
  const movement = String(req.body?.movement ?? "cinematic_micro_movement") as ArqdorVideoMovement;
  if (!ARQDOR_VIDEO_MOVEMENTS.has(movement)) {
    return res.status(400).json({ success: false, error: "Movimento de câmera inválido" });
  }
  const aspectRatio = req.body?.aspect_ratio === "9:16" ? "9:16" : "16:9";
  try {
    const result = await startArqdorRenderVideo({
      tenantId: tid,
      renderId: String(req.params["id"]),
      movement,
      aspectRatio,
      logger: req.log,
    });
    return res.status(202).json({
      success: true,
      video_job_id: result.jobId,
      status: result.status,
      duration_seconds: 5,
      movement,
      aspect_ratio: aspectRatio,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "RENDER_NOT_FOUND") return res.status(404).json({ success: false, error: "Render não encontrado" });
    if (message === "RENDER_NOT_READY") return res.status(409).json({ success: false, error: "Finalize o render antes de gerar o vídeo" });
    req.log?.error?.({ error }, "arch/render-video: falha ao criar job");
    return res.status(500).json({ success: false, error: "Não foi possível iniciar o vídeo do render" });
  }
});

archAiRenderRouter.get("/arch/ai-render-video/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });
  const job = await getArqdorRenderVideo(tid, String(req.params["id"]));
  if (!job) return res.status(404).json({ success: false, error: "Vídeo não encontrado" });
  return res.json({
    success: job.status === "done",
    video_job_id: job.id,
    render_id: job.render_id,
    movement: job.movement,
    aspect_ratio: job.aspect_ratio,
    status: job.status,
    video_url: await renderAccessUrl(job.video_url),
    error: job.error_message,
    created_at: job.created_at,
    completed_at: job.completed_at,
  });
});

archAiRenderRouter.get("/arch/ai-render/:id/reviews", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const renderId = String(req.params["id"]);
  const render = await findTenantRender(renderId, tid);
  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });

  const reviews = await db.select().from(archRenderFidelityReviewsTable)
    .where(and(
      eq(archRenderFidelityReviewsTable.tenantId, tid),
      eq(archRenderFidelityReviewsTable.renderId, renderId),
    ))
    .orderBy(desc(archRenderFidelityReviewsTable.createdAt));

  return res.json({
    success: true,
    render_id: renderId,
    reviews: reviews.map((row) => ({
      id: row.id,
      render_id: row.renderId,
      project_id: row.projectId,
      overall_score: row.overallScore,
      requires_human_review: row.requiresHumanReview,
      review: row.review,
      model: row.model,
      usage: {
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

  const render = await findTenantRender(String(req.params["id"]), tid);
  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });
  if (render.status !== "concluido" || !render.resultImageUrl) {
    return res.status(409).json({ success: false, error: "Finalize o render antes de executar o Fidelity Review" });
  }

  const baseImageUrl = await findRootBaseImage(render, tid);
  if (!baseImageUrl) {
    return res.status(409).json({ success: false, error: "Imagem base do projeto não encontrada para comparação" });
  }

  try {
    const result = await reviewArqdorFidelity({
      tenantId: tid,
      baseImageUrl,
      renderImageUrl: render.resultImageUrl,
      requestedChange: render.prompt,
      log: req.log,
    });

    const [saved] = await db.insert(archRenderFidelityReviewsTable).values({
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
      reviewedBy: String((req as any).user?.id ?? (req as any).user?.sub ?? "") || null,
    }).returning();

    return res.json({
      success: true,
      review_id: saved?.id,
      render_id: render.id,
      review: result.review,
      usage: {
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      },
      persisted: true,
      created_at: saved?.createdAt,
    });
  } catch (error) {
    req.log?.error?.({ err: error, renderId: render.id }, "arch/fidelity-review: falha");
    return res.status(500).json({
      success: false,
      error: "Não foi possível concluir o Fidelity Review desta versão.",
    });
  }
});

archAiRenderRouter.get("/arch/ai-health", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [tenant] = await db.select({
    openaiKeyStatus: tenantsTable.openaiKeyStatus,
    anthropicKeyStatus: tenantsTable.anthropicKeyStatus,
  }).from(tenantsTable).where(eq(tenantsTable.id, tid)).limit(1);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const logs = await db.select({
    provider: aiUsageLogsTable.provider,
    feature: aiUsageLogsTable.feature,
    model: aiUsageLogsTable.model,
    success: aiUsageLogsTable.success,
    errorMessage: aiUsageLogsTable.errorMessage,
    createdAt: aiUsageLogsTable.createdAt,
  }).from(aiUsageLogsTable)
    .where(and(
      eq(aiUsageLogsTable.tenantId, tid),
      gte(aiUsageLogsTable.createdAt, since),
    ))
    .orderBy(desc(aiUsageLogsTable.createdAt))
    .limit(200);

  function providerHealth(provider: "openai" | "anthropic", configured: boolean) {
    const providerLogs = logs.filter((row) => row.provider === provider);
    const lastSuccess = providerLogs.find((row) => row.success);
    const lastFailure = providerLogs.find((row) => !row.success);
    const latest = providerLogs[0];
    let state: "healthy" | "degraded" | "unverified" | "unavailable" = "unverified";
    if (!configured) state = "unavailable";
    else if (latest && !latest.success) state = "degraded";
    else if (lastSuccess) state = "healthy";
    return {
      state,
      configured,
      last_success_at: lastSuccess?.createdAt ?? null,
      last_failure_at: lastFailure?.createdAt ?? null,
      recent_requests: providerLogs.length,
      recent_failures: providerLogs.filter((row) => !row.success).length,
      last_model: latest?.model ?? null,
    };
  }

  const openaiConfigured = tenant?.openaiKeyStatus === "ativo" || Boolean(process.env["OPENAI_API_KEY"]);
  const anthropicConfigured = tenant?.anthropicKeyStatus === "ativo" || Boolean(process.env["ANTHROPIC_API_KEY"]);
  const fidelityLogs = logs.filter((row) => row.feature === "intelligence_analysis");
  const fidelityLatest = fidelityLogs[0] ?? null;

  return res.json({
    success: true,
    observed_window_hours: 24,
    providers: {
      openai: providerHealth("openai", openaiConfigured),
      anthropic: providerHealth("anthropic", anthropicConfigured),
    },
    features: {
      fidelity_review: {
        state: !openaiConfigured && !anthropicConfigured
          ? "unavailable"
          : fidelityLatest
            ? (fidelityLatest.success ? "healthy" : "degraded")
            : "unverified",
        last_success_at: fidelityLogs.find((row) => row.success)?.createdAt ?? null,
        last_failure_at: fidelityLogs.find((row) => !row.success)?.createdAt ?? null,
        recent_requests: fidelityLogs.length,
        recent_failures: fidelityLogs.filter((row) => !row.success).length,
      },
      project_memory: {
        state: "local",
      },
    },
  });
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

  const versions = await Promise.all(renders.map(async (render, index) => {
    const fileAvailable = await renderFileAvailable(render.resultImageUrl);
    return {
      id: render.id,
      project_id: render.projectId,
      concept_project_id: render.conceptProjectId,
      parent_render_id: render.parentRenderId,
      ambiente: render.ambiente,
      mode: render.mode,
      status: render.status,
      is_primary: render.isPrimary,
      can_regenerate: render.mode === "preservar" && Boolean(render.jobInput && render.originalImageUrl),
      source: render.source,
      render_view: render.renderView,
      project_revision: render.projectRevision,
      scene_id: render.sceneId,
      scene_name: render.sceneName,
      camera_snapshot: render.cameraSnapshot,
      source_model_version: render.sourceModelVersion,
      erro_msg: render.erroMsg,
      iluminacao: render.iluminacao,
      version_tag: render.versionTag,
      operation_type: render.operationType,
      material_id: render.materialId,
      material_name: render.materialName,
      selection_metadata: render.selectionMetadata,
      approval_note: render.approvalNote,
      prompt: render.prompt,
      motor: render.motor,
      original_image_url: render.originalImageUrl,
      result_image_url: render.resultImageUrl,
      display_url: await renderAccessUrl(render.resultImageUrl),
      file_available: fileAvailable,
      mask_zones: render.maskZones,
      mask_file_url: render.maskFileUrl,
      composited: render.composited,
      segmentation_confidence: render.segmentationConfidence,
      approved_by: render.approvedBy,
      approved_at: render.approvedAt,
      created_at: render.createdAt,
      concluido_em: render.concluidoEm,
      version_number: index + 1,
    };
  }));

  return res.json({
    success: true,
    project_id: projectId || null,
    concept_project_id: conceptProjectId || null,
    versions,
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

  const fileAvailable = await renderFileAvailable(render.resultImageUrl);

  return res.json({
    success: render.status === "concluido",
    render_id: render.id,
    project_id: render.projectId,
    concept_project_id: render.conceptProjectId,
    parent_render_id: render.parentRenderId,
    status: render.status,
    source: render.source,
    render_view: render.renderView,
    project_revision: render.projectRevision,
    scene_id: render.sceneId,
    scene_name: render.sceneName,
    camera_snapshot: render.cameraSnapshot,
    source_model_version: render.sourceModelVersion,
    result_image_url: render.resultImageUrl,
    display_url: await renderAccessUrl(render.resultImageUrl),
    file_available: fileAvailable,
    original_image_url: render.originalImageUrl,
    mode: render.mode,
    ambiente: render.ambiente,
    version_tag: render.versionTag,
    operation_type: render.operationType,
    material_id: render.materialId,
    material_name: render.materialName,
    selection_metadata: render.selectionMetadata,
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


