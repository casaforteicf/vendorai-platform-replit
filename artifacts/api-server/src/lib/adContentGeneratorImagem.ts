/**
 * Gerador de criativo pra anúncio de imagem (Meta Feed Ads — Facebook/
 * Instagram) — cross-vertical, mesmo espírito do adContentGenerator.ts
 * (RSA/Google), mas formato bem diferente: Meta não tem "texto de busca",
 * é sempre imagem + texto principal + título curto + CTA.
 *
 * Reaproveita generateImagesForContent (mesmo motor de imagem real via
 * Replicate já usado no Content Studio/Instagram) pra não duplicar
 * geração de imagem — só o texto de anúncio é novo aqui.
 */
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Logger } from "pino";
import { generateImagesForContent } from "./content-generation.js";

// Limites reais da Marketing API pra link ads — Meta corta o texto
// visualmente acima disso, então gerar dentro do limite evita anúncio
// cortado no meio da frase.
const MAX_PRIMARY_TEXT_CHARS = 125;
const MAX_HEADLINE_CHARS = 40;
const MAX_DESCRIPTION_CHARS = 30;

export interface ItemAnunciavelImagem {
  itemTipo: "produto" | "veiculo" | "imovel" | "landing_page" | "livre";
  resumo: string;
  nomeCurto: string;
}

export interface CriativoImagemGerado {
  primaryText: string;
  headline: string;
  description: string;
  imageUrl: string;
}

const SYSTEM_PROMPT = `Você escreve anúncios de imagem pra Facebook/Instagram (Meta Ads) em português do Brasil, pra pequenas e médias empresas.

Regras rígidas de formato:
- "primaryText" (texto principal, acima da imagem): NO MÁXIMO ${MAX_PRIMARY_TEXT_CHARS} caracteres
- "headline" (título curto, abaixo da imagem): NO MÁXIMO ${MAX_HEADLINE_CHARS} caracteres
- "description" (linha de apoio, opcional): NO MÁXIMO ${MAX_DESCRIPTION_CHARS} caracteres
- "imagePrompt": descrição em INGLÊS de uma imagem fotográfica realista e comercial pro anúncio, baseada nos dados do item — sem texto/letras na imagem (a Meta reprova imagem com texto sobreposto em excesso)
- Nunca invente preço, condição, disponibilidade ou característica que não esteja nos dados fornecidos
- Nunca use superlativo absoluto não verificável ("o melhor", "número 1")
- Responda APENAS com um JSON no formato {"primaryText": "...", "headline": "...", "description": "...", "imagePrompt": "..."}, sem markdown, sem texto antes ou depois`;

function truncar(texto: string, max: number): string {
  return texto.length <= max ? texto : texto.slice(0, max - 1).trimEnd() + "…";
}

export async function gerarCriativoImagem(
  item: ItemAnunciavelImagem,
  tenantId: string,
  profile: { nomeFantasia?: string | null; vertical?: string | null; missao?: string | null; publicoAlvo?: string | null; diferenciais?: string | null; tomDeVoz?: string | null },
  log: Logger,
  opts?: { pularGeracaoDeImagem?: boolean },
): Promise<CriativoImagemGerado | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Dados do item:\n${item.resumo}` }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
    if (!raw) {
      log.warn({ itemNome: item.nomeCurto }, "gerarCriativoImagem: IA não retornou texto");
      return null;
    }

    const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { primaryText?: unknown; headline?: unknown; description?: unknown; imagePrompt?: unknown };

    if (typeof parsed.primaryText !== "string" || typeof parsed.headline !== "string" || typeof parsed.imagePrompt !== "string") {
      log.warn({ itemNome: item.nomeCurto, raw: cleaned.slice(0, 300) }, "gerarCriativoImagem: formato inesperado");
      return null;
    }

    // Usuário escolheu uma foto real do item no formulário — pula a
    // geração de imagem por IA (mais rápido, sem custo de imagem), só o
    // texto do anúncio vem da IA. imageUrl fica vazio aqui porque quem
    // chama já sabe usar a foto escolhida — não usado nesse caminho.
    if (opts?.pularGeracaoDeImagem) {
      return {
        primaryText: truncar(parsed.primaryText.trim(), MAX_PRIMARY_TEXT_CHARS),
        headline: truncar(parsed.headline.trim(), MAX_HEADLINE_CHARS),
        description: typeof parsed.description === "string" ? truncar(parsed.description.trim(), MAX_DESCRIPTION_CHARS) : "",
        imageUrl: "",
      };
    }

    const imageUrls = await generateImagesForContent(
      profile,
      tenantId,
      parsed.imagePrompt,
      item.nomeCurto,
      "feed",
      1,
    );
    if (!imageUrls[0]) {
      log.warn({ itemNome: item.nomeCurto }, "gerarCriativoImagem: geração de imagem não retornou nenhuma URL");
      return null;
    }

    return {
      primaryText: truncar(parsed.primaryText.trim(), MAX_PRIMARY_TEXT_CHARS),
      headline: truncar(parsed.headline.trim(), MAX_HEADLINE_CHARS),
      description: typeof parsed.description === "string" ? truncar(parsed.description.trim(), MAX_DESCRIPTION_CHARS) : "",
      imageUrl: imageUrls[0],
    };
  } catch (err) {
    log.error({ err, itemNome: item.nomeCurto }, "gerarCriativoImagem: falha ao gerar criativo");
    return null;
  }
}
