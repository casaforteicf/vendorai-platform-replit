import type { Prospect, ProspectQualification, ProspectSolution, ProspectStage } from "@workspace/db";

type DecisionInput = Pick<
  Prospect,
  "stage" | "vendoraiFitScore" | "arqdorFitScore" | "qualification" | "opportunitySummary"
>;

export type ProspectDecision = {
  stage: ProspectStage;
  currentState: string;
  currentObjective: string;
  nextBestAction: string;
  nextBestActionReason: string;
  recommendedSolution: ProspectSolution;
  primaryHook: "vendorai" | "arqdor" | "diagnostico";
};

function hasConfirmedPain(q: ProspectQualification | null | undefined): boolean {
  return Boolean(q?.confirmedPains?.length);
}

function hasProjectSignal(q: ProspectQualification | null | undefined): boolean {
  return Boolean(
    q?.project?.recebeProjetos ||
    q?.project?.formatosProjetos?.length ||
    q?.budget?.usaPlanilha ||
    q?.project?.processoLevantamento ||
    q?.budget?.gargalos?.length,
  );
}

function hasCommercialSignal(q: ProspectQualification | null | undefined): boolean {
  return Boolean(
    q?.commercial?.crmAtual ||
    q?.commercial?.origemLeads?.length ||
    q?.commercial?.canaisAtendimento?.length ||
    q?.commercial?.modeloFollowup ||
    q?.management?.controlePipeline ||
    q?.management?.integracaoSetores,
  );
}

export function recommendProspectSolution(
  vendoraiFitScore: number | null,
  arqdorFitScore: number | null,
  qualification?: ProspectQualification | null,
): Pick<ProspectDecision, "recommendedSolution" | "primaryHook"> {
  const vendor = vendoraiFitScore ?? (hasCommercialSignal(qualification) ? 65 : 0);
  const arqdor = arqdorFitScore ?? (hasProjectSignal(qualification) ? 70 : 0);

  if (vendor < 40 && arqdor < 40) {
    return { recommendedSolution: "undefined", primaryHook: "diagnostico" };
  }

  if (vendor >= 60 && arqdor >= 60) {
    return {
      recommendedSolution: "vendorai_arqdor",
      primaryHook: arqdor > vendor ? "arqdor" : "vendorai",
    };
  }

  if (arqdor > vendor) return { recommendedSolution: "arqdor", primaryHook: "arqdor" };
  return { recommendedSolution: "vendorai", primaryHook: "vendorai" };
}

export function decideProspectNextAction(input: DecisionInput): ProspectDecision {
  const q = input.qualification ?? {};
  const recommendation = recommendProspectSolution(input.vendoraiFitScore, input.arqdorFitScore, q);
  const facts = q.facts ?? [];

  const gatekeeperKnown = facts.some((f) => f.key === "contact_role" && f.value === "gatekeeper" && f.confirmed);
  const responsibleKnown = facts.some((f) => f.key === "responsible_identified" && f.value === true && f.confirmed);
  const decisionMakerKnown = facts.some((f) => f.key === "decision_maker_identified" && f.value === true && f.confirmed);
  const pathToResponsibleKnown = facts.some((f) => f.key === "path_to_responsible_known" && f.value === true && f.confirmed);
  const painKnown = hasConfirmedPain(q);

  if (input.stage === "nao_contatar") {
    return {
      stage: "nao_contatar",
      currentState: "Contato bloqueado por preferência do prospect",
      currentObjective: "Respeitar opt-out e preservar histórico",
      nextBestAction: "Não realizar novos contatos",
      nextBestActionReason: "O prospect solicitou não ser contatado.",
      ...recommendation,
    };
  }

  if (input.stage === "encontrado") {
    return {
      stage: "encontrado",
      currentState: "Empresa encontrada, ainda sem análise suficiente",
      currentObjective: "Validar aderência e enriquecer a conta",
      nextBestAction: "Concluir enriquecimento e calcular aderência antes do contato",
      nextBestActionReason: "A prospecção fria deve iniciar por contexto e aderência, não por disparo imediato.",
      ...recommendation,
    };
  }

  if (!gatekeeperKnown && !responsibleKnown && !decisionMakerKnown) {
    return {
      stage: input.stage === "analisado" ? "analisado" : "em_contato",
      currentState: "Conta ainda sem interlocutor útil mapeado",
      currentObjective: "Encontrar o primeiro interlocutor e o caminho até o responsável",
      nextBestAction: "Iniciar contato curto para descobrir quem responde pela área relevante",
      nextBestActionReason: "Ainda não sabemos com quem conduzir a investigação comercial.",
      ...recommendation,
    };
  }

  if (!responsibleKnown && !decisionMakerKnown && (gatekeeperKnown || pathToResponsibleKnown)) {
    return {
      stage: "em_contato",
      currentState: "Gatekeeper ou caminho de acesso identificado",
      currentObjective: "Identificar e acessar o responsável",
      nextBestAction: "Solicitar o nome e o melhor canal de contato do responsável",
      nextBestActionReason: "O primeiro contato cumpriu a função de abrir caminho; ainda não é hora de vender.",
      ...recommendation,
    };
  }

  if (!painKnown) {
    return {
      stage: "conta_mapeada",
      currentState: decisionMakerKnown ? "Decisor identificado, dor ainda não confirmada" : "Responsável identificado, dor ainda não confirmada",
      currentObjective: "Entender o processo atual e confirmar uma dor real",
      nextBestAction: "Investigar como atendimento, projetos e orçamentos funcionam hoje e onde há retrabalho ou demora",
      nextBestActionReason: "A solução só deve ser apresentada depois de existir uma aplicação concreta.",
      ...recommendation,
    };
  }

  if (input.stage === "reuniao_em_negociacao") {
    return {
      stage: "reuniao_em_negociacao",
      currentState: "Reunião aceita, horário ainda não definido",
      currentObjective: "Definir data e horário da reunião",
      nextBestAction: "Confirmar uma janela de horário e registrar a reunião na Agenda",
      nextBestActionReason: "O prospect aceitou avançar; agora o objetivo é transformar o interesse em compromisso de agenda.",
      ...recommendation,
    };
  }

  if (input.stage === "reuniao_agendada" || input.stage === "qualificado") {
    return {
      stage: input.stage,
      currentState: input.stage === "reuniao_agendada" ? "Reunião confirmada" : "Prospect qualificado para o comercial",
      currentObjective: input.stage === "reuniao_agendada" ? "Preparar a reunião" : "Transferir contexto sem perda de histórico",
      nextBestAction: input.stage === "reuniao_agendada" ? "Gerar briefing da reunião e interromper a cadência de prospecção" : "Criar ou vincular Lead/Negócio e preservar o contexto da conta",
      nextBestActionReason: "A prospecção já atingiu a conversão prevista para esta fase.",
      ...recommendation,
    };
  }

  return {
    stage: "oportunidade_identificada",
    currentState: "Dor confirmada e aplicação potencial identificada",
    currentObjective: "Validar interesse e construir um motivo concreto para a demonstração",
    nextBestAction: recommendation.primaryHook === "arqdor"
      ? "Apresentar brevemente a aplicação do Arqdor ligada à dor confirmada, sem fazer uma apresentação genérica"
      : recommendation.primaryHook === "vendorai"
        ? "Apresentar brevemente a aplicação do Vendor.ai ligada à dor confirmada, sem listar funcionalidades"
        : "Aprofundar o diagnóstico antes de recomendar produto",
    nextBestActionReason: "Já existe dor confirmada; o próximo passo é conectar valor ao problema antes de pedir reunião.",
    ...recommendation,
  };
}
