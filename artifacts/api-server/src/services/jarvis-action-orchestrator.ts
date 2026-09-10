export type JarvisOrchestrationRoute =
  | "conversation"
  | "analysis"
  | "mission"
  | "action_plan"
  | "approval"
  | "execution"
  | "external_action"
  | "specialist_agent";

export type JarvisExecutorAgent =
  | "sdr"
  | "closer"
  | "followup"
  | "reactivation"
  | "scheduler"
  | "service"
  | "onboarding"
  | "relacionamento"
  | "financeiro"
  | "cobranca"
  | "reception";

export type JarvisOrchestrationDecision = {
  route: JarvisOrchestrationRoute;
  explicitAction: boolean;
  preferredAgent: JarvisExecutorAgent | null;
  reason: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function preferredAgentFor(text: string): JarvisExecutorAgent | null {
  if (/\b(cobranca|cobrar|inadimplen|boleto vencido|pagamento atrasado)\b/.test(text)) return "cobranca";
  if (/\b(financeir|fluxo de caixa|contas a pagar|contas a receber|concilia|despesa|receita)\b/.test(text)) return "financeiro";
  if (/\b(agenda|agendar|agendamento|reuniao|consulta|horario|marcar)\b/.test(text)) return "scheduler";
  if (/\b(reativa|reativar|recuperar cliente|cliente inativo|lead inativo)\b/.test(text)) return "reactivation";
  if (/\b(follow.?up|acompanhar lead|retorno comercial|retomar contato)\b/.test(text)) return "followup";
  if (/\b(fechar|fechamento|closer|negociacao|negociar|proposta|desconto)\b/.test(text)) return "closer";
  if (/\b(prospect|prospecc|sdr|qualificar lead|qualificacao|lead novo|novos leads)\b/.test(text)) return "sdr";
  if (/\b(onboarding|implantacao|primeiro acesso|configuracao inicial)\b/.test(text)) return "onboarding";
  if (/\b(pos.?venda|relacionamento|sucesso do cliente|customer success|fideliza)\b/.test(text)) return "relacionamento";
  if (/\b(atendimento|suporte ao cliente|duvida do cliente|reclamacao)\b/.test(text)) return "service";
  if (/\b(recepcao|recepcionar|triagem inicial)\b/.test(text)) return "reception";
  return null;
}

export function resolveJarvisOrchestration(text: string): JarvisOrchestrationDecision {
  const normalized = normalize(text);
  const preferredAgent = preferredAgentFor(normalized);

  if (!normalized) {
    return { route: "conversation", explicitAction: false, preferredAgent: null, reason: "mensagem vazia" };
  }

  if (/\b(aprova|aprovar|aprove|rejeita|rejeitar|rejeite)\b/.test(normalized)) {
    return {
      route: "approval",
      explicitAction: true,
      preferredAgent,
      reason: "comando explícito sobre uma decisão/aprovação",
    };
  }

  if (/\b(executa|execute|executar|rode|rodar|prossiga|prossegue)\b/.test(normalized)
    && /\b(acao|acoes|tarefa|tarefas|plano|etapa|aprovad|pendencia|envio|mensagem|desconto|fechamento|estoque)\b/.test(normalized)) {
    return {
      route: "execution",
      explicitAction: true,
      preferredAgent,
      reason: "comando explícito para executar trabalho operacional já definido",
    };
  }

  if (/\b(missao|missoes)\b/.test(normalized)
    && /\b(crie|criar|registre|registrar|pause|pausar|retome|retomar|conclua|concluir|atualize|atualizar|acompanhe|acompanhar)\b/.test(normalized)) {
    return {
      route: "mission",
      explicitAction: true,
      preferredAgent,
      reason: "comando explícito para operar o Mission Engine",
    };
  }

  if (/\b(plano de acao|plano operacional|planejamento de acao)\b/.test(normalized)
    && /\b(crie|criar|monte|montar|gere|gerar|execute|executar|delegue|delegar|acompanhe|acompanhar)\b/.test(normalized)) {
    return {
      route: "action_plan",
      explicitAction: true,
      preferredAgent,
      reason: "pedido explícito para criar, delegar ou acompanhar um plano de ação",
    };
  }

  if (/\b(envie|enviar|mande|mandar|publique|publicar|agende|agendar|marque|marcar|ligue|ligar)\b/.test(normalized)
    && /\b(whatsapp|mensagem|email|e-mail|instagram|post|publicacao|reuniao|consulta|agenda|cliente|lead|contato)\b/.test(normalized)) {
    return {
      route: "external_action",
      explicitAction: true,
      preferredAgent,
      reason: "pedido explícito de ação em canal ou serviço externo",
    };
  }

  if (/\b(analise|analisar|avalie|avaliar|compare|comparar|como estamos|o que voce faria|o que eu nao estou vendo|prioridade|prioridades|risco|riscos|oportunidade|oportunidades)\b/.test(normalized)) {
    return {
      route: "analysis",
      explicitAction: false,
      preferredAgent,
      reason: "pedido de análise ou decisão; não deve executar ação por inferência",
    };
  }

  if (preferredAgent) {
    return {
      route: "specialist_agent",
      explicitAction: false,
      preferredAgent,
      reason: "assunto corresponde a um agente especializado, sem comando explícito de execução",
    };
  }

  return {
    route: "conversation",
    explicitAction: false,
    preferredAgent: null,
    reason: "conversa ou conhecimento geral sem rota operacional explícita",
  };
}

export function buildJarvisActionOrchestrationContext(text: string) {
  const decision = resolveJarvisOrchestration(text);
  const agent = decision.preferredAgent ? ` ${decision.preferredAgent}` : " nenhum agente específico";

  return [
    "## Action Orchestrator do JARVIS",
    `- Rota operacional detectada: ${decision.route}.`,
    `- Pedido explícito de ação: ${decision.explicitAction ? "sim" : "não"}.`,
    `- Executor preferencial:${agent}.`,
    `- Motivo do roteamento: ${decision.reason}.`,
    "- Se não houver pedido explícito de ação, permaneça em análise/conversa e não execute por inferência.",
    "- Se houver pedido explícito e existir rota/executor real já integrado, priorize esse caminho em vez de responder genericamente.",
    "- Ações sensíveis continuam sujeitas à aprovação humana, permissões, autonomia, idempotência e confirmação de sucesso do executor real.",
    "- O usuário conversa com o JARVIS; não exponha a complexidade interna de roteamento ou nomes de agentes sem necessidade.",
  ].join("\n");
}
