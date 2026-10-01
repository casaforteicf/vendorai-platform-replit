import { and, eq, ne } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  scoutOportunidadesTable,
  scoutRegrasTable,
  propostasTable,
  beautyAgendamentosTable,
  clinicConsultasTable,
  notificationsTable,
} from "@workspace/db";
import { processAgentInternal } from "./agent-dispatch.js";
import type { AgentName } from "../lib/agent-engine.js";

const AGENT_BY_TYPE: Record<string, AgentName> = {
  reativacao: "reactivation",
  reativacao_sazonal: "reactivation",
  follow_up: "followup",
  orcamento_parado: "followup",
  cross_sell: "closer",
  upgrade: "closer",
  potencial_carteira: "closer",
  sinal_expansao: "closer",
  risco_competitivo: "closer",
  renovacao: "closer",
  renovacao_seguro: "closer",
  risco_nao_renovacao: "closer",
  recompra: "relacionamento",
  sequencia_produto: "relacionamento",
  manutencao: "relacionamento",
  aniversario: "relacionamento",
  indicacao: "relacionamento",
  grade_incompleta: "relacionamento",
  receita_vencendo: "relacionamento",
  produto_vencendo: "relacionamento",
  limite_credito_disponivel: "closer",
  whitespace_seguro: "closer",
  sinal_praca_ai: "sdr",
};

export function resolveScoutAgent(tipo?: string | null): AgentName {
  return AGENT_BY_TYPE[tipo ?? ""] ?? "sdr";
}

function actionForType(tipo?: string | null) {
  switch (tipo) {
    case "orcamento_parado": return "Retomar a proposta usando o contexto existente e conduzir para decisão.";
    case "follow_up": return "Retomar a oportunidade comercial no ponto em que parou, sem tratar o lead como cliente antes da venda.";
    case "reativacao":
    case "reativacao_sazonal": return "Reabrir o relacionamento de forma contextual com base no histórico real de cliente.";
    case "cross_sell":
    case "grade_incompleta": return "Apresentar o complemento mais aderente ao histórico do cliente.";
    case "upgrade": return "Apresentar uma evolução de solução com benefício concreto e sem pressionar.";
    case "recompra":
    case "sequencia_produto": return "Abordar no momento provável de nova compra, usando histórico real.";
    case "renovacao":
    case "renovacao_seguro": return "Antecipar a renovação e proteger a receita antes da janela crítica.";
    case "manutencao": return "Antecipar manutenção e reduzir risco de parada ou insatisfação.";
    case "potencial_carteira": return "Investigar expansão de carteira e sugerir a próxima melhor oferta.";
    case "sinal_expansao": return "Validar a expansão e mapear demanda nova antes da concorrência.";
    case "risco_competitivo": return "Proteger o relacionamento, entender o risco e recuperar valor percebido.";
    case "indicacao": return "Pedir indicação no momento adequado, sem forçar nova compra.";
    default: return "Validar o contexto e executar a próxima melhor ação comercial.";
  }
}

async function hasRealCustomerHistory(tenantId: string, leadId: string) {
  const [acceptedProposal] = await db
    .select({ id: propostasTable.id })
    .from(propostasTable)
    .where(and(
      eq(propostasTable.tenantId, tenantId),
      eq(propostasTable.leadId, leadId),
      eq(propostasTable.status, "aceita"),
    ))
    .limit(1);
  if (acceptedProposal) return true;

  const [beautyHistory] = await db
    .select({ id: beautyAgendamentosTable.id })
    .from(beautyAgendamentosTable)
    .where(and(
      eq(beautyAgendamentosTable.tenantId, tenantId),
      eq(beautyAgendamentosTable.clienteId, leadId),
      ne(beautyAgendamentosTable.status, "cancelado"),
    ))
    .limit(1);
  if (beautyHistory) return true;

  const [clinicHistory] = await db
    .select({ id: clinicConsultasTable.id })
    .from(clinicConsultasTable)
    .where(and(
      eq(clinicConsultasTable.tenantId, tenantId),
      eq(clinicConsultasTable.pacienteId, leadId),
      ne(clinicConsultasTable.status, "cancelada"),
    ))
    .limit(1);

  return !!clinicHistory;
}

function looksLikeBudgetOrProposal(text?: string | null) {
  return /or[çc]amento|proposta/i.test(text ?? "");
}

export async function executeScoutOpportunityWithAgent(params: {
  tenantId: string;
  opportunityId: string;
  log: Logger;
  approvedBy?: string | null;
}) {
  const { tenantId, opportunityId, log, approvedBy } = params;

  const [row] = await db.select({
    opportunity: scoutOportunidadesTable,
    lead: leadsTable,
    ruleName: scoutRegrasTable.nome,
  })
    .from(scoutOportunidadesTable)
    .leftJoin(leadsTable, eq(leadsTable.id, scoutOportunidadesTable.clienteId))
    .leftJoin(scoutRegrasTable, eq(scoutRegrasTable.id, scoutOportunidadesTable.regraId))
    .where(and(
      eq(scoutOportunidadesTable.id, opportunityId),
      eq(scoutOportunidadesTable.tenantId, tenantId),
    ))
    .limit(1);

  if (!row?.opportunity) throw new Error("Oportunidade não encontrada.");
  if (!row.lead) throw new Error("Lead da oportunidade não encontrado.");

  const op = row.opportunity;
  let effectiveType = op.tipo;
  let relationship = "lead";

  const customerHistory = await hasRealCustomerHistory(tenantId, row.lead.id);
  if (customerHistory) relationship = "cliente";

  // Guarda semântica: reativação só existe quando houve relação comercial real.
  // Lead que nunca comprou continua sendo follow-up/oportunidade comercial.
  if ((op.tipo === "reativacao" || op.tipo === "reativacao_sazonal") && !customerHistory) {
    effectiveType = looksLikeBudgetOrProposal(row.ruleName) || looksLikeBudgetOrProposal(op.descricao)
      ? "orcamento_parado"
      : "follow_up";
  }

  const agent = resolveScoutAgent(effectiveType);
  const explanation = (op.explanation ?? {}) as any;
  const facts = explanation?.facts ?? {};
  const inference = explanation?.inference ?? {};
  const nextAction = actionForType(effectiveType);

  const scenario = {
    source: "revenue_scout",
    revenueScout: {
      opportunityId: op.id,
      originalType: op.tipo,
      type: effectiveType,
      relationship,
      description: op.descricao,
      estimatedValue: op.valorEstimado ? Number(op.valorEstimado) : null,
      opportunityScore: op.scoreOportunidade ? Number(op.scoreOportunidade) : null,
      confidenceScore: Number(inference?.confidenceScore ?? 0) || null,
      recommendedWindowDays: Number(inference?.recommendedWindowDays ?? 0) || null,
      optimalContactHour: Number(inference?.optimalContactHour ?? NaN),
      facts,
      inference,
      nextBestAction: nextAction,
      ruleName: row.ruleName,
    },
  };

  const mensagem = [
    "PROATIVO REVENUE SCOUT.",
    `Relação atual: ${relationship}.`,
    `Oportunidade: ${op.descricao ?? effectiveType}.`,
    effectiveType !== op.tipo ? `Classificação corrigida para ${effectiveType}; não tratar como reativação de cliente.` : "",
    op.valorEstimado ? `Potencial estimado: R$ ${Number(op.valorEstimado).toFixed(2)}.` : "",
    op.scoreOportunidade ? `Prioridade: ${Number(op.scoreOportunidade).toFixed(0)}/100.` : "",
    `Próxima melhor ação: ${nextAction}`,
    "Use somente fatos disponíveis no contexto. Não invente condição comercial, preço, prazo, desconto ou disponibilidade.",
    "Se faltar informação essencial, prepare a próxima pergunta/ação em vez de assumir.",
  ].filter(Boolean).join(" ");

  const result = await processAgentInternal({
    tenantId,
    leadId: row.lead.id,
    mensagem,
    forcedAgent: agent,
    scenario,
    log,
  });

  const executedAt = new Date();
  const successful = result.status !== "failed";

  await db.update(scoutOportunidadesTable)
    .set({
      ...(effectiveType !== op.tipo ? { tipo: effectiveType } : {}),
      status: successful ? "enviado" : "pendente_revisao_bot",
      pipelineStage: successful ? "em_contato" : "em_analise",
      ...(successful ? { enviadoEm: executedAt } : {}),
      ...(approvedBy ? { approvedBy, approvedAt: executedAt } : {}),
      explanation: {
        ...explanation,
        relationship: {
          kind: relationship,
          hasRealCustomerHistory: customerHistory,
        },
        orchestration: {
          agent,
          executedAt: executedAt.toISOString(),
          resultStatus: result.status,
          resultReason: "reason" in result ? result.reason : undefined,
          originalType: op.tipo,
          effectiveType,
          nextBestAction: nextAction,
        },
      },
    } as any)
    .where(and(
      eq(scoutOportunidadesTable.id, opportunityId),
      eq(scoutOportunidadesTable.tenantId, tenantId),
    ));

  await db.insert(notificationsTable).values({
    tenantId,
    title: successful ? "Revenue Scout atuou em uma oportunidade" : "Revenue Scout precisa de atenção",
    message: [
      row.lead.nome ?? "Contato",
      successful ? `ação conduzida pelo agente ${agent}` : `ação encaminhada para revisão após tentativa do agente ${agent}`,
      op.valorEstimado ? `potencial de R$ ${Number(op.valorEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null,
      `próxima ação: ${nextAction}`,
    ].filter(Boolean).join(" · "),
    type: successful ? "info" : "warning",
    category: "revenue_scout",
  }).catch((notificationError) => {
    log.warn({ notificationError, tenantId, opportunityId }, "scout-agent: falha ao registrar notificacao interna");
  });

  log.info({ tenantId, opportunityId, leadId: row.lead.id, agent, originalType: op.tipo, effectiveType, relationship, result }, "scout-agent: oportunidade roteada para agente");
  return { agent, result, nextBestAction: nextAction, originalType: op.tipo, effectiveType, relationship };
}
