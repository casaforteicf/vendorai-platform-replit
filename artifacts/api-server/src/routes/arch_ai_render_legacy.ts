/**
 * Arch AI Render — pipeline async com roteamento por modo
 *
 * Modo Preservar → flux-kontext-pro (edição por instrução, sem máscara)
 * Modo Criar     → flux-1.1-pro-ultra raw:true (geração livre)
 * Ajuste pontual → flux-fill-pro com máscara (segunda chamada separada)
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
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  createZoneMask,
  createRectMask,
  callReplicateFluxFill,
  compositeWithOriginal,
  validateEdgeIntegrity,
  validateArchitecturalStructure,
  bufferToDataUrl,
} from "../lib/arch-render-pipeline.js";
import sharp from "sharp";
import { generateRenderCreate, generateRenderPreserve } from "../services/media-provider-execution.js";
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
  ])).optional().default([]),
  // materiais para modo criar (compatibilidade com o fluxo existente)
  materials: z.array(z.object({
    zone: z.string(), materialName: z.string().optional(), promptFragment: z.string(),
  })).optional().default([]),
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
    mask_zones, user_notes, render_presets, materials, source, render_view,
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
    motor: durable ? "replicate-flux-kontext-pro" : undefined,
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

  const { mask_zones, ajuste_prompt, mask_file_base64, mask_coordinates } = parsed.data;

  // Herda mode do pai — e sanitiza zonas se mode=preservar
  const safeZones = parent.mode === "preservar"
    ? filterFurnitureZones(mask_zones)
    : mask_zones;

  const baseImageUrl = parent.resultImageUrl ?? parent.originalImageUrl;
  if (!baseImageUrl) {
    return res.status(400).json({ success: false, error: "Render pai não possui imagem de resultado" });
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
    ambiente:     parent.ambiente,
    estilo:       parent.estilo,
    iluminacao:   parent.iluminacao,
    angulo:       parent.angulo,
    materials:    [],
    userNotes:    ajuste_prompt,
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
  ambiente:     string | null | undefined;
  estilo:       string | null | undefined;
  iluminacao:   string | null | undefined;
  angulo:       string | null | undefined;
  materials:    { zone: string; promptFragment: string }[];
  userNotes:    string | undefined;
  source?: string | null;
  renderView?: string | null;
  logger:       any;
  retentativas: number;
}

const MAX_RETENTATIVAS = 2;

export async function processRenderJob(params: RenderJobParams): Promise<void> {
  const {
    renderId, tenantId: tid, mode, originalUrl, maskZones, maskFileBase64, maskCoordinates,
    ambiente, estilo, iluminacao, angulo, materials, userNotes, renderPresets, source, renderView,
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
      // ── 3a. Kontext: edição por instrução de linguagem natural ──────────
      // O modelo opera sobre os pixels reais da imagem — layout, cor e
      // identidade dos objetos ficam preservados por padrão; não usa máscara.
      const originalDataUrl = bufferToDataUrl(originalBuf, originalMime);

      const generated = await generateRenderPreserve({
        imageDataUrl: originalDataUrl,
        prompt,
        logger,
        signal: params.signal,
        resumePredictionId: params.resumePredictionId,
        beforeSubmit: params.beforeProviderSubmit,
        onPredictionCreated: params.onPredictionCreated,
      });
      resultB64 = generated.base64;
      motor = `${generated.provider}-${generated.model}`;
      compositedFlag = false;

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

      resultB64 = await callReplicateFluxFill({
        imageDataUrl: originalDataUrl,
        maskDataUrl,
        prompt,
        steps:    50,
        guidance: 30,
        logger,
      });

      const generatedBuf  = Buffer.from(resultB64, "base64");
      const compositedBuf = await compositeWithOriginal(generatedBuf, originalBuf, maskBuf);
      resultB64 = compositedBuf.toString("base64");
      compositedFlag = true;
      motor = "replicate-flux-fill-pro";

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
      // ── 3c. Modo Criar: geração livre via Flux 1.1 Pro Ultra (raw:true) ─
      if (!process.env["REPLICATE_API_TOKEN"]) {
        throw new Error("REPLICATE_API_TOKEN não configurado");
      }
      const generated = await generateRenderCreate({ prompt, logger });
      resultB64 = generated.base64;
      motor = `${generated.provider}-${generated.model}`;
    }

    // ── 4. QA estrutural pós-render ─────────────────────────────────────────
    const resultBuf = Buffer.from(resultB64, "base64");
    const shouldValidateArchitecture =
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

    // ── 5. Salvar resultado no storage ─────────────────────────────────────

    const captured = await captureGeneratedMedia({
      tenantId: tid,
      title: `Arqdor · ${ambiente || "Render arquitetônico"}`,
      operation: "arqdor_render",
      buffer: resultBuf,
      mimeType: "image/png",
      type: "image",
      originalFilename: `arch-ai-render-${renderId}.png`,
      kind: "mixed",
      metadata: {
        module: "arqdor",
        renderId,
        archProjectId: params.renderId ? undefined : null,
        ambiente: ambiente ?? null,
        source: source ?? "render-studio",
        renderView: renderView ?? null,
        mode,
        motor,
        generatedByAi: true,
      },
    });
    const resultUrl = `/api/storage/objects/${captured.storageUrl.replace(/^\/objects\//, "")}`;

    // ── 6. Atualizar registro ──────────────────────────────────────────────
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

    logger?.info({ renderId, motor }, "arch/ai-render: concluído com sucesso");

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

  // URL de storage interno (/api/storage/objects/...)
  if (url.startsWith("/api/storage/")) {
    const objKey  = url.replace(/^\/api\/storage\/objects\//, "objects/");
    const rawPath = `/${objKey}`;
    const fetched = await (storage as any).getPrivateBuffer?.(rawPath).catch(() => null);
    if (fetched?.buf) return { buf: fetched.buf, mime: fetched.mime ?? "image/png" };
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

// Descrições genéricas por zona para compor a lista de preservação no Kontext
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
    return buildKontextPrompt(p);
  }
  return buildCriarPrompt(p);
}

/**
 * Template validado para flux-kontext-pro (Seção 1.2 do briefing, 02/07/2026).
 * Regras críticas:
 * 1. Ação de conversão de estilo PRIMEIRO (não "preserve everything but…")
 * 2. Lista de preservação individual por objeto/elemento — não termos genéricos
 * 3. Material/cor exatos por elemento, com contraste explícito quando ambíguo
 * 4. Bloco de câmera/qualidade no final
 */
function buildKontextPrompt(p: {
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
  let lightingBlock = "bright, evenly distributed natural daylight filling the entire room, soft and airy, well-exposed with no dark shadows or dim corners — a bright, clean, well-lit photograph";
  if (p.iluminacao && p.iluminacao !== "auto") {
    lightingBlock = LIGHTING_MAP[p.iluminacao] ?? p.iluminacao;
  }

  const lines: string[] = [
    `Convert this 3D sketch render into a photorealistic photograph with natural lighting, realistic textures, and sharp photographic detail. This is currently a flat 3D model render — fully re-render it as a real photograph.`,
    ``,
    `Keep the exact same room layout and camera angle, including every architectural element visible in the original image — walls, doors, panels, trim, and mouldings — even ones partially visible at the edge of the frame. Do not omit, simplify, or crop out any element that exists in the original.`,
    ``,
    `Lit by ${lightingBlock}.`,
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
    `Shot on a professional full-frame camera, 35mm lens, f/5.6, sharp focus throughout, high dynamic range, balanced bright exposure, ultra-high resolution detail, professional real estate and architectural photography quality, no noise, no blur, no visible artifacts, no underexposed or dark areas.`,
    ``,
    `Only change how the scene is rendered — realistic materials, realistic lighting and shadows, photographic depth of field — not what's in it, its layout, its colors, or any architectural element.`,
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
