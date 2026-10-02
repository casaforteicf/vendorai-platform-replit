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
  buildArqdorFidelityBlock,
  inferArqdorRenderPresets,
  type ArqdorRenderPreset,
} from "../lib/arqdor-render-prompts.js";

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
  } = parsed.data;

  if (project_id && concept_project_id) {
    return res.status(400).json({ success: false, error: "Informe project_id ou concept_project_id, não ambos." });
  }
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
    if (concept.status === "submitted" && (concept.configuration as any)?.projectMaster) {
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
    jobInput: durable ? { userNotes: user_notes, materials, renderPresets: render_presets, source, renderView: render_view } : null,
    prompt: durable ? buildPrompt({
      mode, ambiente, estilo, iluminacao, angulo, maskZones: safeMaskZones, materials,
      userNotes: user_notes, renderPresets: render_presets, source, renderView: render_view,
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
    userNotes:    user_notes,
    renderPresets: render_presets,
    source,
    renderView: render_view,
    renderProfile: render_profile,
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
  logger:       any;
  retentativas: number;
}

const MAX_RETENTATIVAS = 2;

async function prepareMaterialReference(buffer: Buffer): Promise<Buffer> {
  // Normaliza a referência para que o modelo receba o material em primeiro
  // plano, sem depender do enquadramento original da foto do catálogo.
  // "attention" prioriza a região visualmente informativa e evita bordas/fundos.
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
    sr += image[p] ?? 0;
    sg += image[p + 1] ?? 0;
    sb += image[p + 2] ?? 0;
    n++;
  }
  return n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
}

async function materialReferenceAverageRgb(referenceBuf: Buffer): Promise<[number, number, number]> {
  const normalized = await prepareMaterialReference(referenceBuf);
  const stats = await sharp(normalized).stats();
  return [
    stats.channels[0]?.mean ?? 0,
    stats.channels[1]?.mean ?? 0,
    stats.channels[2]?.mean ?? 0,
  ];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
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
    logger, retentativas,
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
    // ── 1. Baixar imagem original ──────────────────────────────────────────
    const { buf: originalBuf, mime: originalMime } = await fetchImageAsBuffer(originalUrl, storage);

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