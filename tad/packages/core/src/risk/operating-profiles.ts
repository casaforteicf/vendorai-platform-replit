import type { RiskPolicy } from '../types/index';

export type OperatingProfileId = 'CONSERVATIVE' | 'INTERMEDIATE' | 'AGGRESSIVE';

export interface OperatingProfile {
  id: OperatingProfileId;
  label: string;
  description: string;
  multiplier: number;
  dailyTargetReferencePct: number;
  maxTradesPerDay: null;
  stopAfterDailyTarget: boolean;
  maxPortfolioRiskPct: number;
  maxGrossExposureMultiple: number;
  maxClusterRiskPct: number;
  riskPolicy: RiskPolicy;
}

export const GLOBAL_PAPER_SAFETY_CAPS = {
  maxRiskPerTradePct: 0.8,
  maxDailyLossPct: 4,
  maxLeverage: 6,
  maxOpenPositions: 6,
  maxPortfolioRiskPct: 2.4,
  maxGrossExposureMultiple: 8,
  maxClusterRiskPct: 1.6,
} as const;

export const OPERATING_PROFILES: Record<OperatingProfileId, OperatingProfile> = {
  CONSERVATIVE: {
    id: 'CONSERVATIVE',
    label: 'Conservador',
    description: 'Configuração base do TAD. Prioriza seletividade, menor exposição e preservação de capital PAPER.',
    multiplier: 1,
    dailyTargetReferencePct: 1.6,
    maxTradesPerDay: null,
    stopAfterDailyTarget: false,
    maxPortfolioRiskPct: 1.2,
    maxGrossExposureMultiple: 4,
    maxClusterRiskPct: 0.8,
    riskPolicy: {
      maxRiskPerTradePct: 0.4,
      maxDailyLossPct: 2,
      maxLeverage: 3,
      maxOpenPositions: 3,
      maxSpreadPct: 0.08,
      minConsensus: 0.70,
    },
  },
  INTERMEDIATE: {
    id: 'INTERMEDIATE',
    label: 'Intermediário',
    description: 'Amplia em 40% os limites operacionais da base, mantendo os mesmos gates de qualidade, regime e risco.',
    multiplier: 1.4,
    dailyTargetReferencePct: 2.24,
    maxTradesPerDay: null,
    stopAfterDailyTarget: false,
    maxPortfolioRiskPct: 1.68,
    maxGrossExposureMultiple: 5.6,
    maxClusterRiskPct: 1.12,
    riskPolicy: {
      maxRiskPerTradePct: 0.56,
      maxDailyLossPct: 2.8,
      maxLeverage: 4.2,
      maxOpenPositions: 4,
      maxSpreadPct: 0.08,
      minConsensus: 0.70,
    },
  },
  AGGRESSIVE: {
    id: 'AGGRESSIVE',
    label: 'Arriscado',
    description: 'Dobra os limites da configuração base para testes PAPER/SHADOW. Continua sujeito aos hard gates globais.',
    multiplier: 2,
    dailyTargetReferencePct: 3.2,
    maxTradesPerDay: null,
    stopAfterDailyTarget: false,
    maxPortfolioRiskPct: 2.4,
    maxGrossExposureMultiple: 8,
    maxClusterRiskPct: 1.6,
    riskPolicy: {
      maxRiskPerTradePct: 0.8,
      maxDailyLossPct: 4,
      maxLeverage: 6,
      maxOpenPositions: 6,
      maxSpreadPct: 0.08,
      minConsensus: 0.70,
    },
  },
};

export function getOperatingProfile(id?: string | null): OperatingProfile {
  if (id && id in OPERATING_PROFILES) return OPERATING_PROFILES[id as OperatingProfileId];
  return OPERATING_PROFILES.CONSERVATIVE;
}

export function clampRiskPolicyToPaperCaps(policy: RiskPolicy): RiskPolicy {
  return {
    ...policy,
    maxRiskPerTradePct: Math.min(policy.maxRiskPerTradePct, GLOBAL_PAPER_SAFETY_CAPS.maxRiskPerTradePct),
    maxDailyLossPct: Math.min(policy.maxDailyLossPct, GLOBAL_PAPER_SAFETY_CAPS.maxDailyLossPct),
    maxLeverage: Math.min(policy.maxLeverage, GLOBAL_PAPER_SAFETY_CAPS.maxLeverage),
    maxOpenPositions: Math.min(policy.maxOpenPositions, GLOBAL_PAPER_SAFETY_CAPS.maxOpenPositions),
  };
}
