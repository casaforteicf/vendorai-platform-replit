import { asc, eq, and } from "drizzle-orm";
import {
  db,
  arqdorMarketProtecoesTenantTable,
  type ArqdorMarketProtecaoModo,
  type ArqdorMarketProtecaoEscopo,
} from "@workspace/db";

export type MarketProtectedCandidate = {
  vendedorTenantId: string;
  categoria?: string | null;
  nome?: string | null;
  especificacoes?: Record<string, unknown> | null;
};

export type MarketProtectionDecision = {
  modo: ArqdorMarketProtecaoModo | "sem_regra";
  regraId: string | null;
  escopo: ArqdorMarketProtecaoEscopo | null;
  valor: string | null;
  incluir: boolean;
  boost: number;
};

export function normalizeMarketProtectionValue(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateSubcategory(candidate: MarketProtectedCandidate): string {
  const raw = candidate.especificacoes?.subcategoria
    ?? candidate.especificacoes?.subCategoria
    ?? candidate.especificacoes?.subcategory
    ?? "";
  return normalizeMarketProtectionValue(raw);
}

function matchRule(
  rule: {
    id: string;
    escopo: ArqdorMarketProtecaoEscopo;
    valor: string;
    valorNormalizado: string;
    modo: ArqdorMarketProtecaoModo;
  },
  candidate: MarketProtectedCandidate,
): boolean {
  const target = rule.valorNormalizado;
  if (!target) return false;

  if (rule.escopo === "categoria") {
    return normalizeMarketProtectionValue(candidate.categoria) === target;
  }
  if (rule.escopo === "subcategoria") {
    return candidateSubcategory(candidate) === target;
  }
  return normalizeMarketProtectionValue(candidate.nome) === target;
}

export async function loadTenantMarketProtectionRules(tenantId: string) {
  return db
    .select()
    .from(arqdorMarketProtecoesTenantTable)
    .where(and(
      eq(arqdorMarketProtecoesTenantTable.tenantId, tenantId),
      eq(arqdorMarketProtecoesTenantTable.ativo, true),
    ))
    .orderBy(asc(arqdorMarketProtecoesTenantTable.prioridade), asc(arqdorMarketProtecoesTenantTable.createdAt));
}

export function evaluateMarketProtection(
  candidate: MarketProtectedCandidate,
  sponsorTenantId: string,
  rules: Awaited<ReturnType<typeof loadTenantMarketProtectionRules>>,
): MarketProtectionDecision {
  const matched = rules.find((rule) => matchRule(rule, candidate));
  const isSponsor = candidate.vendedorTenantId === sponsorTenantId;

  if (!matched) {
    return {
      modo: "sem_regra",
      regraId: null,
      escopo: null,
      valor: null,
      incluir: !isSponsor,
      boost: 0,
    };
  }

  if (matched.modo === "bloqueado") {
    return {
      modo: matched.modo,
      regraId: matched.id,
      escopo: matched.escopo,
      valor: matched.valor,
      incluir: false,
      boost: 0,
    };
  }

  if (matched.modo === "exclusivo") {
    return {
      modo: matched.modo,
      regraId: matched.id,
      escopo: matched.escopo,
      valor: matched.valor,
      incluir: isSponsor,
      boost: isSponsor ? 1000 : 0,
    };
  }

  if (matched.modo === "preferencial") {
    return {
      modo: matched.modo,
      regraId: matched.id,
      escopo: matched.escopo,
      valor: matched.valor,
      incluir: true,
      boost: isSponsor ? 500 : 0,
    };
  }

  return {
    modo: matched.modo,
    regraId: matched.id,
    escopo: matched.escopo,
    valor: matched.valor,
    incluir: !isSponsor,
    boost: 0,
  };
}
