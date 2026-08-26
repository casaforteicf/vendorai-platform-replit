/**
 * Gerador de criativos de anúncio (Responsive Search Ads / Performance Max)
 * — cross-vertical. Usado pra qualquer item SEM feed estruturado nativo do
 * Google (veículos, imóveis, serviços/beleza/restaurantes — ver decisão em
 * conversa: Vehicle Ads não existe no Brasil, farmácia OTC via Shopping não
 * confirmado pro Brasil). Produtos físicos com estoque real (farmácia,
 * mercado, distribuidoras) vão por Shopping feed, não por aqui — ver
 * adShoppingFeed.ts.
 *
 * O Google RSA aceita até 15 títulos (máx. 30 caracteres cada) e até 4
 * descrições (máx. 90 caracteres cada) por anúncio, e testa as combinações
 * automaticamente — por isso geramos um CONJUNTO de variações por item, não
 * um texto fixo.
 */
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Logger } from "pino";
import { getOpenAIForTenant } from "./agent-engine.js";

const MAX_HEADLINE_CHARS = 30;
const MAX_DESCRIPTION_CHARS = 90;
const HEADLINE_COUNT = 10;
const DESCRIPTION_COUNT = 4;

export interface ItemAnunciavel {
  itemTipo: "produto" | "veiculo" | "imovel";
  /** Resumo em texto livre dos dados relevantes do item — já formatado por
   * quem chama (cada tipo tem campos bem diferentes, ver buildResumoItem
   * nas rotas). */
  resumo: string;
  /** Nome curto do item, usado como fallback se a IA falhar. */
  nomeCurto: string;
}

export interface CriativoGerado {
  headlines: string[];
  descriptions: string[];
}

const SYSTEM_PROMPT = `Você escreve anúncios de Google Ads (Responsive Search Ads) em português do Brasil, pra pequenas e médias empresas.

Regras rígidas de formato:
- Cada título tem NO MÁXIMO ${MAX_HEADLINE_CHARS} caracteres (conte de verdade, isso é limite técnico do Google, não estético)
- Cada descrição tem NO MÁXIMO ${MAX_DESCRIPTION_CHARS} caracteres
- Gere exatamente ${HEADLINE_COUNT} títulos diferentes entre si (não repita a mesma ideia com sinônimo raso)
- Gere exatamente ${DESCRIPTION_COUNT} descrições diferentes entre si
- Nunca invente preço, condição, disponibilidade ou característica que não esteja nos dados fornecidos
- Nunca use superlativo absoluto não verificável ("o melhor", "número 1") — Google reprova esse tipo de claim sem comprovação
- Varie o ângulo entre os títulos: alguns focados em preço/condição, outros em característica do item, outros em urgência/CTA genérico ("Confira agora", "Fale conosco")
- Responda APENAS com um JSON no formato {"headlines": [...], "descriptions": [...]}, sem markdown, sem texto antes ou depois`;

function truncar(texto: string, max: number): string {
  return texto.length <= max ? texto : texto.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Gera títulos e descrições de anúncio pra um item, a partir do resumo de
 * dados já estruturado. Se a IA falhar ou devolver formato inesperado,
 * retorna null — quem chama decide se tenta de novo ou avisa o usuário
 * (nunca publica um anúncio vazio/genérico demais sem o usuário saber).
 */
function parseCreative(raw: string, item: ItemAnunciavel, log: Logger): CriativoGerado | null {
  const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as { headlines?: unknown; descriptions?: unknown };

  if (!Array.isArray(parsed.headlines) || !Array.isArray(parsed.descriptions)) {
    log.warn({ itemNome: item.nomeCurto, raw: cleaned.slice(0, 300) }, "gerarCriativoRSA: formato inesperado");
    return null;
  }

  const headlines = parsed.headlines
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => truncar(h.trim(), MAX_HEADLINE_CHARS));
  const descriptions = parsed.descriptions
    .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    .map((d) => truncar(d.trim(), MAX_DESCRIPTION_CHARS));

  return headlines.length > 0 && descriptions.length > 0 ? { headlines, descriptions } : null;
}

export async function gerarCriativoRSA(item: ItemAnunciavel, log: Logger, tenantId: string): Promise<CriativoGerado | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Dados do item:\n${item.resumo}` }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
    if (!raw) {
      log.warn({ itemNome: item.nomeCurto }, "gerarCriativoRSA: IA não retornou texto");
      return null;
    }

    return parseCreative(raw, item, log);
  } catch (err) {
    log.warn({ err, itemNome: item.nomeCurto }, "gerarCriativoRSA: Anthropic falhou; tentando OpenAI");
    try {
      const openai = await getOpenAIForTenant(tenantId);
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Dados do item:\n${item.resumo}` },
        ],
      });
      const raw = response.choices[0]?.message?.content?.trim();
      return raw ? parseCreative(raw, item, log) : null;
    } catch (fallbackErr) {
      log.error({ err: fallbackErr, itemNome: item.nomeCurto }, "gerarCriativoRSA: fallback OpenAI também falhou");
      return null;
    }
  }
}
