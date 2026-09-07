import { eq } from 'drizzle-orm';
import {
  agentConfigsTable,
  contentAutopilotConfigTable,
  db,
  type MarketingAutonomyLevel,
} from '@workspace/db';

export interface MarketingAgentAutonomyPolicyResult {
  tenantId: string;
  level: MarketingAutonomyLevel;
  allowed: boolean;
  automaticMode: boolean;
  autonomyEnabled: boolean;
  canRecommend: boolean;
  canProduce: boolean;
  canPublish: boolean;
  canOptimizeBudget: boolean;
  canOperateFull: boolean;
  maxTransferFractionPerCycle: number;
  reason: string;
}

function normalizeStoredLevel(raw: unknown): MarketingAutonomyLevel | null {
  const value = Number(raw);
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value as MarketingAutonomyLevel;
  return null;
}

function normalizeTransferFraction(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(0.5, Math.max(0.01, value));
}

/**
 * Fonte de verdade server-side para autonomia do Marketing IA.
 * Níveis:
 * 0 recomenda; 1 produz; 2 publica; 3 otimiza verba; 4 operação completa.
 *
 * A política dedicada do Marketing é independente da autonomia global dos outros
 * agentes. O Agent Config é consultado somente para compatibilidade com tenants
 * antigos que ainda não possuem marketingAutonomyPolicy persistida.
 */
export async function resolveMarketingAgentAutonomyPolicy(
  tenantId: string,
): Promise<MarketingAgentAutonomyPolicyResult> {
  const [[autopilot], [agentConfig]] = await Promise.all([
    db
      .select({
        ativo: contentAutopilotConfigTable.ativo,
        automationMode: contentAutopilotConfigTable.automationMode,
        marketingAutonomyPolicy: contentAutopilotConfigTable.marketingAutonomyPolicy,
      })
      .from(contentAutopilotConfigTable)
      .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
      .limit(1),
    db
      .select({ autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1),
  ]);

  const automaticMode = Boolean(autopilot?.ativo && autopilot.automationMode === 'automatic');
  const legacyAgentAutonomyEnabled = Boolean(agentConfig?.autonomyEnabledAt);
  const stored = autopilot?.marketingAutonomyPolicy as {
    level?: unknown;
    maxTransferFractionPerCycle?: unknown;
  } | null | undefined;
  const storedLevel = normalizeStoredLevel(stored?.level);
  const level: MarketingAutonomyLevel = storedLevel
    ?? (automaticMode && legacyAgentAutonomyEnabled ? 4 : 0);
  const maxTransferFractionPerCycle = normalizeTransferFraction(stored?.maxTransferFractionPerCycle);

  const canRecommend = true;
  const canProduce = level >= 1;
  const canPublish = level >= 2 && automaticMode;
  const canOptimizeBudget = level >= 3 && automaticMode;
  const canOperateFull = level >= 4 && automaticMode;
  const autonomyEnabled = canPublish;
  const allowed = canPublish;

  return {
    tenantId,
    level,
    allowed,
    automaticMode,
    autonomyEnabled,
    canRecommend,
    canProduce,
    canPublish,
    canOptimizeBudget,
    canOperateFull,
    maxTransferFractionPerCycle,
    reason: canPublish
      ? `Marketing IA no nível ${level}, com modo Automático habilitado pela política dedicada do Marketing.`
      : level < 2
        ? `Nível ${level}: publicação autônoma não está autorizada.`
        : 'Marketing não está no modo Automático.',
  };
}
