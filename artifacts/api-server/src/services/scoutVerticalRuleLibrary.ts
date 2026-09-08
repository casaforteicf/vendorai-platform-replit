import { eq, sql } from "drizzle-orm";
import { db, scoutRegrasTable, scoutOportunidadesTable, tenantsTable } from "@workspace/db";
import { resolveVerticalRevenueProfile } from "./verticalRevenueEngine.js";

const MINIMUM_RULES_PER_TENANT = 50;

const STRATEGIES = [
  { tipo: "recompra", label: "Recompra", condition: (days: number) => ({ diasSemCompra: days }) },
  { tipo: "reativacao", label: "Reativação", condition: (days: number) => ({ diasSemVisita: days }) },
  { tipo: "follow_up", label: "Retorno comercial", condition: (days: number) => ({ diasSemRetorno: days }) },
  { tipo: "cross_sell", label: "Venda complementar", condition: (days: number) => ({ janelaAnaliseDias: days }) },
  { tipo: "upgrade", label: "Evolução de solução", condition: (days: number) => ({ janelaAnaliseDias: days }) },
  { tipo: "aniversario", label: "Relacionamento", condition: (days: number) => ({ antecedenciaDias: days }) },
  { tipo: "orcamento_parado", label: "Orçamento parado", condition: (days: number) => ({ diasParado: days }) },
  { tipo: "renovacao", label: "Renovação", condition: (days: number) => ({ diasAntesVencimento: days }) },
  { tipo: "manutencao", label: "Manutenção preventiva", condition: (days: number) => ({ cicloDias: days }) },
  { tipo: "sequencia_produto", label: "Próxima etapa", condition: (days: number) => ({ diasApos: days }) },
] as const;

const WINDOWS = [
  { label: "imediata", days: 7 },
  { label: "curta", days: 15 },
  { label: "mensal", days: 30 },
  { label: "ampliada", days: 60 },
  { label: "estratégica", days: 90 },
] as const;

function looksLikeBudgetRecovery(name: string | null | undefined) {
  return /or[çc]amento|proposta/i.test(name ?? "");
}

/**
 * Corrige um legado semântico importante: algumas regras antigas de recuperação
 * de orçamento foram gravadas como `reativacao`. Isso faz um lead que nunca
 * comprou aparecer como "cliente reativado" e ainda roteia para o agente errado.
 *
 * A correção é idempotente e roda junto da manutenção da biblioteca:
 * - regra orçamento/proposta + tipo reativacao -> orcamento_parado;
 * - converte diasSemVisita em diasParado quando necessário;
 * - corrige oportunidades já abertas para o mesmo tipo;
 * - substitui a explicação antiga por uma leitura compatível com lead/proposta.
 */
async function repairLegacyBudgetRecoveryRules(tx: any, tenantId: string) {
  const legacyRules = await tx
    .select({
      id: scoutRegrasTable.id,
      nome: scoutRegrasTable.nome,
      tipo: scoutRegrasTable.tipo,
      condicoes: scoutRegrasTable.condicoes,
    })
    .from(scoutRegrasTable)
    .where(eq(scoutRegrasTable.tenantId, tenantId));

  for (const rule of legacyRules) {
    if (rule.tipo !== "reativacao" || !looksLikeBudgetRecovery(rule.nome)) continue;

    const cond = (rule.condicoes ?? {}) as Record<string, unknown>;
    const diasParado = Number(cond.diasParado ?? cond.diasSemVisita ?? 7);
    const normalizedConditions = {
      ...cond,
      diasParado: Number.isFinite(diasParado) && diasParado > 0 ? diasParado : 7,
      classificacaoCorrigida: "orcamento_parado",
    };

    await tx
      .update(scoutRegrasTable)
      .set({
        tipo: "orcamento_parado",
        condicoes: normalizedConditions,
      } as any)
      .where(eq(scoutRegrasTable.id, rule.id));

    await tx
      .update(scoutOportunidadesTable)
      .set({
        tipo: "orcamento_parado",
        explanation: {
          facts: {
            regra: rule.nome,
            classificacao_corrigida: true,
            origem: "orçamento/proposta sem avanço",
          },
          inference: {
            resumo: "Há uma oportunidade comercial sem conclusão registrada para este lead.",
            motivo: "A regra de recuperação de orçamento identificou uma proposta ou negociação parada. Isso é follow-up comercial, não reativação de cliente.",
          },
          autonomy: {
            requer_confirmacao_humana: true,
            contato_automatico: false,
          },
        },
      } as any)
      .where(eq(scoutOportunidadesTable.regraId, rule.id));
  }
}

/**
 * Garante uma biblioteca inicial sem apagar, alterar ou reativar regras do
 * cliente. Os modelos entram inativos para revisão humana e podem ser
 * configurados com produtos/serviços reais antes da ativação.
 */
export async function ensureMinimumScoutRulesForTenant(
  tenantId: string,
  minimum = MINIMUM_RULES_PER_TENANT,
) {
  return db.transaction(async (tx) => {
    // Dashboard e tela de regras podem carregar juntos. O lock por tenant
    // impede duas requisições simultâneas de inserirem a mesma biblioteca.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`scout-rule-library:${tenantId}`}))`);

    await repairLegacyBudgetRecoveryRules(tx, tenantId);

    const [tenant] = await tx.select({ vertical: tenantsTable.vertical })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    const existing = await tx.select({ nome: scoutRegrasTable.nome })
      .from(scoutRegrasTable)
      .where(eq(scoutRegrasTable.tenantId, tenantId));
    if (existing.length >= minimum) return { existing: existing.length, inserted: 0 };

    const vertical = tenant?.vertical?.trim() || "Geral";
    const profile = resolveVerticalRevenueProfile(vertical);
    const signals = profile?.signals?.length
      ? profile.signals
      : ["recorrência", "inatividade", "necessidade complementar", "continuidade comercial"];
    const knownNames = new Set(existing.map((rule) => rule.nome));
    const templates = STRATEGIES.flatMap((strategy, strategyIndex) =>
      WINDOWS.map((window, windowIndex) => {
        const signal = signals[(strategyIndex + windowIndex) % signals.length]!;
        const nome = `Biblioteca Scout · ${vertical} · ${strategy.label} · ${window.label}`;
        return {
          tenantId,
          nome,
          tipo: strategy.tipo,
          condicoes: {
            ...strategy.condition(window.days),
            biblioteca: "vertical_v1",
            vertical: profile?.key ?? vertical,
            sinal: signal,
            requerConfiguracao: ["cross_sell", "upgrade", "sequencia_produto"].includes(strategy.tipo),
          },
          acao: {
            canal: "human_approval",
            automaticContact: false,
            mensagem: strategy.tipo === "reativacao"
              ? `Validar ${signal} somente para relacionamento com histórico real antes de contatar o cliente.`
              : strategy.tipo === "orcamento_parado" || strategy.tipo === "follow_up"
                ? `Validar ${signal} e retomar a oportunidade comercial sem tratar o lead como cliente antes da venda.`
                : `Validar ${signal} e confirmar o contexto antes de contatar o cliente.`,
          },
          ativo: false,
        };
      }),
    );

    const missing = templates
      .filter((template) => !knownNames.has(template.nome))
      .slice(0, Math.max(0, minimum - existing.length));
    if (missing.length) await tx.insert(scoutRegrasTable).values(missing as any);
    return { existing: existing.length, inserted: missing.length };
  });
}