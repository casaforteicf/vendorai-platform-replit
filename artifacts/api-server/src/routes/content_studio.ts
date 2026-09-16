import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { contentGenerationsTable, db } from "@workspace/db";
import { buildReferencePatternsPromptBlock } from "../services/content-reference-creators.js";
import { buildOwnPerformancePromptBlock } from "../services/content-performance.js";
import { buildContentCreativeRuntime, buildGenerationDesignQa } from "../services/contentCreativeRuntime.js";
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

type MarketingContextInput = {
  campaignId?: string;
  campaignName?: string;
  campaignGoal?: string;
  audienceSegment?: string;
  audienceNiche?: string;
  nicheName?: string;
  productIds?: string[];
  productNames?: string[];
};

function buildPrompt(tab: Tab, input: string, referencePatterns: string, creativeContext = ""): string {
  const prompts: Record<Tab, string> = {
    workflow: `Crie um fluxo de conteúdo para Instagram no nicho "${input}": 5 tópicos em alta, script, visual, legenda e 10 hashtags.`,
    trends:   `Liste 5 ângulos de conteúdo em alta no nicho "${input}" para Reels e vídeos curtos com IA.`,
    hooks:    `Crie 5 ganchos para parar a rolagem no nicho "${input}" nos primeiros 3 segundos. Use os gatilhos: surpresa, medo, ego, urgência e desejo.`,
    script:   `Escreva um script de Reel sobre "${input}" com: GANCHO (0-2s), DESENVOLVIMENTO (3-25s) e CTA (26-30s). Máximo 30 segundos.`,
  };
  return `${prompts[tab]}\n\nCONTEXTO CRIATIVO OFICIAL DO VENDORAI:\n${creativeContext || "Use o briefing informado pelo usuário."}\n\n${referencePatterns}`;
}

function scoreGeneratedText(result: string, input: { cta?: string | null; hasBrandContext: boolean; channel: string }) {
  const normalized = result.trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hasStructure = /gancho|cta|tela|benef[ií]cio|visual|legenda|desenvolvimento/i.test(normalized);
  const requestedCta = input.cta?.trim();
  const hasCta = requestedCta
    ? normalized.toLowerCase().includes(requestedCta.toLowerCase()) || /\bcta\b|fale|saiba|compre|chame|acesse|solicite/i.test(normalized)
    : /\bcta\b|fale|saiba|compre|chame|acesse|solicite/i.test(normalized);
  const readable = wordCount >= 20 && wordCount <= 700;

  return buildGenerationDesignQa({
    brandScore: input.hasBrandContext ? 92 : 78,
    readabilityScore: readable ? 92 : 76,
    compositionScore: hasStructure ? 92 : 80,
    channelFitScore: input.channel === "instagram" ? 94 : 88,
    ctaScore: hasCta ? 94 : 68,
    technicalScore: normalized.length > 20 ? 94 : 65,
    warnings: [
      ...(!hasCta ? ["CTA não ficou claro no resultado gerado."] : []),
      ...(!hasStructure ? ["Estrutura criativa pouco explícita para o formato solicitado."] : []),
    ],
    recommendations: [
      ...(!hasCta ? ["Reforçar uma chamada para ação compatível com a campanha."] : []),
    ],
  });
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

function sanitizeProductStoryboard(value: string): string {
  const operationalSection = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:⏰|🎵|🎶)?\s*(?:MELHOR\s+HOR[ÁA]RIO(?:\s+PARA\s+POSTAR)?|M[ÚU]SICA(?:\/[ÁA]UDIO)?\s+RECOMENDAD[OA]|[ÁA]UDIO\s+RECOMENDAD[OA])\b/i.exec(value);
  const creativeOnly = operationalSection ? value.slice(0, operationalSection.index) : value;
  return creativeOnly
    .split(/\r?\n/)
    .filter((line) => !/\b(?:CapCut|Adobe\s+Premiere(?:\s+Rush)?|Reels\s+nativo|biblioteca\s+do\s+Instagram)\b/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

router.post("/tenants/:tenantId/content-studio/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const { tab, input, marketingContext } = req.body as { tab?: string; input?: string; marketingContext?: MarketingContextInput };
  if (!input || typeof input !== "string" || input.trim().length < 2) {
    res.status(422).json({ error: "Campo 'input' é obrigatório (mín. 2 caracteres)" }); return;
  }

  const resolvedTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "script";
  try {
    const audience = marketingContext?.audienceNiche || marketingContext?.audienceSegment || marketingContext?.nicheName || null;
    const creativeRuntime = await buildContentCreativeRuntime({
      tenantId,
      context: {
        campaignId: marketingContext?.campaignId ?? null,
        campaignName: marketingContext?.campaignName ?? null,
        objective: marketingContext?.campaignGoal || input.trim(),
        audience,
        productId: marketingContext?.productIds?.[0] ?? null,
        productName: marketingContext?.productNames?.[0] ?? null,
        channel: "instagram",
        format: resolvedTab === "script" ? "reel" : resolvedTab,
        message: input.trim(),
      },
    });

    const [referencePatterns, ownPerformance] = await Promise.all([
      buildReferencePatternsPromptBlock(tenantId),
      buildOwnPerformancePromptBlock(tenantId),
    ]);
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Você é um especialista em marketing digital para Instagram no Brasil. Responda sempre em português e respeite o contexto criativo oficial do tenant/campanha.",
      messages: [{ role: "user", content: buildPrompt(resolvedTab, input.trim(), ownPerformance + referencePatterns, creativeRuntime.promptContext) }],
    });
    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    const designQa = scoreGeneratedText(result, {
      cta: creativeRuntime.brief.cta,
      hasBrandContext: Boolean(creativeRuntime.creativePlan.brand.logoUrl || creativeRuntime.creativePlan.brand.tone?.length),
      channel: creativeRuntime.brief.channel,
    });
    res.json({ result, tab: resolvedTab, creativeBrief: creativeRuntime.brief, contextSources: creativeRuntime.contextSources, designQa });
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

    const creativeRuntime = await buildContentCreativeRuntime({
      tenantId,
      context: {
        objective: `promover ${name.trim()}`,
        audience: typeof req.body?.nicheId === "string" ? req.body.nicheId : null,
        productId: parseImageAssetIds(req.body?.productIds)[0] ?? null,
        productName: name.trim(),
        offer: price.trim() || null,
        channel: "instagram",
        format: resolvedFormat,
        cta: cta.trim() || "Compre agora",
        message: description.trim() || null,
        visualDirection: benefits.trim() || null,
        assetIds: imageAssetIds,
      },
    });

    const formatLabel = resolvedFormat === "story"
      ? "Stories (9:16 vertical, 5 telas)"
      : "Reels (15-30 segundos, roteiro sequencial)";

    const textPrompt = `Você é um especialista em marketing de conteúdo para Instagram no Brasil.

CONTEXTO CRIATIVO OFICIAL DO VENDORAI:
${creativeRuntime.promptContext}

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

Ao final, inclua somente 5 hashtags estratégicas.
Não recomende músicas, faixas, artistas, bibliotecas de áudio ou níveis de volume.
Não recomende melhor horário, dia, calendário ou estratégia de postagem.
Não recomende CapCut, Adobe Premiere, Instagram, Reels nativo ou qualquer ferramenta externa.
Não inclua instruções de edição nem próximos passos operacionais. O VendorAI cuidará do áudio, organização e publicação depois da renderização.`;

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
        system: "Você é o diretor criativo do VendorAI. Use o contexto de campanha, marca e canal recebido. Entregue somente conteúdo criativo que será usado diretamente na renderização. Responda em português claro e estruturado. Nunca recomende horários de postagem, músicas, artistas, bibliotecas de áudio, níveis de volume, CapCut, Adobe Premiere ou outras ferramentas externas; essas decisões são executadas pelo próprio VendorAI após o vídeo ficar pronto.",
        messages: [{
          role: "user",
          content: [
            ...imageBlock,
            { type: "text", text: textPrompt },
          ],
        }],
      });

      const rawResult = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");
      const result = sanitizeProductStoryboard(rawResult);
      const designQa = scoreGeneratedText(result, {
        cta: creativeRuntime.brief.cta,
        hasBrandContext: Boolean(creativeRuntime.creativePlan.brand.logoUrl || creativeRuntime.creativePlan.brand.tone?.length),
        channel: creativeRuntime.brief.channel,
      });

      let generationId: string | null = null;
      try {
        const [generation] = await db
          .insert(contentGenerationsTable)
          .values({
            tenantId,
            type: resolvedFormat === "story" ? "stories" : "reels",
            theme: name.trim(),
            productName: name.trim(),
            contentFormat: resolvedFormat === "story" ? "stories" : "reels",
            aspectRatio: "9:16",
            result: resolvedFormat === "story"
              ? { variations: [{ text: result, cta: cta.trim() || "Compre agora" }] }
              : { variations: [{ title: name.trim(), scenes: [], audioSuggestion: "", cta: cta.trim() || "Compre agora" }] },
          })
          .returning({ id: contentGenerationsTable.id });
        generationId = generation?.id ?? null;
      } catch (persistError) {
        req.log.warn({ err: persistError }, "content-studio: product-video generation could not be persisted");
      }

      if (!shouldRender) {
        res.json({ result, format: resolvedFormat, generationId, creativeBrief: creativeRuntime.brief, contextSources: creativeRuntime.contextSources, designQa });
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
        generationId,
        creativeBrief: creativeRuntime.brief,
        contextSources: creativeRuntime.contextSources,
        designQa,
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


// ─── Assistente IA para edição não destrutiva de vídeo ───────────────────────

type VideoAiSuggestionType = "sticker" | "cta" | "caption_motion" | "clip_motion";
type VideoAiSuggestion = {
  id: string;
  type: VideoAiSuggestionType;
  start: number;
  end: number;
  reason: string;
  layerId?: string;
  clipId?: string;
  text?: string;
  emoji?: string;
  motion?: string;
};

type VideoAiInput = {
  goal?: string;
  instructions?: string;
  channel?: string;
  ratio?: string;
  duration?: number;
  clips?: Array<{ id: string; name?: string; start: number; end: number }>;
  captions?: Array<{ id: string; start: number; end: number; text: string }>;
};

const CAPTION_AI_MOTIONS = new Set(["none", "word-pop", "word-bounce", "pulse", "karaoke"]);
const CLIP_AI_MOTIONS = new Set(["zoom-in", "zoom-out", "pan-left", "pan-right"]);
const AI_EDIT_GOAL_LABELS: Record<string, string> = {
  commercial: "mais comercial, com benefício, oferta e CTA",
  dynamic: "mais dinâmico, com retenção e variação visual",
  reel: "Reel rápido, direto e com gancho forte",
  offer: "destacar oferta, condição e chamada para ação",
  clean: "profissional, clean e institucional",
  product: "valorizar produto, demonstração e benefícios comprovados no conteúdo",
  testimonial: "priorizar depoimento, credibilidade, voz e leitura confortável",
};

const AI_EDIT_GOAL_GUIDANCE: Record<string, string> = {
  commercial: "Equilibre ritmo e clareza. Destaque benefício e CTA, sem transformar todos os segundos em efeito.",
  dynamic: "Use variação visual e movimentos curtos em pontos relevantes, preservando respiro entre destaques.",
  reel: "Fortaleça os primeiros segundos e a retenção. Prefira intervenções curtas e rápidas.",
  offer: "Destaque apenas condição, preço, urgência e CTA que estejam realmente presentes na transcrição ou orientação.",
  clean: "Mantenha edição discreta, elegante e institucional. Evite excesso de stickers e movimentos agressivos.",
  product: "Priorize demonstração, atributos e benefícios explicitamente mencionados. Não invente especificações ou resultados.",
  testimonial: "Preserve pausas e naturalidade da fala. Use legendas e movimentos sutis; evite elementos que disputem atenção com a pessoa.",
};

function bounded(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
}

function extractJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Resposta da IA sem JSON válido");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function fallbackVideoEditPlan(input: Required<Pick<VideoAiInput, "goal" | "duration" | "clips" | "captions">>) {
  const suggestions: VideoAiSuggestion[] = [];
  const captions = input.captions;
  const duration = input.duration;
  const impact = captions.find((item) => /oferta|desconto|preço|valor|agora|hoje|benef[ií]cio|resultado|novo|novidade|garantia|econom/i.test(item.text)) ?? captions[0];
  if (impact) {
    suggestions.push({ id: `fallback-caption-${impact.id}`, type: "caption_motion", start: impact.start, end: impact.end, layerId: impact.id, motion: input.goal === "clean" ? "pulse" : "word-pop", reason: "Dá ênfase à frase mais relevante sem alterar o texto falado." });
    if (input.goal !== "clean") suggestions.push({ id: `fallback-sticker-${impact.id}`, type: "sticker", start: impact.start, end: Math.min(duration, Math.max(impact.end, impact.start + 1.4)), emoji: input.goal === "offer" ? "💰" : input.goal === "product" ? "🛍️" : input.goal === "testimonial" ? "⭐" : "✨", reason: "Cria um ponto visual de atenção no trecho de maior intenção comercial." });
  }
  const firstClip = input.clips[0];
  if (firstClip && firstClip.end - firstClip.start > 1.2) {
    suggestions.push({ id: `fallback-motion-${firstClip.id}`, type: "clip_motion", start: firstClip.start, end: Math.min(firstClip.end, firstClip.start + 1.8), clipId: firstClip.id, motion: "zoom-in", reason: "Adiciona movimento curto no início para aumentar a retenção visual." });
  }
  if (duration > 1) {
    suggestions.push({ id: "fallback-cta-final", type: "cta", start: Math.max(0, duration - 4), end: duration, text: "Fale com nossa equipe", reason: "Fecha o vídeo com uma chamada clara sem inventar condição comercial." });
  }
  return { goal: input.goal, summary: "Plano seguro criado a partir da timeline e da transcrição.", suggestions, source: "fallback" as const };
}

router.post("/tenants/:tenantId/content-studio/video/ai-edit-plan", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const input = (req.body ?? {}) as VideoAiInput;
  const duration = bounded(input.duration, 0.1, 7_200);
  const clips = Array.isArray(input.clips) ? input.clips.filter((item) => item && typeof item.id === "string").slice(0, 80) : [];
  const captions = Array.isArray(input.captions)
    ? input.captions.filter((item) => item && typeof item.id === "string" && typeof item.text === "string" && item.text.trim()).slice(0, 300)
    : [];
  if (!clips.length) { res.status(422).json({ error: "Adicione ao menos um clipe antes da análise." }); return; }
  if (!captions.length) { res.status(422).json({ error: "Gere as legendas inteligentes antes da análise por IA." }); return; }

  const goal = typeof input.goal === "string" && input.goal in AI_EDIT_GOAL_LABELS ? input.goal : "commercial";
  const safeInstructions = typeof input.instructions === "string" ? input.instructions.trim().slice(0, 800) : "";
  const captionIds = new Set(captions.map((item) => item.id));
  const clipIds = new Set(clips.map((item) => item.id));
  const transcript = captions.map((item) => `[${item.start.toFixed(2)}-${item.end.toFixed(2)}] (${item.id}) ${item.text}`).join("\n");
  const clipMap = clips.map((item) => `[${item.start.toFixed(2)}-${item.end.toFixed(2)}] (${item.id}) ${item.name ?? "Clipe"}`).join("\n");

  const fallback = fallbackVideoEditPlan({ goal, duration, clips, captions });
  try {
    const creativeRuntime = await buildContentCreativeRuntime({
      tenantId,
      context: {
        objective: AI_EDIT_GOAL_LABELS[goal],
        channel: String(input.channel ?? "instagram"),
        format: String(input.ratio ?? "9:16"),
        message: safeInstructions || null,
      },
    });
    const prompt = `Crie um plano de edição de vídeo NÃO DESTRUTIVO para o editor VendorAI.\n\nCONTEXTO CRIATIVO OFICIAL:\n${creativeRuntime.promptContext}\n\nOBJETIVO: ${AI_EDIT_GOAL_LABELS[goal]}\nDIREÇÃO: ${AI_EDIT_GOAL_GUIDANCE[goal]}\nCANAL: ${String(input.channel ?? "reels")}\nFORMATO: ${String(input.ratio ?? "9:16")}\nDURAÇÃO: ${duration.toFixed(2)}s\nORIENTAÇÃO ADICIONAL: ${safeInstructions || "nenhuma"}\n\nCLIPES:\n${clipMap}\n\nTRANSCRIÇÃO SINCRONIZADA:\n${transcript}\n\nRetorne APENAS JSON válido, sem markdown, no formato:\n{\n  "summary": "resumo curto",\n  "suggestions": [\n    { "id":"s1", "type":"sticker", "start":1.2, "end":2.8, "emoji":"✨", "reason":"..." },\n    { "id":"s2", "type":"cta", "start":20, "end":24, "text":"texto curto", "reason":"..." },\n    { "id":"s3", "type":"caption_motion", "start":3, "end":5, "layerId":"id de legenda existente", "motion":"word-pop", "reason":"..." },\n    { "id":"s4", "type":"clip_motion", "start":5, "end":7, "clipId":"id de clipe existente", "motion":"zoom-in", "reason":"..." }\n  ]\n}\n\nREGRAS:\n- no máximo 8 sugestões; menos é melhor que exagerar;\n- use somente ids de clipes/legendas fornecidos;\n- caption_motion permitido: none, word-pop, word-bounce, pulse, karaoke;\n- clip_motion permitido: zoom-in, zoom-out, pan-left, pan-right;\n- stickers devem ser emojis simples e contextuais;\n- CTA deve usar apenas informação presente na fala/orientação. Se não houver CTA explícito, use uma chamada neutra como \"Fale com nossa equipe\";\n- nunca invente preço, desconto, prazo, garantia, prova social, telefone ou link;\n- não altere o conteúdo falado;\n- não aplique efeitos em todos os trechos: preserve respiro visual;\n- cada sugestão precisa explicar por que melhora retenção, clareza ou conversão.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      system: "Você é um editor profissional de vídeo curto dentro do VendorAI. Responda estritamente com JSON válido e nunca invente fatos comerciais.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content.filter((block) => block.type === "text").map((block) => (block as { type: "text"; text: string }).text).join("\n");
    const parsed = extractJsonObject(raw) as { summary?: unknown; suggestions?: unknown };
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [];
    const suggestions: VideoAiSuggestion[] = [];

    for (let index = 0; index < rawSuggestions.length; index += 1) {
      const candidate = rawSuggestions[index] as Record<string, unknown>;
      const type = String(candidate.type ?? "") as VideoAiSuggestionType;
      if (!["sticker", "cta", "caption_motion", "clip_motion"].includes(type)) continue;
      const start = bounded(candidate.start, 0, duration);
      const end = bounded(candidate.end, Math.min(duration, start + 0.1), duration);
      if (end <= start) continue;
      const suggestion: VideoAiSuggestion = {
        id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `ai-${type}-${index + 1}`,
        type,
        start,
        end,
        reason: typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 240) : "Melhoria sugerida pela IA.",
      };
      if (type === "sticker") suggestion.emoji = typeof candidate.emoji === "string" ? candidate.emoji.trim().slice(0, 12) : "✨";
      if (type === "cta") suggestion.text = typeof candidate.text === "string" && candidate.text.trim() ? candidate.text.trim().slice(0, 100) : "Fale com nossa equipe";
      if (type === "caption_motion") {
        const layerId = String(candidate.layerId ?? "");
        const motion = String(candidate.motion ?? "word-pop");
        if (!captionIds.has(layerId) || !CAPTION_AI_MOTIONS.has(motion)) continue;
        suggestion.layerId = layerId;
        suggestion.motion = motion;
      }
      if (type === "clip_motion") {
        const clipId = String(candidate.clipId ?? "");
        const motion = String(candidate.motion ?? "zoom-in");
        if (!clipIds.has(clipId) || !CLIP_AI_MOTIONS.has(motion)) continue;
        suggestion.clipId = clipId;
        suggestion.motion = motion;
      }
      suggestions.push(suggestion);
    }

    if (!suggestions.length) {
      res.json({ plan: fallback });
      return;
    }
    const designQa = buildGenerationDesignQa({
      brandScore: creativeRuntime.creativePlan.brand.logoUrl || creativeRuntime.creativePlan.brand.tone?.length ? 90 : 78,
      readabilityScore: 90,
      compositionScore: suggestions.length <= 8 ? 92 : 72,
      channelFitScore: 92,
      ctaScore: suggestions.some((item) => item.type === "cta") ? 92 : 72,
      technicalScore: 94,
      warnings: suggestions.some((item) => item.type === "cta") ? [] : ["Plano de edição sem CTA explícito."],
    });
    res.json({ plan: { goal, summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 320) : "Plano de edição criado a partir da fala e da timeline.", suggestions, source: "ai" }, creativeBrief: creativeRuntime.brief, designQa });
  } catch (err) {
    req.log.warn({ err, tenantId }, "content-studio: AI edit plan fell back to deterministic plan");
    res.json({ plan: fallback });
  }
});

export default router;