import { and, desc, eq, gte } from "drizzle-orm";
import {
  businessProfilesTable,
  db,
  fornecedoresTable,
  jarvisCasesTable,
  vieSourcesTable,
} from "@workspace/db";
import { getActiveCatalogPreview } from "../lib/catalog-readiness.js";
import { loadJarvisContractDocumentIntelligence } from "./jarvis-contract-document-intelligence.js";
import { loadJarvisKeyPeopleIntelligence } from "./jarvis-key-people-intelligence.js";

export type JarvisWatchlistKind =
  | "empresa"
  | "concorrente"
  | "fornecedor"
  | "produto"
  | "localidade"
  | "tema"
  | "pessoa_chave";

export type JarvisWatchlistItem = {
  key: string;
  kind: JarvisWatchlistKind;
  label: string;
  origin: "business_profile" | "supplier_registry" | "official_catalog" | "key_people_registry";
  monitoringStatus: "active_signal" | "monitored_no_recent_signal" | "configured_only";
  recentCaseIds: string[];
};

export type JarvisBlindSpot = {
  code: string;
  severity: "attention" | "risk";
  area: "perfil" | "concorrencia" | "fornecedores" | "catalogo" | "geografia" | "fontes" | "aprendizado" | "contratos" | "pessoas";
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

function sourceIdentity(item: {
  source: string;
  evidence: Record<string, unknown> | null;
}) {
  const evidence = item.evidence ?? {};
  const sourceId = typeof evidence.sourceId === "string" ? evidence.sourceId : null;
  const sourceCode = typeof evidence.sourceCode === "string" ? evidence.sourceCode : null;
  const sourceName = typeof evidence.sourceName === "string" ? evidence.sourceName : null;
  return sourceId ?? sourceCode ?? sourceName ?? item.source;
}

function itemKey(kind: JarvisWatchlistKind, label: string) {
  return `${kind}:${normalize(label).replaceAll(" ", "-")}`;
}

export async function loadJarvisWatchlistIntelligence(tenantId: string) {
  const now = new Date();
  const recentSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [profileRows, suppliers, catalog, recentCases, activeNewsSources, outcomeRows, contractIntelligence, keyPeopleIntelligence] = await Promise.all([
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
    loadJarvisContractDocumentIntelligence(tenantId),
    loadJarvisKeyPeopleIntelligence(tenantId),
  ]);

  const profile = profileRows[0] ?? null;
  const hasExternalMonitoring = activeNewsSources.length > 0;
  const searchableCases = recentCases.map((item) => ({ item, search: caseSearchText(item) }));
  const keyPeopleByName = new Map(keyPeopleIntelligence.items.map((item) => [normalize(item.name), item]));

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

  for (const person of keyPeopleIntelligence.items) {
    const label = compact(person.name);
    if (!label) continue;
    rawItems.push({ key: itemKey("pessoa_chave", label), kind: "pessoa_chave", label, origin: "key_people_registry" });
  }

  const deduped = new Map<string, Omit<JarvisWatchlistItem, "monitoringStatus" | "recentCaseIds">>();
  for (const item of rawItems) deduped.set(item.key, item);

  const watchlist: JarvisWatchlistItem[] = [...deduped.values()].map((item) => {
    if (item.kind === "pessoa_chave") {
      const person = keyPeopleByName.get(normalize(item.label));
      const recentCaseIds = person?.recentSignals.map((signal) => signal.caseId) ?? [];
      return {
        ...item,
        monitoringStatus: person?.status === "active_public_signal"
          ? "active_signal"
          : person?.status === "no_recent_public_signal"
            ? "monitored_no_recent_signal"
            : "configured_only",
        recentCaseIds,
      };
    }

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

  if (keyPeopleIntelligence.summary.coverageInsufficient > 0) {
    blindSpots.push({
      code: "key_people_public_coverage_insufficient",
      severity: "attention",
      area: "pessoas",
      title: "Cobertura pública insuficiente para parte das pessoas-chave",
      detail: `${keyPeopleIntelligence.summary.coverageInsufficient}/${keyPeopleIntelligence.summary.monitoredPeople} pessoa(s)-chave ativa(s) não possuem fonte pública configurada. Isso impede concluir se houve ou não mudança relevante.`,
      recommendation: "Associar somente fontes públicas permitidas e verificáveis às pessoas-chave que realmente precisam ser monitoradas.",
    });
  }

  if (contractIntelligence.summary.contracts > 0) {
    if (contractIntelligence.summary.lifecycleCoveragePercent < 100) {
      blindSpots.push({
        code: "contract_lifecycle_coverage_gap",
        severity: "attention",
        area: "contratos",
        title: "Cobertura incompleta do ciclo de vida contratual",
        detail: `${contractIntelligence.summary.contractsWithLifecycleMetadata}/${contractIntelligence.summary.contracts} contrato(s) possuem metadados estruturados de vigência, renovação, reajuste, obrigação ou risco. Ausência de metadados não significa ausência de obrigação ou risco.`,
        recommendation: "Completar vencimento, renovação, reajustes, obrigações e cláusulas relevantes nos contratos ativos prioritários.",
      });
    }

    const critical = contractIntelligence.alerts.filter((item) => item.severity === "critical").slice(0, 5);
    if (critical.length) {
      blindSpots.push({
        code: "contract_critical_alerts",
        severity: "risk",
        area: "contratos",
        title: `${critical.length} alerta(s) contratual(is) crítico(s) prioritário(s)`,
        detail: critical.map((item) => `[${item.contractId}] ${item.title}${item.dueAt ? ` (${item.dueAt.toISOString()})` : ""}`).join(" | "),
        recommendation: "Revisar os contratos indicados antes de renovar, reajustar, assumir compromisso ou concluir que não há pendência.",
      });
    }

    const risks = contractIntelligence.alerts.filter((item) => item.severity === "risk").slice(0, 5);
    if (risks.length) {
      blindSpots.push({
        code: "contract_risk_alerts",
        severity: "attention",
        area: "contratos",
        title: `${risks.length} alerta(s) contratual(is) de risco prioritário(s)`,
        detail: risks.map((item) => `[${item.contractId}] ${item.title}${item.dueAt ? ` (${item.dueAt.toISOString()})` : ""}`).join(" | "),
        recommendation: "Planejar a ação contratual com base na data e no dado persistido; não inferir cláusulas ou valores ausentes.",
      });
    }
  }

  for (const monitoredItem of watchlist) {
    if (monitoredItem.recentCaseIds.length < 2) continue;
    const relatedCases = recentCases.filter((item) => monitoredItem.recentCaseIds.includes(item.id));
    const sources = new Set(relatedCases.map(sourceIdentity));
    const normalizedCategories = new Set(relatedCases.map((item) => normalize(item.category)));
    const hasRisk = normalizedCategories.has("risco");
    const hasOpportunity = normalizedCategories.has("oportunidade");
    if (sources.size < 2 || !hasRisk || !hasOpportunity) continue;

    blindSpots.push({
      code: `source_divergence:${monitoredItem.key}`,
      severity: "attention",
      area: "fontes",
      title: `Sinais divergentes entre fontes sobre ${monitoredItem.label}`,
      detail: `Nos últimos 7 dias, fontes diferentes geraram sinais em direções opostas para o mesmo item monitorado (${monitoredItem.kind}). Casos relacionados: ${relatedCases.map((item) => item.id).join(", ")}. Isso indica divergência de interpretação/impacto e não prova, sozinho, contradição factual.`,
      recommendation: "Comparar as evidências e a confiabilidade de cada fonte antes de transformar o sinal em decisão ou ação automática.",
    });
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
      sourceDivergences: blindSpots.filter((item) => item.code.startsWith("source_divergence:" )).length,
      activeExternalSources: activeNewsSources.length,
      contractAlerts: contractIntelligence.summary.alerts,
      contractCriticalAlerts: contractIntelligence.summary.criticalAlerts,
      contractLifecycleCoveragePercent: contractIntelligence.summary.lifecycleCoveragePercent,
      monitoredKeyPeople: keyPeopleIntelligence.summary.monitoredPeople,
      keyPeopleWithPublicSignals: keyPeopleIntelligence.summary.activePublicSignals,
      keyPeopleCoverageInsufficient: keyPeopleIntelligence.summary.coverageInsufficient,
    },
    watchlist,
    blindSpots,
  };
}
