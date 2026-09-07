import { and, desc, eq, gte } from "drizzle-orm";
import {
  businessProfilesTable,
  db,
  fornecedoresTable,
  jarvisCasesTable,
  vieSourcesTable,
} from "@workspace/db";
import { getActiveCatalogPreview } from "../lib/catalog-readiness.js";

export type JarvisWatchlistKind =
  | "empresa"
  | "concorrente"
  | "fornecedor"
  | "produto"
  | "localidade"
  | "tema";

export type JarvisWatchlistItem = {
  key: string;
  kind: JarvisWatchlistKind;
  label: string;
  origin: "business_profile" | "supplier_registry" | "official_catalog";
  monitoringStatus: "active_signal" | "monitored_no_recent_signal" | "configured_only";
  recentCaseIds: string[];
};

export type JarvisBlindSpot = {
  code: string;
  severity: "attention" | "risk";
  area: "perfil" | "concorrencia" | "fornecedores" | "catalogo" | "geografia" | "fontes" | "aprendizado";
  title: string;
  detail: string;
  recommendation: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string | null | undefined, max = 180) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 30) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = compact(raw, 180);
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function caseSearchText(item: {
  title: string;
  detail: string;
  category: string;
  source: string;
  evidence: Record<string, unknown> | null;
}) {
  return normalize([
    item.title,
    item.detail,
    item.category,
    item.source,
    item.evidence ? JSON.stringify(item.evidence) : "",
  ].join(" "));
}

function itemKey(kind: JarvisWatchlistKind, label: string) {
  return `${kind}:${normalize(label).replaceAll(" ", "-")}`;
}

export async function loadJarvisWatchlistIntelligence(tenantId: string) {
  const now = new Date();
  const recentSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [profileRows, suppliers, catalog, recentCases, activeNewsSources, outcomeRows] = await Promise.all([
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db
      .select({ nome: fornecedoresTable.nome })
      .from(fornecedoresTable)
      .where(eq(fornecedoresTable.tenantId, tenantId)),
    getActiveCatalogPreview(tenantId, 25),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        detail: jarvisCasesTable.detail,
        category: jarvisCasesTable.category,
        source: jarvisCasesTable.source,
        evidence: jarvisCasesTable.evidence,
        status: jarvisCasesTable.status,
        lastDetectedAt: jarvisCasesTable.lastDetectedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        gte(jarvisCasesTable.updatedAt, recentSince),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(200),
    db
      .select({ id: vieSourcesTable.id })
      .from(vieSourcesTable)
      .where(and(eq(vieSourcesTable.active, true), eq(vieSourcesTable.domain, "news"))),
    db
      .select({ id: jarvisCasesTable.id, resultSummary: jarvisCasesTable.resultSummary })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        eq(jarvisCasesTable.status, "resolved"),
      ))
      .orderBy(desc(jarvisCasesTable.resolvedAt))
      .limit(20),
  ]);

  const profile = profileRows[0] ?? null;
  const hasExternalMonitoring = activeNewsSources.length > 0;
  const searchableCases = recentCases.map((item) => ({ item, search: caseSearchText(item) }));

  const rawItems: Array<Omit<JarvisWatchlistItem, "monitoringStatus" | "recentCaseIds">> = [];
  if (profile) {
    const companyName = profile.nomeFantasia ?? profile.razaoSocial;
    if (companyName) rawItems.push({ key: itemKey("empresa", companyName), kind: "empresa", label: compact(companyName), origin: "business_profile" });

    for (const competitor of uniqueStrings(profile.concorrentes ?? [], 20)) {
      rawItems.push({ key: itemKey("concorrente", competitor), kind: "concorrente", label: competitor, origin: "business_profile" });
    }

    if (profile.endereco) {
      rawItems.push({ key: itemKey("localidade", profile.endereco), kind: "localidade", label: compact(profile.endereco), origin: "business_profile" });
    }

    for (const theme of uniqueStrings([profile.vertical, profile.publicoAlvo], 5)) {
      rawItems.push({ key: itemKey("tema", theme), kind: "tema", label: theme, origin: "business_profile" });
    }
  }

  for (const supplier of uniqueStrings(suppliers.map((item) => item.nome), 25)) {
    rawItems.push({ key: itemKey("fornecedor", supplier), kind: "fornecedor", label: supplier, origin: "supplier_registry" });
  }

  for (const product of catalog) {
    const label = compact(product.nome);
    if (!label) continue;
    rawItems.push({ key: itemKey("produto", label), kind: "produto", label, origin: "official_catalog" });
  }

  const deduped = new Map<string, Omit<JarvisWatchlistItem, "monitoringStatus" | "recentCaseIds">>();
  for (const item of rawItems) deduped.set(item.key, item);

  const watchlist: JarvisWatchlistItem[] = [...deduped.values()].map((item) => {
    const needle = normalize(item.label);
    const matchedCases = needle.length >= 3
      ? searchableCases.filter(({ search }) => search.includes(needle)).slice(0, 5)
      : [];
    return {
      ...item,
      monitoringStatus: matchedCases.length > 0
        ? "active_signal"
        : hasExternalMonitoring
          ? "monitored_no_recent_signal"
          : "configured_only",
      recentCaseIds: matchedCases.map(({ item: matched }) => matched.id),
    };
  });

  const blindSpots: JarvisBlindSpot[] = [];
  if (!profile) {
    blindSpots.push({
      code: "business_profile_missing",
      severity: "risk",
      area: "perfil",
      title: "Perfil do negócio ausente",
      detail: "O JARVIS não tem perfil empresarial suficiente para definir contexto de mercado e monitoramento por tenant.",
      recommendation: "Concluir o perfil do negócio antes de ampliar a inteligência externa.",
    });
  } else {
    if (!(profile.concorrentes?.length)) {
      blindSpots.push({
        code: "competitors_not_configured",
        severity: "attention",
        area: "concorrencia",
        title: "Concorrentes não configurados",
        detail: "Não há concorrentes explícitos para acompanhar mudanças, preços, posicionamento ou movimentos comerciais.",
        recommendation: "Cadastrar concorrentes diretos e indiretos no perfil do negócio.",
      });
    }
    if (!profile.endereco) {
      blindSpots.push({
        code: "geography_not_configured",
        severity: "attention",
        area: "geografia",
        title: "Geografia operacional não definida",
        detail: "Sem localização configurada, o JARVIS não consegue diferenciar adequadamente sinais regionais dos nacionais.",
        recommendation: "Completar o endereço/região principal de atuação no perfil do negócio.",
      });
    }
  }

  if (!suppliers.length) {
    blindSpots.push({
      code: "suppliers_not_configured",
      severity: "attention",
      area: "fornecedores",
      title: "Fornecedores não cadastrados",
      detail: "O monitoramento não consegue relacionar notícias, risco de abastecimento ou alternativas a fornecedores reais do tenant.",
      recommendation: "Cadastrar os fornecedores relevantes no registro oficial de fornecedores.",
    });
  }

  if (!catalog.length) {
    blindSpots.push({
      code: "official_catalog_empty",
      severity: "attention",
      area: "catalogo",
      title: "Catálogo oficial sem produtos ativos",
      detail: "A inteligência de produto não tem itens ativos da fonte oficial para cruzar com demanda, concorrência e mercado.",
      recommendation: "Ativar os produtos reais no Catálogo antes de usar análise por produto.",
    });
  }

  if (!hasExternalMonitoring) {
    blindSpots.push({
      code: "external_sources_unavailable",
      severity: "risk",
      area: "fontes",
      title: "Sem fontes externas ativas",
      detail: "O VIE não possui fontes de notícias ativas; portanto, ausência de alertas externos não significa ausência de eventos.",
      recommendation: "Restabelecer ou ativar fontes oficiais no Source Registry do VIE.",
    });
  } else {
    const externalCases = recentCases.filter((item) => item.source === "news" || item.source.startsWith("news:"));
    if (!externalCases.length) {
      blindSpots.push({
        code: "no_recent_external_relevant_cases",
        severity: "attention",
        area: "fontes",
        title: "Nenhum Caso Vendor externo relevante nos últimos 7 dias",
        detail: "Há fontes externas ativas, mas nenhum sinal externo recente virou Caso Vendor. Isso pode significar baixa relevância real ou cobertura insuficiente; não é prova de que nada aconteceu.",
        recommendation: "Revisar cobertura, classificação por tenant e termos de contexto antes de concluir que não houve mudança de mercado.",
      });
    }
  }

  const outcomesWithLearning = outcomeRows.filter((item) => Boolean(item.resultSummary?.trim()));
  if (!outcomesWithLearning.length) {
    blindSpots.push({
      code: "decision_outcomes_missing",
      severity: "attention",
      area: "aprendizado",
      title: "Sem resultados registrados para decisões anteriores",
      detail: "O JARVIS ainda não possui evidência de resultado suficiente para aprender quais recomendações funcionaram neste tenant.",
      recommendation: "Registrar o resultado dos Casos Vendor encerrados para construir memória de decisão.",
    });
  }

  return {
    generatedAt: now,
    windowDays: 7,
    summary: {
      watchlistItems: watchlist.length,
      activeSignals: watchlist.filter((item) => item.monitoringStatus === "active_signal").length,
      configuredOnly: watchlist.filter((item) => item.monitoringStatus === "configured_only").length,
      blindSpots: blindSpots.length,
      riskBlindSpots: blindSpots.filter((item) => item.severity === "risk").length,
      activeExternalSources: activeNewsSources.length,
    },
    watchlist,
    blindSpots,
  };
}
