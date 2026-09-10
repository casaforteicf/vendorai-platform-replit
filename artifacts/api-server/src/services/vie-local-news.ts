import { and, eq } from "drizzle-orm";
import { businessProfilesTable, db, tenantsTable, vieSourcesTable } from "@workspace/db";

const STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const STATE_BY_NAME = new Map(Object.entries(STATE_NAMES).map(([uf, name]) => [normalize(name), uf]));

export type TenantNewsLocation = {
  city: string | null;
  stateCode: string | null;
  stateName: string | null;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 2 || clean.length > 80) return null;
  return clean;
}

function discoveryString(discovery: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanLabel(discovery[key]);
    if (value) return value;
  }
  return null;
}

function stateCodeFromValue(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (STATE_NAMES[upper]) return upper;
  return STATE_BY_NAME.get(normalize(value)) ?? null;
}

function parseAddress(address: string | null): TenantNewsLocation {
  if (!address) return { city: null, stateCode: null, stateName: null };
  const clean = address.replace(/\s+/g, " ").trim();
  const ufMatch = clean.match(/(?:[-/,]\s*|\b)(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i);
  const stateCode = ufMatch?.[1]?.toUpperCase() ?? null;

  let city: string | null = null;
  if (stateCode) {
    const beforeState = clean.slice(0, ufMatch!.index ?? clean.length).replace(/[\s,\-/]+$/, "");
    const segments = beforeState.split(/[,–—]/).map((part) => part.trim()).filter(Boolean);
    const candidate = segments.at(-1)?.replace(/^\d{5}-?\d{3}\s*/, "").trim() ?? "";
    if (candidate && !/\d/.test(candidate) && !/^(rua|avenida|av\.?|rodovia|estrada|bairro)\b/i.test(candidate)) city = candidate;
  }

  return { city, stateCode, stateName: stateCode ? STATE_NAMES[stateCode] : null };
}

export function resolveTenantNewsLocation(input: {
  discoveryData?: Record<string, unknown> | null;
  endereco?: string | null;
}): TenantNewsLocation {
  const discovery = input.discoveryData ?? {};
  const directCity = discoveryString(discovery, ["cidade", "city", "municipio", "município", "localidade"]);
  const directState = discoveryString(discovery, ["uf", "estado", "state", "stateCode", "regionCode"]);
  const parsed = parseAddress(input.endereco ?? null);
  const stateCode = stateCodeFromValue(directState) ?? parsed.stateCode;
  const city = directCity ?? parsed.city;

  return {
    city,
    stateCode,
    stateName: stateCode ? STATE_NAMES[stateCode] : directState,
  };
}

export async function getTenantNewsLocation(tenantId: string): Promise<TenantNewsLocation> {
  const rows = await db
    .select({ endereco: businessProfilesTable.endereco, discoveryData: businessProfilesTable.discoveryData })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);
  return resolveTenantNewsLocation(rows[0] ?? {});
}

function slug(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function googleNewsRss(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

async function upsertLocalSource(input: {
  code: string;
  name: string;
  scope: "local" | "regional";
  city: string | null;
  stateCode: string;
  query: string;
  categories: string[];
}) {
  const now = new Date();
  await db
    .insert(vieSourcesTable)
    .values({
      code: input.code,
      name: input.name,
      domain: "news",
      scope: input.scope,
      sourceType: "rss",
      endpointUrl: googleNewsRss(input.query),
      websiteUrl: "https://news.google.com/",
      countryCode: "BR",
      regionCode: input.stateCode,
      city: input.city,
      categories: input.categories,
      reliabilityScore: 78,
      active: true,
      licenseNotes: "Agregador de notícias locais. O VendorAI armazena somente metadados, link e resumo; a matéria permanece no veículo de origem.",
      metadata: { provider: "google-news-search", dynamicLocal: true, query: input.query },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: vieSourcesTable.code,
      set: {
        endpointUrl: googleNewsRss(input.query),
        scope: input.scope,
        regionCode: input.stateCode,
        city: input.city,
        categories: input.categories,
        active: true,
        updatedAt: now,
      },
    });
}

export async function ensureLocalNewsSourcesForActiveTenants(): Promise<{ tenants: number; localities: number }> {
  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.status, "active"), eq(tenantsTable.countryCode, "BR")));

  const seen = new Set<string>();
  for (const tenant of tenants) {
    const location = await getTenantNewsLocation(tenant.id);
    if (!location.stateCode) continue;

    const stateName = location.stateName ?? STATE_NAMES[location.stateCode] ?? location.stateCode;
    const stateKey = `state:${location.stateCode}`;
    if (!seen.has(stateKey)) {
      seen.add(stateKey);
      await upsertLocalSource({
        code: `local-news-state-${location.stateCode.toLowerCase()}`,
        name: `Notícias regionais — ${stateName}`,
        scope: "regional",
        city: null,
        stateCode: location.stateCode,
        query: `\"${stateName}\" when:1d`,
        categories: ["noticias-locais", "regional", stateName, location.stateCode],
      });
    }

    if (location.city) {
      const cityKey = `city:${normalize(location.city)}:${location.stateCode}`;
      if (!seen.has(cityKey)) {
        seen.add(cityKey);
        await upsertLocalSource({
          code: `local-news-city-${slug(location.city)}-${location.stateCode.toLowerCase()}`,
          name: `Notícias locais — ${location.city}/${location.stateCode}`,
          scope: "local",
          city: location.city,
          stateCode: location.stateCode,
          query: `\"${location.city}\" \"${stateName}\" when:1d`,
          categories: ["noticias-locais", "local", location.city, stateName, location.stateCode],
        });
      }
    }
  }

  return { tenants: tenants.length, localities: seen.size };
}

export function sourceMatchesTenantLocation(
  source: { scope?: string | null; city?: string | null; regionCode?: string | null; countryCode?: string | null },
  location: TenantNewsLocation,
): boolean {
  const scope = normalize(source.scope ?? "");
  if (!new Set(["local", "regional", "state", "estadual", "municipal"]).has(scope)) return true;
  if ((source.countryCode ?? "BR").toUpperCase() !== "BR") return false;

  const sourceState = (source.regionCode ?? "").toUpperCase();
  if (!location.stateCode || sourceState !== location.stateCode.toUpperCase()) return false;
  if (scope === "local" || scope === "municipal") {
    return Boolean(location.city && source.city && normalize(location.city) === normalize(source.city));
  }
  return true;
}
