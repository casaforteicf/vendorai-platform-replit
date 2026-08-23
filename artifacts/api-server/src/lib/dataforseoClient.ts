/**
 * Cliente pra DataForSEO (https://docs.dataforseo.com) — usado pelo Pesquisador
 * do Content Autopilot. Precisa de DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 * (Basic Auth, credenciais de https://app.dataforseo.com/api-access).
 *
 * Endpoints usados (v3, método Live — resposta síncrona, mais simples que
 * o método Standard de POST+GET separado, mas cobra em todo request):
 * - POST /keywords_data/google_ads/keywords_for_keywords/live → sugestões de
 *   keyword a partir de termos-semente, com volume/dificuldade
 * - POST /keywords_data/google_ads/search_volume/live → volume/competição
 *   pra uma lista específica de keywords
 * - POST /serp/google/organic/live/regular → top resultados orgânicos pra
 *   uma keyword (usado pra pesquisa de concorrência)
 *
 * Cada chamada retorna um campo `cost` (USD) por task — devolvido daqui pra
 * quem chama poder acumular gasto e respeitar o teto do tenant.
 */
import { logger } from "./logger.js";

const BASE_URL = "https://api.dataforseo.com/v3";
const TIMEOUT_MS = 30_000;
const DEFAULT_LOCATION_NAME = "Brazil";
const DEFAULT_LANGUAGE_CODE = "pt";

function authHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

export function isDataForSeoConfigured(): boolean {
  return authHeader() !== null;
}

interface DataForSeoTask<T> {
  status_code: number;
  status_message: string;
  cost: number;
  result: T[] | null;
}

interface DataForSeoResponse<T> {
  status_code: number;
  status_message: string;
  tasks: DataForSeoTask<T>[] | null;
}

async function postLive<TResult>(path: string, body: unknown[]): Promise<{ result: TResult[]; cost: number }> {
  const auth = authHeader();
  if (!auth) {
    throw new Error("DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD não configurados");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as DataForSeoResponse<TResult>;
    if (!res.ok || json.status_code >= 40000) {
      throw new Error(`DataForSEO respondeu ${res.status}/${json.status_code}: ${json.status_message}`);
    }
    const task = json.tasks?.[0];
    if (!task || task.status_code >= 40000) {
      throw new Error(`DataForSEO task falhou: ${task?.status_message ?? "sem task na resposta"}`);
    }
    return { result: task.result ?? [], cost: task.cost ?? 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export interface KeywordSuggestion {
  keyword: string;
  searchVolume: number | null;
  competition: number | null;
  competitionLevel: string | null;
}

interface KeywordsForKeywordsItem {
  keyword: string;
  search_volume: number | null;
  competition: number | null;
  competition_level: string | null;
}

/** Descobre keywords relacionadas a termos-semente, já com volume/competição. */
export async function keywordsForKeywords(
  seedKeywords: string[],
  opts: { locationName?: string; languageCode?: string; limit?: number } = {},
): Promise<{ keywords: KeywordSuggestion[]; cost: number }> {
  const { result, cost } = await postLive<KeywordsForKeywordsItem>("/keywords_data/google_ads/keywords_for_keywords/live", [
    {
      keywords: seedKeywords,
      location_name: opts.locationName ?? DEFAULT_LOCATION_NAME,
      language_code: opts.languageCode ?? DEFAULT_LANGUAGE_CODE,
      limit: opts.limit ?? 100,
      sort_by: "search_volume",
    },
  ]);
  return {
    cost,
    keywords: result
      .filter((item) => item.keyword)
      .map((item) => ({
        keyword: item.keyword,
        searchVolume: item.search_volume,
        competition: item.competition,
        competitionLevel: item.competition_level,
      })),
  };
}

export interface SerpOrganicResult {
  position: number | null;
  title: string;
  url: string;
  domain: string;
  description: string | null;
}

interface SerpTaskResult {
  keyword: string;
  items?: Array<{
    type: string;
    rank_absolute?: number;
    title?: string;
    url?: string;
    domain?: string;
    description?: string;
  }>;
}

/** Top resultados orgânicos do Google pra uma keyword — usado pra pesquisa de concorrência. */
export async function serpOrganicTop(
  keyword: string,
  opts: { locationName?: string; languageCode?: string; maxResults?: number } = {},
): Promise<{ results: SerpOrganicResult[]; cost: number }> {
  const { result, cost } = await postLive<SerpTaskResult>("/serp/google/organic/live/regular", [
    {
      keyword,
      location_name: opts.locationName ?? DEFAULT_LOCATION_NAME,
      language_code: opts.languageCode ?? DEFAULT_LANGUAGE_CODE,
      device: "desktop",
    },
  ]);
  const items = result[0]?.items ?? [];
  const maxResults = opts.maxResults ?? 10;
  const organic = items
    .filter((item) => item.type === "organic" && item.url)
    .slice(0, maxResults)
    .map((item) => ({
      position: item.rank_absolute ?? null,
      title: item.title ?? "",
      url: item.url ?? "",
      domain: item.domain ?? "",
      description: item.description ?? null,
    }));
  return { results: organic, cost };
}

export function logDataForSeoCost(context: Record<string, unknown>, cost: number) {
  logger.info({ ...context, custoUsd: cost }, "content-autopilot: chamada DataForSEO");
}
