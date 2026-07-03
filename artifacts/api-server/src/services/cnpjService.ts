/**
 * Cmd 23 — Serviço de dados CNPJ e Meta Ad Library
 *
 * Fontes:
 *  - BrasilAPI (grátis): lookup de CNPJ individual
 *  - CNPJá (pago): busca em massa por CNAE + cidade + data  (requer CNPJ_API_KEY)
 *  - Meta Ad Library (grátis com INSTAGRAM_ACCESS_TOKEN): anunciantes ativos
 */

export interface CnpjCompany {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnaeCode: string;
  cnaeDescricao: string;
  cnaesSecundarios: Array<{ code: string; descricao: string }>;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string | null;
  email: string | null;
  dataAbertura: string;
  porte: "MEI" | "ME" | "EPP" | "DEMAIS" | null;
  capitalSocial: number | null;
  situacao: string;
  socios: Array<{
    nome: string;
    qualificacao: string;
    dataNascimento?: string;
  }>;
  enderecoCompleto: string;
}

export interface MetaAdResult {
  pageId: string;
  pageName: string;
  snapshotUrl: string | null;
  startDate: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a LinkedIn search URL for a company's decision-maker */
export function buildLinkedInSearchUrl(razaoSocial: string, cidade: string): string {
  const q = encodeURIComponent(`"${razaoSocial}" ${cidade} dono OR sócio OR gerente OR diretor`);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}

// ── BrasilAPI — single CNPJ lookup (free, no key) ──────────────────────────

async function parseBrasilApiResponse(data: Record<string, unknown>): Promise<CnpjCompany> {
  const cnpj = String(data.cnpj ?? "").replace(/\D/g, "");
  const razaoSocial = String(data.razao_social ?? "");
  const nomeFantasia = data.nome_fantasia ? String(data.nome_fantasia) : null;
  const cnaeCode = String((data.cnae_fiscal ?? "")).toString().padStart(7, "0");
  const cnaeDescricao = String(data.cnae_fiscal_descricao ?? "");

  const cnaesSecundarios: CnpjCompany["cnaesSecundarios"] = [];
  if (Array.isArray(data.cnaes_secundarios)) {
    for (const c of data.cnaes_secundarios) {
      cnaesSecundarios.push({
        code: String((c as Record<string, unknown>).codigo ?? ""),
        descricao: String((c as Record<string, unknown>).descricao ?? ""),
      });
    }
  }

  const logradouro = String(data.logradouro ?? "");
  const numero = String(data.numero ?? "");
  const complemento = data.complemento ? String(data.complemento) : null;
  const bairro = String(data.bairro ?? "");
  const municipio = String(data.municipio ?? "");
  const uf = String(data.uf ?? "");
  const cep = String(data.cep ?? "").replace(/\D/g, "");

  const enderecoCompleto = [logradouro, numero, complemento, bairro, municipio, uf]
    .filter(Boolean)
    .join(", ");

  const socios: CnpjCompany["socios"] = [];
  if (Array.isArray(data.qsa)) {
    for (const s of data.qsa) {
      const sObj = s as Record<string, unknown>;
      socios.push({
        nome: String(sObj.nome_socio ?? sObj.nome ?? ""),
        qualificacao: String(sObj.qualificacao_socio ?? ""),
        dataNascimento: sObj.data_entrada_sociedade ? String(sObj.data_entrada_sociedade) : undefined,
      });
    }
  }

  let porte: CnpjCompany["porte"] = null;
  const porteStr = String(data.porte ?? "").toUpperCase();
  if (porteStr.includes("MEI")) porte = "MEI";
  else if (porteStr.includes("MICROEMPRESA") || porteStr === "ME") porte = "ME";
  else if (porteStr.includes("PEQUENA") || porteStr === "EPP") porte = "EPP";
  else if (porteStr.includes("DEMAIS") || porteStr.includes("MEDIO") || porteStr.includes("GRANDE")) porte = "DEMAIS";

  const capitalSocial = data.capital_social ? Number(data.capital_social) : null;
  const situacao = String(data.descricao_situacao_cadastral ?? data.situacao_cadastral ?? "ATIVA");

  // Phone: BrasilAPI returns ddd_telefone_1
  let telefone: string | null = null;
  const ddd = String(data.ddd_telefone_1 ?? "").replace(/\D/g, "");
  if (ddd.length >= 10) telefone = `+55${ddd}`;
  else if (ddd) telefone = ddd;

  const email = data.email ? String(data.email) : null;
  const dataAbertura = String(data.data_inicio_atividade ?? data.abertura ?? "");

  return {
    cnpj, razaoSocial, nomeFantasia, cnaeCode, cnaeDescricao,
    cnaesSecundarios, logradouro, numero, complemento, bairro, municipio,
    uf, cep, telefone, email, dataAbertura, porte, capitalSocial,
    situacao, socios, enderecoCompleto,
  };
}

export async function getCompanyByCnpj(cnpj: string): Promise<CnpjCompany | null> {
  const clean = normalizeCnpj(cnpj);
  if (clean.length !== 14) return null;

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return parseBrasilApiResponse(data);
  } catch {
    return null;
  }
}

// ── CNPJá API — bulk CNAE search (requires CNPJ_API_KEY) ──────────────────

export interface CnpjSearchParams {
  cnae: string;
  uf?: string;
  municipio?: string;
  aberturaDias?: number;
  porte?: "MEI" | "ME" | "EPP" | "DEMAIS";
  limit?: number;
}

export interface CnpjSearchResult {
  empresas: CnpjCompany[];
  total: number;
  apiKeyRequired: boolean;
}

export async function searchByCnae(params: CnpjSearchParams): Promise<CnpjSearchResult> {
  const apiKey = process.env.CNPJ_API_KEY;

  if (!apiKey) {
    return { empresas: [], total: 0, apiKeyRequired: true };
  }

  const limit = params.limit ?? 20;
  const url = new URL("https://api.cnpja.com/office");
  url.searchParams.set("cnae_principal", params.cnae.replace(/\D/g, ""));
  if (params.uf) url.searchParams.set("state", params.uf);
  if (params.municipio) url.searchParams.set("city", params.municipio);
  if (params.aberturaDias) {
    const since = new Date();
    since.setDate(since.getDate() - params.aberturaDias);
    url.searchParams.set("opening_date_start", since.toISOString().split("T")[0]);
  }
  if (params.porte) url.searchParams.set("company_size", params.porte);
  url.searchParams.set("status", "ATIVA");
  url.searchParams.set("limit", String(limit));

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`CNPJá API error ${res.status}: ${errText}`);
    }

    const json = await res.json() as {
      data?: Array<Record<string, unknown>>;
      total?: number;
      count?: number;
    };

    const raw = json.data ?? [];
    const empresas: CnpjCompany[] = [];

    for (const item of raw) {
      // CNPJá returns nested structure
      const company = (item.company ?? item) as Record<string, unknown>;
      const office = (item.office ?? item) as Record<string, unknown>;

      const cnpj = String(office.taxId ?? item.cnpj ?? "").replace(/\D/g, "");
      if (!cnpj) continue;

      // Try BrasilAPI for full data if CNPJá doesn't have it
      const merged: Record<string, unknown> = {
        cnpj,
        razao_social: company.name ?? office.name ?? item.razao_social,
        nome_fantasia: office.alias ?? item.nome_fantasia,
        cnae_fiscal: (office.mainActivity as Record<string, unknown>)?.code ?? item.cnae_fiscal,
        cnae_fiscal_descricao: (office.mainActivity as Record<string, unknown>)?.text ?? item.cnae_fiscal_descricao,
        logradouro: (office.address as Record<string, unknown>)?.street ?? item.logradouro,
        numero: (office.address as Record<string, unknown>)?.number ?? item.numero,
        municipio: (office.address as Record<string, unknown>)?.city ?? item.municipio,
        uf: (office.address as Record<string, unknown>)?.state ?? item.uf,
        cep: (office.address as Record<string, unknown>)?.zip ?? item.cep,
        ddd_telefone_1: item.telefone,
        email: item.email,
        data_inicio_atividade: office.startDate ?? item.data_abertura ?? item.data_inicio_atividade,
        porte: (company.size as Record<string, unknown>)?.description ?? item.porte,
        capital_social: company.equity ?? item.capital_social,
        descricao_situacao_cadastral: (office.status as Record<string, unknown>)?.description ?? "ATIVA",
        qsa: item.qsa ?? [],
        bairro: (office.address as Record<string, unknown>)?.district ?? item.bairro,
        complemento: (office.address as Record<string, unknown>)?.complement ?? item.complemento,
        cnaes_secundarios: item.cnaes_secundarios ?? [],
      };

      try {
        empresas.push(await parseBrasilApiResponse(merged));
      } catch {
        // skip malformed entry
      }
    }

    return {
      empresas,
      total: json.total ?? json.count ?? empresas.length,
      apiKeyRequired: false,
    };
  } catch (err) {
    if ((err as Error).message?.includes("apiKeyRequired") || (err as NodeJS.ErrnoException).code === "ENOTFOUND") {
      return { empresas: [], total: 0, apiKeyRequired: true };
    }
    throw err;
  }
}

// ── Meta Ad Library — anunciantes ativos ──────────────────────────────────

export async function searchMetaAds(
  searchTerms: string,
  accessToken: string,
  limit = 10,
): Promise<{ ads: MetaAdResult[]; hasAds: boolean }> {
  try {
    const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("search_terms", searchTerms);
    url.searchParams.set("ad_reached_countries", "BR");
    url.searchParams.set("ad_active_status", "ACTIVE");
    url.searchParams.set("fields", "page_name,ad_snapshot_url,ad_delivery_start_time");
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return { ads: [], hasAds: false };

    const json = await res.json() as { data?: Array<Record<string, unknown>> };
    const data = json.data ?? [];

    const ads: MetaAdResult[] = data.map((d) => ({
      pageId: String(d.page_id ?? ""),
      pageName: String(d.page_name ?? ""),
      snapshotUrl: d.ad_snapshot_url ? String(d.ad_snapshot_url) : null,
      startDate: d.ad_delivery_start_time ? String(d.ad_delivery_start_time) : null,
    }));

    return { ads, hasAds: ads.length > 0 };
  } catch {
    return { ads: [], hasAds: false };
  }
}

/** Check if a company has active Meta ads (used during enrichment) */
export async function checkHasMetaAds(nomeEmpresa: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return false;
  const result = await searchMetaAds(nomeEmpresa, token, 3);
  return result.hasAds;
}

/** Check if company exists on Google Places (basic name+city presence check) */
export async function checkGooglePresence(
  nomeEmpresa: string,
  cidade: string,
  placesApiKey?: string,
): Promise<boolean> {
  const key = placesApiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return false;

  try {
    const query = encodeURIComponent(`${nomeEmpresa} ${cidade}`);
    const url = `https://places.googleapis.com/v1/places:searchText`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const json = await res.json() as { places?: unknown[] };
    return Array.isArray(json.places) && json.places.length > 0;
  } catch {
    return false;
  }
}
