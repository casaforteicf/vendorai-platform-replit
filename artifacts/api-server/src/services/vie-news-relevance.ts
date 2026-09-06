import { and, desc, eq, gte } from "drizzle-orm";
import {
  businessProfilesTable,
  db,
  jarvisCasesTable,
  tenantsTable,
  vieItemsTable,
  vieSourcesTable,
} from "@workspace/db";

const STOPWORDS = new Set([
  "para", "com", "sem", "uma", "que", "dos", "das", "por", "como", "mais", "seu", "sua",
  "empresa", "empresas", "brasil", "brasileiro", "brasileira", "servico", "servicos", "produto", "produtos",
]);

const OPPORTUNITY_WORDS = [
  "crescimento", "investimento", "credito", "financiamento", "expansao", "demanda", "oportunidade", "licitacao",
  "obra", "lancamento", "incentivo", "reducao de juros", "aumento de vendas", "novo mercado",
];

const RISK_WORDS = [
  "aumento de custo", "alta de preco", "inflacao", "escassez", "crise", "queda", "recessao", "risco", "fraude",
  "multa", "proibicao", "restricao", "atraso", "desabastecimento", "juros altos", "alta do dolar", "regulacao",
];

export type VieTenantNewsScore = {
  relevant: boolean;
  score: number;
  confidence: number;
  impact: number;
  category: "Oportunidade" | "Risco" | "Mercado";
  severity: "opportunity" | "risk" | "attention";
  matchedTerms: string[];
  rationale: string;
};

type TenantContext = {
  name: string;
  vertical: string;
  audience: string;
  differentiators: string;
  competitors: string[];
  products: string[];
};

type NewsInput = {
  title: string;
  excerpt?: string | null;
  categories?: string[] | null;
  sourceReliability?: number | null;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function terms(value: string): string[] {
  return [...new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && !STOPWORDS.has(item)),
  )];
}

function tenantKeywords(context: TenantContext): string[] {
  return [...new Set([
    ...terms(context.vertical),
    ...terms(context.audience),
    ...terms(context.differentiators),
    ...context.competitors.flatMap(terms),
    ...context.products.flatMap(terms),
  ])].slice(0, 80);
}

function containsPhrase(haystack: string, phrases: string[]): boolean {
  return phrases.some((phrase) => haystack.includes(normalize(phrase)));
}

export function scoreVieNewsForTenant(context: TenantContext, news: NewsInput): VieTenantNewsScore {
  const text = normalize(`${news.title} ${news.excerpt ?? ""} ${(news.categories ?? []).join(" ")}`);
  const keywords = tenantKeywords(context);
  const matchedTerms = keywords.filter((keyword) => text.includes(keyword)).slice(0, 12);

  const productMatches = context.products.filter((product) => {
    const productTerms = terms(product);
    return productTerms.some((term) => text.includes(term));
  }).length;
  const competitorMatches = context.competitors.filter((competitor) => {
    const competitorTerms = terms(competitor);
    return competitorTerms.some((term) => text.includes(term));
  }).length;

  const opportunity = containsPhrase(text, OPPORTUNITY_WORDS);
  const risk = containsPhrase(text, RISK_WORDS);
  const reliability = Math.max(0, Math.min(100, news.sourceReliability ?? 70));

  let score = 20;
  score += Math.min(36, matchedTerms.length * 6);
  score += Math.min(18, productMatches * 9);
  score += Math.min(16, competitorMatches * 8);
  if (opportunity || risk) score += 8;
  score = Math.max(0, Math.min(100, score));

  const confidence = Math.max(0, Math.min(100, Math.round((reliability * 0.55) + (score * 0.45))));
  const impact = Math.max(0, Math.min(100, Math.round(score * (opportunity || risk ? 1 : 0.82))));

  const category: VieTenantNewsScore["category"] = risk ? "Risco" : opportunity ? "Oportunidade" : "Mercado";
  const severity: VieTenantNewsScore["severity"] = risk ? "risk" : opportunity ? "opportunity" : "attention";
  const relevant = score >= 60 && matchedTerms.length >= 2;

  const rationale = relevant
    ? `Notícia relacionada ao contexto do tenant por ${matchedTerms.length} termos relevantes${productMatches ? `, ${productMatches} correspondência(s) de produto` : ""}${competitorMatches ? ` e ${competitorMatches} de concorrente` : ""}.`
    : "Sinal abaixo do limiar mínimo de relevância para este tenant.";

  return { relevant, score, confidence, impact, category, severity, matchedTerms, rationale };
}

async function loadTenantContext(tenantId: string): Promise<TenantContext | null> {
  const [tenant, profile] = await Promise.all([
    db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
  ]);

  const tenantRow = tenant[0];
  const profileRow = profile[0];
  if (!tenantRow && !profileRow) return null;

  return {
    name: profileRow?.nomeFantasia || profileRow?.razaoSocial || tenantRow?.nomeEmpresa || tenantRow?.name || "Tenant",
    vertical: profileRow?.vertical || tenantRow?.segmento || tenantRow?.vertical || "",
    audience: profileRow?.publicoAlvo || "",
    differentiators: profileRow?.diferenciais || "",
    competitors: Array.isArray(profileRow?.concorrentes) ? profileRow.concorrentes : [],
    products: Array.isArray(profileRow?.produtos)
      ? profileRow.produtos.map((product) => `${product.nome} ${product.descricao ?? ""}`.trim())
      : [],
  };
}

export async function classifyRecentVieNewsForTenant(tenantId: string, lookbackHours = 72) {
  const context = await loadTenantContext(tenantId);
  if (!context) return { tenantId, evaluated: 0, relevant: 0, upserted: 0 };

  const since = new Date(Date.now() - Math.max(1, lookbackHours) * 60 * 60 * 1000);
  const rows = await db
    .select({ item: vieItemsTable, source: vieSourcesTable })
    .from(vieItemsTable)
    .innerJoin(vieSourcesTable, eq(vieItemsTable.sourceId, vieSourcesTable.id))
    .where(and(eq(vieSourcesTable.active, true), eq(vieSourcesTable.domain, "news"), gte(vieItemsTable.collectedAt, since)))
    .orderBy(desc(vieItemsTable.publishedAt), desc(vieItemsTable.collectedAt))
    .limit(200);

  let relevant = 0;
  let upserted = 0;
  const now = new Date();

  for (const { item, source } of rows) {
    const score = scoreVieNewsForTenant(context, {
      title: item.title,
      excerpt: item.excerpt,
      categories: item.categories,
      sourceReliability: source.reliabilityScore,
    });
    if (!score.relevant) continue;
    relevant += 1;

    const signalKey = `vie-news:${item.id}`;
    await db
      .insert(jarvisCasesTable)
      .values({
        tenantId,
        signalKey,
        source: "news",
        category: score.category,
        severity: score.severity,
        title: item.title,
        detail: item.excerpt || score.rationale,
        confidence: score.confidence,
        impact: score.impact,
        href: item.url,
        evidence: {
          vieItemId: item.id,
          sourceId: source.id,
          sourceCode: source.code,
          sourceName: source.name,
          sourceReliability: source.reliabilityScore,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          matchedTerms: score.matchedTerms,
          relevanceScore: score.score,
          rationale: score.rationale,
        },
        recommendedAction: score.category === "Risco"
          ? "Avaliar exposição do negócio e definir resposta preventiva."
          : score.category === "Oportunidade"
            ? "Avaliar potencial comercial e decidir se deve virar ação, lead ou campanha."
            : "Analisar com o JARVIS se o movimento altera prioridades do negócio.",
        firstDetectedAt: now,
        lastDetectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [jarvisCasesTable.tenantId, jarvisCasesTable.signalKey],
        set: {
          category: score.category,
          severity: score.severity,
          title: item.title,
          detail: item.excerpt || score.rationale,
          confidence: score.confidence,
          impact: score.impact,
          href: item.url,
          evidence: {
            vieItemId: item.id,
            sourceId: source.id,
            sourceCode: source.code,
            sourceName: source.name,
            sourceReliability: source.reliabilityScore,
            publishedAt: item.publishedAt?.toISOString() ?? null,
            matchedTerms: score.matchedTerms,
            relevanceScore: score.score,
            rationale: score.rationale,
          },
          lastDetectedAt: now,
          updatedAt: now,
        },
      });
    upserted += 1;
  }

  return { tenantId, evaluated: rows.length, relevant, upserted };
}
