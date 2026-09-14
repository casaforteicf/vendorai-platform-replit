import type { MarketingAutomationMode, NormalizedMarketingRecord } from './marketing-data-standard';

export type InstagramGrowthDecision = 'SCALE' | 'REPEAT' | 'IMPROVE' | 'REPLACE' | 'PAUSE';

export interface InstagramGrowthGoal {
  primaryObjective: 'grow_audience';
  priorityOrder: ['reach_non_followers', 'retention', 'engagement', 'follower_conversion', 'commercial_conversion'];
}

export interface InstagramGrowthMetrics {
  currentFollowers: number | null;
  followsInPeriod: number;
  reach: number;
  views: number;
  interactions: number;
  profileVisits: number;
  profileLinkTaps: number;
  followerConversionRate: number | null;
  engagementRate: number | null;
  averageSkipRate: number | null;
  publishedContentCount: number;
}

export interface InstagramGrowthAction {
  priority: number;
  decision: InstagramGrowthDecision;
  title: string;
  evidence: string;
  action: string;
  metricToImprove: 'distribution' | 'retention' | 'engagement' | 'follower_conversion' | 'consistency';
  requiresApproval: boolean;
}

export interface InstagramGrowthIntelligence {
  goal: InstagramGrowthGoal;
  metrics: InstagramGrowthMetrics;
  growthScore: number;
  status: 'critical' | 'building' | 'growing' | 'strong';
  actions: InstagramGrowthAction[];
}

const n = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sum = (values: Array<number | null | undefined>): number =>
  values.reduce<number>((total, value) => total + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0);

const average = (values: Array<number | null | undefined>): number | null => {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return present.length ? present.reduce((total, value) => total + value, 0) / present.length : null;
};

const safeRatio = (num: number, den: number): number | null => den > 0 ? num / den : null;

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

function latestFollowerCount(records: NormalizedMarketingRecord[]): number | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const raw = records[index]?.raw;
    const value = n(raw?.followers_count);
    if (value != null) return value;
  }
  return null;
}

/**
 * Instagram-specific brain fed by Windsor-normalized data.
 * The permanent primary objective is audience growth. Commercial conversion
 * remains relevant, but it is downstream of distribution and follower growth.
 */
export function buildInstagramGrowthIntelligence(input: {
  records: NormalizedMarketingRecord[];
  automationMode?: MarketingAutomationMode;
}): InstagramGrowthIntelligence {
  const records = input.records.filter((record) => record.provenance.connector === 'instagram');
  const automationMode = input.automationMode ?? 'RECOMMEND';

  const contentRecords = records.filter((record) => Boolean(record.content?.id));
  const reach = sum(contentRecords.map((record) => record.delivery?.reach));
  const views = sum(contentRecords.map((record) => record.delivery?.views));
  const interactions = sum(contentRecords.map((record) => record.engagement?.interactions));
  const profileVisits = sum(records.map((record) => record.acquisition?.profileVisits));
  const profileLinkTaps = sum(records.map((record) => record.acquisition?.profileLinkTaps));
  const followsInPeriod = sum(records.map((record) => record.acquisition?.follows));
  const averageSkipRate = average(contentRecords.map((record) => record.quality?.skipRate));
  const engagementRate = safeRatio(interactions, reach || views);
  const followerConversionRate = safeRatio(followsInPeriod, reach);
  const currentFollowers = latestFollowerCount(records);

  // Growth score intentionally favors discoverability and retention over vanity engagement.
  const distributionScore = reach > 0 ? clamp(Math.log10(reach + 1) * 22) : 0;
  const retentionScore = averageSkipRate == null ? 25 : clamp((1 - averageSkipRate) * 100);
  const engagementScore = engagementRate == null ? 0 : clamp((engagementRate / 0.08) * 100);
  const followerScore = followerConversionRate == null ? 0 : clamp((followerConversionRate / 0.03) * 100);
  const consistencyScore = clamp((contentRecords.length / 12) * 100);

  const growthScore = Math.round(
    distributionScore * 0.30
      + retentionScore * 0.25
      + engagementScore * 0.15
      + followerScore * 0.20
      + consistencyScore * 0.10,
  );

  const actions: InstagramGrowthAction[] = [];
  const requiresApproval = automationMode !== 'EXECUTE';

  if (contentRecords.length < 8) {
    actions.push({
      priority: 1,
      decision: 'IMPROVE',
      title: 'Aumentar consistência de publicação',
      evidence: `${contentRecords.length} conteúdos detectados no período analisado.`,
      action: 'Planejar uma cadência contínua, priorizando Reels curtos de demonstração e dor concreta.',
      metricToImprove: 'consistency',
      requiresApproval,
    });
  }

  if (averageSkipRate != null && averageSkipRate >= 0.65) {
    actions.push({
      priority: 1,
      decision: 'REPLACE',
      title: 'Trocar hooks com retenção fraca',
      evidence: `Skip médio de ${(averageSkipRate * 100).toFixed(1)}%.`,
      action: 'Abrir os próximos Reels com problema, resultado ou demonstração nos primeiros 2 segundos e remover introduções institucionais.',
      metricToImprove: 'retention',
      requiresApproval,
    });
  }

  if (reach < 500) {
    actions.push({
      priority: 2,
      decision: 'IMPROVE',
      title: 'Expandir alcance fora da base atual',
      evidence: `${Math.round(reach)} contas de alcance somado nos conteúdos analisados.`,
      action: 'Priorizar formatos de descoberta: Reels curtos, colaborações, temas de dor do segmento e variações dos conteúdos com melhor retenção.',
      metricToImprove: 'distribution',
      requiresApproval,
    });
  }

  if (followerConversionRate == null || followerConversionRate < 0.01) {
    actions.push({
      priority: 2,
      decision: 'IMPROVE',
      title: 'Converter alcance em seguidores',
      evidence: followerConversionRate == null
        ? 'Ainda não há base suficiente para calcular conversão de alcance em seguidores.'
        : `Conversão estimada em seguidores de ${(followerConversionRate * 100).toFixed(2)}%.`,
      action: 'Adicionar promessa editorial clara e CTA de seguir em conteúdos de alto alcance; repetir séries para criar motivo de retorno.',
      metricToImprove: 'follower_conversion',
      requiresApproval,
    });
  }

  if (engagementRate != null && engagementRate >= 0.08) {
    actions.push({
      priority: 3,
      decision: 'SCALE',
      title: 'Escalar padrões com interação forte',
      evidence: `Taxa agregada de interação de ${(engagementRate * 100).toFixed(1)}%.`,
      action: 'Criar 3 variações do melhor tema/formato e distribuir em sequência no Planejador.',
      metricToImprove: 'engagement',
      requiresApproval,
    });
  }

  actions.sort((a, b) => a.priority - b.priority);

  return {
    goal: {
      primaryObjective: 'grow_audience',
      priorityOrder: ['reach_non_followers', 'retention', 'engagement', 'follower_conversion', 'commercial_conversion'],
    },
    metrics: {
      currentFollowers,
      followsInPeriod,
      reach,
      views,
      interactions,
      profileVisits,
      profileLinkTaps,
      followerConversionRate,
      engagementRate,
      averageSkipRate,
      publishedContentCount: contentRecords.length,
    },
    growthScore,
    status: growthScore < 30 ? 'critical' : growthScore < 55 ? 'building' : growthScore < 80 ? 'growing' : 'strong',
    actions: actions.slice(0, 5),
  };
}
