import { resolveJarvisCapability, type JarvisCapabilityFamily } from "./jarvis-capability-profile.js";
import {
  formatJarvisWebResearchContext,
  researchJarvisWeb,
  shouldUseJarvisWebResearch,
} from "./jarvis-web-research-provider.js";

export type JarvisProviderStatus = "executed" | "not_applicable" | "needs_configuration" | "failed";

export type JarvisProviderExecution = {
  status: JarvisProviderStatus;
  family: JarvisCapabilityFamily;
  provider: string | null;
  context: string;
  retrievedAt: string;
};

const FIAT_ALIASES: Record<string, string> = {
  dolar: "USD",
  dolares: "USD",
  dollar: "USD",
  usd: "USD",
  real: "BRL",
  reais: "BRL",
  brl: "BRL",
  euro: "EUR",
  eur: "EUR",
  libra: "GBP",
  gbp: "GBP",
  "peso argentino": "ARS",
  ars: "ARS",
  guarani: "PYG",
  pyg: "PYG",
  "peso uruguaio": "UYU",
  uyu: "UYU",
  boliviano: "BOB",
  bob: "BOB",
  iene: "JPY",
  jpy: "JPY",
  franco: "CHF",
  chf: "CHF",
  yuan: "CNY",
  cny: "CNY",
};

const CRYPTO_ALIASES: Record<string, string> = {
  bitcoin: "bitcoin",
  btc: "bitcoin",
  ethereum: "ethereum",
  eth: "ethereum",
  solana: "solana",
  sol: "solana",
  xrp: "ripple",
  ripple: "ripple",
  dogecoin: "dogecoin",
  doge: "dogecoin",
};

const STOCK_SYMBOLS: Record<string, string> = {
  petr4: "PETR4",
  vale3: "VALE3",
  itub4: "ITUB4",
  bbas3: "BBAS3",
  wege3: "WEGE3",
  aapl: "AAPL",
  msft: "MSFT",
  nvda: "NVDA",
  tsla: "TSLA",
  amzn: "AMZN",
  meta: "META",
  googl: "GOOGL",
  spy: "SPY",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "VendorAI-Jarvis/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function detectFiatCurrencies(text: string): string[] {
  const normalized = normalize(text);
  // Coleta cada moeda com a posição onde aparece, para devolver na ordem de menção no texto.
  const hits: Array<{ code: string; index: number }> = [];
  for (const [alias, code] of Object.entries(FIAT_ALIASES)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").exec(normalized);
    if (match) hits.push({ code, index: match.index });
  }
  for (const match of text.matchAll(/\b[A-Z]{3}\b/g)) {
    hits.push({ code: match[0].toUpperCase(), index: match.index ?? 0 });
  }

  if (!hits.length && /\b(cambio|forex|moedas?)\b/.test(normalized)) {
    return ["USD", "BRL"];
  }

  hits.sort((a, b) => a.index - b.index);
  return unique(hits.map((hit) => hit.code));
}

export function detectCryptoAssets(text: string): string[] {
  const normalized = normalize(text);
  const found: string[] = [];
  for (const [alias, id] of Object.entries(CRYPTO_ALIASES)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").test(normalized)) found.push(id);
  }
  return unique(found);
}

export function detectStockSymbols(text: string): string[] {
  const normalized = normalize(text);
  const found: string[] = [];
  for (const [alias, symbol] of Object.entries(STOCK_SYMBOLS)) {
    if (new RegExp(`(^|\\b)${alias}(\\b|$)`, "i").test(normalized)) found.push(symbol);
  }
  for (const explicit of text.match(/\$[A-Z]{1,6}\b/g) ?? []) found.push(explicit.slice(1));
  return unique(found);
}

function detectAmount(text: string): number {
  const match = text.match(/(?:R\$|US\$|\$|€)?\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)/);
  if (!match?.[1]) return 1;
  const raw = match[1].replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function loadFiatContext(text: string): Promise<string | null> {
  const currencies = detectFiatCurrencies(text);
  if (!currencies.length) return null;

  let from = currencies[0];
  let to = currencies[1];
  if (!to) {
    to = from === "BRL" ? "USD" : "BRL";
  }
  if (from === to) return null;

  const amount = detectAmount(text);
  const data = await fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
  const rate = Number(data?.rates?.[to]);
  if (!Number.isFinite(rate)) throw new Error(`Câmbio ${from}/${to} indisponível no provider`);
  const converted = amount * rate;
  const sourceTime = data?.time_last_update_utc ?? null;

  return [
    "### Provider real — câmbio",
    "- Provider: ExchangeRate-API (endpoint público open.er-api.com).",
    `- Par: ${from}/${to}.`,
    `- Taxa de referência: 1 ${from} = ${rate} ${to}.`,
    `- Conversão solicitada/referência: ${amount} ${from} = ${converted} ${to}.`,
    sourceTime ? `- Atualização informada pelo provider: ${sourceTime}.` : null,
    "- Se o pedido foi genérico sobre câmbio/Forex, use USD/BRL como referência inicial e deixe claro que outros pares podem ser consultados sob demanda.",
    "- Observação: é taxa de referência; pode diferir do bid/ask, spread, IOF e tarifa praticados por banco/corretora.",
  ].filter(Boolean).join("\n");
}

async function loadCryptoContext(text: string): Promise<string | null> {
  const assets = detectCryptoAssets(text);
  if (!assets.length) return null;
  const vs = detectFiatCurrencies(text)[0]?.toLowerCase() ?? "brl";
  const data = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(assets.join(","))}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true&include_last_updated_at=true`,
  );

  const lines = ["### Provider real — cripto", "- Provider: CoinGecko."];
  for (const asset of assets) {
    const row = data?.[asset];
    const price = Number(row?.[vs]);
    if (!Number.isFinite(price)) continue;
    const change = Number(row?.[`${vs}_24h_change`]);
    const updated = Number(row?.last_updated_at);
    lines.push(`- ${asset}: ${price} ${vs.toUpperCase()}${Number.isFinite(change) ? `; variação 24h ${change.toFixed(2)}%` : ""}${Number.isFinite(updated) ? `; atualizado ${new Date(updated * 1000).toISOString()}` : ""}.`);
  }
  if (lines.length <= 2) throw new Error("Cotação cripto não retornou valores válidos");
  return lines.join("\n");
}

async function loadStockContext(text: string): Promise<{ context: string | null; configured: boolean }> {
  const symbols = detectStockSymbols(text);
  if (!symbols.length) return { context: null, configured: true };
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      context: [
        "### Feed dedicado de ações não configurado",
        `- Ativos detectados: ${symbols.join(", ")}.`,
        "- Provider dedicado previsto: Twelve Data.",
        "- O JARVIS deve tentar pesquisa web atual como fallback e deixar claro quando o dado não vier de um feed dedicado.",
      ].join("\n"),
    };
  }

  const lines = ["### Provider real — ações", "- Provider: Twelve Data."];
  for (const symbol of symbols.slice(0, 5)) {
    const data = await fetchJson(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`,
    );
    if (data?.status === "error") continue;
    const close = data?.close ?? data?.price;
    lines.push(`- ${symbol}: preço/último fechamento ${close ?? "não informado"}; variação ${data?.percent_change ?? "não informada"}%; timestamp ${data?.timestamp ?? data?.datetime ?? "não informado"}.`);
  }
  return { configured: true, context: lines.length > 2 ? lines.join("\n") : null };
}

async function executeMarketProvider(text: string): Promise<JarvisProviderExecution> {
  const retrievedAt = new Date().toISOString();
  const contexts: string[] = [];
  let needsConfiguration = false;

  try {
    const [fiat, crypto, stocks] = await Promise.all([
      loadFiatContext(text),
      loadCryptoContext(text),
      loadStockContext(text),
    ]);
    if (fiat) contexts.push(fiat);
    if (crypto) contexts.push(crypto);
    if (stocks.context) contexts.push(stocks.context);
    if (!stocks.configured) needsConfiguration = true;

    if (!contexts.length) {
      return {
        status: "not_applicable",
        family: "market_data",
        provider: null,
        retrievedAt,
        context: "## Providers reais\nNenhum ativo/par específico foi identificado para o feed automático. O JARVIS deve tentar pesquisa atual antes de afirmar que não possui dados de mercado.",
      };
    }

    return {
      status: needsConfiguration ? "needs_configuration" : "executed",
      family: "market_data",
      provider: "market-registry",
      retrievedAt,
      context: [
        "## Dados externos consultados pelo JARVIS",
        `- Consulta executada em: ${retrievedAt}.`,
        ...contexts,
        "- Use estes valores como evidência externa desta resposta; não substitua por valores lembrados pelo modelo.",
      ].join("\n"),
    };
  } catch (error) {
    return {
      status: "failed",
      family: "market_data",
      provider: "market-registry",
      retrievedAt,
      context: `## Provider dedicado de mercado\nA consulta direta falhou (${error instanceof Error ? error.message : "erro desconhecido"}). Tente pesquisa web atual antes de declarar indisponibilidade total.`,
    };
  }
}

async function executeWebResearchProvider(
  text: string,
  family: JarvisCapabilityFamily,
  tenantId?: string,
): Promise<JarvisProviderExecution> {
  const result = await researchJarvisWeb({
    tenantId: tenantId ?? "",
    family,
    query: text,
  });
  return {
    status: result.status === "executed" ? "executed" : "failed",
    family,
    provider: "openai-web-search",
    retrievedAt: result.retrievedAt,
    context: formatJarvisWebResearchContext(result),
  };
}

function combineMarketEvidence(
  direct: JarvisProviderExecution,
  fallback: JarvisProviderExecution,
): JarvisProviderExecution {
  if (fallback.status !== "executed") return direct;
  return {
    status: "executed",
    family: "market_data",
    provider: direct.provider ? `${direct.provider}+openai-web-search` : "openai-web-search",
    retrievedAt: fallback.retrievedAt,
    context: [
      direct.context,
      "## Fallback de mercado",
      "Quando o feed dedicado não cobre o pedido ou está sem configuração, o JARVIS usa pesquisa web atual como segunda fonte. Diferencie feed dedicado, taxa de referência, fechamento, dado atrasado e informação recuperada da web.",
      fallback.context,
    ].filter(Boolean).join("\n"),
  };
}

export async function executeJarvisProvider(text: string, tenantId?: string): Promise<JarvisProviderExecution> {
  const capability = resolveJarvisCapability(text);
  const hasMarketAsset =
    detectFiatCurrencies(text).length > 0 ||
    detectCryptoAssets(text).length > 0 ||
    detectStockSymbols(text).length > 0;

  if (capability.family === "market_data" || hasMarketAsset) {
    const direct = await executeMarketProvider(text);
    if (direct.status === "executed") return direct;

    const fallback = await executeWebResearchProvider(text, "market_data", tenantId);
    return combineMarketEvidence(direct, fallback);
  }

  if (shouldUseJarvisWebResearch(capability.family)) {
    return executeWebResearchProvider(text, capability.family, tenantId);
  }

  return {
    status: "not_applicable",
    family: capability.family,
    provider: null,
    retrievedAt: new Date().toISOString(),
    context: "",
  };
}
