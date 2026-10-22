import { and, desc, eq } from "drizzle-orm";
import { db, dealsTable, jarvisCasesTable } from "@workspace/db";
import { extractExplicitFinancialImpact } from "./jarvis-priority-intelligence.js";

export type JarvisScenarioKind = "base" | "upside" | "adverse";

export type JarvisScenario = {
  kind: JarvisScenarioKind;
  label: string;
  description: string;
  projectedPipelineBrl: number | null;
  assumptions: string[];
  supportingCaseIds: string[];
  coverage: {
    dealsEvaluated: number;
    dealsWithValueAndProbability: number;
    openCasesEvaluated: number;
    casesWithExplicitFinancialImpact: number;
  };
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isRisk(category: string, severity: string) {
  return normalize(category).includes("risco") || normalize(severity).includes("risk");
}

function isOpportunity(category: string, severity: string) {
  return normalize(category).includes("oportun") || normalize(severity).includes("opportunity");
}

export async function loadJarvisScenarioIntelligence(tenantId: string) {
  const [deals, openCases] = await Promise.all([
    db
      .select({
        id: dealsTable.id,
        titulo: dealsTable.titulo,
        valor: dealsTable.valor,
        etapa: dealsTable.etapa,
        probabilidade: dealsTable.probabilidade,
        dataFechamentoPrevista: dealsTable.dataFechamentoPrevista,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(eq(dealsTable.tenantId, tenantId))
      .orderBy(desc(dealsTable.updatedAt))
      .limit(200),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        metric: jarvisCasesTable.metric,
        confidence: jarvisCasesTable.confidence,
        impact: jarvisCasesTable.impact,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        eq(jarvisCasesTable.status, "open"),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(200),
  ]);

  const activeDeals = deals.filter((item) => !["ganho", "perdido", "entregue"].includes(item.etapa));
  const measurableDeals = activeDeals.filter((item) => {
    const value = item.valor == null ? null : Number(item.valor);
    return value != null && Number.isFinite(value) && item.probabilidade != null;
  });

  const weightedPipeline = measurableDeals.reduce((sum, item) => {
    const value = Number(item.valor);
    const probability = Math.max(0, Math.min(100, item.probabilidade ?? 0));
    return sum + value * (probability / 100);
  }, 0);

  const explicitCases = openCases
    .map((item) => ({ ...item, financial: extractExplicitFinancialImpact(item.metric) }))
    .filter((item) => item.financial);

  const riskCases = explicitCases.filter((item) => isRisk(item.category, item.severity));
  const opportunityCases = explicitCases.filter((item) => isOpportunity(item.category, item.severity));

  const explicitRiskAmount = riskCases.reduce((sum, item) => sum + (item.financial?.amount ?? 0), 0);
  const explicitOpportunityAmount = opportunityCases.reduce((sum, item) => sum + (item.financial?.amount ?? 0), 0);

  const baseProjected = measurableDeals.length ? weightedPipeline : null;
  const upsideProjected = baseProjected == null ? null : baseProjected + explicitOpportunityAmount;
  const adverseProjected = baseProjected == null ? null : Math.max(0, baseProjected - explicitRiskAmount);

  const coverage = {
    dealsEvaluated: activeDeals.length,
    dealsWithValueAndProbability: measurableDeals.length,
    openCasesEvaluated: openCases.length,
    casesWithExplicitFinancialImpact: explicitCases.length,
  };

  const scenarios: JarvisScenario[] = [
    {
      kind: "base",
      label: "Cenário base",
      description: "Pipeline ponderado apenas por valor e probabilidade já persistidos no CRM.",
      projectedPipelineBrl: baseProjected,
      assumptions: [
        "Mantém as probabilidades atuais dos negócios ativos.",
        "Não adiciona valor financeiro que não esteja persistido.",
        "Não trata o cenário como previsão garantida; é uma fotografia ponderada do pipeline atual.",
      ],
      supportingCaseIds: [],
      coverage,
    },
    {
      kind: "upside",
      label: "Cenário otimista",
      description: "Cenário base acrescido somente de oportunidades com impacto financeiro explícito em Casos Vendor abertos.",
      projectedPipelineBrl: upsideProjected,
      assumptions: [
        "As probabilidades atuais do pipeline permanecem válidas.",
        "Somente impactos financeiros explicitamente persistidos em oportunidades são adicionados.",
        "O valor representa um teste de cenário, não uma promessa de receita.",
      ],
      supportingCaseIds: opportunityCases.map((item) => item.id),
      coverage,
    },
    {
      kind: "adverse",
      label: "Cenário adverso",
      description: "Cenário base reduzido somente por riscos com impacto financeiro explícito em Casos Vendor abertos.",
      projectedPipelineBrl: adverseProjected,
      assumptions: [
        "As probabilidades atuais do pipeline permanecem válidas.",
        "Somente impactos financeiros explicitamente persistidos em riscos são descontados.",
        "O valor representa um teste de estresse e não uma previsão certa de perda.",
      ],
      supportingCaseIds: riskCases.map((item) => item.id),
      coverage,
    },
  ];

  return {
    generatedAt: new Date(),
    scenarios,
    summary: {
      openCasesEvaluated: coverage.openCasesEvaluated,
      activeDeals: activeDeals.length,
      measurableDeals: measurableDeals.length,
      weightedPipelineBrl: baseProjected,
      explicitRiskAmountBrl: explicitRiskAmount || null,
      explicitOpportunityAmountBrl: explicitOpportunityAmount || null,
      coverageRatio: activeDeals.length ? measurableDeals.length / activeDeals.length : 0,
    },
  };
}
