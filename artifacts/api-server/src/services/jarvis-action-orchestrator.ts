export type JarvisOrchestrationRoute =
  | "conversation"
  | "analysis"
  | "mission"
  | "decision"
  | "action_plan"
  | "approval"
  | "execution"
  | "external_action"
  | "specialist_agent";

export type JarvisOrchestrationOwner =
  | "natural_actions"
  | "action_plans"
  | "missions"
  | "support";

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
  owner: JarvisOrchestrationOwner;
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
  if (/\b(cobranc\w*|cobrar|inadimpl\w*|boleto vencido|pagamento atrasado)\b/.test(text)) return "cobranca";
  if (/\b(financeir\w*|fluxo de caixa|contas a pagar|contas a receber|concilia\w*|despesa|receita)\b/.test(text)) return "financeiro";
  if (/\b(agenda\w*|agendar|reuniao|consulta|horario|marcar)\b/.test(text)) return "scheduler";
  if (/\b(reativ\w*|recuperar (?:cliente|clientes|lead|leads)|clientes? inativos?|leads? inativos?)\b/.test(text)) return "reactivation";
  if (/\b(follow.?up|acompanhar lead|retorno comercial|retomar contato)\b/.test(text)) return "followup";
  if (/\b(fechar|fechamento|closer|negociacao|negociar|proposta|desconto)\b/.test(text)) return "closer";
  if (/\b(prospect\w*|prospecc\w*|sdr|qualificar lead|qualificacao|lead novo|novos leads)\b/.test(text)) return "sdr";
  if (/\b(onboarding|implantacao|primeiro acesso|configuracao inicial)\b/.test(text)) return "onboarding";
  if (/\b(pos.?venda|relacionamento|sucesso do cliente|customer success|fideliz\w*)\b/.test(text)) return "relacionamento";
  if (/\b(atendimento|suporte ao cliente|duvida do cliente|reclam\w*)\b/.test(text)) return "service";
  if (/\b(recepcao|recepcionar|triagem inicial)\b/.test(text)) return "reception";
  return null;
}

function ownerFor(route: JarvisOrchestrationRoute): JarvisOrchestrationOwner {
  if (route === "approval" || route === "execution") return "natural_actions";
  if (route === "action_plan") return "action_plans";
  if (route === "mission" || route === "decision") return "missions";
  return "support";
}

function decision(
  route: JarvisOrchestrationRoute,
  explicitAction: boolean,
  preferredAgent: JarvisExecutorAgent | null,
  reason: string,
): JarvisOrchestrationDecision {
  return { route, owner: ownerFor(route), explicitAction, preferredAgent, reason };
}

export function resolveJarvisOrchestration(text: string): JarvisOrchestrationDecision {
  const normalized = normalize(text);
  const preferredAgent = preferredAgentFor(normalized);

  if (!normalized) {
    return decision("conversation", false, null, "mensagem vazia");
  }

  if (/\b(aprova|aprovar|aprove|rejeita|rejeitar|rejeite)\b/.test(normalized)) {
    return decision("approval", true, preferredAgent, "comando explícito sobre uma decisão/aprovação");
  }

  if (/\b(executa|execute|executar|rode|rodar|prossiga|prossegue)\b/.test(normalized)
    && /\b(acao|acoes|tarefa|tarefas|plano|etapa|aprov\w*|pendenc\w*|envio|mensagem|desconto|fechamento|estoque)\b/.test(normalized)) {
    return decision("execution", true, preferredAgent, "comando explícito para executar trabalho operacional já definido");
  }

  const missionSubject = /\b(missao|missoes)\b/.test(normalized);
  const missionCommand = /\b(crie|criar|registre|registrar|pause|pausar|retome|retomar|conclua|concluir|atualize|atualizar|acompanhe|acompanhar)\b/.test(normalized);
  if (missionSubject && missionCommand) {
    return decision("mission", true, preferredAgent, "comando explícito para operar o Mission Engine");
  }

  if (/\b(registre|registrar|grave|gravar)\b/.test(normalized)
    && /\b(decisao|decisoes)\b/.test(normalized)) {
    return decision("decision", true, preferredAgent, "comando explícito para registrar decisão empresarial");
  }

  if (missionSubject && /\b(quais|liste|listar|como estao|como esta|status|andamento|progresso|atrasad\w*|bloquead\w*)\b/.test(normalized)) {
    return decision("mission", false, preferredAgent, "consulta de estado das Missões; somente leitura");
  }

  if (/\b(decisao|decisoes)\b/.test(normalized)
    && /\b(quais|liste|listar|como estao|como esta|status|resultado|resultados|revisao|revisar)\b/.test(normalized)) {
    return decision("decision", false, preferredAgent, "consulta de decisões e resultados; somente leitura");
  }

  const actionPlanSubject = /\b(plano de acao|planos de acao|plano operacional|planos operacionais|planejamento de acao)\b/.test(normalized);
  const actionPlanCommand = /\b(crie|criar|monte|montar|gere|gerar|execute|executar|delegue|delegar|acompanhe|acompanhar)\b/.test(normalized);
  if (actionPlanSubject && actionPlanCommand) {
    return decision("action_plan", true, preferredAgent, "pedido explícito para criar, delegar ou acompanhar um plano de ação");
  }

  const executionSubject = actionPlanSubject
    || /\b(plano|planos|execucao|execucoes|acao|acoes|delegacao|delegacoes|pendencia|pendencias|etapa|etapas)\b/.test(normalized);
  const statusIntent = /\b(como esta|como estao|status|andamento|o que falta|o que esta em andamento|o que esta bloqueado|o que terminou|o que foi concluido|qual o andamento|quais pendencias)\b/.test(normalized);
  if (executionSubject && statusIntent) {
    return decision("action_plan", false, preferredAgent, "consulta de andamento de planos e execução; somente leitura");
  }

  if (/\b(envie|enviar|mande|mandar|publique|publicar|agende|agendar|marque|marcar|ligue|ligar)\b/.test(normalized)
    && /\b(whatsapp|mensagem|email|e-mail|instagram|post|publicacao|reuniao|consulta|agenda|cliente|lead|contato)\b/.test(normalized)) {
    return decision("external_action", true, preferredAgent, "pedido explícito de ação em canal ou serviço externo");
  }

  if (/\b(analise|analisar|avalie|avaliar|compare|comparar|como estamos|o que voce faria|o que eu nao estou vendo|prioridade|prioridades|risco|riscos|oportunidade|oportunidades)\b/.test(normalized)) {
    return decision("analysis", false, preferredAgent, "pedido de análise ou decisão; não deve executar ação por inferência");
  }

  if (preferredAgent) {
    return decision("specialist_agent", false, preferredAgent, "assunto corresponde a um agente especializado, sem comando explícito de execução");
  }

  return decision("conversation", false, null, "conversa ou conhecimento geral sem rota operacional explícita");
}

export function ownsJarvisOrchestrationRoute(
  owner: JarvisOrchestrationOwner,
  text: string,
): boolean {
  return resolveJarvisOrchestration(text).owner === owner;
}

export function buildJarvisActionOrchestrationContext(text: string) {
  const routeDecision = resolveJarvisOrchestration(text);
  const agent = routeDecision.preferredAgent ? ` ${routeDecision.preferredAgent}` : " nenhum agente específico";

  return [
    "## Action Orchestrator do JARVIS",
    `- Rota operacional detectada: ${routeDecision.route}.`,
    `- Proprietário da rota: ${routeDecision.owner}.`,
    `- Pedido explícito de ação: ${routeDecision.explicitAction ? "sim" : "não"}.`,
    `- Executor preferencial:${agent}.`,
    `- Motivo do roteamento: ${routeDecision.reason}.`,
    "- Cada solicitação tem um único proprietário operacional; routers que não são donos devem apenas seguir o fluxo.",
    "- Se não houver pedido explícito de ação, permaneça em leitura/análise e não execute por inferência.",
    "- Se houver pedido explícito e existir rota/executor real já integrado, priorize esse caminho em vez de responder genericamente.",
    "- Ações sensíveis continuam sujeitas à aprovação humana, permissões, autonomia, idempotência e confirmação de sucesso do executor real.",
    "- O usuário conversa com o JARVIS; não exponha a complexidade interna de roteamento ou nomes de agentes sem necessidade.",
  ].join("\n");
}
