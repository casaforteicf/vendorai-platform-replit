import { getOpenAIForTenant } from "./agent-engine.js";
import { callOpenAI as gatewayCallOpenAI } from "./ai-gateway.js";
import { captureGeneratedMedia } from "../services/media-library.js";
import { toFile } from "openai";
import { callReplicateFlux11Pro } from "./arch-render-pipeline.js";
import type {
  FeedVariation,
  StoriesVariation,
  ReelsVariation,
  LinkedInVariation,
  YouTubeVariation,
  ContentGenerationResult,
  ContentType,
  ContentVariation,
} from "@workspace/db";

interface TenantProfile {
  nomeFantasia?: string | null;
  vertical?: string | null;
  missao?: string | null;
  publicoAlvo?: string | null;
  diferenciais?: string | null;
  tomDeVoz?: string | null;
  discoveryData?: unknown;
}

function buildBrandContext(profile: TenantProfile): string {
  const lines: string[] = [];
  if (profile.nomeFantasia) lines.push(`Empresa: ${profile.nomeFantasia}`);
  if (profile.vertical) lines.push(`Segmento: ${profile.vertical}`);
  if (profile.missao) lines.push(`Missão/Proposta: ${profile.missao}`);
  if (profile.publicoAlvo) lines.push(`Público-alvo: ${profile.publicoAlvo}`);
  if (profile.diferenciais) lines.push(`Diferenciais: ${profile.diferenciais}`);
  if (profile.tomDeVoz) lines.push(`Tom de voz: ${profile.tomDeVoz}`);
  const disc = profile.discoveryData as Record<string, unknown> | null | undefined;
  if (Array.isArray(disc?.["coresBrand"]) && (disc["coresBrand"] as string[]).length > 0) {
    lines.push(`Cores da marca: ${(disc["coresBrand"] as string[]).join(", ")}`);
  }
  if (typeof disc?.["sloganMarca"] === "string" && disc["sloganMarca"]) {
    lines.push(`Slogan: ${disc["sloganMarca"]}`);
  }
  return lines.join("\n") || "Empresa sem contexto definido.";
}

// ── SEGMENT_STYLE_MAP ─────────────────────────────────────────────────────────
// Maps the tenant's vertical/segment to a visual style block for image prompts.
// SEGMENT_STYLE_BLOCK = scene/environment/lighting (Flux prompt context).
// BRAND_STYLE_BLOCK   = colors/identity (accent layer — never overrides scene palette).

interface SegmentStyle { scene: string; palette: string; lighting: string; mood: string }

const SEGMENT_STYLE_MAP: [string, SegmentStyle][] = [
  ["construção civil", { scene: "freshly finished construction interior, exposed concrete, premium building materials organized on clean floor", palette: "warm grays, cement tones, sandy beige, clean whites", lighting: "natural daylight through large windows, soft diffused shadows", mood: "solid and professional" }],
  ["construção",       { scene: "modern construction site or finished renovation, high-quality materials prominently displayed", palette: "warm grays, cement tones, beige", lighting: "bright daylight or clean interior", mood: "professional and durable" }],
  ["reforma",          { scene: "renovated residential interior before-and-after, clean modern surfaces, tile or flooring detail", palette: "neutral whites, warm grays, warm wood tones", lighting: "bright interior with natural light", mood: "transformation and craftsmanship" }],
  ["arquitetura",      { scene: "elegant architectural space, high-end residential or commercial project, premium interior design", palette: "sophisticated neutrals, charcoal, warm whites, natural stone tones", lighting: "dramatic architectural lighting, golden hour", mood: "luxurious and refined" }],
  ["design de interiores", { scene: "curated designer interior, signature furniture pieces in a contemporary showroom or residence", palette: "minimalist neutrals with strong accent colors, premium materials", lighting: "soft diffused studio lighting, elegant shadows", mood: "modern and sophisticated" }],
  ["design",           { scene: "contemporary studio or showroom, curated objects and surfaces", palette: "minimalist neutrals, accent tones", lighting: "soft diffused light, elegant composition", mood: "modern and sophisticated" }],
  ["marcenaria",       { scene: "beautifully crafted wooden furniture in warm residential interior, natural wood grain visible, workshop or showroom", palette: "warm oak, walnut, pine tones, cream whites, warm grays", lighting: "warm residential lighting, golden hour side light", mood: "warm and residential" }],
  ["móveis",           { scene: "modern furniture showroom or styled living space, premium furniture as focal point", palette: "warm neutrals, natural wood, soft whites", lighting: "warm showroom or natural window light", mood: "cozy and aspirational" }],
  ["saúde",            { scene: "clean modern medical office or wellness center with natural elements, clinical and organized", palette: "clean whites, soft aqua, sage green, light gray", lighting: "bright clinical even lighting", mood: "clinical and bright" }],
  ["clínica",          { scene: "upscale aesthetic clinic, elegant treatment room, premium medical-grade equipment", palette: "clean whites, soft rose, nude tones, subtle gold", lighting: "warm flattering clinical lighting", mood: "premium and trustworthy" }],
  ["estética",         { scene: "luxury beauty and aesthetics studio, soft botanicals, marble surfaces, elegant treatment setting", palette: "rose gold, soft white, blush, nude tones", lighting: "warm and flattering, soft shadows", mood: "glamorous and self-care focused" }],
  ["beleza",           { scene: "elegant beauty salon or spa, premium skincare products on marble surface, floral accents", palette: "soft pinks, gold accents, clean whites, blush tones", lighting: "warm flattering lighting, soft ring-light glow", mood: "glamorous and aspirational" }],
  ["imobiliária",      { scene: "well-staged premium residential interior or architectural exterior, real estate photography style", palette: "clean whites, warm beiges, natural light tones, greenery accents", lighting: "bright natural daylight, wide angle", mood: "aspirational and welcoming" }],
  ["imóveis",          { scene: "premium residential or commercial property, beautifully staged interior with lifestyle props", palette: "neutral warm tones, cream, light oak", lighting: "golden hour exterior or bright interior natural light", mood: "aspirational and professional" }],
  ["autopeças",        { scene: "clean auto parts store or technical workshop, organized parts shelving, garage environment with metallic surfaces", palette: "industrial grays, metallic silver, deep black, red accents", lighting: "bright workshop fluorescent, clean and even", mood: "clean and technical" }],
  ["distribuidora",    { scene: "organized warehouse or distribution center, product shelves neatly stacked, professional industrial environment", palette: "clean whites, industrial blues, metallic accents", lighting: "bright warehouse lighting, even and shadowless", mood: "organized and reliable" }],
  ["atacado",          { scene: "large warehouse with organized pallets, bulk product display, logistics environment", palette: "neutral industrial tones, clean whites", lighting: "bright commercial lighting", mood: "efficient and volume-focused" }],
  ["academia",         { scene: "modern fitness gym interior, premium exercise equipment, high-energy training environment", palette: "bold dark tones, neon accents, steel gray, high contrast black", lighting: "dramatic gym lighting, strong and directional", mood: "energetic and motivational" }],
  ["fitness",          { scene: "dynamic fitness setting or outdoor workout, active lifestyle moment", palette: "vibrant energetic colors, high contrast, sporty tones", lighting: "natural outdoor light or dramatic gym lighting", mood: "high-energy and inspiring" }],
  ["moda",             { scene: "fashion editorial setting, styled flat-lay or boutique interior, clothing as art", palette: "fashion-forward seasonal palette, high-contrast editorial tones", lighting: "fashion photography studio or golden hour lifestyle", mood: "stylish and trendy" }],
  ["varejo",           { scene: "retail store interior, curated product display, modern boutique environment", palette: "clean retail presentation, bright and inviting tones", lighting: "bright retail product-focused lighting", mood: "inviting and commercial" }],
  ["restaurante",      { scene: "restaurant interior or table setting, beautifully plated food on elegant table, ambient decor", palette: "warm amber, terracotta, cream, deep wood tones", lighting: "warm restaurant ambient lighting, candle glow accents", mood: "appetizing and inviting" }],
  ["supermercado",     { scene: "supermarket shelving or fresh produce section, clean commercial display, abundance of product", palette: "fresh greens, clean whites, vibrant reds and yellows", lighting: "bright commercial store lighting, fresh and even", mood: "fresh and value-driven" }],
  ["alimentação",      { scene: "artisan food photography with natural ingredients, kitchen or rustic table setting", palette: "earthy warm tones, fresh greens, natural food colors", lighting: "soft natural window light, food photography standard", mood: "appetizing and authentic" }],
  ["tecnologia",       { scene: "modern tech office or product studio, clean desk setup with digital screens", palette: "cool blues, grays, white, dark mode accents", lighting: "cool modern studio lighting, screen glow", mood: "innovative and clean" }],
  ["educação",         { scene: "modern educational environment, classroom or online learning setup with organized materials", palette: "bright blues, greens, whites, academic tones", lighting: "bright natural or studio light", mood: "inspiring and professional" }],
];

const DEFAULT_SEGMENT_STYLE: SegmentStyle = {
  scene:    "clean professional product photography studio, neutral elegant background",
  palette:  "neutral grays and whites, subtle warm accents",
  lighting: "professional studio lighting, soft and even, minimal shadows",
  mood:     "clean and professional",
};

function getSegmentStyle(vertical: string | null | undefined): SegmentStyle {
  if (!vertical) return DEFAULT_SEGMENT_STYLE;
  const v = vertical.toLowerCase();
  for (const [key, style] of SEGMENT_STYLE_MAP) {
    if (v.includes(key)) return style;
  }
  return DEFAULT_SEGMENT_STYLE;
}

function buildSegmentStyleBlock(vertical: string | null | undefined): string {
  const s = getSegmentStyle(vertical);
  return `Scene and environment: ${s.scene}. Environment palette: ${s.palette}. Lighting: ${s.lighting}. Mood: ${s.mood}.`;
}

function buildBrandStyleBlock(profile: TenantProfile): string {
  const disc = profile.discoveryData as Record<string, unknown> | null | undefined;
  const brandColors = Array.isArray(disc?.["coresBrand"]) && (disc["coresBrand"] as string[]).length > 0
    ? (disc["coresBrand"] as string[]).join(", ")
    : null;
  const brand = profile.nomeFantasia || "the brand";
  const parts: string[] = [`Brand: "${brand}".`];
  if (brandColors) {
    parts.push(`Use the brand colors (${brandColors}) as accent tones on product, packaging, props or subtle design elements — never override the scene's environment palette.`);
  }
  return parts.join(" ");
}

async function saveImageFromUrl(
  tenantId: string,
  url: string,
  operation: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download generated image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const captured = await captureGeneratedMedia({
    tenantId,
    title: "Imagem gerada — Content Studio",
    operation,
    buffer: buf,
    mimeType,
    type: "image",
    originalFilename: `content-${crypto.randomUUID()}.${extension}`,
    kind: "mixed",
    metadata: { module: "content_studio", generatedByAi: true, ...metadata },
  });
  const servePath = captured.storageUrl.replace(/^\/objects\//, "");
  return `/api/storage/objects/${servePath}`;
}

function verticalHints(vertical: string | null | undefined): string {
  const v = vertical ?? "";
  if (v.includes("Varejo") || v.includes("Moda") || v.includes("Roupa") || v.includes("Acessório")) {
    return `CONTEXTO VERTICAL — MODA & VAREJO: Use linguagem voltada a moda, estilo e tendências. Mencione quando relevante: coleções sazonais, grade de tamanhos disponíveis (P/M/G/GG), looks, combinações, estilo de vida, tendências da estação. Utilize emojis de moda (👗👠👜✨) e hashtags como #moda #estilo #ootd #look #tendência #novacoleção.`;
  }
  if (v.includes("Supermercado") || v.includes("Mercado") || v.includes("Atacado")) {
    return `CONTEXTO VERTICAL — SUPERMERCADO: Use linguagem de conveniência, economia e qualidade. Destaque preços promocionais, produtos frescos, hortifrúti, ofertas relâmpago, combos e variedade. Sugira receitas ou utilizações do produto quando pertinente. Use emojis de alimentação (🛒🥩🥦🍎💰) e hashtags como #oferta #economize #fresquinho #supermercado #promoção.`;
  }
  if (v.includes("Construção") || v.includes("Reforma") || v.includes("Civil")) {
    return `CONTEXTO VERTICAL — CONSTRUÇÃO & REFORMA: Use linguagem técnica mas acessível. Enfatize qualidade dos materiais, durabilidade, acabamento, prazo de entrega e suporte técnico. Mencione quando relevante: tipo de obra, área de aplicação, normas técnicas. Use emojis de construção (🏗️🔨⚙️🏠✅) e hashtags como #construção #reforma #materiais #obra #engenharia #acabamento.`;
  }
  return "";
}

const IMAGE_MODELS_PRIORITY = [
  "gpt-image-1",
  "chatgpt-image-latest",
  "dall-e-3",
  "dall-e-2",
];

async function saveB64Image(
  tenantId: string,
  b64: string,
  operation: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const buf = Buffer.from(b64, "base64");
  const captured = await captureGeneratedMedia({
    tenantId,
    title: "Imagem gerada — Content Studio",
    operation,
    buffer: buf,
    mimeType: "image/png",
    type: "image",
    originalFilename: `content-${crypto.randomUUID()}.png`,
    kind: "mixed",
    metadata: { module: "content_studio", generatedByAi: true, ...metadata },
  });
  const servePath = captured.storageUrl.replace(/^\/objects\//, "");
  return `/api/storage/objects/${servePath}`;
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const url = imageUrl.startsWith("/")
    ? `http://localhost:${process.env["PORT"] ?? 8080}${imageUrl}`
    : imageUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar imagem de referência: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Generates images using the client's existing image as reference (AI editing/improvement)
export async function generateImagesWithReference(
  tenantId: string,
  referenceImageUrl: string,
  editPrompt: string,
  imageCount: number = 1,
): Promise<string[]> {
  if (imageCount < 1) imageCount = 1;
  if (imageCount > 10) imageCount = 10;
  const openai = await getOpenAIForTenant(tenantId);
  const results: string[] = [];

  let referenceBuffer: Buffer;
  try {
    referenceBuffer = await fetchImageBuffer(referenceImageUrl);
  } catch {
    throw new Error("Não foi possível carregar a imagem de referência. Verifique se ela está acessível.");
  }

  const imagePromises = Array.from({ length: imageCount }, async (_, i) => {
    const variantPrompt = imageCount > 1
      ? `${editPrompt} Variation ${i + 1}: slightly different angle or perspective than other variations.`
      : editPrompt;

    // Try image editing with gpt-image-1 models first
    for (const model of ["gpt-image-1", "chatgpt-image-latest"]) {
      try {
        const imageFile = await toFile(referenceBuffer, "reference.png", { type: "image/png" });
        const response = await (openai.images as any).edit({
          model,
          image: imageFile,
          prompt: variantPrompt,
          n: 1,
          size: "1024x1024",
        });
        const item = Array.isArray((response as any)?.data) ? (response as any).data[0] : undefined;
        if (!item) continue;
        if (item.b64_json) return await saveB64Image(tenantId, item.b64_json, "content_reference_image");
        if (item.url) return item.url as string;
      } catch {
        // Try next model
      }
    }

    // Fallback: generate from scratch with a descriptive prompt
    for (const model of IMAGE_MODELS_PRIORITY) {
      try {
        const response = await openai.images.generate({
          model,
          prompt: variantPrompt,
          n: 1,
          size: "1024x1024",
        } as Parameters<typeof openai.images.generate>[0]);
        const item = Array.isArray((response as any)?.data) ? (response as any).data[0] : undefined;
        if (!item) continue;
        if ((item as any).b64_json) return await saveB64Image(tenantId, (item as any).b64_json, "content_reference_edit", { prompt: variantPrompt, referenceImageUrl });
        if ((item as any).url) return await saveImageFromUrl(tenantId, (item as any).url as string, "content_reference_generation", { prompt: variantPrompt, referenceImageUrl });
      } catch {
        // Try next model
      }
    }

    throw new Error(`Nenhum modelo retornou resultado para imagem ${i + 1}`);
  });

  return await Promise.all(imagePromises);
}

/**
 * IMAGE_CONCEPTS defines fundamentally different visual directions for each image slot.
 * Slot 0 → hero product shot; Slot 1 → lifestyle / sensation; Slot 2+ → supporting angles.
 * Each concept produces a prompt that stands alone — no shared base prompt.
 */
const IMAGE_CONCEPTS: Array<{
  label: string;
  buildPrompt: (brand: string, subject: string, style: string, format: string, obs: string) => string;
}> = [
  {
    label: "hero-product",
    buildPrompt: (brand, subject, style, format, obs) =>
      `Professional hero product photograph for Instagram ${format} post. Brand: "${brand}". Subject: ${subject}. ${obs}Clean studio setup, perfect lighting, neutral or elegantly textured background, product centered and sharp, premium commercial photography. Style: ${style}. No text. No watermarks. No people. Focus 100% on the product itself.`,
  },
  {
    label: "lifestyle-sensation",
    buildPrompt: (brand, subject, style, format, obs) =>
      `Aspirational lifestyle Instagram ${format} image for the brand "${brand}". Concept: show the FEELING and SENSATION that ${subject} creates in the customer's life — not the product itself, but the emotion, transformation, and lifestyle it enables. ${obs}Authentic scene with natural light, warm atmosphere, real environment where this product fits. People interacting naturally if relevant. Evokes desire, aspiration, and positive emotion. Style: ${style}. No text. No watermarks.`,
  },
  {
    label: "detail-texture",
    buildPrompt: (brand, subject, style, format, obs) =>
      `Close-up macro detail photograph for Instagram ${format} for brand "${brand}". Subject: ${subject}. ${obs}Extreme close-up highlighting textures, materials, craftsmanship and quality. Shallow depth of field (f/2.0), soft bokeh background, dramatic lighting to reveal surface details. Conveys premium quality and attention to detail. Style: ${style}. No text. No watermarks.`,
  },
  {
    label: "context-in-use",
    buildPrompt: (brand, subject, style, format, obs) =>
      `Contextual in-use Instagram ${format} photograph for brand "${brand}". Subject: ${subject}. ${obs}Product shown in its natural environment being used in a real-world scenario. Authentic and relatable setting with natural light. Tells a story about the product's purpose and benefit. Style: ${style}. No text. No watermarks.`,
  },
  {
    label: "flat-lay",
    buildPrompt: (brand, subject, style, format, obs) =>
      `Elegant overhead flat-lay composition for Instagram ${format} for brand "${brand}". Subject: ${subject}. ${obs}Top-down shot, product arranged with complementary props and textures that reinforce the brand identity. Symmetrical or artfully asymmetrical layout. Premium styling on elegant surface. Style: ${style}. No text. No watermarks.`,
  },
];

function getImageSize(model: string, aspectRatio?: string): "1024x1024" | "1024x1536" | "1024x1792" {
  if (aspectRatio === "9:16" || aspectRatio === "4:5") {
    if (model === "gpt-image-1" || model === "chatgpt-image-latest") return "1024x1536";
    if (model === "dall-e-3") return "1024x1792";
  }
  return "1024x1024";
}

export async function generateImagesForContent(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  format: "feed" | "stories",
  imageCount: number = 1,
  style?: string,
  referenceImageUrl?: string,
  observations?: string,
  aspectRatio?: string,
): Promise<string[]> {
  if (imageCount < 1) imageCount = 1;
  if (imageCount > 10) imageCount = 10;

  const brand = profile.nomeFantasia || "a empresa";
  const subject = productName ? `${productName} — ${theme}` : theme;
  const observationsNote = observations ? `Client-specific request: ${observations}. ` : "";

  const formatLabel = (() => {
    if (aspectRatio === "9:16") return format === "stories" ? "Stories (vertical, 9:16 portrait)" : "Reels (vertical, 9:16 portrait)";
    if (aspectRatio === "4:5") return "Feed portrait (4:5 ratio, vertical)";
    return "Feed square (1:1 ratio)";
  })();

  // Flux aspect_ratio values
  const fluxAspectRatio = aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:5" ? "4:5" : "1:1";

  // When a reference image is available, use OpenAI image editing (unchanged)
  if (referenceImageUrl) {
    const editPrompt = `Improve this product/marketing image for Instagram ${formatLabel} post for the brand "${brand}". Subject: ${subject}. Keep the same product and subject matter. ${observationsNote}Improve: lighting, sharpness, color, composition. Professional Instagram marketing quality. No text. No watermarks.`;
    return generateImagesWithReference(tenantId, referenceImageUrl, editPrompt, imageCount);
  }

  // Build style blocks for Flux prompt (Passo 2 — segment + brand)
  const segmentBlock = buildSegmentStyleBlock(profile.vertical);
  const brandBlock = buildBrandStyleBlock(profile);
  const styleContext = style ?? `${segmentBlock} ${brandBlock}`;

  const imagePromises = Array.from({ length: imageCount }, async (_, i) => {
    const concept = IMAGE_CONCEPTS[i % IMAGE_CONCEPTS.length];
    const fullPrompt = concept.buildPrompt(brand, subject, styleContext, formatLabel, observationsNote);

    // Primary: Flux 1.1 Pro via Replicate
    try {
      const outputUrl = await callReplicateFlux11Pro({ prompt: fullPrompt, aspectRatio: fluxAspectRatio });
      return await saveImageFromUrl(tenantId, outputUrl, "content_image_generation", { prompt: fullPrompt, theme, productName, format, aspectRatio: fluxAspectRatio, provider: "replicate" });
    } catch {
      // Fallback: OpenAI image generation
    }

    const openai = await getOpenAIForTenant(tenantId);
    let lastError: unknown;
    for (const model of IMAGE_MODELS_PRIORITY) {
      try {
        const size = getImageSize(model, aspectRatio);
        const response = await openai.images.generate({
          model,
          prompt: fullPrompt,
          n: 1,
          size,
          ...(model === "dall-e-3" ? { quality: "standard" } : {}),
        } as Parameters<typeof openai.images.generate>[0]);
        const item = "data" in response && Array.isArray(response.data) ? response.data[0] : undefined;
        if (!item) continue;
        if ("url" in item && item.url) return await saveImageFromUrl(tenantId, item.url as string, "content_image_generation", { prompt: fullPrompt, theme, productName, format, aspectRatio, model });
        if ("b64_json" in item && item.b64_json) return await saveB64Image(tenantId, item.b64_json, "content_image_generation", { prompt: fullPrompt, theme, productName, format, aspectRatio, model });
      } catch (err) { lastError = err; }
    }
    throw lastError ?? new Error(`Nenhum modelo retornou resultado para imagem ${i + 1}`);
  });

  return await Promise.all(imagePromises);
}

export async function describeImage(imageUrl: string, tenantId: string): Promise<string> {
  const imgContent: import("openai").OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: "Descreva esta imagem em detalhes para que eu possa usar a descrição como prompt para gerar uma imagem similar. Inclua: objetos principais, composição, cores, iluminação, estilo, ambiente e qualquer detalhes visuais importantes. Escreva em português." },
    { type: "image_url", image_url: { url: imageUrl } },
  ];
  const result = await gatewayCallOpenAI(
    tenantId,
    "media_interpretation",
    [{ role: "user", content: imgContent } as any],
    { model: "gpt-4o-mini", maxTokens: 500 },
  );
  return result.content || "Imagem sem descrição disponível";
}

export interface ContentStrategyHints {
  customerPain?: string;
  postObjective?: string;
  voiceTone?: string;
  desiredCta?: string;
  /** Bloco pronto de padrões dos criadores de referência (ver
   * content-reference-creators.ts) — texto livre já formatado, injetado
   * como está, sem parsing aqui. */
  referencePatterns?: string;
}

const POST_OBJECTIVE_LABELS: Record<string, string> = {
  atrair_dor: "Atrair atenção pra dor",
  prova_social: "Prova social",
  educar: "Educar",
  vender_direto: "Vender direto",
  bastidores: "Bastidores",
};
const VOICE_TONE_LABELS: Record<string, string> = {
  direto_comercial: "Direto e comercial",
  storytelling: "Storytelling",
  educativo: "Educativo",
  bastidores_casual: "Bastidores casual",
};
const CTA_LABELS: Record<string, string> = {
  comentar_palavra: "peça ao seguidor para comentar uma palavra-chave",
  chamar_direct: "convide o seguidor a chamar no direct",
  clicar_link: "direcione o seguidor para clicar no link da bio",
  sem_cta: "NÃO inclua nenhuma chamada para ação — finalize o post naturalmente",
};

function buildStrategyBlock(s?: ContentStrategyHints): string {
  let block = "";

  if (s?.customerPain) {
    const objective = s.postObjective ? (POST_OBJECTIVE_LABELS[s.postObjective] ?? s.postObjective) : null;
    const tone      = s.voiceTone     ? (VOICE_TONE_LABELS[s.voiceTone]         ?? s.voiceTone)     : null;
    const cta       = s.desiredCta    ? (CTA_LABELS[s.desiredCta]                ?? s.desiredCta)    : null;

    const parts: string[] = [
      `Crie um post que ataca a dor: "${s.customerPain}".`,
    ];
    if (objective) parts.push(`Objetivo: ${objective}.`);
    if (tone)      parts.push(`Tom de voz: ${tone}.`);
    if (cta)       parts.push(s.desiredCta === "sem_cta" ? `${cta}.` : `Termine com CTA que ${cta}.`);

    block += `\nINSTRUÇÃO ESTRATÉGICA (siga à risca — tem prioridade sobre qualquer padrão genérico): ${parts.join(" ")}\n`;
  }

  if (s?.referencePatterns) block += s.referencePatterns;

  return block;
}

export async function generateFeedContent(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  imageCount: number = 1,
  productExtra?: string,
  referenceImageUrls?: string[],
  aspectRatio?: string,
  strategy?: ContentStrategyHints,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);
  const strategyBlock = buildStrategyBlock(strategy);

  let subjectLines: string[] = [];
  if (productName) {
    subjectLines.push(`Produto/serviço: ${productName}`);
    if (productExtra) subjectLines.push(productExtra);
    subjectLines.push(`Tema/ângulo da publicação: ${theme}`);
  } else {
    subjectLines.push(`Tema da publicação: ${theme}`);
  }
  const subject = subjectLines.join("\n");

  const prompt = `Você é um copywriter especialista em Instagram para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}
${subject}
${strategyBlock}
Crie ${variationsCount} variações distintas de legenda para o Feed do Instagram. Cada variação deve ter:
- Uma legenda completa e envolvente (2-4 parágrafos, emojis contextuais, linguagem alinhada ao tom da marca)
- 15 a 20 hashtags relevantes e estratégicas

Retorne SOMENTE JSON válido no formato:
{"variations": [{"caption": "...", "hashtags": ["#hashtag1", "#hashtag2"]}]}`;

  const textResult = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
  );

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: Omit<FeedVariation, "imageUrl">[];
  };

  const refImages = referenceImageUrls && referenceImageUrls.length > 0 ? referenceImageUrls : null;
  const variations: FeedVariation[] = (raw.variations ?? []).map((v, i) => ({
    ...v,
    ...(refImages ? { imageUrl: refImages[i % refImages.length] } : {}),
    ...(refImages && refImages.length > 1 ? { imageUrls: refImages } : {}),
  }));

  return {
    result: { variations },
    tokensUsed,
  };
}

export async function generateStoriesContent(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  imageCount: number = 1,
  productExtra?: string,
  referenceImageUrls?: string[],
  aspectRatio?: string,
  strategy?: ContentStrategyHints,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);
  const strategyBlock = buildStrategyBlock(strategy);

  let subjectLines: string[] = [];
  if (productName) {
    subjectLines.push(`Produto/serviço: ${productName}`);
    if (productExtra) subjectLines.push(productExtra);
    subjectLines.push(`Tema: ${theme}`);
  } else {
    subjectLines.push(`Tema: ${theme}`);
  }
  const subject = subjectLines.join("\n");

  const prompt = `Você é um copywriter especialista em Instagram Stories para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}
${subject}
${strategyBlock}
Crie ${variationsCount} variações distintas de conteúdo para Stories do Instagram. Cada variação deve ter:
- Um texto curto e impactante (máximo 3 linhas — precisa caber na tela do Stories)
- Um CTA (call-to-action) claro e direto (ex: "Arrasta pra cima", "Clica no link da bio", "Manda mensagem")

Retorne SOMENTE JSON válido no formato:
{"variations": [{"text": "...", "cta": "..."}]}`;

  const textResult = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
  );

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: Omit<StoriesVariation, "imageUrl">[];
  };

  const refImages = referenceImageUrls && referenceImageUrls.length > 0 ? referenceImageUrls : null;
  const variations: StoriesVariation[] = (raw.variations ?? []).map((v, i) => ({
    ...v,
    ...(refImages ? { imageUrl: refImages[i % refImages.length] } : {}),
    ...(refImages && refImages.length > 1 ? { imageUrls: refImages } : {}),
  }));

  return {
    result: { variations },
    tokensUsed,
  };
}

export async function generateReelsScript(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  productExtra?: string,
  strategy?: ContentStrategyHints,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);
  const strategyBlock = buildStrategyBlock(strategy);

  let subjectLines: string[] = [];
  if (productName) {
    subjectLines.push(`Produto/serviço: ${productName}`);
    if (productExtra) subjectLines.push(productExtra);
    subjectLines.push(`Tema: ${theme}`);
  } else {
    subjectLines.push(`Tema: ${theme}`);
  }
  const subject = subjectLines.join("\n");

  const prompt = `Você é um roteirista especialista em Reels do Instagram para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}
${subject}
${strategyBlock}
Crie ${variationsCount} roteiros distintos para Reels do Instagram (vídeos de 15-60 segundos). Cada roteiro deve ter:
- Título chamativo para o Reel
- 5 a 7 cenas detalhadas com: visual sugerido, fala/texto na tela, duração estimada
- Sugestão de trilha sonora ou trend de áudio
- CTA final

Retorne SOMENTE JSON válido no formato:
{"variations": [{"title": "...", "scenes": [{"visual": "...", "fala": "...", "duracao": "5s"}], "audioSuggestion": "...", "cta": "..."}]}`;

  const textResult = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
  );

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: ReelsVariation[];
  };
  return {
    result: { variations: raw.variations ?? [] },
    tokensUsed,
  };
}

// D-LinkedIn: LinkedIn tem tom diferente do Instagram -- profissional, sem
// emoji excessivo, foco em autoridade/resultado de negócio em vez de
// venda direta. Sem geração de imagem (post de texto puro é o formato
// mais nativo e performático no LinkedIn).
export async function generateLinkedInContent(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  productExtra?: string,
  strategy?: ContentStrategyHints,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);
  const strategyBlock = buildStrategyBlock(strategy);

  let subjectLines: string[] = [];
  if (productName) {
    subjectLines.push(`Produto/serviço: ${productName}`);
    if (productExtra) subjectLines.push(productExtra);
    subjectLines.push(`Tema/ângulo da publicação: ${theme}`);
  } else {
    subjectLines.push(`Tema da publicação: ${theme}`);
  }
  const subject = subjectLines.join("\n");

  const prompt = `Você é um copywriter especialista em LinkedIn para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}
${subject}
${strategyBlock}
Crie ${variationsCount} variações distintas de post para o LinkedIn. Diferente do Instagram, o tom aqui é profissional e
consultivo -- fala pra tomador de decisão B2B, foca em autoridade e resultado de negócio, não em venda direta. Cada variação deve ter:
- Um "hook" (primeira linha, que aparece antes do "ver mais" -- precisa parar o scroll sozinho)
- Corpo do post (3-6 parágrafos curtos, quebras de linha frequentes -- formato nativo do LinkedIn, sem emoji em excesso)
- 3 a 5 hashtags profissionais (não use hashtag genérica de Instagram tipo #instagood)

Retorne SOMENTE JSON válido no formato:
{"variations": [{"hook": "...", "caption": "...", "hashtags": ["#hashtag1", "#hashtag2"]}]}`;

  const textResult = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.8 },
  );

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: LinkedInVariation[];
  };
  return {
    result: { variations: raw.variations ?? [] },
    tokensUsed,
  };
}

// D-YouTube: gera ROTEIRO + título + descrição pra gravação -- não gera
// vídeo de verdade (nenhuma ferramenta do sistema produz vídeo do zero
// hoje). A pessoa grava seguindo o roteiro; o texto de título/descrição/
// tags já sai pronto pra colar na hora de publicar.
export async function generateYouTubeScript(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  productExtra?: string,
  strategy?: ContentStrategyHints,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);
  const strategyBlock = buildStrategyBlock(strategy);

  let subjectLines: string[] = [];
  if (productName) {
    subjectLines.push(`Produto/serviço: ${productName}`);
    if (productExtra) subjectLines.push(productExtra);
    subjectLines.push(`Tema: ${theme}`);
  } else {
    subjectLines.push(`Tema: ${theme}`);
  }
  const subject = subjectLines.join("\n");

  const prompt = `Você é um roteirista especialista em YouTube para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}
${subject}
${strategyBlock}
Crie ${variationsCount} roteiros distintos para vídeo de YouTube (3-8 minutos, formato educativo/institucional). Cada roteiro deve ter:
- Título otimizado para busca e cliques (máx 70 caracteres)
- Descrição do vídeo pronta pra colar no YouTube (2-3 parágrafos + call to action)
- 8 a 12 tags de busca
- Roteiro em blocos: Gancho (primeiros 15s, por que continuar assistindo), Desenvolvimento (pontos principais, um por bloco, com o que falar em cada um), Encerramento (resumo + CTA)

Retorne SOMENTE JSON válido no formato:
{"variations": [{"titulo": "...", "descricao": "...", "tags": ["tag1", "tag2"], "roteiro": [{"bloco": "Gancho", "conteudo": "..."}, {"bloco": "Desenvolvimento", "conteudo": "..."}, {"bloco": "Encerramento", "conteudo": "..."}]}]}`;

  const textResult = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.8 },
  );

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: YouTubeVariation[];
  };
  return {
    result: { variations: raw.variations ?? [] },
    tokensUsed,
  };
}

export interface ContentStrategy {
  strategy: string;
  prompts: string[];
  headlines: string[];
  ctas: string[];
  captions: string[];
  hashtags: string[];
  approaches: string[];
  visualStyle: string;
}

export async function generateContentStrategy(
  profile: TenantProfile,
  tenantId: string,
  command: string,
  contentType: string,
  variationsCount: number,
  referencePatterns?: string,
): Promise<{ strategy: ContentStrategy; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);

  const typeLabel = contentType === "stories" ? "Stories" : contentType === "reels" ? "Reels" : "Feed";

  const prompt = `Você é um estrategista de marketing digital especialista em Instagram para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}
${referencePatterns ?? ""}
O usuário deu o seguinte comando simples: "${command}"

Com base nesse comando, crie uma estratégia de conteúdo completa para ${variationsCount} variações de ${typeLabel}.

Retorne SOMENTE JSON válido com este formato exato:
{
  "strategy": "Visão geral da estratégia em 2-3 frases",
  "visualStyle": "Descrição do estilo visual recomendado (cores, iluminação, composição)",
  "prompts": ["prompt de imagem 1 em inglês para DALL-E", "prompt de imagem 2", ...],
  "headlines": ["headline 1", "headline 2", ...],
  "ctas": ["CTA 1", "CTA 2", ...],
  "captions": ["legenda completa 1", "legenda completa 2", ...],
  "hashtags": ["#hashtag1 #hashtag2 #hashtag3", "#hashtagA #hashtagB", ...],
  "approaches": ["abordagem 1 (ex: promocional, emocional, educativo)", "abordagem 2", ...]
}

Regras:
- prompts: ${variationsCount} prompts detalhados em inglês para gerar imagens com IA
- headlines: ${variationsCount} headlines curtas e impactantes em português
- ctas: ${variationsCount} calls-to-action em português
- captions: ${variationsCount} legendas completas com storytelling em português
- hashtags: ${variationsCount} conjuntos de hashtags (5-8 por conjunto)
- approaches: ${variationsCount} nomes de abordagem/distância de cada variação
- strategy: visão geral da estratégia de conteúdo
- visualStyle: guia visual unificada para todas as imagens`;

  const textResult = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
  );

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as Partial<ContentStrategy>;

  const strategy: ContentStrategy = {
    strategy: raw.strategy ?? "Estratégia de conteúdo gerada",
    visualStyle: raw.visualStyle ?? "Estilo visual moderno e clean",
    prompts: Array.isArray(raw.prompts) ? raw.prompts : [],
    headlines: Array.isArray(raw.headlines) ? raw.headlines : [],
    ctas: Array.isArray(raw.ctas) ? raw.ctas : [],
    captions: Array.isArray(raw.captions) ? raw.captions : [],
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : [],
    approaches: Array.isArray(raw.approaches) ? raw.approaches : [],
  };

  return { strategy, tokensUsed };
}

// ── Melhorar texto ────────────────────────────────────────────────────────────

export async function improveVariationText(
  tenantId: string,
  type: ContentType,
  variation: ContentVariation,
  theme?: string,
): Promise<{ variation: ContentVariation; tokensUsed: number }> {
  let prompt: string;

  if (type === "feed") {
    const v = variation as FeedVariation;
    prompt = `Você é um copywriter especialista em Instagram. Abaixo está uma legenda de Feed existente${theme ? ` sobre "${theme}"` : ""}.

Reescreva-a tornando-a mais forte e persuasiva:
- Melhore o hook das primeiras 2 linhas para parar o scroll
- Aumente o impacto emocional
- Mantenha a mesma mensagem central mas com mais energia
- Mantenha ou melhore as hashtags (15-20, ainda relevantes)

Legenda atual:
${v.caption}

Hashtags atuais:
${v.hashtags.join(" ")}

Retorne SOMENTE JSON válido no formato:
{"caption": "...", "hashtags": ["#hashtag1", "#hashtag2"]}`;

  } else if (type === "stories") {
    const v = variation as StoriesVariation;
    prompt = `Você é um copywriter especialista em Instagram Stories. Abaixo está um texto de Stories existente${theme ? ` sobre "${theme}"` : ""}.

Reescreva tornando-o mais direto, impactante e urgente:
- Cada tela deve ter no máximo 2-3 linhas curtas
- Use gatilhos emocionais mais fortes
- Melhore o CTA para ser mais específico e irresistível
- Mantenha o mesmo tema e objetivo

Texto atual:
${v.text}

CTA atual:
${v.cta}

Retorne SOMENTE JSON válido no formato:
{"text": "...", "cta": "..."}`;

  } else if (type === "linkedin") {
    const v = variation as LinkedInVariation;
    prompt = `Você é um copywriter especialista em LinkedIn. Abaixo está um post existente${theme ? ` sobre "${theme}"` : ""}.

Reescreva tornando-o mais forte e persuasivo, mantendo o tom profissional/consultivo (nunca informal como Instagram):
- Melhore o hook (primeira linha) pra parar o scroll de quem toma decisão B2B
- Fortaleça a autoridade/prova de resultado
- Mantenha a mesma mensagem central, mais direta

Hook atual:
${v.hook}

Post atual:
${v.caption}

Hashtags atuais:
${v.hashtags.join(" ")}

Retorne SOMENTE JSON válido no formato:
{"hook": "...", "caption": "...", "hashtags": ["#hashtag1", "#hashtag2"]}`;

  } else if (type === "youtube") {
    const v = variation as YouTubeVariation;
    const roteiroStr = v.roteiro.map((b) => `[${b.bloco}] ${b.conteudo}`).join("\n\n");
    prompt = `Você é um roteirista especialista em YouTube. Abaixo está um roteiro existente${theme ? ` sobre "${theme}"` : ""}.

Reescreva tornando o gancho mais forte e o roteiro mais claro de seguir na gravação:
- Fortaleça os primeiros 15 segundos (motivo pra continuar assistindo)
- Deixe cada bloco mais objetivo pra gravar
- Melhore o título pra busca/clique, mantendo o mesmo assunto

Título atual: ${v.titulo}
Descrição atual: ${v.descricao}
Roteiro atual:
${roteiroStr}

Retorne SOMENTE JSON válido no formato:
{"titulo": "...", "descricao": "...", "tags": ["tag1", "tag2"], "roteiro": [{"bloco": "Gancho", "conteudo": "..."}, {"bloco": "Desenvolvimento", "conteudo": "..."}, {"bloco": "Encerramento", "conteudo": "..."}]}`;

  } else {
    const v = variation as ReelsVariation;
    const scenesStr = v.scenes.map((s, i) =>
      `Cena ${i + 1}: [Visual: ${s.visual}] [Fala: ${s.fala}] [Duração: ${s.duracao}]`
    ).join("\n");

    prompt = `Você é um roteirista especialista em Reels do Instagram${theme ? ` sobre "${theme}"` : ""}.

Reescreva este roteiro tornando-o mais dinâmico e viral:
- Torne os primeiros 3 segundos ainda mais impactantes (hook visual e verbal)
- Adicione mais ritmo e energia às cenas
- Deixe as falas mais naturais e coloquiais
- Mantenha a mesma quantidade de cenas e duração total

Roteiro atual:
${scenesStr}

CTA atual:
${v.cta}

Retorne SOMENTE JSON válido no formato:
{"title": "...", "scenes": [{"visual": "...", "fala": "...", "duracao": "..."}], "audioSuggestion": "...", "cta": "..."}`;
  }

  const result = await gatewayCallOpenAI(
    tenantId,
    "content_generator",
    [{ role: "user", content: prompt }],
    { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
  );

  const tokensUsed = result.inputTokens + result.outputTokens;
  const raw = JSON.parse(result.content || "{}") as Partial<ContentVariation>;

  return { variation: raw as ContentVariation, tokensUsed };
}
