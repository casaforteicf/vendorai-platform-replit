export const COMMERCIAL_STAGE_ORDER = [
  "novo",
  "qualificado",
  "proposta",
  "negociacao",
  "conferencia_estoque",
  "contrato",
  "ganho",
] as const;

export const EXECUTION_STAGE_ORDER = [
  "pedido_confirmado",
  "liberacao_financeira",
  "liberacao_medidas",
  "projeto",
  "producao_a_iniciar",
  "producao_em_andamento",
  "producao_finalizada",
  "aguardando_liberacao",
  "liberado",
  "agenda_entrega",
  "em_transporte",
  "instalacao_a_iniciar",
  "instalacao_em_andamento",
  "instalacao_finalizada",
  "entrega_obra",
  "pos_venda",
  "concluido",
] as const;

export const SUPPORT_STAGE_ORDER = [
  "chamado_cliente",
  "agendamento_assistencia",
  "execucao_assistencia",
  "relatorio_assistencia",
  "feedback_cliente",
  "fechamento_assistencia",
] as const;

export const PARTNER_STAGE_ORDER = [
  "parceiro_identificado",
  "contato",
  "qualificacao",
  "proposta_parceria",
  "negociacao",
  "parceiro_ativo",
  "inativo",
] as const;

export const SAAS_STAGE_ORDER = [
  "lead_qualificado",
  "demo_agendada",
  "trial_ativo",
  "proposta_enviada",
  "fechamento",
  "onboarding",
  "expansao",
] as const;

export const TERMINAL_WORK_STAGES = new Set(["concluido", "fechamento_assistencia", "cancelado"]);
export const TERMINAL_DEAL_STAGES = new Set(["ganho", "perdido", "entregue"]);
export const TERMINAL_RELATIONSHIP_STAGES = new Set(["aquecimento_retomado", "parceiro_ativo", "inativo"]);

export function stageIndex(order: readonly string[], stage: string | null | undefined): number {
  if (!stage) return -1;
  return order.indexOf(stage);
}

export function isBackwardMove(order: readonly string[], current: string | null | undefined, target: string | null | undefined): boolean {
  const currentIndex = stageIndex(order, current);
  const targetIndex = stageIndex(order, target);
  if (currentIndex < 0 || targetIndex < 0) return false;
  return targetIndex < currentIndex;
}

export function canAdvanceWorkCard(pipeline: string, current: string, target: string): boolean {
  if (target === current) return true;
  if (target === "cancelado") return true;
  if (TERMINAL_WORK_STAGES.has(current)) return false;
  const order = pipeline === "suporte" ? SUPPORT_STAGE_ORDER : EXECUTION_STAGE_ORDER;
  return !isBackwardMove(order, current, target);
}
