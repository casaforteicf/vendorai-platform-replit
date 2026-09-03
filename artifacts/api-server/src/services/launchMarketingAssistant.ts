import { eq } from "drizzle-orm";
import { contentAutopilotConfigTable, db } from "@workspace/db";
import { getFilteredLaunchCommandCenter, type LaunchCommandCenterFilters } from "./launchCommandCenter.js";

export type AssistedDraftKind = "creative" | "landing_page" | "audience" | "keyword";

type DraftInput = {
  tenantId: string;
  kind: AssistedDraftKind;
  filters?: LaunchCommandCenterFilters;
};

function bestCampaign(center: Awaited<ReturnType<typeof getFilteredLaunchCommandCenter>>) {
  return center.rankings?.[0] ?? null;
}

/**
 * Marketing Manager usa o mesmo modo persistido do Content Autopilot.
 * - suggestion/semi: entrega rascunho para revisão;
 * - automatic: a IA está autorizada a executar conteúdo/publicação sem
 *   aprovação manual item a item. Mídia paga só pode usar orçamento, período
 *   e travas já definidos na campanha; este endpoint nunca inventa orçamento.
 *
 * Este método continua sendo um construtor de plano/rascunho e, portanto,
 * nunca afirma que publicou algo se não houve execução real.
 */
export async function buildAssistedMarketingDraft(input: DraftInput) {
  const [[automationConfig], center] = await Promise.all([
    db
      .select({
        ativo: contentAutopilotConfigTable.ativo,
        automationMode: contentAutopilotConfigTable.automationMode,
      })
      .from(contentAutopilotConfigTable)
      .where(eq(contentAutopilotConfigTable.tenantId, input.tenantId))
      .limit(1),
    getFilteredLaunchCommandCenter(input.tenantId, input.filters ?? {}),
  ]);

  const autonomous = Boolean(
    automationConfig?.ativo && automationConfig.automationMode === "automatic",
  );
  const winner = bestCampaign(center);
  const diagnosis = center.diagnosis;
  const context = {
    period: center.period.label,
    diagnosisStage: diagnosis.stage,
    evidence: diagnosis.evidence,
    currentAction: diagnosis.action,
    winningCampaign: winner?.label ?? null,
    winningRevenue: winner?.revenue ?? 0,
    winningRoas: winner?.roas ?? null,
    avgBehaviorIntent: center.metrics.avgBehaviorIntent,
    avgCommercialFit: center.metrics.avgCommercialFit,
  };

  const reviewSuffix = autonomous
    ? "A IA pode executar a hipótese automaticamente dentro dos limites e conexões já configurados."
    : "A hipótese permanece em revisão humana antes de qualquer publicação.";

  const drafts: Record<AssistedDraftKind, { title: string; objective: string; draft: Record<string, unknown> }> = {
    creative: {
      title: autonomous ? "Próximo criativo da IA" : "Rascunho de novo criativo",
      objective: autonomous
        ? "Criar e executar uma nova mensagem usando os sinais reais, sem aumentar orçamento automaticamente."
        : "Testar uma nova mensagem sem alterar campanha ou orçamento automaticamente.",
      draft: {
        angle: diagnosis.stage === "lp" ? "aderência anúncio → promessa da LP" : diagnosis.stage === "qualidade_intencao" ? "dor e qualificação do público" : "resultado comercial e prova de valor",
        hook: winner ? `Criar variação inspirada no melhor sinal de receita de ${winner.label}, sem copiar o criativo atual.` : "Criar variação focada na principal dor registrada no funil.",
        bodyBrief: `Usar a evidência atual (${diagnosis.evidence}) e levar o usuário para uma próxima ação mensurável. Evitar promessas não comprovadas.`,
        cta: "Começar teste / solicitar demonstração",
        governance: reviewSuffix,
      },
    },
    landing_page: {
      title: autonomous ? "Próxima variação de landing page" : "Rascunho de variação de landing page",
      objective: autonomous
        ? "Preparar uma hipótese de LP que pode ser executada pelo Marketing automático respeitando blocos protegidos."
        : "Preparar uma hipótese de LP para aprovação antes de publicar.",
      draft: {
        heroHypothesis: diagnosis.stage === "lp" ? "reduzir distância entre promessa do anúncio e primeiro bloco da página" : "reforçar benefício, prova de valor e próximo passo",
        sections: ["hero", "dor", "como funciona", "prova de valor verificável", "CTA", "FAQ/objeções"],
        primaryKpi: center.metrics.trialActivationRate != null ? "trial_activated" : "lead/trial_started",
        guardrail: autonomous
          ? "Preservar tracking first-party, consentimento e blocos protegidos."
          : "Não remover tracking first-party nem consentimento; publicar somente após aprovação.",
      },
    },
    audience: {
      title: autonomous ? "Próxima hipótese de público" : "Rascunho de hipótese de público",
      objective: autonomous
        ? "Refinar público dentro dos limites da campanha sem aumentar orçamento automaticamente."
        : "Sugerir refinamento de público sem editar segmentação real.",
      draft: {
        hypothesis: center.metrics.avgCommercialFit != null && center.metrics.avgCommercialFit < 50
          ? "estreitar público para perfis com maior fit comercial explícito"
          : "preservar o público atual e testar uma expansão controlada em paralelo",
        signals: ["segmento/atividade", "porte/equipe", "orçamento/capacidade", "urgência", "Behavior Intent"],
        exclude: ["contatos já convertidos quando a plataforma permitir", "segmentos sem aderência comercial comprovada"],
        guardrail: autonomous
          ? "Pode executar dentro da segmentação e orçamento já autorizados; aumento de orçamento continua bloqueado."
          : "Nenhuma alteração de público é aplicada sem aprovação.",
      },
    },
    keyword: {
      title: autonomous ? "Próximas palavras-chave da IA" : "Rascunho de palavras-chave",
      objective: autonomous
        ? "Selecionar e usar hipóteses de busca de maior intenção sem aprovação manual de cada keyword."
        : "Preparar novas hipóteses de busca para revisão humana.",
      draft: {
        themes: diagnosis.stage === "qualidade_intencao"
          ? ["dor específica + solução", "software/CRM + vertical", "automação + problema operacional"]
          : ["produto + vertical", "CRM com IA + vertical", "automação comercial + vertical"],
        matchStrategy: "Começar com termos de maior intenção e revisar termos de pesquisa antes de ampliar correspondência.",
        negativesToReview: ["grátis permanente", "curso", "vaga/emprego", "download"],
        guardrail: autonomous
          ? "A IA pode usar as keywords no modo Automático; limites de mídia continuam vindo da campanha configurada."
          : "Lista é rascunho; nenhuma keyword ou lance é publicado automaticamente.",
      },
    },
  };

  return {
    mode: autonomous ? "automatic" as const : "assisted" as const,
    kind: input.kind,
    requiresApproval: !autonomous,
    publishingPerformed: false,
    budgetChanged: false,
    executionPolicy: {
      contentPublishing: autonomous ? "authorized" : "approval_required",
      sponsoredMedia: autonomous ? "authorized_with_configured_budget" : "approval_required",
      budgetIncreaseAllowed: false,
    },
    context,
    ...drafts[input.kind],
  };
}
