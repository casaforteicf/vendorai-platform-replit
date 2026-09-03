import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildReferencePatternsPromptBlock } from "../services/content-reference-creators.js";
import { buildOwnPerformancePromptBlock } from "../services/content-performance.js";
import {
  resolveProductVideoLibraryImages,
  startProductPhotoVideo,
  type ProductVideoImage,
} from "../services/media-product-video.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ─── Script generation (Anthropic) ────────────────────────────────────────────

const TABS = ["workflow", "trends", "hooks", "script"] as const;
type Tab = (typeof TABS)[number];

function buildPrompt(tab: Tab, input: string, referencePatterns: string): string {
  const prompts: Record<Tab, string> = {
    workflow: `Crie um fluxo de conteúdo para Instagram no nicho "${input}": 5 tópicos em alta, script, visual, legenda e 10 hashtags.`,
    trends:   `Liste 5 ângulos de conteúdo em alta no nicho "${input}" para Reels e vídeos curtos com IA.`,
    hooks:    `Crie 5 ganchos para parar a rolagem no nicho "${input}" nos primeiros 3 segundos. Use os gatilhos: surpresa, medo, ego, urgência e desejo.`,
    script:   `Escreva um script de Reel sobre "${input}" com: GANCHO (0-2s), DESENVOLVIMENTO (3-25s) e CTA (26-30s). Máximo 30 segundos.`,
  };
  return prompts[tab] + referencePatterns;
}

function parseImageAssetIds(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))];
  } catch {
    throw new Error("imageAssetIds inválido");
  }
}

router.post("/tenants/:tenantId/content-studio/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const { tab, input } = req.body as { tab?: string; input?: string };
  if (!input || typeof input !== "string" || input.trim().length < 2) {
    res.status(422).json({ error: "Campo 'input' é obrigatório (mín. 2 caracteres)" }); return;
  }

  const resolvedTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "script";
  try {
    const [referencePatterns, ownPerformance] = await Promise.all([
      buildReferencePatternsPromptBlock(tenantId),
      buildOwnPerformancePromptBlock(tenantId),
    ]);
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português.",
      messages: [{ role: "user", content: buildPrompt(resolvedTab, input.trim(), ownPerformance + referencePatterns) }],
    });
    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    res.json({ result, tab: resolvedTab });
  } catch (err) {
    req.log.error({ err }, "content-studio: generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

// ─── Product video storyboard + real photo render ────────────────────────────

type UploadedProductImage = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

router.post(
  "/tenants/:tenantId/content-studio/product-video",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: 8 },
  ]),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Acesso negado" }); return;
    }

    const {
      name        = "",
      description = "",
      price       = "",
      benefits    = "",
      cta         = "Compre agora",
      format      = "reel",
      renderVideo = "false",
    } = req.body as Record<string, string>;

    if (!name.trim()) {
      res.status(422).json({ error: "Nome do produto é obrigatório" }); return;
    }

    let imageAssetIds: string[];
    try {
      imageAssetIds = parseImageAssetIds(req.body?.imageAssetIds);
    } catch (error) {
      res.status(422).json({ error: error instanceof Error ? error.message : "imageAssetIds inválido" });
      return;
    }

    if (imageAssetIds.length > 8) {
      res.status(422).json({ error: "Selecione no máximo 8 fotos da Biblioteca" });
      return;
    }

    const fileFields = (!Array.isArray(req.files) && req.files ? req.files : {}) as Record<string, UploadedProductImage[]>;
    const uploadedImages = [
      ...(fileFields["image"] ?? []),
      ...(fileFields["images"] ?? []),
    ];

    if (uploadedImages.length + imageAssetIds.length > 8) {
      res.status(422).json({ error: "Use no máximo 8 fotos no total" });
      return;
    }

    const renderMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (uploadedImages.some((file) => !renderMimeTypes.has(file.mimetype.toLowerCase()))) {
      res.status(422).json({ error: "Para gerar o vídeo, use somente fotos JPG, PNG ou WebP" });
      return;
    }
    if (uploadedImages.some((file) => file.size > 20 * 1024 * 1024)) {
      res.status(422).json({ error: "Cada foto deve ter no máximo 20 MB" });
      return;
    }

    let libraryImages: ProductVideoImage[] = [];
    try {
      libraryImages = await resolveProductVideoLibraryImages(tenantId, imageAssetIds);
    } catch (error) {
      res.status(422).json({ error: error instanceof Error ? error.message : "Falha ao carregar fotos da Biblioteca" });
      return;
    }

    const productImages: ProductVideoImage[] = [
      ...libraryImages,
      ...uploadedImages.map((file) => ({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
        size: file.size,
      })),
    ];
    const shouldRender = renderVideo === "true";
    const resolvedFormat = format === "story" ? "story" : "reel";

    if (shouldRender && !productImages.length) {
      res.status(422).json({ error: "Selecione ou envie ao menos uma foto para gerar o vídeo do produto" });
      return;
    }

    const formatLabel = resolvedFormat === "story"
      ? "Stories (9:16 vertical, 5 telas)"
      : "Reels (15-30 segundos, roteiro sequencial)";

    const textPrompt = `Você é um especialista em marketing de conteúdo para Instagram no Brasil.

Crie um storyboard completo para ${formatLabel} de um produto com as seguintes informações:

**Produto:** ${name}
**Descrição:** ${description || "não informada"}
**Preço:** ${price || "não informado"}
**Benefícios principais:** ${benefits || "não informados"}
**CTA final:** ${cta}
${productImages.length ? `\n${productImages.length} imagem(ns) do produto foram fornecidas. Use a primeira como referência visual principal e escreva cenas compatíveis com fotografias reais do produto.` : ""}

${resolvedFormat === "story"
  ? `Crie exatamente 5 telas de Story (use o formato abaixo para cada tela):

TELA 1 — GANCHO
- Duração: 3s
- Texto principal: [texto impactante, máx. 6 palavras]
- Texto secundário: [frase de apoio opcional]
- Visual: [descrição do visual/cena]

[repita para Telas 2 a 5 com: INTERESSE, PROVA/BENEFÍCIO, OFERTA, CTA]`
  : `Crie o roteiro completo do Reel com:

GANCHO (0-3s): [texto e ação]
PROBLEMA/DESEJO (3-10s): [contexto e identificação]
SOLUÇÃO/PRODUTO (10-20s): [apresentação do produto e benefícios]
PROVA SOCIAL (20-25s): [depoimento, número ou resultado]
CTA (25-30s): [chamada para ação com ${cta}]

Para cada seção: texto de tela, narração/legenda e indicação visual.`}

Ao final, sugira:
- 5 hashtags estratégicas
- Melhor horário para postar
- Música/áudio recomendado`;

    try {
      const referenceImage = productImages[0];
      const imageBlock = referenceImage
        ? [{
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (referenceImage.mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: referenceImage.buffer.toString("base64"),
            },
          }]
        : [];

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português de forma clara e estruturada.",
        messages: [{
          role: "user",
          content: [
            ...imageBlock,
            { type: "text", text: textPrompt },
          ],
        }],
      });

      const result = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");

      if (!shouldRender) {
        res.json({ result, format: resolvedFormat });
        return;
      }

      const render = await startProductPhotoVideo({
        tenantId,
        userId: req.user?.sub ?? null,
        name,
        description,
        price,
        benefits,
        cta,
        format: resolvedFormat,
        storyboard: result,
        images: productImages,
      });

      res.status(202).json({
        result,
        format: resolvedFormat,
        renderStarted: true,
        projectId: render.projectId,
        jobId: render.jobId,
      });
    } catch (err) {
      req.log.error({ err }, "content-studio: product-video failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
    }
  }
);

export default router;
