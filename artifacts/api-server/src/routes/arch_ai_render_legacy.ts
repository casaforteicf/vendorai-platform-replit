/**
 * Arch AI Render — pipeline async com roteamento por modo
 *
 * Modo Preservar → OpenAI GPT Image Premium (edição com imagem de referência)
 * Modo Criar     → OpenAI GPT Image Premium (geração livre)
 * Ajuste pontual → OpenAI GPT Image Premium com máscara
 *
 * POST /api/arch/ai-render               → 202, render_id
 * GET  /api/arch/ai-renders              → histórico persistente por projeto
 * GET  /api/arch/ai-render/:id           → status + resultado
 * POST /api/arch/ai-render/:id/adjust    → ajuste herdando mode do pai
 * POST /api/arch/project-config          → salvar configuração reutilizável
 * GET  /api/arch/project-config          → listar configs por lead_id
 */
import { Router, type Request, type Response } from "express";
import { eq, and, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  archAiRendersTable,
  archConceptProjectsTable,
  archProjetosTable,
  archProjectConfigsTable,
  automationLogsTable,
  archMaterialsTable,
  archMaterialImagesTable,
  archMaterialTenantAccessTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  createZoneMask,
  createRectMask,
  createMaterialSurfaceMask,
  compositeWithOriginal,
  validateEdgeIntegrity,
  validateArchitecturalStructure,
  validateColorStability,
  bufferToDataUrl,
} from "../lib/arch-render-pipeline.js";
import sharp from "sharp";
import { generateRenderCreateOpenAI, generateRenderPremiumOpenAI } from "../services/media-provider-execution.js";
import { captureGeneratedMedia } from "../services/media-library.js";
import {
  authorizeVendorCredits,
  debitVendorCredits,
  recordCommercialUsage,
} from "../services/commercial-usage.js";
import {
  buildArqdorFidelityBlock,
  inferArqdorRenderPresets,
  type ArqdorRenderPreset,
} from "../lib/arqdor-render-prompts.js";
import { interventionPromptContext, type RealEnvironmentAnalysis } from "../lib/arqdor-real-environment.js";

export const archAiRenderRouter = Router();

// ── Zonas que são mobiliário solto — nunca editáveis no modo Preservar ────────
const FURNITURE_ZONES = new Set([
  "sofa", "sofá", "mesa", "cadeira", "cadeiras", "cama", "poltrona",
  "luminaria", "luminária", "tapete", "planta", "plantas", "eletrodomestico",
  "eletrodoméstico", "decoracao", "decoração",
]);

function filterFurnitureZones(zones: string[]): string[] {
  return zones.filter(z => !FURNITURE_ZONES.has(z.toLowerCase().trim()));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tenantId(req: Request): string | null {
  return (req as any).user?.tenantId ?? null;
}

function sanitizeRenderErrorForUser(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const low = raw.toLowerCase();

  if (
    low.includes("http 402") ||
    low.includes("insufficient credit") ||
    low.includes("purchase credit") ||
    low.includes("replicate.com/account/billing") ||
    low.includes("billing hard limit") ||
    low.includes("insufficient_quota") ||
    low.includes("exceeded your current quota")
  ) {
    return "O render está temporariamente indisponível por limite do provedor. O administrador da plataforma já pode corrigir isso sem expor dados de cobrança ao tenant. Tente novamente em alguns minutos.";
  }
  if (low.includes("http 429") || low.includes("rate limit") || low.includes("too many requests")) {
    return "Há muitos renders sendo processados ao mesmo tempo. Aguarde cerca de um minuto e tente novamente.";
  }
  if (low.includes("http 401") || low.includes("http 403") || low.includes("authentication")) {
    return "O provedor de render recusou a autenticação da plataforma. Avise o administrador.";
  }
  if (
    low.includes("failed query") ||
    low.includes("value too long for type character varying") ||
    low.includes("database") ||
    low.includes("postgres")
  ) {
    return "O render foi processado, mas ocorreu uma falha interna ao finalizar e salvar a versão. Tente novamente; o erro técnico foi ocultado e registrado para correção.";
  }
  return raw
    .replace(/https?:\/\/replicate\.com\/\S+/gi, "")
    .replace(/replicate/gi, "provedor de render")
    .trim();
}

// ── Esquemas de validação ──────────────────────────────────────────────────────

const renderBodySchema = z.object({
  project_id:        z.string().optional(),
  concept_project_id: z.string().trim().min(1).optional(),
  source: z.enum(["facade", "model3d"]).optional(),
  render_view: z.enum(["exterior", "interior"]).optional(),
  render_profile: z.enum(["technical", "premium", "decorated"]).optional().default("premium"),
  project_revision: z.string().trim().min(1).optional(),
  scene_id: z.string().trim().min(1).optional(),
  scene_name: z.string().trim().min(1).optional(),
  camera_snapshot: z.object({
    floor: z.number().int().optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    target: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }).optional(),
  source_model_version: z.string().trim().min(1).optional(),
  lead_id:           z.string().optional(),
  original_image_url: z.string().min(10, "original_image_url obrigatório"),
  mode:              z.enum(["preservar", "criar"]),
  ambiente:          z.string().min(1),
  estilo:            z.string().optional(),
  iluminacao:        z.string().optional(),
  angulo:            z.string().optional(),
  mask_zones:        z.array(z.string()).optional().default([]),
  user_notes:        z.string().optional(),
  render_presets: z.array(z.enum([
    "facade_exterior_preserve",
    "interior_layout_preserve",
    "material_detail_enhancer",
    "distortion_correction",
    "camera_perspective_lock",
    "joinery_precision",
    "roof_openings_lock",
    "lighting_realism",
    "landscape_controlled",
    "pool_water_fidelity",
    "glass_mirror_fidelity",
    "outdoor_gourmet_preserve",
    "deck_pergola_preserve",
    "wall_gate_fidelity",
    "night_lighting_exterior",
    "guardrail_glass_precision",
    "ceiling_led_linear",
    "ambient_boost",
    "shadow_softening",
    "exposure_lift_controlled",
  ])).optional().default([]),
  // materiais para modo criar (compatibilidade com o fluxo existente)
  materials: z.array(z.object({
    zone: z.string(), materialName: z.string().optional(), promptFragment: z.string(),
  })).optional().default([]),
});

const materialMaskPreviewBodySchema = z.object({
  mask_coordinates: z.array(z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().positive().max(100),
    h: z.number().positive().max(100),
  })).min(1),
});

const adjustBodySchema = z.object({
  mask_zones:      z.array(z.string()).optional().default([]),
  ajuste_prompt:   z.string().optional(),
  // Máscara real desenhada no frontend (PNG base64) — maior prioridade.
  mask_file_base64: z.string().optional(),
  // Seleção real por retângulo arrastável (SelectionCanvas no
  // RenderStudioPage.tsx) — x/y/w/h em porcentagem (0-100). Antes desse
  // fix, esse campo era descartado silenciosamente pelo Zod (não existia
  // no schema) e o ajuste caía no mapa heurístico de zonas fixas, que não
  // batia com nenhuma seleção real desenhada.
  mask_coordinates: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })).optional(),
  // Genius Render: quando true, a seleção desenhada é tratada como semente.
  // O backend amplia levemente a janela para dar contexto visual ao modelo,
  // mas a composição final continua bloqueando qualquer mudança fora dela.
  expand_selection_to_material: z.boolean().optional().default(false),
  selection_padding_percent: z.number().min(0).max(25).optional().default(10),
  material_id: z.string().trim().min(1).optional(),
  material_name: z.string().trim().min(1).optional(),
  material_reference_url: z.string().trim().min(1).optional(),
});

const projectConfigBodySchema = z.object({
  lead_id:         z.string().optional(),
  nome_config:     z.string().min(1),
  mode:            z.enum(["preservar", "criar"]),
  estilo:          z.string().optional(),
  iluminacao:      z.string().optional(),
  angulo_padrao:   z.string().optional(),
  paleta_materiais: z.record(z.string(), z.string()).optional(),
});

// ── POST /api/arch/ai-render — Inicia job assíncrono ─────────────────────────

archAiRenderRouter.post("/arch/ai-render", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = renderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const {
    project_id, concept_project_id, lead_id, original_image_url, mode,
    ambiente, estilo, iluminacao, angulo,
    mask_zones, user_notes, render_presets, materials, source, render_view, render_profile,
    project_revision, scene_id, scene_name, camera_snapshot, source_model_version,
  } = parsed.data;

  if (project_id && concept_project_id) {
    return res.status(400).json({ success: false, error: "Informe project_id ou concept_project_id, não ambos." });
  }
  let effectiveUserNotes = user_notes;
  let realEnvironmentSourceUrl: string | undefined;
  let realEnvironmentKind: string | undefined;
  let resolvedProjectRevision = project_revision ?? null;
  let resolvedSceneId = scene_id ?? null;
  let resolvedSceneName = scene_name ?? null;
  let resolvedCameraSnapshot = camera_snapshot ?? null;
  let resolvedSourceModelVersion = source_model_version ?? null;

  if (concept_project_id) {
    const [concept] = await db.select({
      id: archConceptProjectsTable.id,
      status: archConceptProjectsTable.status,
      configuration: archConceptProjectsTable.configuration,
    })
      .from(archConceptProjectsTable)
      .where(and(eq(archConceptProjectsTable.id, concept_project_id), eq(archConceptProjectsTable.tenantId, tid)))
      .limit(1);
    if (!concept) return res.status(404).json({ success: false, error: "Pré-projeto não encontrado." });
    const conceptConfiguration = (concept.configuration ?? {}) as any;
    const realEnvironmentContext = interventionPromptContext(
      (conceptConfiguration?.realEnvironment ?? null) as RealEnvironmentAnalysis | null,
    );
    if (realEnvironmentContext) {
      effectiveUserNotes = [realEnvironmentContext, effectiveUserNotes].filter(Boolean).join("\n");
    }
    const realEnvironment = conceptConfiguration?.realEnvironment as RealEnvironmentAnalysis | undefined;
    if (realEnvironment && realEnvironment.useMode !== "reference") {
      realEnvironmentSourceUrl = typeof (realEnvironment as any).sourceImageUrl === "string"
        ? String((realEnvironment as any).sourceImageUrl)
        : undefined;
      realEnvironmentKind = realEnvironment.kind;
    }
    const projectMaster = conceptConfiguration?.projectMaster;
    resolvedProjectRevision = resolvedProjectRevision
      ?? String(conceptConfiguration?.revisionNumber ?? projectMaster?.version ?? 1);
    resolvedSourceModelVersion = resolvedSourceModelVersion
      ?? String(projectMaster?.geometryVersion ?? "concept_live");

    if (resolvedSceneId) {
      const savedScenes = Array.isArray(conceptConfiguration?.savedTourPoints) ? conceptConfiguration.savedTourPoints : [];
      const savedScene = savedScenes.find((scene: any) => String(scene?.id) === resolvedSceneId);
      if (!savedScene) {
        return res.status(400).json({ success: false, error: "A cena 3D informada não pertence a este projeto." });
      }
      resolvedSceneName = resolvedSceneName ?? String(savedScene.name || resolvedSceneId);
      resolvedCameraSnapshot = resolvedCameraSnapshot ?? {
        floor: Number(savedScene.floor ?? 0),
        position: savedScene.position,
        target: savedScene.target,
      };
    }

    if (concept.status === "submitted" && projectMaster) {
      return res.status(409).json({
        success: false,
        error: "O Projeto Mestre está congelado. Gere novos renders pela revisão do projeto ou pelo Projeto Arqdor aprovado.",
        code: "PROJECT_MASTER_FROZEN",
      });
    }
  }
  if (project_id) {
    const [project] = await db.select({ id: archProjetosTable.id })
      .from(archProjetosTable)
      .where(and(eq(archProjetosTable.id, project_id), eq(archProjetosTable.tenantId, tid)))
      .limit(1);
    if (!project) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
  }

  // Sanitiza: no modo Preservar, remove mobiliário solto das zonas
  const safeMaskZones = mode === "preservar"
    ? filterFurnitureZones(mask_zones)
    : mask_zones;

  // Persist before acknowledging. Only concept preservation uses the durable
  // worker; existing professional render modes keep their established pipeline.
  const durable = Boolean(concept_project_id) && mode === "preservar";
  // Cria registro inicial
  const [render] = await db.insert(archAiRendersTable).values({
    tenantId:         tid,
    leadId:           lead_id,
    projectId:        project_id,
    conceptProjectId: concept_project_id,
    mode,
    ambiente,
    estilo,
    iluminacao:       iluminacao,
    angulo:           mode === "preservar" ? undefined : angulo,
    maskZones:        safeMaskZones,
    originalImageUrl: original_image_url,
    source,
    renderView: render_view,
    projectRevision: resolvedProjectRevision,
    sceneId: resolvedSceneId,
    sceneName: resolvedSceneName,
    cameraSnapshot: resolvedCameraSnapshot,
    sourceModelVersion: resolvedSourceModelVersion,
    jobInput: durable ? { userNotes: effectiveUserNotes, materials, renderPresets: render_presets, source, renderView: render_view, realEnvironmentSourceUrl, realEnvironmentKind } : null,
    prompt: durable ? buildPrompt({
      mode, ambiente, estilo, iluminacao, angulo, maskZones: safeMaskZones, materials,
      userNotes: effectiveUserNotes, renderPresets: render_presets, source, renderView: render_view,
    }) : undefined,
    motor: undefined,
    status:           durable ? "queued" : "processando",
    versionTag:       mode === "preservar" ? "fiel_ao_original" : "conceito",
  }).returning();

  if (!render) {
    return res.status(500).json({ success: false, error: "Falha ao criar registro" });
  }

  // Responde 202 imediatamente
  res.status(202).json({
    success:   true,
    render_id: render.id,
    status:    durable ? "queued" : "processando",
  });

  if (durable) return;

  // ── Job assíncrono em background ────────────────────────────────────────────
  processRenderJob({
    renderId:     render.id,
    tenantId:     tid,
    mode,
    originalUrl:  original_image_url,
    maskZones:    safeMaskZones,
    ambiente,
    estilo,
    iluminacao,
    angulo,
    materials,
    userNotes:    effectiveUserNotes,
    renderPresets: render_presets,
    source,
    renderView: render_view,
    renderProfile: render_profile,
    realEnvironmentSourceUrl,
    realEnvironmentKind,
    logger:       req.log,
    retentativas: 0,
  }).catch(err => {
    req.log.error({ err, renderId: render.id }, "arch/ai-render: job falhou");
  });

  return;
});

// ── GET /api/arch/ai-renders — Histórico oficial do projeto ──────────────────

archAiRenderRouter.get("/arch/ai-renders", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const projectId = String(req.query["project_id"] ?? "").trim();
  const ambiente = String(req.query["ambiente"] ?? "").trim();
  if (!projectId) {
    return res.status(400).json({ success: false, error: "project_id obrigatório" });
  }

  const conditions = [
    eq(archAiRendersTable.tenantId, tid),
    eq(archAiRendersTable.projectId, projectId),
  ];
  if (ambiente) conditions.push(eq(archAiRendersTable.ambiente, ambiente));

  const renders = await db
    .select()
    .from(archAiRendersTable)
    .where(and(...conditions))
    .orderBy(asc(archAiRendersTable.createdAt));

  return res.json({
    success: true,
    project_id: projectId,
    versions: renders.map((render, index) => ({
      id: render.id,
      project_id: render.projectId,
      parent_render_id: render.parentRenderId,
      concept_project_id: render.conceptProjectId,
      project_revision: render.projectRevision,
      scene_id: render.sceneId,
      scene_name: render.sceneName,
      camera_snapshot: render.cameraSnapshot,
      source_model_version: render.sourceModelVersion,
      ambiente: render.ambiente,
      mode: render.mode,
      status: render.status,
      version_tag: render.versionTag,
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

// ── GET /api/arch/ai-render/:id — Status e resultado ─────────────────────────

archAiRenderRouter.get("/arch/ai-render/:id", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [render] = await (db as any)
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       (req.params["id"] as string)),
      eq(archAiRendersTable.tenantId, tid as string),
    )!)
    .limit(1);

  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });

  return res.json({
    success:                render.status === "concluido",
    render_id:              render.id,
    project_id:             render.projectId,
    parent_render_id:       render.parentRenderId,
    concept_project_id:      render.conceptProjectId,
    project_revision:        render.projectRevision,
    scene_id:                render.sceneId,
    scene_name:              render.sceneName,
    camera_snapshot:         render.cameraSnapshot,
    source_model_version:    render.sourceModelVersion,
    status:                 render.status,
    result_image_url:       render.resultImageUrl,
    original_image_url:     render.originalImageUrl,
    mode:                   render.mode,
    ambiente:               render.ambiente,
    version_tag:            render.versionTag,
    mask_zones:             render.maskZones,
    composited:             render.composited,
    segmentation_confidence: render.segmentationConfidence,
    erro_msg:               sanitizeRenderErrorForUser(render.erroMsg),
    prompt:                 render.prompt,
    motor:                  render.motor,
    approved_by:            render.approvedBy,
    approved_at:            render.approvedAt,
    created_at:             render.createdAt,
    concluido_em:           render.concluidoEm,
  });
});

// ── POST /api/arch/ai-render/:id/approve — Aprova versão concluída ────────────

archAiRenderRouter.post("/arch/ai-render/:id/approve", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [render] = await (db as any)
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       req.params["id"] as string),
      eq(archAiRendersTable.tenantId, tid as string),
    ))
    .limit(1);

  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });
  if (render.status !== "concluido") {
    return res.status(400).json({ success: false, error: "Apenas renders concluídos podem ser aprovados" });
  }

  const approvedBy = String((req as any).user?.id ?? "").trim() || null;
  const approvedAt = new Date();
  const [updated] = await db
    .update(archAiRendersTable)
    .set({ versionTag: "aprovado", approvedBy, approvedAt })
    .where(and(
      eq(archAiRendersTable.id,       req.params["id"] as string),
      eq(archAiRendersTable.tenantId, tid as string),
    ))
    .returning();

  return res.json({
    success:          true,
    render_id:        updated?.id ?? render.id,
    status:           updated?.status ?? render.status,
    result_image_url: updated?.resultImageUrl ?? render.resultImageUrl,
    version_tag:      updated?.versionTag ?? "aprovado",
    approved_by:      updated?.approvedBy ?? approvedBy,
    approved_at:      updated?.approvedAt ?? approvedAt,
  });
});

// ── POST /api/arch/ai-render/:id/material-mask-preview ───────────────────────
// Detecta a superfície por cor + conectividade + perímetro ANTES de gastar uma
// geração. O frontend exibe a máscara e exige confirmação explícita do usuário.
archAiRenderRouter.post("/arch/ai-render/:id/material-mask-preview", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = materialMaskPreviewBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Seleção inválida",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const [parent] = await (db as any)
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, req.params["id"] as string),
      eq(archAiRendersTable.tenantId, tid as string),
    ))
    .limit(1);

  if (!parent) return res.status(404).json({ success: false, error: "Render não encontrado" });
  if (parent.status !== "concluido") {
    return res.status(409).json({ success: false, error: "Finalize o render antes de detectar a superfície" });
  }

  const baseImageUrl = parent.resultImageUrl ?? parent.originalImageUrl;
  if (!baseImageUrl) {
    return res.status(400).json({ success: false, error: "Render sem imagem disponível" });
  }

  try {
    const storage = new ObjectStorageService();
    const { buf: imageBuf } = await fetchImageAsBuffer(baseImageUrl, storage);
    const meta = await sharp(imageBuf).metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 768;

    const maskBuf = await createMaterialSurfaceMask(
      imageBuf,
      parsed.data.mask_coordinates,
      width,
      height,
    );

    const { data: gray } = await sharp(maskBuf).greyscale().raw().toBuffer({ resolveWithObject: true });
    let selectedPixels = 0;
    for (const value of gray) if (value > 127) selectedPixels++;
    const coverage = selectedPixels / Math.max(1, width * height);

    // Preview transparente: âmbar apenas onde a superfície foi detectada.
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const alpha = gray[i] ?? 0;
      const p = i * 4;
      rgba[p] = 245;
      rgba[p + 1] = 158;
      rgba[p + 2] = 11;
      rgba[p + 3] = Math.round(alpha * 0.48);
    }
    const previewBuf = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();

    return res.json({
      success: true,
      width,
      height,
      coverage,
      mask_file_base64: `data:image/png;base64,${maskBuf.toString("base64")}`,
      preview_data_url: `data:image/png;base64,${previewBuf.toString("base64")}`,
      detection: "color+perimeter+connectivity",
    });
  } catch (error: any) {
    req.log?.warn?.({ err: error, renderId: req.params["id"] }, "arch/material-mask-preview: detecção falhou");
    return res.status(422).json({
      success: false,
      error: error?.message ?? "Não foi possível detectar a superfície. Refine a seleção e tente novamente.",
      code: "SURFACE_DETECTION_FAILED",
    });
  }
});

// ── POST /api/arch/ai-render/:id/adjust — Ajuste pós-geração ─────────────────

archAiRenderRouter.post("/arch/ai-render/:id/adjust", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [parent] = await (db as any)
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       (req.params["id"] as string)),
      eq(archAiRendersTable.tenantId, tid as string),
    )!)
    .limit(1);

  if (!parent) return res.status(404).json({ success: false, error: "Render pai não encontrado" });
  if (parent.status !== "concluido") {
    return res.status(400).json({ success: false, error: "O render pai ainda não foi concluído" });
  }

  const parsed = adjustBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const {
    mask_zones,
    ajuste_prompt,
    mask_file_base64,
    mask_coordinates,
    expand_selection_to_material,
    selection_padding_percent,
    material_id,
    material_name,
    material_reference_url,
  } = parsed.data;

  // Herda mode do pai — e sanitiza zonas se mode=preservar
  const safeZones = parent.mode === "preservar"
    ? filterFurnitureZones(mask_zones)
    : mask_zones;

  const baseImageUrl = parent.resultImageUrl ?? parent.originalImageUrl;
  if (!baseImageUrl) {
    return res.status(400).json({ success: false, error: "Render pai não possui imagem de resultado" });
  }

  if (material_id && (!mask_coordinates || mask_coordinates.length === 0) && !mask_file_base64) {
    return res.status(400).json({
      success: false,
      error: "Selecione e confirme a região antes de aplicar um material do catálogo.",
      code: "MATERIAL_REGION_REQUIRED",
    });
  }

  // Resolve material reference server-side from the canonical Material Library record.
  // This avoids rejecting valid library images when the frontend receives an absolute/CDN URL
  // and prevents trusting an arbitrary URL supplied by the browser.
  let resolvedMaterialReferenceUrl = material_reference_url;
  let resolvedMaterialName = material_name;

  if (material_id) {
    const [material] = await db
      .select({
        id: archMaterialsTable.id,
        ownerTenantId: archMaterialsTable.ownerTenantId,
        nome: archMaterialsTable.nome,
        compartilhamento: archMaterialsTable.compartilhamento,
        primaryImageId: archMaterialsTable.primaryImageId,
        ativo: archMaterialsTable.ativo,
      })
      .from(archMaterialsTable)
      .where(eq(archMaterialsTable.id, material_id))
      .limit(1);

    if (!material || !material.ativo) {
      return res.status(404).json({
        success: false,
        error: "Material não encontrado na Biblioteca de Materiais.",
        code: "MATERIAL_NOT_FOUND",
      });
    }

    let materialAllowed =
      material.ownerTenantId === tid ||
      material.compartilhamento === "publico" ||
      material.compartilhamento === "parceiros";

    if (!materialAllowed) {
      const [access] = await db
        .select({ id: archMaterialTenantAccessTable.id })
        .from(archMaterialTenantAccessTable)
        .where(and(
          eq(archMaterialTenantAccessTable.materialId, material.id),
          eq(archMaterialTenantAccessTable.tenantId, tid),
        ))
        .limit(1);
      materialAllowed = Boolean(access);
    }

    if (!materialAllowed) {
      return res.status(403).json({
        success: false,
        error: "Este material não está disponível para este tenant.",
        code: "MATERIAL_ACCESS_DENIED",
      });
    }

    let [referenceImage] = material.primaryImageId
      ? await db
          .select({
            id: archMaterialImagesTable.id,
            storageUrl: archMaterialImagesTable.storageUrl,
          })
          .from(archMaterialImagesTable)
          .where(and(
            eq(archMaterialImagesTable.id, material.primaryImageId),
            eq(archMaterialImagesTable.materialId, material.id),
            eq(archMaterialImagesTable.status, "ativa"),
          ))
          .limit(1)
      : [];

    if (!referenceImage) {
      [referenceImage] = await db
        .select({
          id: archMaterialImagesTable.id,
          storageUrl: archMaterialImagesTable.storageUrl,
        })
        .from(archMaterialImagesTable)
        .where(and(
          eq(archMaterialImagesTable.materialId, material.id),
          eq(archMaterialImagesTable.status, "ativa"),
        ))
        .orderBy(asc(archMaterialImagesTable.createdAt))
        .limit(1);
    }

    if (!referenceImage?.storageUrl) {
      return res.status(400).json({
        success: false,
        error: "Este material não possui imagem de referência disponível para o render.",
        code: "MATERIAL_REFERENCE_REQUIRED",
      });
    }

    resolvedMaterialReferenceUrl = referenceImage.storageUrl;
    resolvedMaterialName = material.nome;
  } else if (material_reference_url && !(
    material_reference_url.startsWith("/objects/") ||
    material_reference_url.startsWith("/api/storage/objects/") ||
    material_reference_url.startsWith("data:image/")
  )) {
    return res.status(400).json({
      success: false,
      error: "A referência visual precisa vir da Biblioteca de Materiais.",
      code: "INVALID_MATERIAL_REFERENCE",
    });
  }

  const [adjust] = await db.insert(archAiRendersTable).values({
    tenantId:         tid,
    leadId:           parent.leadId,
    projectId:        parent.projectId,
    conceptProjectId: parent.conceptProjectId,
    parentRenderId:   parent.id,
    projectRevision:  parent.projectRevision,
    sceneId:          parent.sceneId,
    sceneName:        parent.sceneName,
    cameraSnapshot:   parent.cameraSnapshot,
    sourceModelVersion: parent.sourceModelVersion,
    mode:             parent.mode,
    ambiente:         parent.ambiente,
    estilo:           parent.estilo,
    iluminacao:       parent.iluminacao,
    angulo:           parent.angulo,
    maskZones:        safeZones,
    originalImageUrl: baseImageUrl,
    status:           "processando",
    operationType:    material_id ? "material" : ajuste_prompt?.includes("refino global em alta qualidade") ? "improve" : "adjust",
    materialId:        material_id,
    materialName:      resolvedMaterialName,
    prompt:            ajuste_prompt,
    versionTag:       parent.versionTag,
  }).returning();

  if (!adjust) {
    return res.status(500).json({ success: false, error: "Falha ao criar ajuste" });
  }

  res.status(202).json({ success: true, render_id: adjust.id, status: "processando" });

  processRenderJob({
    renderId:     adjust.id,
    tenantId:     tid,
    mode:         parent.mode as "preservar" | "criar",
    originalUrl:  baseImageUrl,
    maskZones:    safeZones,
    maskFileBase64: mask_file_base64,
    maskCoordinates: mask_coordinates,
    materialAwareSelection: expand_selection_to_material,
    selectionPaddingPercent: selection_padding_percent,
    materialReferenceUrl: resolvedMaterialReferenceUrl,
    materialName: resolvedMaterialName,
    ambiente:     parent.ambiente,
    estilo:       parent.estilo,
    iluminacao:   parent.iluminacao,
    angulo:       parent.angulo,
    materials:    [],
    userNotes:    ajuste_prompt,
    renderPresets: inferArqdorRenderPresets({
      ambiente: parent.ambiente,
      renderView: parent.renderView,
      source: parent.source,
      userNotes: ajuste_prompt,
    }),
    logger:       req.log,
    retentativas: 0,
  }).catch(err => {
    req.log.error({ err, renderId: adjust.id }, "arch/ai-render/adjust: job falhou");
  });

  return;
});

// ── POST /api/arch/project-config ─────────────────────────────────────────────

archAiRenderRouter.post("/arch/project-config", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = projectConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const [config] = await db.insert(archProjectConfigsTable).values({
    tenantId:       tid,
    leadId:         parsed.data.lead_id,
    nomeConfig:     parsed.data.nome_config,
    mode:           parsed.data.mode,
    estilo:         parsed.data.estilo,
    iluminacao:     parsed.data.iluminacao,
    anguloPadrao:   parsed.data.angulo_padrao,
    paletaMateriais: parsed.data.paleta_materiais,
  }).returning();

  return res.status(201).json({ success: true, config });
});

// ── GET /api/arch/project-config?lead_id=uuid ────────────────────────────────

archAiRenderRouter.get("/arch/project-config", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const leadId = req.query["lead_id"] as string | undefined;

  const conditions = leadId
    ? and(
        eq(archProjectConfigsTable.tenantId, tid),
        eq(archProjectConfigsTable.leadId, leadId),
      )
    : eq(archProjectConfigsTable.tenantId, tid);

  const configs = await db
    .select()
    .from(archProjectConfigsTable)
    .where(conditions);

  return res.json({ success: true, configs });
});

// ── Job de processamento assíncrono ───────────────────────────────────────────

export interface RenderJobParams {
  leaseToken?: string;
  signal?: AbortSignal;
  resumePredictionId?: string;
  beforeProviderSubmit?: () => Promise<void>;
  onPredictionCreated?: (id: string) => Promise<void>;
  renderId:     string;
  tenantId:     string;
  mode:         "preservar" | "criar";
  originalUrl:  string;
  maskZones:    string[];
  // Máscara real desenhada pelo usuário (PNG base64, branco=editar,
  // preto=preservar) — quando presente, tem prioridade sobre o mapa
  // heurístico de zonas fixas (ZONE_REGIONS). Seleção livre de verdade,
  // não mais só 5 zonas em posição fixa presumindo cozinha padrão.
  maskFileBase64?: string;
  maskCoordinates?: { x: number; y: number; w: number; h: number }[];
  materialAwareSelection?: boolean;
  selectionPaddingPercent?: number;
  materialReferenceUrl?: string;
  materialName?: string;
  ambiente:     string | null | undefined;
  estilo:       string | null | undefined;
  iluminacao:   string | null | undefined;
  angulo:       string | null | undefined;
  materials:    { zone: string; promptFragment: string }[];
  userNotes:    string | undefined;
  renderPresets?: ArqdorRenderPreset[];
  source?: string | null;
  renderView?: string | null;
  renderProfile?: "technical" | "premium" | "decorated";
  realEnvironmentSourceUrl?: string;
  realEnvironmentKind?: string;
  logger:       any;
  retentativas: number;
}

const MAX_RETENTATIVAS = 2;

async function prepareMaterialReference(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(768, 768, { fit: "cover", position: "attention" })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

async function maskedAverageRgb(imageBuf: Buffer, maskBuf: Buffer): Promise<[number, number, number]> {
  const meta = await sharp(imageBuf).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return [0, 0, 0];
  const image = await sharp(imageBuf).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const mask = await sharp(maskBuf).resize(width, height, { fit: "fill" }).greyscale().raw().toBuffer();
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < width * height; i++) {
    if ((mask[i] ?? 0) < 128) continue;
    const p = i * 3;
    sr += image[p] ?? 0; sg += image[p + 1] ?? 0; sb += image[p + 2] ?? 0; n++;
  }
  return n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
}

async function materialReferenceAverageRgb(referenceBuf: Buffer): Promise<[number, number, number]> {
  const normalized = await prepareMaterialReference(referenceBuf);
  const stats = await sharp(normalized).stats();
  return [stats.channels[0]?.mean ?? 0, stats.channels[1]?.mean ?? 0, stats.channels[2]?.mean ?? 0];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function enhanceFinalRender(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return buffer;

  const longest = Math.max(width, height);
  const targetLongest = 2560;
  const scale = targetLongest / longest;

  return sharp(buffer)
    .resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 2.0, x1: 2.0, y2: 10, y3: 20 })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

export async function processRenderJob(params: RenderJobParams): Promise<void> {
  const {
    renderId, tenantId: tid, mode, originalUrl, maskZones, maskFileBase64, maskCoordinates,
    materialAwareSelection, selectionPaddingPercent, materialReferenceUrl, materialName,
    ambiente, estilo, iluminacao, angulo, materials, userNotes, renderPresets, source, renderView, renderProfile,
    realEnvironmentSourceUrl, realEnvironmentKind, logger, retentativas,
  } = params;

  const storage = new ObjectStorageService();
  const ownedRender = and(
    eq(archAiRendersTable.id, renderId), eq(archAiRendersTable.tenantId, tid),
    ...(params.leaseToken ? [
      eq(archAiRendersTable.jobLeaseToken, params.leaseToken),
      sql`${archAiRendersTable.jobLeaseUntil} > NOW()`,
    ] : []),
  );

  try {
    const initialCreditAuthorization = await authorizeVendorCredits(tid, "render_premium", 1);
    if (!initialCreditAuthorization.ok) {
      throw new Error(
        `INSUFFICIENT_VENDOR_CREDITS: required=${initialCreditAuthorization.required} available=${initialCreditAuthorization.includedRemaining + initialCreditAuthorization.available}`,
      );
    }

    // ── 1. Baixar imagem original ──────────────────────────────────────────
    const { buf: originalBuf, mime: originalMime } = await fetchImageAsBuffer(originalUrl, storage);

    let realEnvironmentDataUrl: string | undefined;
    if (realEnvironmentSourceUrl) {
      const realEnvironmentImage = await fetchImageAsBuffer(realEnvironmentSourceUrl, storage);
      realEnvironmentDataUrl = bufferToDataUrl(realEnvironmentImage.buf, realEnvironmentImage.mime);
    }

    const meta = await sharp(originalBuf).metadata();
    const width  = meta.width  ?? 1024;
    const height = meta.height ?? 768;

    logger?.info({ renderId, mode, width, height }, "arch/ai-render: iniciando job");

    // ── 2. Montar prompt ───────────────────────────────────────────────────
    const prompt = buildPrompt({
      mode, ambiente, estilo, iluminacao, angulo, maskZones, materials, userNotes,
      renderPresets, source, renderView,
    });

    // ── 3. Execução por mode ───────────────────────────────────────────────
    let resultB64: string;
    let motor     = "replicate-flux-fill";
    let compositedFlag = false;
    let segConf: Record<string, number> | undefined;
    let maskFileUrl: string | undefined;

    if (mode === "preservar") {
      const originalDataUrl = bufferToDataUrl(originalBuf, originalMime);
      const hasLocalSelection = Boolean(maskFileBase64 || (maskCoordinates && maskCoordinates.length > 0));

      if (hasLocalSelection && params.userNotes) {
        // Genius Render local edit:
        // a seleção do usuário é sempre autoridade. Para troca de material,
        // podemos ampliar apenas a janela de contexto; depois recompomos sobre
        // o original, garantindo que nenhum pixel fora da área autorizada mude.
        const expandedCoordinates = maskCoordinates?.map((rect) => {
          if (!materialAwareSelection) return rect;
          const padding = Math.max(0, Math.min(25, selectionPaddingPercent ?? 10));
          const px = rect.w * (padding / 100);
          const py = rect.h * (padding / 100);
          const x = Math.max(0, rect.x - px);
          const y = Math.max(0, rect.y - py);
          const w = Math.min(100 - x, rect.w + px * 2);
          const h = Math.min(100 - y, rect.h + py * 2);
          return { x, y, w, h };
        });

        const maskBuf = maskFileBase64
          ? Buffer.from(maskFileBase64.replace(/^data:image\/\w+;base64,/, ""), "base64")
          : materialAwareSelection
            ? await createMaterialSurfaceMask(originalBuf, expandedCoordinates ?? maskCoordinates ?? [], width, height)
            : await createRectMask(expandedCoordinates ?? maskCoordinates ?? [], width, height);

        const maskPath = await storage.savePrivateBuffer(
          maskBuf, "image/png",
          `arch-mask-${tid}-${renderId}.png`,
        );
        maskFileUrl = `/api/storage/objects/${maskPath.replace(/^\/objects\//, "")}`;

        const localPrompt = [
          prompt,
          "LOCAL EDIT MODE. The mask is an editable candidate area, not permission to redesign it.",
          materialAwareSelection
            ? "MATERIAL-SURFACE LOCK: the supplied mask has already been segmented to the connected material surface selected by the user. Change the finish only on white mask pixels. Do not reinterpret, enlarge, bridge gaps, cross seams or include adjacent panels, TV screens, walls, niches, appliances, trim, furniture, openings or disconnected surfaces."
            : "Change only the explicitly selected region.",
          "Everything outside the intended selected surface must remain visually identical to the source.",
          "Preserve camera, geometry, object inventory, furniture placement, dimensions, seams, edges and all unrelated materials.",
        ].join(" ");

        let materialReferenceDataUrl: string | undefined;
        let materialReferenceOriginalDataUrl: string | undefined;
        let materialReferenceBuffer: Buffer | undefined;
        if (materialReferenceUrl) {
          const reference = await fetchImageAsBuffer(materialReferenceUrl, storage);
          materialReferenceBuffer = reference.buf;
          const normalizedReference = await prepareMaterialReference(reference.buf);
          materialReferenceDataUrl = bufferToDataUrl(normalizedReference, "image/png");
          materialReferenceOriginalDataUrl = bufferToDataUrl(reference.buf, reference.mime);
        }

        const finalLocalPrompt = materialReferenceDataUrl
          ? [
              localPrompt,
              `EXACT MATERIAL LOCK: the material selected by the user is${materialName ? ` "${materialName}"` : " the supplied catalog reference"}. This is not a suggestion and must not be replaced by a generic or similar material.`,
              "The SECOND input image is a normalized close-up of the exact selected material. The THIRD input image, when present, is the original catalog reference for the same material.",
              "Inside the confirmed mask only, transfer the exact visible material identity: base hue, undertone, grain/vein pattern family, grain direction, pattern scale, contrast, roughness, gloss, reflectance and finish character.",
              "Adapt only perspective and scene lighting needed to make the exact same material physically plausible on the selected surface.",
              "DO NOT invent another wood species, another stone, another MDF tone, another fabric, another finish, or a merely similar substitute.",
              "Use reference images only for material appearance. Never copy their object shape, scene, background, crop or camera.",
            ].join(" ")
          : localPrompt;

        const referenceImageDataUrls = materialReferenceDataUrl
          ? [materialReferenceDataUrl, ...(materialReferenceOriginalDataUrl ? [materialReferenceOriginalDataUrl] : [])]
          : undefined;

        const generated = await generateRenderPremiumOpenAI({
          tenantId: tid,
          imageDataUrl: originalDataUrl,
          maskDataUrl: bufferToDataUrl(maskBuf, "image/png"),
          referenceImageDataUrls,
          prompt: finalLocalPrompt,
          logger,
        });

        const generatedBuf = Buffer.from(generated.base64, "base64");
        const compositedBuf = await compositeWithOriginal(generatedBuf, originalBuf, maskBuf);
        resultB64 = compositedBuf.toString("base64");
        compositedFlag = true;
        motor = `${generated.provider}-${generated.model}`;

        const validation = await validateEdgeIntegrity(originalBuf, compositedBuf, maskBuf);

        let materialFidelityValid = true;
        let materialColorDistance: number | undefined;
        if (materialReferenceBuffer) {
          const referenceRgb = await materialReferenceAverageRgb(materialReferenceBuffer);
          const resultRgb = await maskedAverageRgb(compositedBuf, maskBuf);
          materialColorDistance = rgbDistance(referenceRgb, resultRgb);
          materialFidelityValid = materialColorDistance <= 92;
        }

        logger?.info(
          { renderId, materialAwareSelection, materialColorDistance, materialFidelityValid, ...validation },
          "arch/ai-render: validação de bordas e fidelidade do material",
        );

        if ((!validation.valid || !materialFidelityValid) && retentativas < MAX_RETENTATIVAS) {
          logger?.warn({ renderId, retentativas }, "arch/ai-render: ajuste local rejeitado, tentando novamente");
          await db.update(archAiRendersTable)
            .set({ retentativas: String(retentativas + 1) })
            .where(ownedRender);
          return processRenderJob({ ...params, retentativas: retentativas + 1 });
        }
        if (!validation.valid || !materialFidelityValid) {
          const materialDetail = !materialFidelityValid
            ? ` Material selecionado não foi reproduzido com fidelidade suficiente (desvio de cor ${Math.round(materialColorDistance ?? 0)}).`
            : "";
          throw new Error(`Ajuste local rejeitado após ${MAX_RETENTATIVAS} tentativas: ${validation.details}.${materialDetail}`);
        }

        await db.update(archAiRendersTable)
          .set({ maskFileUrl })
          .where(ownedRender);
      } else {
        // Refino global: preservação rígida sem máscara.
        const generated = await generateRenderPremiumOpenAI({
          tenantId: tid,
          imageDataUrl: realEnvironmentDataUrl ?? originalDataUrl,
          referenceImageDataUrls: realEnvironmentDataUrl ? [originalDataUrl] : undefined,
          prompt: [
            prompt,
            ...(realEnvironmentDataUrl ? [
              "REAL-SITE COMPOSITION MODE. The FIRST input image is the actual existing place and is authoritative for camera, perspective, road, sidewalks, neighboring buildings, terrain cues, vegetation and every unaffected surrounding element.",
              "The SECOND input image is the designed architectural intervention and is authoritative for the new project's geometry, opening count/position, massing, proportions, materials and design intent.",
              "Insert the designed intervention into the real place at physically plausible scale and ground contact. Do not turn the location into a generic scene.",
              "Vegetation or existing objects may disappear ONLY where they are physically occluded by the new construction or explicitly marked REMOVE/REPLACE/RELOCATE in the REAL ENVIRONMENT LOCK. Preserve all remaining vegetation and context.",
              "Do not copy the background, sky or surroundings from the project reference image. Do not redesign the building to match the existing site.",
              `Existing scene category: ${realEnvironmentKind ?? "ambiente real"}.`,
            ] : []),
            "PREMIUM ARCHVIZ OUTPUT: produce a high-end photorealistic architectural visualization of the exact same project.",
            "Preserve the reference camera, architecture, cabinetry, exact visible-object inventory, furniture count/placement and the perceived base colors/material identity.",
            "Increase realistic global illumination, material micro-detail, wood grain fidelity, fabric weave, stone depth, metal/glass reflections, soft contact shadows and photographic clarity.",
            iluminacao?.includes("bright") || iluminacao?.includes("linear led")
              ? "BRIGHT SCENE: make the scene clearly brighter with realistic linear LED illumination where architecturally plausible, controlled practical lighting and soft ambient bounce light. Do not shift the underlying material colors."
              : "Use balanced premium architectural lighting with readable shadow detail and controlled highlights.",
            renderProfile === "decorated"
              ? "DECORATED MODE: existing objects remain immutable; you may add only a few small tasteful accessories in genuinely empty areas, without covering, replacing or moving anything."
              : "FAITHFUL MODE: do not add any new decoration or object.",
          ].join(" "),
          logger,
        });
        resultB64 = generated.base64;
        motor = `${generated.provider}-${generated.model}`;
        compositedFlag = false;
      }

      // Confiança heurística registrada por zona (para auditoria)
      segConf = {};
      for (const z of maskZones) {
        const known = ["piso","teto","parede","armario","bancada","porta","janela",
                       "parede_fundo","parede_lateral","armários sup.","armários inf."] as const;
        segConf[z] = known.includes(z as any) ? 0.85 : 0.45;
      }

      await db.update(archAiRendersTable)
        .set({ segmentationConfidence: segConf })
        .where(ownedRender);

    } else if (mode === "criar" && params.userNotes) {
      // ── 3b. Ajuste pós-geração de elemento pontual (Fill Pro + máscara) ─
      // Chamada separada sobre resultado já convertido — nunca combinada
      // com a geração inicial do Kontext no mesmo fluxo.
      // Seleção livre de verdade: se o usuário desenhou a máscara real
      // (frontend com ferramenta de pincel), usa ela direto — só cai no
      // mapa heurístico de 5 zonas fixas (ZONE_REGIONS) se nada foi
      // desenhado, mantendo compatibilidade com o fluxo antigo.
      const maskBuf = maskFileBase64
        ? Buffer.from(maskFileBase64.replace(/^data:image\/\w+;base64,/, ""), "base64")
        : maskCoordinates && maskCoordinates.length > 0
          ? await createRectMask(maskCoordinates, width, height)
          : await createZoneMask(maskZones, width, height);

      const maskPath = await storage.savePrivateBuffer(
        maskBuf, "image/png",
        `arch-mask-${tid}-${renderId}.png`,
      );
      maskFileUrl = `/api/storage/objects/${maskPath.replace(/^\/objects\//, "")}`;

      const originalDataUrl = bufferToDataUrl(originalBuf, originalMime);
      const maskDataUrl     = bufferToDataUrl(maskBuf, "image/png");

      const generated = await generateRenderPremiumOpenAI({
        tenantId: tid,
        imageDataUrl: originalDataUrl,
        maskDataUrl,
        prompt,
        logger,
      });
      resultB64 = generated.base64;

      const generatedBuf  = Buffer.from(resultB64, "base64");
      const compositedBuf = await compositeWithOriginal(generatedBuf, originalBuf, maskBuf);
      resultB64 = compositedBuf.toString("base64");
      compositedFlag = true;
      motor = `${generated.provider}-${generated.model}`;

      const validation = await validateEdgeIntegrity(originalBuf, compositedBuf, maskBuf);
      logger?.info({ renderId, ...validation }, "arch/ai-render: validação de bordas (fill)");

      if (!validation.valid && retentativas < MAX_RETENTATIVAS) {
        logger?.warn({ renderId, retentativas }, "arch/ai-render: rejeitado_auto, tentando novamente");
        await db.update(archAiRendersTable)
          .set({ retentativas: String(retentativas + 1) })
          .where(ownedRender);
        return processRenderJob({ ...params, retentativas: retentativas + 1 });
      }
      if (!validation.valid) {
        throw new Error(`Ajuste rejeitado após ${MAX_RETENTATIVAS} tentativas: ${validation.details}`);
      }

      await db.update(archAiRendersTable)
        .set({ maskFileUrl })
        .where(ownedRender);

    } else {
      // ── 3c. Modo Criar: geração livre no mesmo motor oficial OpenAI ─────
      const generated = await generateRenderCreateOpenAI({ tenantId: tid, prompt, logger });
      resultB64 = generated.base64;
      motor = `${generated.provider}-${generated.model}`;
    }

    // ── 4. Resultado único da geração ───────────────────────────────────────
    // O Render Premium é deliberadamente single-pass: o mesmo prompt já
    // concentra preservação rígida + materiais + iluminação + fotorealismo.
    // Evitamos uma segunda geração para reduzir custo, tempo e risco de deriva.
    const resultBuf = Buffer.from(resultB64, "base64");

    // ── 5. QA estrutural pós-render ─────────────────────────────────────────
    const shouldValidateArchitecture =
      !realEnvironmentSourceUrl &&
      mode === "preservar" &&
      ambiente === "fachada" &&
      (source === "facade" || renderView === "exterior");

    if (shouldValidateArchitecture) {
      const validation = await validateArchitecturalStructure(originalBuf, resultBuf);
      logger?.info({ renderId, retentativas, ...validation }, "arch/ai-render: QA estrutural da fachada");

      const qaMetrics = {
        ...(segConf ?? {}),
        structure_score: Number(validation.score.toFixed(4)),
        structure_coverage: Number(validation.edgeCoverage.toFixed(4)),
        structure_mirror: Number(validation.mirroredCoverage.toFixed(4)),
        structure_centroid_shift: Number(validation.centroidShift.toFixed(4)),
      };
      segConf = qaMetrics;

      await db.update(archAiRendersTable)
        .set({ segmentationConfidence: qaMetrics })
        .where(ownedRender);

      if (!validation.valid && retentativas < MAX_RETENTATIVAS) {
        const nextAttempt = retentativas + 1;
        logger?.warn(
          { renderId, nextAttempt, details: validation.details },
          "arch/ai-render: estrutura rejeitada, regenerando com lock reforçado",
        );

        await db.update(archAiRendersTable)
          .set({
            status: "processando",
            retentativas: String(nextAttempt),
            erroMsg: `QA estrutural: ${validation.details} Regenerando automaticamente.`,
            providerPredictionId: null,
            providerSubmissionStartedAt: null,
          })
          .where(ownedRender);

        const reinforcedNotes = [
          userNotes ?? "",
          "AUTOMATIC QA RETRY: the previous result distorted the source architecture.",
          "Reproduce the reference geometry more literally. Keep the exact silhouette, facade width, roof/parapet line, garage, entrance and all openings in the same positions and proportions.",
          "Do not mirror, rotate, crop, zoom, simplify, stylize or reinterpret the building massing. Change only materials, lighting, shadows and photographic realism.",
        ].filter(Boolean).join("\n");

        return processRenderJob({
          ...params,
          userNotes: reinforcedNotes,
          retentativas: nextAttempt,
          resumePredictionId: undefined,
        });
      }

      if (!validation.valid) {
        await db.update(archAiRendersTable)
          .set({
            status: "rejeitado_auto",
            erroMsg: `Render rejeitado automaticamente após ${MAX_RETENTATIVAS + 1} tentativas: ${validation.details}`,
            segmentationConfidence: qaMetrics,
            concluidoEm: new Date(),
          })
          .where(ownedRender);
        logger?.warn({ renderId, ...validation }, "arch/ai-render: QA estrutural rejeitou o resultado final");
        return;
      }
    }

    // ── 6. Finalização técnica + salvar em alta resolução ─────────────
    // Ajustes locais já partem de uma versão finalizada em alta resolução.
    // Reprocessar a imagem inteira aqui (resize + sharpen) altera pixels fora
    // da máscara e quebra a promessa de "somente a região selecionada".
    // Para edições locais compostadas, preservamos o resultado composto
    // exatamente como saiu do compositeWithOriginal; o restante permanece
    // pixel a pixel igual à versão pai.
    const finalResultBuf = compositedFlag ? resultBuf : await enhanceFinalRender(resultBuf);
    const finalMeta = await sharp(finalResultBuf).metadata();
    const [renderContext] = await db
      .select({
        projectId: archAiRendersTable.projectId,
        leadId: archAiRendersTable.leadId,
      })
      .from(archAiRendersTable)
      .where(and(
        eq(archAiRendersTable.id, renderId),
        eq(archAiRendersTable.tenantId, tid),
      ))
      .limit(1);

    const captured = await captureGeneratedMedia({
      tenantId: tid,
      title: `Arqdor · ${ambiente || "Render arquitetônico"}`,
      operation: "arqdor_render",
      buffer: finalResultBuf,
      mimeType: "image/png",
      type: "image",
      originalFilename: `arch-ai-render-${renderId}.png`,
      kind: "mixed",
      metadata: {
        module: "arqdor",
        renderId,
        archProjectId: renderContext?.projectId ?? null,
        leadId: renderContext?.leadId ?? null,
        ambiente: ambiente ?? null,
        source: source ?? "render-studio",
        renderView: renderView ?? null,
        mode,
        motor,
        generatedByAi: true,
        finalWidth: finalMeta.width ?? null,
        finalHeight: finalMeta.height ?? null,
        qualityPipeline: renderProfile === "technical" ? "technical-gpt-image+qa+2560" : "premium-gpt-image+qa+2560",
      },
    });
    // Persistimos a referência canônica do objeto. A API converte para display_url
    // quando o navegador precisa consumir o arquivo.
    const resultUrl = captured.storageUrl;

    // ── 7. Debitar Vendor Credits somente após resultado final válido ─────
    const finalCreditAuthorization = await authorizeVendorCredits(tid, "render_premium", 1);
    if (!finalCreditAuthorization.ok) {
      throw new Error(
        `INSUFFICIENT_VENDOR_CREDITS: required=${finalCreditAuthorization.required} available=${finalCreditAuthorization.includedRemaining + finalCreditAuthorization.available}`,
      );
    }

    const creditReferenceId = `arqdor-render:${renderId}`;
    const creditDebit = await debitVendorCredits({
      tenantId: tid,
      credits: finalCreditAuthorization.walletRequired,
      commercialKey: "vendor.arqdor",
      referenceId: creditReferenceId,
      reason: "render_premium",
      metadata: { renderId, mode, ambiente, renderProfile, motor },
    });

    await recordCommercialUsage({
      tenantId: tid,
      commercialKey: "vendor.arqdor",
      metricKey: "render_premium",
      quantity: 1,
      success: true,
      billable: true,
      billingStatus: "overage",
      provider: motor?.startsWith("openai") ? "openai" : "media_provider",
      model: motor,
      source: "arqdor_render",
      sourceEventId: `commercial:${renderId}`,
      requestId: renderId,
      metadata: {
        mode,
        ambiente,
        renderProfile,
        vendorCreditsReserved: Number(creditDebit.debited ?? 0),
        internalRetries: retentativas,
      },
    });

    // ── 8. Atualizar registro ──────────────────────────────────────────────
    await db.update(archAiRendersTable)
      .set({
        status:          "concluido",
        resultImageUrl:  resultUrl,
        composited:      compositedFlag,
        motor,
        prompt,
        erroMsg:         null,
        concluidoEm:     new Date(),
      })
      .where(ownedRender);

    logger?.info({
      renderId,
      motor,
      finalWidth: finalMeta.width,
      finalHeight: finalMeta.height,
    }, "arch/ai-render: concluído com sucesso");

  } catch (err: any) {
    logger?.error({ err, renderId }, "arch/ai-render: erro no job");

    const rawErrorMessage = String(err?.message ?? err);
    const safeErrorMessage = sanitizeRenderErrorForUser(rawErrorMessage) ?? "O render não pôde ser concluído. Tente novamente em alguns minutos.";

    await db.update(archAiRendersTable)
      .set({ status: "erro", erroMsg: safeErrorMessage })
      .where(ownedRender);

    db.insert(automationLogsTable).values({
      flow: "arch_ai_render", step: "processRenderJob",
      status: "error", errorMessage: rawErrorMessage,
    }).catch(() => undefined);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchImageAsBuffer(
  url: string,
  storage: ObjectStorageService,
): Promise<{ buf: Buffer; mime: string }> {
  // Data URL inline
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("Data URL inválida");
    return { buf: Buffer.from(match[2]!, "base64"), mime: match[1]! };
  }

  // Storage interno: banco guarda /objects/...; registros antigos podem ter
  // /api/storage/objects/...
  if (url.startsWith("/objects/") || url.startsWith("/api/storage/objects/")) {
    const rawPath = url.startsWith("/api/storage/objects/")
      ? `/objects/${url.slice("/api/storage/objects/".length)}`
      : url;
    const file = await storage.getObjectEntityFile(rawPath);
    const [[buf], metadata] = await Promise.all([
      file.download(),
      file.getMetadata(),
    ]);
    return { buf, mime: metadata[0].contentType ?? "image/png" };
  }

  // URL externa
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Falha ao baixar imagem (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  return { buf: Buffer.from(await res.arrayBuffer()), mime: contentType };
}

// ── Mapas auxiliares ──────────────────────────────────────────────────────────

const LIGHTING_MAP: Record<string, string> = {
  day: "balanced natural daylight and neutral material colors",
  sunset: "warm sunset light with long soft shadows",
  night: "nighttime light with warm practical lamps, dark sky and realistic material response",
  manha:   "soft warm morning light",
  tarde:   "bright afternoon sunlight",
  golden:  "warm golden hour light",
  noturno: "night mood lighting",
  nublado: "overcast diffused light",
};

const STYLE_MAP: Record<string, string> = {
  minimalista:   "minimalist style with clean lines, neutral palette",
  contemporaneo: "contemporary modern style with bold geometric forms",
  classico:      "timeless classic style with warm tones",
  industrial:    "industrial style with raw concrete and exposed steel",
  escandinavo:   "Scandinavian style with natural light and pale wood",
  tropical:      "tropical Brazilian style with warm earthy tones",
};

const ANGLE_MAP: Record<string, string> = {
  frontal:     "straight-on frontal view",
  "45":        "45-degree diagonal view",
  lateral_esq: "side view from the left",
  lateral_dir: "side view from the right",
  ampla:       "wide-angle expansive view",
  aerea:       "aerial top-down view",
};

// Descrições genéricas por zona para compor a lista de preservação
const ZONE_PRESERVE_DESCRIPTIONS: Record<string, string> = {
  piso:             "the floor with its current material and color",
  teto:             "the ceiling with its current finish",
  parede:           "the walls with their current paint color and finish",
  "parede_fundo":   "the back wall with its current finish",
  "parede_lateral": "the side walls with their current finish",
  armario:          "the cabinet with its exact current wood tone and finish",
  "armários sup.":  "the upper cabinets with their exact current tone and finish",
  "armários inf.":  "the lower cabinets with their exact current tone and finish",
  bancada:          "the countertop with its current material and color",
  porta:            "the door with its current material and frame",
  janela:           "the window with its current frame and glass",
};

function buildPrompt(p: {
  mode:       "preservar" | "criar";
  ambiente:   string | null | undefined;
  estilo:     string | null | undefined;
  iluminacao: string | null | undefined;
  angulo:     string | null | undefined;
  maskZones:  string[];
  materials:  { zone: string; promptFragment: string }[];
  userNotes:  string | undefined;
  renderPresets?: ArqdorRenderPreset[];
  source?: string | null;
  renderView?: string | null;
}): string {
  if (p.mode === "preservar") {
    return buildPreservePrompt(p);
  }
  return buildCriarPrompt(p);
}

/**
 * Template de preservação rígida para GPT Image (Seção 1.2 do briefing, 02/07/2026).
 * Regras críticas:
 * 1. Ação de conversão de estilo PRIMEIRO (não "preserve everything but…")
 * 2. Lista de preservação individual por objeto/elemento — não termos genéricos
 * 3. Material/cor exatos por elemento, com contraste explícito quando ambíguo
 * 4. Bloco de câmera/qualidade no final
 */
function buildPreservePrompt(p: {
  ambiente:   string | null | undefined;
  iluminacao: string | null | undefined;
  maskZones:  string[];
  materials:  { zone: string; promptFragment: string }[];
  userNotes:  string | undefined;
  renderPresets?: ArqdorRenderPreset[];
  source?: string | null;
  renderView?: string | null;
}): string {
  const inferredPresets = inferArqdorRenderPresets({
    ambiente: p.ambiente,
    renderView: p.renderView,
    source: p.source,
    userNotes: p.userNotes,
    explicit: p.renderPresets,
  });
  const fidelityBlock = buildArqdorFidelityBlock({
    presets: inferredPresets,
    negativeKind: inferredPresets.includes("material_detail_enhancer")
      ? "material"
      : inferredPresets.includes("facade_exterior_preserve")
        ? "architecture"
        : "interior",
  });
  if (p.ambiente === "fachada" || p.renderView === "exterior" || p.source === "facade") {
    const light = p.iluminacao === "night"
      ? "Night photograph with warm interior and facade lighting, realistic dark sky and readable materials. Do not turn night into daytime."
      : p.iluminacao === "sunset"
        ? "Warm sunset light with long soft shadows, balanced sky exposure and warm reflections."
        : "Neutral natural daylight with physically plausible shadows and controlled reflections.";
    // Pedido curto: o FLUX Kontext lê só ~512 tokens. O texto longo abaixo passava disso e os
    // materiais/luz/aberturas eram cortados, gerando uma casa diferente da desenhada.
    const [summary, details] = (p.userNotes ?? "").split("---DETALHES---");
    if (details !== undefined && summary.trim()) {
      return [
        "Turn this architectural facade illustration into a photorealistic photograph of the exact same house, with the same camera angle and framing.",
        summary.trim(),
        "Keep every wall edge, the roof and parapet line, the garage door, the entrance door and every window in the same place, size and count. Keep the colors and materials shown in the image. Do not add, remove, move or resize any window, door, floor, volume or roof.",
        "Replace the flat illustrated surfaces with real textures (plaster, wood grain, glass reflections, metal), add depth with window reveals, soft contact shadows and a real sky and garden.",
        light,
        "Photographic realism, eye-level view, straight verticals. No drawing style, no text, no people, no cars.",
      ].join("\n");
    }
    return [
      "Convert the reference geometry into a photorealistic architectural EXTERIOR photograph of the SAME built house.",
      "SOURCE-OF-TRUTH LOCK: the reference image and the structured geometry notes are authoritative. Geometry always has priority over style, realism, landscaping or composition improvements.",
      "The source can be a technical line elevation or a basic 3D preview. Preserve its exact outer silhouette, floor-to-floor alignment, facade width, roof/parapet outline, wall breaks and composition; only replace the schematic visual language with real materials, lighting and depth.",
      "OPENING LOCK: preserve the exact count, floor, horizontal order, center position, width/height relationship and sill relationship of every modeled door and window. Never add, remove, merge, split, resize or relocate openings.",
      "MASSING LOCK: preserve garage width and side, entrance position, wall returns, gates, setbacks and every modeled facade volume. Never mirror, rotate, crop or redesign the building.",
      "CAMERA LOCK: keep the same framing and visible building extents. Do not zoom in enough to crop roof, garage, entrance, facade edges or visible side returns.",
      p.userNotes ?? "",
      "Use the user's material schedule only after satisfying every geometry lock: physical plaster, wood grain, stone relief, realistic metal roughness, glazing reflections and wall/window reveal thickness.",
      light,
      "Human eye-level camera, 28–35 mm full-frame equivalent, corrected verticals and realistic perspective. Preserve a selected 3D camera if specified.",
      ...p.materials.map((m) => `${m.zone}: ${m.promptFragment}`),
      "Create depth through reveals, soffit shadows, wall thickness, glazing and contact shadows without moving any edge from the reference.",
      "Landscaping may improve realism but must never cover, replace or visually redefine architectural openings or facade edges.",
      "Never output vector art, SVG appearance, CAD shading, technical drawing, cartoon, illustration, clay render, flat blocks or bubble vegetation.",
      "FINAL SELF-CHECK: before finishing, verify that floor count, silhouette, roof line, garage, entrance and every visible opening still match the source reference.",
      fidelityBlock,
    ].join("\n");
  }
  const ambienteLabel = p.ambiente ?? "interior room";

  // Zonas selecionadas para editar (aparência/material a trocar)
  const editZones = new Set(p.maskZones.map(z => z.toLowerCase().trim()));

  // Zonas conhecidas que NÃO estão sendo editadas → lista de preservação
  const allKnownZones = Object.keys(ZONE_PRESERVE_DESCRIPTIONS);
  const preserveLines: string[] = allKnownZones
    .filter(z => !editZones.has(z))
    .map(z => `- ${ZONE_PRESERVE_DESCRIPTIONS[z]}`);

  // Material explícito para zonas a editar (quando fornecido pelo usuário)
  const materialLines: string[] = p.materials.map(
    m => `- ${m.zone}: apply ${m.promptFragment} — realistic photographic texture`,
  );

  // Bloco de iluminação: padrão natural+brilhante, sobrescrito se informado
  let lightingBlock = "physically plausible global illumination with soft natural daylight, realistic bounce light, controlled highlight roll-off, readable shadow detail and balanced exposure — bright but never flat or washed out";
  if (p.iluminacao && p.iluminacao !== "auto") {
    lightingBlock = LIGHTING_MAP[p.iluminacao] ?? p.iluminacao;
  }

  const hasExplicitAppearanceEdit = editZones.size > 0 || materialLines.length > 0;
  const lines: string[] = [
    `STRICT PRESERVATION MODE — the reference image is the immutable design source. Fidelity has priority over styling, decoration and visual creativity.`,
    `OBJECT INVENTORY LOCK: every visible object in the reference is mandatory and must remain present in the output. Preserve every existing furniture item, loose object, stool, pouf, chair, bench, table, sofa, cabinet, countertop, appliance, fixture, decoration and built-in in the exact same count, position, orientation, size, proportions, silhouette and visible shape. Never move, resize, rotate, replace, delete, hide, merge, occlude, simplify or redesign an existing item.`,
    `COLOR LOCK: preserve the exact perceived colors of cabinetry, furniture, walls, floors, stone, wood, metals, fabrics and all existing finishes. Do not recolor, warm, cool, desaturate or reinterpret them. Lighting may affect natural highlights and shadows, but the underlying material color must remain the same.`,
    `TEXTURE IDENTITY LOCK: keep each existing material identity, texture family, grain direction, veining direction and pattern. Improve only texture resolution, micro-detail, roughness, depth, reflectance and realism. Do not swap one wood, stone, fabric, paint or metal for another unless that exact zone was explicitly selected for a material change.`,
    `ARCHITECTURE/CAMERA LOCK: preserve walls, openings, trim, mouldings, ceiling, floor boundaries, cabinetry geometry, circulation, camera position, framing, perspective and field of view exactly. No crop, zoom, mirror or composition change.`,
    hasExplicitAppearanceEdit
      ? `EDIT SCOPE: only the explicitly selected zones may change appearance. Every unselected element remains locked.`
      : `NO REDESIGN / NO NEW OBJECTS: this pass is enhancement-only. Do not add decorative objects, plants, artwork, lamps, cushions, accessories or furniture unless the user explicitly asks for them.`,
    `Re-render the SAME scene as premium photorealistic architectural visualization. Improve only rendering quality: physically based material response, high-resolution surface detail, realistic reflections, global illumination, contact shadows, bounce light, exposure, tonal separation and photographic clarity.`,
    `Lighting: ${lightingBlock}.`,
    `MATERIAL REALISM: retain the original base color and material identity while adding believable micro-texture and physically plausible response — wood grain detail without changing species/color, stone depth without changing slab tone/pattern, subtle paint roughness, controlled glass reflections, realistic metal specular response and visible textile weave.`,
    `LIGHTING REALISM: natural indirect bounce, soft area/contact shadows, subtle ambient occlusion at joints, balanced white balance and controlled highlights. Do not use lighting as an excuse to change the apparent finish color.`,
    `CAMERA/DETAIL: architectural photography, straight verticals, natural 28–35mm perspective, crisp focus, fine detail without oversharpening. No blur, watercolor, painterly effect, plastic surfaces, low-resolution textures, cartoon or game-engine look.`,
  ];

  if (preserveLines.length > 0) {
    lines.push(``, `Keep these exact elements unchanged in position and color:`);
    lines.push(...preserveLines);
  }

  if (materialLines.length > 0) {
    lines.push(``, `Apply the following material changes to the specified zones only:`);
    lines.push(...materialLines);
  }

  if (p.userNotes) {
    lines.push(``, `Additional instruction: ${p.userNotes}`);
  }

  lines.push(
    ``,
    `Shot on a professional full-frame camera, 35mm lens, f/5.6, sharp focus throughout, high dynamic range, realistic tonal separation, fine material detail, premium architectural-magazine quality, no noise, no blur, no visible artifacts, no smeared textures and no underexposed or clipped areas.`,
    ``,
    `FINAL SELF-CHECK: compare against the reference before finishing. Existing object inventory must match one-for-one: same count, same visible objects, same placement, dimensions, orientation, silhouette, colors and material identity. Verify stools, poufs, chairs, benches, tables, sofas, appliances, fixtures and decorations are all still present. Architecture, camera and composition must also match. Only realism, texture fidelity, lighting and resolution may improve unless an explicit selected-zone edit was requested.`,
    fidelityBlock,
  );

  return lines.join("\n");
}

/**
 * Prompt para modo Criar — geração livre via flux-1.1-pro-ultra.
 * Também usado para ajuste pós-geração pontual via Fill Pro (userNotes).
 */
function buildCriarPrompt(p: {
  ambiente:   string | null | undefined;
  estilo:     string | null | undefined;
  iluminacao: string | null | undefined;
  angulo:     string | null | undefined;
  maskZones:  string[];
  materials:  { zone: string; promptFragment: string }[];
  userNotes:  string | undefined;
  renderView?: string | null;
  source?: string | null;
  renderPresets?: ArqdorRenderPreset[];
}): string {
  const parts: string[] = [
    `Professional architectural visualization of a ${p.ambiente ?? "interior"}.`,
    `Ultra-realistic photorealistic photograph, natural lighting, sharp detail.`,
  ];

  if (p.estilo) {
    parts.push(`Style: ${STYLE_MAP[p.estilo] ?? p.estilo}.`);
  }

  if (p.iluminacao && p.iluminacao !== "auto") {
    parts.push(`Lighting: ${LIGHTING_MAP[p.iluminacao] ?? p.iluminacao}.`);
  }

  if (p.angulo) {
    parts.push(`Camera: ${ANGLE_MAP[p.angulo] ?? p.angulo}.`);
  }

  if (p.materials.length > 0) {
    parts.push(
      "Material applications (apply only to each specified zone):",
      ...p.materials.map(m => `• ${m.zone}: ${m.promptFragment}`),
    );
  }

  if (p.userNotes) {
    parts.push(`Additional notes: ${p.userNotes}`);
  }

  const inferredPresets = inferArqdorRenderPresets({
    ambiente: p.ambiente,
    renderView: p.renderView,
    source: p.source,
    userNotes: p.userNotes,
    explicit: p.renderPresets,
  });
  parts.push(buildArqdorFidelityBlock({
    presets: inferredPresets,
    negativeKind: inferredPresets.includes("material_detail_enhancer") ? "material" : inferredPresets.includes("facade_exterior_preserve") ? "architecture" : "interior",
  }));

  parts.push(
    "Keep everything else in the image exactly as it is — do not change any other element, color, material, or lighting elsewhere in the scene.",
    "Shot on a professional full-frame camera, 35mm lens, ultra-high resolution detail, professional real estate photography quality.",
  );

  return parts.join(" ");
}
