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

export async function generateFeedContent(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  variationsCount: number
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const openai = getOpenAI();
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const subject = productName
    ? `Produto/serviço: ${productName}\nTema/ângulo da publicação: ${theme}`
    : `Tema da publicação: ${theme}`;

  const prompt = `Você é um copywriter especialista em Instagram para a marca "${brand}".

Contexto da marca:
${context}

${subject}

Crie ${variationsCount} variações distintas de legenda para o Feed do Instagram. Cada variação deve ter:
- Uma legenda completa e envolvente (2-4 parágrafos, emojis contextuais, linguagem alinhada ao tom da marca)
- 15 a 20 hashtags relevantes e estratégicas

Retorne SOMENTE JSON válido no formato:
{"variations": [{"caption": "...", "hashtags": ["#hashtag1", "#hashtag2"]}]}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.85,
  });

  const tokensUsed = response.usage?.total_tokens ?? 0;
  const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    variations?: FeedVariation[];
  };
  return {
    result: { variations: raw.variations ?? [] },
    tokensUsed,
  };
}

export async function generateStoriesContent(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  variationsCount: number
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const openai = getOpenAI();
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const subject = productName
    ? `Produto/serviço: ${productName}\nTema: ${theme}`
    : `Tema: ${theme}`;

  const prompt = `Você é um copywriter especialista em Instagram Stories para a marca "${brand}".

Contexto da marca:
${context}

${subject}

Crie ${variationsCount} variações distintas de conteúdo para Stories do Instagram. Cada variação deve ter:
- Um texto curto e impactante (máximo 3 linhas — precisa caber na tela do Stories)
- Um CTA (call-to-action) claro e direto (ex: "Arrasta pra cima", "Clica no link da bio", "Manda mensagem")

Retorne SOMENTE JSON válido no formato:
{"variations": [{"text": "...", "cta": "..."}]}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.85,
  });

  const tokensUsed = response.usage?.total_tokens ?? 0;
  const raw = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    variations?: StoriesVariation[];
  };
  return {
    result: { variations: raw.variations ?? [] },
    tokensUsed,
  };
}

export async function generateReelsScript(
  profile: TenantProfile,
  theme: string,
  productName: string | undefined,
  variationsCount: number
): Promise<{ result: ContentGenerationResult; tokensUsed: number }> {
  const openai = getOpenAI();
  const brand = profile.nomeFantasia || "a empresa";
  const context = buildBrandContext(profile);
  const subject = productName
    ? `Produto/serviço: ${productName}\nTema: ${theme}`
    : `Tema: ${theme}`;

  const prompt = `Você é um roteirista especialista em Reels do Instagram para a marca "${brand}".

Contexto da marca:
${context}

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
