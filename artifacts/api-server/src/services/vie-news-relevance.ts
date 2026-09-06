import { and, desc, eq, gte } from "drizzle-orm";
import {
  businessProfilesTable,
  db,
  fornecedoresTable,
  jarvisCasesTable,
  tenantsTable,
  vieItemsTable,
  vieSourcesTable,
} from "@workspace/db";

const STOPWORDS = new Set([
  "para", "com", "sem", "uma", "que", "dos", "das", "por", "como", "mais", "seu", "sua",
  "empresa", "empresas", "brasil", "brasileiro", "brasileira", "servico", "servicos", "produto", "produtos",
  "rua", "avenida", "rodovia", "bairro",
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
  signalType: "competitor" | "supplier" | "regional" | "sectoral" | "market";
  matchedTerms: string[];
  matchedCompetitors: string[];
  matchedSuppliers: string[];
  matchedRegions: string[];
  rationale: string;
};

type TenantContext = {
  name: string;
  vertical: string;
  audience: string;
  differentiators: string;
  competitors: string[];
  suppliers: string[];
  products: string[];
  regions: string[];
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
    ...context.suppliers.flatMap(terms),
    ...context.products.flatMap(terms),
    ...context.regions.flatMap(terms),
  ])].slice(0, 100);
}

function containsPhrase(haystack: string, phrases: string[]): boolean {
  return phrases.some((phrase) => haystack.includes(normalize(phrase)));
}

function matchingNamedEntities(text: string, entities: string[]): string[] {
  return entities.filter((entity) => {
    const entityTerms = terms(entity);
    if (!entityTerms.length) return false;
    return entityTerms.every((term) => text.includes(term));
  });
}

function matchingRegions(text: string, regions: string[]): string[] {
  return regions.filter((region) => terms(region).some((term) => text.includes(term)));
}

export function scoreVieNewsForTenant(context: TenantContext, news: NewsInput): VieTenantNewsScore {
  const text = normalize(`${news.title} ${news.excerpt ?? ""} ${(news.categories ?? []).join(" ")}`);
  const keywords = tenantKeywords(context);
  const matchedTerms = keywords.filter((keyword) => text.includes(keyword)).slice(0, 16);

  const productMatches = context.products.filter((product) => {
    const productTerms = terms(product);
    return productTerms.some((term) => text.includes(term));
  }).length;
  const matchedCompetitors = matchingNamedEntities(text, context.competitors);
  const matchedSuppliers = matchingNamedEntities(text, context.suppliers);
  const matchedRegions = matchingRegions(text, context.regions);
  const verticalMatch = terms(context.vertical).some((term) => text.includes(term));

  const opportunity = containsPhrase(text, OPPORTUNITY_WORDS);
  const risk = containsPhrase(text, RISK_WORDS);
  const reliability = Math.max(0, Math.min(100, news.sourceReliability ?? 70));

  let score = 20;
  score += Math.min(35, matchedTerms.length * 5);
  score += Math.min(16, productMatches * 8);
  score += Math.min(30, matchedCompetitors.length * 30);
  score += Math.min(28, matchedSuppliers.length * 28);
  score += Math.min(12, matchedRegions.length * 12);
  if (opportunity || risk) score += 8;
  score = Math.max(0, Math.min(100, score));

  const confidence = Math.max(0, Math.min(100, Math.round((reliability * 0.55) + (score * 0.45))));
  const impact = Math.max(0, Math.min(100, Math.round(score * (opportunity || risk ? 1 : 0.82))));

  const category: VieTenantNewsScore["category"] = risk ? "Risco" : opportunity ? "Oportunidade" : "Mercado";
  const severity: VieTenantNewsScore["severity"] = risk ? "risk" : opportunity ? "opportunity" : "attention";
  const signalType: VieTenantNewsScore["signalType"] = matchedCompetitors.length
    ? "competitor"
    : matchedSuppliers.length
      ? "supplier"
      : matchedRegions.length
        ? "regional"
        : productMatches || verticalMatch
          ? "sectoral"
          : "market";
  const externalEntityMatches = matchedCompetitors.length + matchedSuppliers.length;
  const relevant = score >= 60 && (matchedTerms.length >= 2 || externalEntityMatches > 0);

  const signalLabel = signalType === "competitor"
    ? "concorrente"
    : signalType === "supplier"
      ? "fornecedor"
      : signalType === "regional"
        ? "regional"
        : signalType === "sectoral"
          ? "setorial"
          : "de mercado";
  const rationale = relevant
    ? `Sinal ${signalLabel} relacionado ao contexto do tenant por ${matchedTerms.length} termos relevantes${productMatches ? `, ${productMatches} correspondência(s) de produto` : ""}${matchedCompetitors.length ? `, concorrente(s): ${matchedCompetitors.join(", ")}` : ""}${matchedSuppliers.length ? `, fornecedor(es): ${matchedSuppliers.join(", ")}` : ""}${matchedRegions.length ? `, região(ões): ${matchedRegions.join(", ")}` : ""}.`
    : "Sinal abaixo do limiar mínimo de relevância para este tenant.";

  return {
    relevant,
    score,
    confidence,
    impact,
    category,
    severity,
    signalType,
    matchedTerms,
    matchedCompetitors,
    matchedSuppliers,
    matchedRegions,
    rationale,
  };
}

async function loadTenantContext(tenantId: string): Promise<TenantContext | null> {
  const [tenant, profile, suppliers] = await Promise.all([
    db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({ nome: fornecedoresTable.nome }).from(fornecedoresTable).where(eq(fornecedoresTable.tenantId, tenantId)),
  ]);

  const tenantRow = tenant[0];
  const profileRow = profile[0];
  if (!tenantRow && !profileRow) return null;

  const discovery = profileRow?.discoveryData ?? {};
  const discoveredRegions = ["cidade", "city", "municipio", "estado", "state", "regiao", "region"]
    .flatMap((key) => typeof discovery[key] === "string" ? [discovery[key] as string] : []);
  const regions = [...new Set([
    ...(profileRow?.endereco ? [profileRow.endereco] : []),
    ...discoveredRegions,
  ].filter(Boolean))];

  return {
    name: profileRow?.nomeFantasia || profileRow?.razaoSocial || tenantRow?.nomeEmpresa || tenantRow?.name || "Tenant",
    vertical: profileRow?.vertical || tenantRow?.segmento || tenantRow?.vertical || "",
    audience: profileRow?.publicoAlvo || "",
    differentiators: profileRow?.diferenciais || "",
    competitors: Array.isArray(profileRow?.concorrentes) ? profileRow.concorrentes : [],
    suppliers: suppliers.map((supplier) => supplier.nome).filter(Boolean),
    products: Array.isArray(profileRow?.produtos)
      ? profileRow.produtos.map((product) => `${product.nome} ${product.descricao ?? ""}`.trim())
      : [],
    regions,
  };
}

function recommendedAction(score: VieTenantNewsScore): string {
  if (score.signalType === "competitor") {
    return "Comparar o movimento do concorrente com preços, oferta, território e pipeline antes de decidir a resposta.";
  }
  if (score.signalType === "supplier") {
    return score.category === "Risco"
      ? "Avaliar impacto em custo, prazo, dependência e alternativas de fornecimento."
      : "Avaliar se o movimento do fornecedor cria ganho de margem, prazo ou condição comercial.";
  }
  if (score.signalType === "regional") {
    return "Cruzar o movimento regional com clientes, leads, território e capacidade comercial do tenant.";
  }
  if (score.category === "Risco") {
    return "Avaliar exposição do negócio e definir resposta preventiva.";
  }
  if (score.category === "Oportunidade") {
    return "Avaliar potencial comercial e decidir se deve virar ação, lead ou campanha.";
  }
  return "Analisar com o JARVIS se o movimento altera prioridades do negócio.";
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

    const evidence = {
      vieItemId: item.id,
      sourceId: source.id,
      sourceCode: source.code,
      sourceName: source.name,
      sourceReliability: source.reliabilityScore,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      signalType: score.signalType,
      matchedTerms: score.matchedTerms,
      matchedCompetitors: score.matchedCompetitors,
      matchedSuppliers: score.matchedSuppliers,
      matchedRegions: score.matchedRegions,
      relevanceScore: score.score,
      rationale: score.rationale,
    };

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
        evidence,
        recommendedAction: recommendedAction(score),
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
          evidence,
          recommendedAction: recommendedAction(score),
          lastDetectedAt: now,
          updatedAt: now,
        },
      });
    upserted += 1;
  }

  return { tenantId, evaluated: rows.length, relevant, upserted };
}
