import type { InstagramGrowthAction, InstagramGrowthIntelligence } from './instagram-growth';

export type InstagramPlannerContentMix = {
  growth: number;
  authority: number;
  proof: number;
  conversion: number;
};

export type InstagramPlannerDirective = {
  source: 'windsor_instagram_growth';
  primaryObjective: 'grow_audience';
  growthScore: number;
  status: InstagramGrowthIntelligence['status'];
  contentMix: InstagramPlannerContentMix;
  minimumCadence: {
    reelsPerWeek: number;
    carouselsPerWeek: number;
    storiesPerDay: number;
  };
  priorities: Array<{
    decision: InstagramGrowthAction['decision'];
    title: string;
    action: string;
    metricToImprove: InstagramGrowthAction['metricToImprove'];
  }>;
  plannerPrompt: string;
};

function contentMixFor(score: number): InstagramPlannerContentMix {
  if (score < 30) return { growth: 70, authority: 15, proof: 10, conversion: 5 };
  if (score < 55) return { growth: 60, authority: 20, proof: 15, conversion: 5 };
  if (score < 80) return { growth: 50, authority: 20, proof: 20, conversion: 10 };
  return { growth: 40, authority: 20, proof: 20, conversion: 20 };
}

function cadenceFor(score: number) {
  if (score < 30) return { reelsPerWeek: 7, carouselsPerWeek: 2, storiesPerDay: 4 };
  if (score < 55) return { reelsPerWeek: 6, carouselsPerWeek: 2, storiesPerDay: 4 };
  if (score < 80) return { reelsPerWeek: 5, carouselsPerWeek: 2, storiesPerDay: 3 };
  return { reelsPerWeek: 4, carouselsPerWeek: 2, storiesPerDay: 3 };
}

/**
 * Converts Windsor-fed Instagram intelligence into constraints the media planner
 * can consume. The planner is not allowed to treat Instagram as a generic channel:
 * audience growth is always the first objective and the content mix adapts to the
 * current Growth Score.
 */
export function buildInstagramPlannerDirective(
  intelligence: InstagramGrowthIntelligence,
): InstagramPlannerDirective {
  const mix = contentMixFor(intelligence.growthScore);
  const cadence = cadenceFor(intelligence.growthScore);
  const priorities = intelligence.actions.slice(0, 5).map((item) => ({
    decision: item.decision,
    title: item.title,
    action: item.action,
    metricToImprove: item.metricToImprove,
  }));

  const priorityText = priorities.length
    ? priorities.map((item, index) => `${index + 1}. ${item.title}: ${item.action}`).join(' ')
    : 'Manter testes contínuos de formatos e hooks, medindo crescimento de audiência.';

  return {
    source: 'windsor_instagram_growth',
    primaryObjective: 'grow_audience',
    growthScore: intelligence.growthScore,
    status: intelligence.status,
    contentMix: mix,
    minimumCadence: cadence,
    priorities,
    plannerPrompt: [
      'INSTAGRAM — REGRA OBRIGATÓRIA DO PLANEJADOR:',
      'o objetivo primário é crescer audiência qualificada antes de otimizar conversão comercial.',
      `Growth Score atual: ${intelligence.growthScore}/100 (${intelligence.status}).`,
      `Mix recomendado: ${mix.growth}% crescimento, ${mix.authority}% autoridade, ${mix.proof}% prova e ${mix.conversion}% conversão.`,
      `Cadência mínima: ${cadence.reelsPerWeek} Reels/semana, ${cadence.carouselsPerWeek} carrosséis/semana e ${cadence.storiesPerDay} Stories/dia.`,
      `Prioridades Windsor: ${priorityText}`,
      'Cada peça deve ter hipótese de crescimento, KPI principal e decisão esperada SCALE/REPEAT/IMPROVE/REPLACE/PAUSE.',
    ].join(' '),
  };
}
