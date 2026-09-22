import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  db,
  salesObjectionEventsTable,
} from "@workspace/db";

export type CloserLearnedResponse = {
  category: string;
  objection: string;
  response: string;
  uses: number;
  advances: number;
  breakRate: number;
  confidenceScore: number;
};

const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: "preco",
    patterns: [
      /\bcar[oa]\b/i,
      /\bpre[cç]o\b/i,
      /\bvalor\b/i,
      /\bcusto\b/i,
      /\bor[cç]amento\b/i,
      /\bdesconto\b/i,
      /\bpromo[cç][aã]o\b/i,
      /\bfora do or[cç]amento\b/i,
    ],
  },
  {
    category: "decisor",
    patterns: [
      /\bs[oó]ci[oa]\b/i,
      /\bdiretor(a)?\b/i,
      /\bgerente\b/i,
      /\bminha esposa\b/i,
      /\bmeu marido\b/i,
      /\bpreciso falar com\b/i,
      /\bn[aã]o decido sozinho\b/i,
    ],
  },
  {
    category: "concorrencia",
    patterns: [
      /\bfornecedor\b/i,
      /\bconcorrente\b/i,
      /\bj[aá] uso\b/i,
      /\bj[aá] tenho (um|uma)\b/i,
      /\bsistema atual\b/i,
      /\boutra empresa\b/i,
    ],
  },
  {
    category: "timing",
    patterns: [
      /\bagora n[aã]o\b/i,
      /\bn[aã]o [ée] o momento\b/i,
      /\bmais pra frente\b/i,
      /\bmais para frente\b/i,
      /\bano que vem\b/i,
      /\bdepois\b/i,
      /\bvou pensar\b/i,
      /\bpreciso pensar\b/i,
    ],
  },
  {
    category: "confianca",
    patterns: [
      /\bn[aã]o conhe[cç]o\b/i,
      /\bconfian[cç]a\b/i,
      /\bconfi[aá]vel\b/i,
      /\breceio\b/i,
      /\bseguran[cç]a\b/i,
      /\bnunca ouvi falar\b/i,
    ],
  },
  {
    category: "necessidade",
    patterns: [
      /\bn[aã]o preciso\b/i,
      /\bn[aã]o vejo necessidade\b/i,
      /\bn[aã]o tenho esse problema\b/i,
      /\bpra mim n[aã]o serve\b/i,
      /\bpara mim n[aã]o serve\b/i,
    ],
  },
  {
    category: "risco",
    patterns: [
      /\bj[aá] tentei\b/i,
      /\bn[aã]o funcionou\b/i,
      /\bdeu errado\b/i,
      /\bgarantia\b/i,
      /\bmedo\b/i,
      /\bris[ck]o\b/i,
    ],
  },
  {
    category: "material",
    patterns: [
      /\bmanda(r)? (por )?(e-?mail|email|whatsapp|zap)\b/i,
      /\bme envia\b/i,
      /\bmanda a proposta\b/i,
      /\bmanda material\b/i,
    ],
  },
];

export function detectCloserObjectionCategories(message: string): string[] {
  const categories = CATEGORY_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(message)))
    .map((entry) => entry.category);
  return [...new Set(categories)];
}

export function wilsonLowerBound(successes: number, trials: number): number {
  if (trials <= 0) return 0;
  const z = 1.96;
  const p = Math.max(0, Math.min(successes, trials)) / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const adjustment =
    z *
    Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.max(0, (centre - adjustment) / denominator);
}

export async function loadCloserWinningResponses(input: {
  tenantId: string;
  segmento?: string | null;
  incomingMessage: string;
  minUses?: number;
  limit?: number;
}): Promise<CloserLearnedResponse[]> {
  const categories = detectCloserObjectionCategories(input.incomingMessage);
  if (categories.length === 0) return [];

  const segmento =
    input.segmento?.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, "_") || "geral";
  const minUses = Math.max(2, input.minUses ?? 3);
  const limit = Math.max(1, Math.min(input.limit ?? 3, 5));

  const conditions = [
    eq(salesObjectionEventsTable.tenantId, input.tenantId),
    isNotNull(salesObjectionEventsTable.responseText),
    inArray(salesObjectionEventsTable.category, categories),
    or(
      eq(salesObjectionEventsTable.segmento, segmento),
      eq(salesObjectionEventsTable.segmento, "geral"),
    ),
  ];

  const events = await db
    .select({
      normalizedObjection: salesObjectionEventsTable.normalizedObjection,
      category: salesObjectionEventsTable.category,
      responseText: salesObjectionEventsTable.responseText,
      brokeObjection: salesObjectionEventsTable.brokeObjection,
      createdAt: salesObjectionEventsTable.createdAt,
    })
    .from(salesObjectionEventsTable)
    .where(and(...conditions))
    .orderBy(desc(salesObjectionEventsTable.createdAt))
    .limit(500);

  const grouped = new Map<
    string,
    {
      category: string;
      objection: string;
      response: string;
      uses: number;
      advances: number;
    }
  >();

  for (const event of events) {
    const response = event.responseText?.trim();
    if (!response) continue;
    const responseKey = response.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
    const key = `${event.category}::${event.normalizedObjection}::${responseKey}`;
    const current = grouped.get(key) ?? {
      category: event.category,
      objection: event.normalizedObjection,
      response,
      uses: 0,
      advances: 0,
    };
    current.uses += 1;
    if (event.brokeObjection) current.advances += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .filter((item) => item.uses >= minUses)
    .map((item) => ({
      ...item,
      breakRate: Number(((item.advances / item.uses) * 100).toFixed(2)),
      confidenceScore: Number(wilsonLowerBound(item.advances, item.uses).toFixed(4)),
    }))
    .sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }
      if (b.uses !== a.uses) return b.uses - a.uses;
      return b.breakRate - a.breakRate;
    })
    .slice(0, limit);
}

export function formatCloserWinningResponsesPrompt(
  responses: CloserLearnedResponse[],
): string | null {
  if (responses.length === 0) return null;

  return [
    "## MEMÓRIA COMERCIAL DO TENANT — RESPOSTAS COM EVIDÊNCIA HISTÓRICA",
    "Use somente se a objeção atual for realmente compatível. Isto é evidência histórica, não uma ordem para copiar o texto.",
    "Adapte ao contexto atual e preserve as regras de verdade comercial. Nunca invente fatos ausentes só porque uma resposta antiga os mencionou.",
    "Priorize abordagens com maior amostra e confiança. Não revele métricas internas ao lead.",
    ...responses.map(
      (item, index) =>
        `${index + 1}. Categoria: ${item.category} | Objeção: ${item.objection} | Usos: ${item.uses} | Avanços: ${item.advances} | Taxa de quebra: ${item.breakRate}% | Confiança: ${item.confidenceScore} | Resposta histórica: ${item.response}`,
    ),
  ].join("\n");
}
