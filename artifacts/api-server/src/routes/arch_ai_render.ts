/**
 * Arch AI Render — pipeline async com roteamento por modo
 *
 * Modo Preservar → flux-kontext-pro (edição por instrução, sem máscara)
 * Modo Criar     → flux-1.1-pro-ultra raw:true (geração livre)
 * Ajuste pontual → flux-fill-pro com máscara (segunda chamada separada)
 *
 * POST /api/arch/ai-render               → 202, render_id
 * GET  /api/arch/ai-render/:id           → status + resultado
 * POST /api/arch/ai-render/:id/adjust    → ajuste herdando mode do pai
 * POST /api/arch/project-config          → salvar configuração reutilizável
 * GET  /api/arch/project-config          → listar configs por lead_id
 */
import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  archAiRendersTable,
  archProjectConfigsTable,
  automationLogsTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  createZoneMask,
  callReplicateFluxKontext,
  callReplicateFluxUltraPro,
  callReplicateFluxFill,
  compositeWithOriginal,
  validateEdgeIntegrity,
  bufferToDataUrl,
} from "../lib/arch-render-pipeline.js";
import sharp from "sharp";

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

// ── Esquemas de validação ──────────────────────────────────────────────────────

const renderBodySchema = z.object({
  project_id:        z.string().optional(),
  lead_id:           z.string().optional(),
  original_image_url: z.string().min(10, "original_image_url obrigatório"),
  mode:              z.enum(["preservar", "criar"]),
  ambiente:          z.string().min(1),
  estilo:            z.string().optional(),
  iluminacao:        z.string().optional(),
  angulo:            z.string().optional(),
  mask_zones:        z.array(z.string()).optional().default([]),
  user_notes:        z.string().optional(),
  // materiais para modo criar (compatibilidade com o fluxo existente)
  materials: z.array(z.object({
    zone: z.string(), materialName: z.string().optional(), promptFragment: z.string(),
  })).optional().default([]),
});

const adjustBodySchema = z.object({
  mask_zones:    z.array(z.string()).optional().default([]),
  ajuste_prompt: z.string().optional(),
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
    project_id, lead_id, original_image_url, mode,
    ambiente, estilo, iluminacao, angulo,
    mask_zones, user_notes, materials,
  } = parsed.data;

  // Sanitiza: no modo Preservar, remove mobiliário solto das zonas
  const safeMaskZones = mode === "preservar"
    ? filterFurnitureZones(mask_zones)
    : mask_zones;

  // Cria registro inicial
  const [render] = await db.insert(archAiRendersTable).values({
    tenantId:         tid,
    leadId:           lead_id,
    projectId:        project_id,
    mode,
    ambiente,
    estilo,
    iluminacao:       iluminacao,
    angulo:           mode === "preservar" ? undefined : angulo,
    maskZones:        safeMaskZones,
    originalImageUrl: original_image_url,
    status:           "processando",
    versionTag:       mode === "preservar" ? "fiel_ao_original" : "conceito",
  }).returning();

  if (!render) {
    return res.status(500).json({ success: false, error: "Falha ao criar registro" });
  }

  // Responde 202 imediatamente
  res.status(202).json({
    success:   true,
    render_id: render.id,
    status:    "processando",
  });

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
    logger:       req.log,
    retentativas: 0,
  }).catch(err => {
    req.log.error({ err, renderId: render.id }, "arch/ai-render: job falhou");
  });

  return;
});

// ── GET /api/arch/ai-render/:id — Status e resultado ─────────────────────────

archAiRenderRouter.get("/arch/ai-render/:id", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [render] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       req.params["id"]!),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);

  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });

  return res.json({
    success:                render.status === "concluido",
    render_id:              render.id,
    status:                 render.status,
    result_image_url:       render.resultImageUrl,
    mode:                   render.mode,
    version_tag:            render.versionTag,
    mask_zones:             render.maskZones,
    composited:             render.composited,
    segmentation_confidence: render.segmentationConfidence,
    erro_msg:               render.erroMsg,
    motor:                  render.motor,
    created_at:             render.createdAt,
    concluido_em:           render.concluidoEm,
  });
});

// ── POST /api/arch/ai-render/:id/adjust — Ajuste pós-geração ─────────────────

archAiRenderRouter.post("/arch/ai-render/:id/adjust", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [parent] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       req.params["id"]!),
      eq(archAiRendersTable.tenantId, tid),
    ))
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

  const { mask_zones, ajuste_prompt } = parsed.data;

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

interface RenderJobParams {
  renderId:     string;
  tenantId:     string;
  mode:         "preservar" | "criar";
  originalUrl:  string;
  maskZones:    string[];
  ambiente:     string | null | undefined;
  estilo:       string | null | undefined;
  iluminacao:   string | null | undefined;
  angulo:       string | null | undefined;
  materials:    { zone: string; promptFragment: string }[];
  userNotes:    string | undefined;
  logger:       any;
  retentativas: number;
}

const MAX_RETENTATIVAS = 2;

async function processRenderJob(params: RenderJobParams): Promise<void> {
  const {
    renderId, tenantId: tid, mode, originalUrl, maskZones,
    ambiente, estilo, iluminacao, angulo, materials, userNotes,
    logger, retentativas,
  } = params;

  const storage = new ObjectStorageService();

  try {
    // ── 1. Baixar imagem original ──────────────────────────────────────────
    const { buf: originalBuf, mime: originalMime } = await fetchImageAsBuffer(originalUrl, storage);

    const meta = await sharp(originalBuf).metadata();
    const width  = meta.width  ?? 1024;
    const height = meta.height ?? 768;

    logger?.info({ renderId, mode, width, height }, "arch/ai-render: iniciando job");

    // ── 2. Montar prompt ───────────────────────────────────────────────────
    const prompt = buildPrompt({ mode, ambiente, estilo, iluminacao, angulo, maskZones, materials, userNotes });

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

      resultB64 = await callReplicateFluxKontext({
        imageDataUrl: originalDataUrl,
        prompt,
        logger,
      });
      motor = "replicate-flux-kontext-pro";
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
        .where(eq(archAiRendersTable.id, renderId));

    } else if (mode === "criar" && params.userNotes) {
      // ── 3b. Ajuste pós-geração de elemento pontual (Fill Pro + máscara) ─
      // Chamada separada sobre resultado já convertido — nunca combinada
      // com a geração inicial do Kontext no mesmo fluxo.
      const maskBuf = await createZoneMask(maskZones, width, height);

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
          .where(eq(archAiRendersTable.id, renderId));
        return processRenderJob({ ...params, retentativas: retentativas + 1 });
      }
      if (!validation.valid) {
        throw new Error(`Ajuste rejeitado após ${MAX_RETENTATIVAS} tentativas: ${validation.details}`);
      }

      await db.update(archAiRendersTable)
        .set({ maskFileUrl })
        .where(eq(archAiRendersTable.id, renderId));

    } else {
      // ── 3c. Modo Criar: geração livre via Flux 1.1 Pro Ultra (raw:true) ─
      if (!process.env["REPLICATE_API_TOKEN"]) {
        throw new Error("REPLICATE_API_TOKEN não configurado");
      }
      resultB64 = await callReplicateFluxUltraPro({ prompt, logger });
      motor = "replicate-flux-1.1-pro-ultra";
    }

    // ── 4. Salvar resultado no storage ─────────────────────────────────────
    const resultBuf  = Buffer.from(resultB64, "base64");
    const objPath    = await storage.savePrivateBuffer(
      resultBuf, "image/png",
      `arch-ai-render-${tid}-${renderId}.png`,
    );
    const resultUrl  = `/api/storage/objects/${objPath.replace(/^\/objects\//, "")}`;

    // ── 5. Atualizar registro ──────────────────────────────────────────────
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
      .where(eq(archAiRendersTable.id, renderId));

    logger?.info({ renderId, motor }, "arch/ai-render: concluído com sucesso");

  } catch (err: any) {
    logger?.error({ err, renderId }, "arch/ai-render: erro no job");

    await db.update(archAiRendersTable)
      .set({ status: "erro", erroMsg: String(err?.message ?? err) })
      .where(eq(archAiRendersTable.id, renderId));

    db.insert(automationLogsTable).values({
      flow: "arch_ai_render", step: "processRenderJob",
      status: "error", errorMessage: String(err?.message ?? err),
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
}): string {
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

  parts.push(
    "Keep everything else in the image exactly as it is — do not change any other element, color, material, or lighting elsewhere in the scene.",
    "Shot on a professional full-frame camera, 35mm lens, ultra-high resolution detail, professional real estate photography quality.",
  );

  return parts.join(" ");
}
