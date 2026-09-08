import { and, desc, eq, gte } from "drizzle-orm";
import { db, jarvisCasesTable, jarvisKeyPeopleTable } from "@workspace/db";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPublicExternalCase(item: {
  source: string;
  evidence: Record<string, unknown> | null;
}) {
  if (item.source === "news" || item.source.startsWith("news:")) return true;
  const evidence = item.evidence ?? {};
  if (evidence.public === true || evidence.isPublic === true) return true;
  return ["publicUrl", "sourceUrl", "url"].some(
    (key) => typeof evidence[key] === "string" && String(evidence[key]).startsWith("http"),
  );
}

export async function loadJarvisKeyPeopleIntelligence(tenantId: string) {
  const now = new Date();
  const recentSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [people, cases] = await Promise.all([
    db
      .select({
        id: jarvisKeyPeopleTable.id,
        name: jarvisKeyPeopleTable.name,
        organization: jarvisKeyPeopleTable.organization,
        role: jarvisKeyPeopleTable.role,
        monitoringReason: jarvisKeyPeopleTable.monitoringReason,
        publicSources: jarvisKeyPeopleTable.publicSources,
      })
      .from(jarvisKeyPeopleTable)
      .where(and(eq(jarvisKeyPeopleTable.tenantId, tenantId), eq(jarvisKeyPeopleTable.active, true)))
      .limit(100),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        detail: jarvisCasesTable.detail,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        source: jarvisCasesTable.source,
        evidence: jarvisCasesTable.evidence,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        gte(jarvisCasesTable.updatedAt, recentSince),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(300),
  ]);

  const publicCases = cases.filter(isPublicExternalCase).map((item) => ({
    item,
    search: normalize([
      item.title,
      item.detail,
      item.category,
      item.source,
      item.evidence ? JSON.stringify(item.evidence) : "",
    ].join(" ")),
  }));

  const items = people.map((person) => {
    const normalizedName = normalize(person.name);
    const matches = normalizedName.length >= 4
      ? publicCases.filter(({ search }) => search.includes(normalizedName)).slice(0, 8)
      : [];
    const configuredSources = Array.isArray(person.publicSources) ? person.publicSources.length : 0;

    return {
      id: person.id,
      name: person.name,
      organization: person.organization,
      role: person.role,
      monitoringReason: person.monitoringReason,
      configuredPublicSources: configuredSources,
      status: matches.length > 0
        ? "active_public_signal" as const
        : configuredSources > 0
          ? "no_recent_public_signal" as const
          : "coverage_insufficient" as const,
      recentSignals: matches.map(({ item }) => ({
        caseId: item.id,
        title: item.title,
        category: item.category,
        severity: item.severity,
        source: item.source,
        updatedAt: item.updatedAt,
      })),
    };
  });

  return {
    generatedAt: now,
    windowDays: 30,
    summary: {
      monitoredPeople: items.length,
      activePublicSignals: items.filter((item) => item.status === "active_public_signal").length,
      noRecentPublicSignals: items.filter((item) => item.status === "no_recent_public_signal").length,
      coverageInsufficient: items.filter((item) => item.status === "coverage_insufficient").length,
      publicCasesEvaluated: publicCases.length,
    },
    items,
    guardrails: [
      "Somente sinais externos com evidência pública registrada podem ser associados a pessoas-chave.",
      "Ausência de sinal recente não prova ausência de evento.",
      "Não inferir vida privada, localização, relações pessoais ou informações não presentes em fonte pública permitida.",
    ],
  };
}
