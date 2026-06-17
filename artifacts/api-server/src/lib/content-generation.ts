import { getOpenAI } from "./agent-engine.js";
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

export async function generateImageForContent(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  format: "feed" | "stories"
): Promise<string | undefined> {
  try {
    const openai = getOpenAI();
    const brand = profile.nomeFantasia || "a empresa";
    const subject = productName ? `${productName} — ${theme}` : theme;
    const v = profile.vertical ?? "";
    let styleHint = "clean, modern, professional marketing photography";
    if (v.includes("Varejo") || v.includes("Moda") || v.includes("Roupa")) {
      styleHint = "fashion editorial photography, stylish, trendy, well-lit studio or lifestyle setting";
    } else if (v.includes("Supermercado") || v.includes("Mercado")) {
      styleHint = "bright food photography, fresh produce, appetizing, commercial supermarket style";
    } else if (v.includes("Construção") || v.includes("Reforma")) {
      styleHint = "professional construction/renovation photography, high quality materials, clean workspace";
    }

    const formatLabel = format === "stories" ? "Stories (vertical format)" : "Feed (square format)";
    const imagePrompt = `Professional marketing image for the Instagram ${formatLabel} of the brand "${brand}". Theme: ${subject}. Style: ${styleHint}. High quality, visually appealing, suitable for a business Instagram profile. No text overlays. No watermarks. Bright, well-lit, commercial photography aesthetic.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    return response.data?.[0]?.url ?? undefined;
  } catch (err) {
    console.error("[content-generation] image generation failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function generateFeedContent(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  productExtra?: string
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const openai = getOpenAI();
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

  const [textResponse, imageUrl] = await Promise.all([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.85,
    }),
    generateImageForContent(profile, theme, productName, "feed"),
  ]);

  const tokensUsed = textResponse.usage?.total_tokens ?? 0;
  const raw = JSON.parse(textResponse.choices[0]?.message?.content ?? "{}") as {
    variations?: Omit<FeedVariation, "imageUrl">[];
  };

  const variations: FeedVariation[] = (raw.variations ?? []).map((v, i) => ({
    ...v,
    imageUrl: i === 0 ? imageUrl : undefined,
  }));

  return {
    result: { variations },
    tokensUsed,
  };
}

export async function generateStoriesContent(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  productExtra?: string
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const openai = getOpenAI();
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

  const [textResponse, imageUrl] = await Promise.all([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.85,
    }),
    generateImageForContent(profile, theme, productName, "stories"),
  ]);

  const tokensUsed = textResponse.usage?.total_tokens ?? 0;
  const raw = JSON.parse(textResponse.choices[0]?.message?.content ?? "{}") as {
    variations?: Omit<StoriesVariation, "imageUrl">[];
  };

  const variations: StoriesVariation[] = (raw.variations ?? []).map((v, i) => ({
    ...v,
    imageUrl: i === 0 ? imageUrl : undefined,
  }));

  return {
    result: { variations },
    tokensUsed,
  };
}

export async function generateReelsScript(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  variationsCount: number,
  productExtra?: string
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const openai = getOpenAI();
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.85,
  });

  const tokensUsed = response.usage?.total_tokens ?? 0;
  const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    variations?: ReelsVariation[];
  };
  return {
    result: { variations: raw.variations ?? [] },
    tokensUsed,
  };
}
