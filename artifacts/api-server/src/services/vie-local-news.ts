import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { businessProfilesTable, db, jarvisCasesTable, tenantsTable } from "@workspace/db";
import { getCompanyByCnpj } from "./cnpjService.js";
import { parseRss } from "./vie-rss-collector.js";

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
  const upper = value.toUpperCase().trim();
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
  cnpj?: string | null;
}): TenantNewsLocation {
  const discovery = input.discoveryData ?? {};
  const directCity = discoveryString(discovery, ["cidade", "city", "municipio", "município", "localidade"]);
  const directState = discoveryString(discovery, ["uf", "estado", "state", "stateCode", "regionCode"]);
  const parsed = parseAddress(input.endereco ?? null);
  const stateCode = stateCodeFromValue(directState) ?? parsed.stateCode;
  const city = directCity ?? parsed.city;
  return { city, stateCode, stateName: stateCode ? STATE_NAMES[stateCode] : directState };
}

export async function getTenantNewsLocation(tenantId: string): Promise<TenantNewsLocation> {
  const rows = await db
    .select({
      endereco: businessProfilesTable.endereco,
      discoveryData: businessProfilesTable.discoveryData,
      cnpj: businessProfilesTable.cnpj,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);

  const profile = rows[0];
  const resolved = resolveTenantNewsLocation(profile ?? {});
  if (resolved.stateCode) return resolved;

  if (profile?.cnpj) {
    const company = await getCompanyByCnpj(profile.cnpj).catch(() => null);
    if (company?.uf) {
      const stateCode = stateCodeFromValue(company.uf);
      return {
        city: cleanLabel(company.municipio),
        stateCode,
        stateName: stateCode ? STATE_NAMES[stateCode] : company.uf,
      };
    }
  }

  return resolved;
}

function googleNewsRss(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

function cleanGoogleTitle(title: string): string {
  const cleaned = title.replace(/\s+-\s+[^-]{2,80}$/u, "").trim();
  return cleaned || title.trim();
}

function cleanExcerpt(excerpt: string | null, title: string): string | null {
  if (!excerpt) return null;
  let value = excerpt.replace(/\s+/g, " ").trim();
  const normalizedTitle = normalize(title);
  if (normalize(value).startsWith(normalizedTitle)) value = value.slice(title.length).trim().replace(/^[-–—:|]+\s*/, "");
  value = value.replace(/\s+-\s+[^-]{2,80}$/u, "").trim();
  if (value.length < 35 || normalize(value) === normalizedTitle) return null;
  return value.slice(0, 700);
}

async function fetchLocalFeed(query: string) {
  const response = await fetch(googleNewsRss(query), {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      "User-Agent": "VendorAI-JARVIS/1.0 (+https://appvendorai.com)",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseRss(await response.text());
}

function articleKey(url: string, title: string) {
  return createHash("sha256").update(`${url}|${normalize(title)}`).digest("hex").slice(0, 32);
}

async function collectForTenant(tenantId: string, location: TenantNewsLocation) {
  if (!location.stateCode) return { fetched: 0, upserted: 0, errors: 0 };
  const stateName = location.stateName ?? STATE_NAMES[location.stateCode] ?? location.stateCode;
  const queries = location.city
    ? [
        `\"${location.city}\" \"${stateName}\" when:1d`,
        `\"${stateName}\" when:1d`,
      ]
    : [`\"${stateName}\" when:1d`];

  const collected = [] as ReturnType<typeof parseRss>;
  let errors = 0;
  for (const query of queries) {
    try {
      collected.push(...await fetchLocalFeed(query));
    } catch {
      errors += 1;
    }
  }

  const cutoff = Date.now() - 30 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const recent = collected
    .filter((item) => !item.publishedAt || item.publishedAt.getTime() >= cutoff)
    .filter((item) => {
      const key = item.url || normalize(item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, 30);

  const now = new Date();
  let upserted = 0;
  for (const item of recent) {
    const title = cleanGoogleTitle(item.title);
    const detail = cleanExcerpt(item.excerpt, title) ?? `Atualização local recente em ${location.city ? `${location.city}, ` : ""}${stateName}.`;
    const publishedAt = item.publishedAt ?? now;
    const regions = [location.city, stateName, location.stateCode].filter((value): value is string => Boolean(value));
    const evidence = {
      signalType: "regional",
      localNews: true,
      matchedRegions: regions,
      city: location.city,
      stateCode: location.stateCode,
      stateName,
      publishedAt: publishedAt.toISOString(),
      sourceHidden: true,
    };

    await db
      .insert(jarvisCasesTable)
      .values({
        tenantId,
        signalKey: `vie-local:${articleKey(item.url, title)}`,
        source: "news_local",
        category: "Local",
        severity: "attention",
        title,
        detail,
        confidence: 70,
        impact: 35,
        href: item.url,
        evidence,
        recommendedAction: "Analisar se a informação local altera prioridades, riscos ou oportunidades do negócio.",
        firstDetectedAt: publishedAt,
        lastDetectedAt: publishedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [jarvisCasesTable.tenantId, jarvisCasesTable.signalKey],
        set: {
          title,
          detail,
          href: item.url,
          evidence,
          status: "open",
          lastDetectedAt: publishedAt,
          updatedAt: now,
        },
      });
    upserted += 1;
  }

  return { fetched: collected.length, upserted, errors };
}

export async function collectLocalNewsForActiveTenants(): Promise<{
  tenants: number;
  localizedTenants: number;
  fetched: number;
  upserted: number;
  errors: number;
}> {
  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.status, "active"), eq(tenantsTable.countryCode, "BR")));

  let localizedTenants = 0;
  let fetched = 0;
  let upserted = 0;
  let errors = 0;

  for (const tenant of tenants) {
    try {
      const location = await getTenantNewsLocation(tenant.id);
      if (!location.stateCode) continue;
      localizedTenants += 1;
      const result = await collectForTenant(tenant.id, location);
      fetched += result.fetched;
      upserted += result.upserted;
      errors += result.errors;
    } catch {
      errors += 1;
    }
  }

  return { tenants: tenants.length, localizedTenants, fetched, upserted, errors };
}
