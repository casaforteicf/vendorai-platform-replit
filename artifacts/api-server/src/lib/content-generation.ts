import { getOpenAIForTenant } from "./agent-engine.js";
import { callOpenAI as gatewayCallOpenAI } from "./ai-gateway.js";
import { ObjectStorageService } from "./objectStorage.js";
import { toFile } from "openai";
import type {
  FeedVariation,
  StoriesVariation,
  ReelsVariation,
  ContentGenerationResult,
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

async function saveB64Image(b64: string): Promise<string> {
  const buf = Buffer.from(b64, "base64");
  const storage = new ObjectStorageService();
  const objectPath = await storage.savePrivateBuffer(buf, "image/png", `${crypto.randomUUID()}.png`);
  const servePath = objectPath.replace(/^\/objects\//, "");
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

  for (let i = 0; i < imageCount; i++) {
    const variantPrompt = imageCount > 1
      ? `${editPrompt} Variation ${i + 1}: slightly different angle or perspective than other variations.`
      : editPrompt;

    let saved = false;
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
        const item = Array.isArray(response?.data) ? response.data[0] : undefined;
        if (!item) continue;
        if (item.b64_json) {
          results.push(await saveB64Image(item.b64_json));
          saved = true;
          break;
        }
        if (item.url) {
          results.push(item.url);
          saved = true;
          break;
        }
      } catch {
        // Try next model
      }
    }

    // Fallback: generate from scratch with a descriptive prompt
    if (!saved) {
      for (const model of IMAGE_MODELS_PRIORITY) {
        try {
          const response = await openai.images.generate({
            model,
            prompt: variantPrompt,
            n: 1,
            size: "1024x1024",
          } as Parameters<typeof openai.images.generate>[0]);
          const item = Array.isArray(response?.data) ? response.data[0] : undefined;
          if (!item) continue;
          if ((item as any).b64_json) {
            results.push(await saveB64Image((item as any).b64_json));
            saved = true;
            break;
          }
          if ((item as any).url) {
            results.push((item as any).url);
            saved = true;
            break;
          }
        } catch {
          // Try next model
        }
      }
    }

    if (!saved) throw new Error(`Nenhum modelo retornou resultado para imagem ${i + 1}`);
  }

  return results;
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
): Promise<string[]> {
  if (imageCount < 1) imageCount = 1;
  if (imageCount > 10) imageCount = 10;
  const openai = await getOpenAIForTenant(tenantId);
  const brand = profile.nomeFantasia || "a empresa";
  const subject = productName ? `${productName} — ${theme}` : theme;
  const v = profile.vertical ?? "";
  let styleHint = style ?? "clean, modern, professional marketing photography";
  if (!style) {
    if (v.includes("Varejo") || v.includes("Moda") || v.includes("Roupa")) {
      styleHint = "fashion editorial photography, stylish, trendy, well-lit studio or lifestyle setting";
    } else if (v.includes("Supermercado") || v.includes("Mercado")) {
      styleHint = "bright food photography, fresh produce, appetizing, commercial supermarket style";
    } else if (v.includes("Construção") || v.includes("Reforma")) {
      styleHint = "professional construction/renovation photography, high quality materials, clean workspace";
    }
  }

  // When a reference image is available, use AI editing to improve it
  if (referenceImageUrl) {
    const formatLabel = format === "stories" ? "Stories (vertical, 9:16)" : "Feed (square, 1:1)";
    const editPrompt = `Improve this product/marketing image for use in an Instagram ${formatLabel} post for the brand "${brand}". Subject: ${subject}. Keep the same product and subject matter. Improve: lighting quality, sharpness, color vibrancy, composition. The result must be suitable for professional Instagram marketing. Style: ${styleHint}. No text. No watermarks.`;
    return generateImagesWithReference(tenantId, referenceImageUrl, editPrompt, imageCount);
  }

  const results: string[] = [];
  const formatLabel = format === "stories" ? "Stories (vertical format)" : "Feed (square format)";
  const basePrompt = `Professional marketing image for the Instagram ${formatLabel} of the brand "${brand}". Theme: ${subject}. Style: ${styleHint}. High quality, visually appealing, suitable for a business Instagram profile. No text overlays. No watermarks. Bright, well-lit, commercial photography aesthetic.`;

  for (let i = 0; i < imageCount; i++) {
    let lastError: unknown;
    const imagePrompt = imageCount > 1 ? `${basePrompt} Variation ${i + 1} of ${imageCount}. Each image should be unique and distinct.` : basePrompt;

    let saved = false;
    for (const model of IMAGE_MODELS_PRIORITY) {
      try {
        const response = await openai.images.generate({
          model,
          prompt: imagePrompt,
          n: 1,
          size: "1024x1024",
          ...(model === "dall-e-3" ? { quality: "standard" } : {}),
        } as Parameters<typeof openai.images.generate>[0]);

        const item = "data" in response && Array.isArray(response.data) ? response.data[0] : undefined;
        if (!item) continue;

        if ("url" in item && item.url) {
          results.push(item.url);
          saved = true;
          break;
        }

        if ("b64_json" in item && item.b64_json) {
          results.push(await saveB64Image(item.b64_json));
          saved = true;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!saved) {
      throw lastError ?? new Error(`Nenhum modelo de imagem disponível retornou resultado para imagem ${i + 1}`);
    }
  }

  return results;
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

export async function generateFeedContent(
  profile: TenantProfile,
  tenantId: string,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  imageCount: number = 1,
  productExtra?: string,
  referenceImageUrl?: string,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);

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

Crie ${variationsCount} variações distintas de legenda para o Feed do Instagram. Cada variação deve ter:
- Uma legenda completa e envolvente (2-4 parágrafos, emojis contextuais, linguagem alinhada ao tom da marca)
- 15 a 20 hashtags relevantes e estratégicas

Retorne SOMENTE JSON válido no formato:
{"variations": [{"caption": "...", "hashtags": ["#hashtag1", "#hashtag2"]}]}`;

  const [textResult, imageUrls] = await Promise.all([
    gatewayCallOpenAI(
      tenantId,
      "content_generator",
      [{ role: "user", content: prompt }],
      { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
    ),
    generateImagesForContent(profile, tenantId, theme, productName, "feed", imageCount, undefined, referenceImageUrl),
  ]);

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: Omit<FeedVariation, "imageUrl">[];
  };

  const variations: FeedVariation[] = (raw.variations ?? []).map((v) => ({
    ...v,
    imageUrl: imageUrls[0],
    imageUrls: imageUrls,
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
  referenceImageUrl?: string,
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);

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

Crie ${variationsCount} variações distintas de conteúdo para Stories do Instagram. Cada variação deve ter:
- Um texto curto e impactante (máximo 3 linhas — precisa caber na tela do Stories)
- Um CTA (call-to-action) claro e direto (ex: "Arrasta pra cima", "Clica no link da bio", "Manda mensagem")

Retorne SOMENTE JSON válido no formato:
{"variations": [{"text": "...", "cta": "..."}]}`;

  const [textResult, imageUrls] = await Promise.all([
    gatewayCallOpenAI(
      tenantId,
      "content_generator",
      [{ role: "user", content: prompt }],
      { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, temperature: 0.85 },
    ),
    generateImagesForContent(profile, tenantId, theme, productName, "stories", imageCount, undefined, referenceImageUrl),
  ]);

  const tokensUsed = textResult.inputTokens + textResult.outputTokens;
  const raw = JSON.parse(textResult.content || "{}") as {
    variations?: Omit<StoriesVariation, "imageUrl">[];
  };

  const variations: StoriesVariation[] = (raw.variations ?? []).map((v, i) => ({
    ...v,
    imageUrl: imageUrls[0],
    imageUrls: imageUrls,
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
  productExtra?: string
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);

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
  variationsCount: number
): Promise<{ strategy: ContentStrategy; tokensUsed: number }> {
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const hints = verticalHints(profile.vertical);

  const typeLabel = contentType === "stories" ? "Stories" : contentType === "reels" ? "Reels" : "Feed";

  const prompt = `Você é um estrategista de marketing digital especialista em Instagram para a marca "${brand}".

Contexto da marca:
${context}
${hints ? `\n${hints}\n` : ""}

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
