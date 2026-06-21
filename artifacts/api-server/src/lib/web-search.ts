/**
 * Web search for product information — uses OpenAI web search tool
 * Returns extracted features with traceable sources
 */
import { getOpenAIForTenant } from "./agent-engine.js";
import { logger } from "./logger.js";

export interface WebSource {
  url: string;
  title: string;
  snippet: string;
}

export interface ProductSearchResult {
  productName: string;
  features: string[];
  description: string;
  brand?: string;
  price?: string;
  imageUrl?: string;
  sources: WebSource[];
  insufficient: boolean; // true if no reliable data found
}

export async function searchProductInfo(
  productName: string,
  brandHint?: string | null,
  tenantId?: string,
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<ProductSearchResult> {
  const searchLog = log ?? logger;
  const query = brandHint ? `${productName} ${brandHint}` : productName;

  searchLog.info({ productName, brandHint, tenantId }, "Searching product info on web");

  try {
    const openai = await getOpenAIForTenant(tenantId ?? "default");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um assistente de pesquisa de produtos. Use a ferramenta web_search para buscar informações sobre produtos e retorne os dados em formato JSON estrito. Nunca invente características.`,
        },
        {
          role: "user",
          content: `Busque informações sobre o produto "${query}". Preciso de: nome, marca, descrição, características principais (lista), e preço aproximado se disponível. Retorne APENAS JSON válido sem markdown.\n\nFormato esperado:\n{\n  "productName": "string",\n  "brand": "string",\n  "description": "string",\n  "features": ["string"],\n  "price": "string",\n  "imageUrl": "string",\n  "sources": [{"url": "string", "title": "string", "snippet": "string"}]\n}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current information",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query" },
              },
              required: ["query"],
            },
          },
        } as any,
      ],
      tool_choice: "auto",
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content ?? "";

    // Try to extract JSON
    let data: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        data = JSON.parse(content);
      }
    } catch {
      searchLog.info({ content: content.slice(0, 500) }, "Failed to parse JSON from web search, using raw text");
      // Fallback: use raw text as description
      return {
        productName,
        features: [],
        description: content.slice(0, 1000),
        sources: [],
        insufficient: true,
      };
    }

    const sources: WebSource[] = (data.sources || []).map((s: any) => ({
      url: s.url || s.link || "",
      title: s.title || "Fonte web",
      snippet: s.snippet || s.description || "",
    })).filter((s: WebSource) => s.url);

    const insufficient = !data.features || data.features.length === 0;

    return {
      productName: data.productName || productName,
      brand: data.brand,
      description: data.description || "",
      features: data.features || [],
      price: data.price,
      imageUrl: data.imageUrl,
      sources,
      insufficient,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    searchLog.error({ error: msg, productName }, "Web search failed");
    return {
      productName,
      features: [],
      description: "",
      sources: [],
      insufficient: true,
    };
  }
}
