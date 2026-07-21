/**
 * Industry Pack inicial do Revenue Scout para materiais de construção.
 * Mantém o vocabulário e a priorização vertical separados do motor core.
 */
export const CONSTRUCTION_STAGES = [
  "planejamento",
  "fundacao",
  "estrutura",
  "alvenaria",
  "cobertura",
  "instalacoes",
  "impermeabilizacao",
  "revestimentos",
  "esquadrias",
  "pintura",
  "acabamentos",
  "conclusao",
  "manutencao",
] as const;

export const CONSTRUCTION_CATEGORIES_BY_STAGE: Record<string, readonly string[]> = {
  planejamento: ["ferramentas", "epis", "materiais_basicos"],
  fundacao: ["aco", "concreto", "madeira", "impermeabilizantes", "formas"],
  estrutura: ["vergalhoes", "malhas", "concreto", "formas", "aditivos"],
  alvenaria: ["blocos", "tijolos", "argamassa", "vergas", "telas"],
  cobertura: ["telhas", "rufos", "calhas", "mantas", "fixadores"],
  instalacoes: ["hidraulica", "eletrica", "reservatorios", "quadros"],
  impermeabilizacao: ["mantas", "selantes", "primers", "membranas"],
  revestimentos: ["pisos", "porcelanatos", "ceramicas", "rejuntes"],
  esquadrias: ["portas", "janelas", "vidros", "ferragens"],
  pintura: ["massa", "selador", "tinta", "primer", "ferramentas"],
  acabamentos: ["loucas", "metais", "rodapes", "iluminacao", "acessorios"],
  conclusao: ["limpeza", "ferramentas", "manutencao"],
  manutencao: ["reposicao", "ferramentas", "produtos_manutencao"],
};

const BASE_SCORE: Record<string, number> = {
  mudanca_etapa: 80,
  sequencia_produto: 80,
  recuperacao_orcamento: 75,
  upgrade: 75,
  reducao_compra: 70,
  risco_perda: 70,
  expansao_cesta: 65,
  cross_sell: 65,
  aniversario: 60,
  recompra: 55,
  cliente_inativo: 50,
  reativacao: 45,
};

export interface ConstructionScoreInput {
  tipo?: string | null;
  diasDesdeUltimo: number;
  diasEsperado: number;
  intentScore?: number;
  dadosCompletos?: boolean;
  bloqueadoPorExcecao?: boolean;
}

export interface ConstructionScoreResult {
  score: number;
  prioridade: "alta" | "media" | "acompanhar" | "nao_agir";
  confianca: "alta" | "media" | "baixa";
}

export function scoreConstructionOpportunity(input: ConstructionScoreInput): ConstructionScoreResult {
  if (input.bloqueadoPorExcecao) {
    return { score: 0, prioridade: "nao_agir", confianca: "baixa" };
  }

  const base = BASE_SCORE[input.tipo ?? ""] ?? 50;
  const atraso = input.diasEsperado > 0 && input.diasDesdeUltimo > input.diasEsperado * 1.5 ? 10 : 0;
  const intencao = Math.min(Math.floor((input.intentScore ?? 0) / 10) * 5, 15);
  const completude = input.dadosCompletos ? 5 : 0;
  const score = Math.min(base + atraso + intencao + completude, 100);

  return {
    score,
    prioridade: score >= 75 ? "alta" : score >= 50 ? "media" : score >= 25 ? "acompanhar" : "nao_agir",
    confianca: score >= 75 ? "alta" : score >= 50 ? "media" : "baixa",
  };
}

export function nextConstructionStage(stage?: string | null): string | null {
  if (!stage) return null;
  const index = CONSTRUCTION_STAGES.indexOf(stage as (typeof CONSTRUCTION_STAGES)[number]);
  return index >= 0 ? CONSTRUCTION_STAGES[index + 1] ?? null : null;
}
