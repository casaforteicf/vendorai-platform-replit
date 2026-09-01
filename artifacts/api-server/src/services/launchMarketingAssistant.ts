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
 * Assisted Marketing Manager: creates an auditable draft only.
 * It deliberately has no publishing/budget side effect. Any media mutation must
 * go through an explicit approval flow elsewhere in the product.
 */
export async function buildAssistedMarketingDraft(input: DraftInput) {
  const center = await getFilteredLaunchCommandCenter(input.tenantId, input.filters ?? {});
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

  const drafts: Record<AssistedDraftKind, { title: string; objective: string; draft: Record<string, unknown> }> = {
    creative: {
      title: "Rascunho de novo criativo",
      objective: "Testar uma nova mensagem sem alterar campanha ou orçamento automaticamente.",
      draft: {
        angle: diagnosis.stage === "lp" ? "aderência anúncio → promessa da LP" : diagnosis.stage === "qualidade_intencao" ? "dor e qualificação do público" : "resultado comercial e prova de valor",
        hook: winner ? `Criar variação inspirada no melhor sinal de receita de ${winner.label}, sem copiar o criativo atual.` : "Criar variação focada na principal dor registrada no funil.",
        bodyBrief: `Usar a evidência atual (${diagnosis.evidence}) e levar o usuário para uma próxima ação mensurável. Evitar promessas não comprovadas.`,
        cta: "Começar teste / solicitar demonstração",
      },
    },
    landing_page: {
      title: "Rascunho de variação de landing page",
      objective: "Preparar uma hipótese de LP para aprovação antes de publicar.",
      draft: {
        heroHypothesis: diagnosis.stage === "lp" ? "reduzir distância entre promessa do anúncio e primeiro bloco da página" : "reforçar benefício, prova de valor e próximo passo",
        sections: ["hero", "dor", "como funciona", "prova de valor verificável", "CTA", "FAQ/objeções"],
        primaryKpi: center.metrics.trialActivationRate != null ? "trial_activated" : "lead/trial_started",
        guardrail: "Não remover tracking first-party nem consentimento; não publicar sem aprovação.",
      },
    },
    audience: {
      title: "Rascunho de hipótese de público",
      objective: "Sugerir refinamento de público sem editar segmentação real.",
      draft: {
        hypothesis: center.metrics.avgCommercialFit != null && center.metrics.avgCommercialFit < 50
          ? "estreitar público para perfis com maior fit comercial explícito"
          : "preservar o público atual e testar uma expansão controlada em paralelo",
        signals: ["segmento/atividade", "porte/equipe", "orçamento/capacidade", "urgência", "Behavior Intent"],
        exclude: ["contatos já convertidos quando a plataforma permitir", "segmentos sem aderência comercial comprovada"],
        guardrail: "Nenhuma alteração de público é aplicada por este endpoint.",
      },
    },
    keyword: {
      title: "Rascunho de palavras-chave",
      objective: "Preparar novas hipóteses de busca para revisão humana.",
      draft: {
        themes: diagnosis.stage === "qualidade_intencao"
          ? ["dor específica + solução", "software/CRM + vertical", "automação + problema operacional"]
          : ["produto + vertical", "CRM com IA + vertical", "automação comercial + vertical"],
        matchStrategy: "Começar com termos de maior intenção e revisar termos de pesquisa antes de ampliar correspondência.",
        negativesToReview: ["grátis permanente", "curso", "vaga/emprego", "download"],
        guardrail: "Lista é rascunho; nenhuma keyword ou lance é publicado automaticamente.",
      },
    },
  };

  return {
    mode: "assisted" as const,
    kind: input.kind,
    requiresApproval: true,
    publishingPerformed: false,
    budgetChanged: false,
    context,
    ...drafts[input.kind],
  };
}
