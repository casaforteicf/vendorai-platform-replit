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

function normalizeLevel(raw: unknown, automaticMode: boolean, autonomyEnabled: boolean): MarketingAutonomyLevel {
  const value = Number(raw);
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value as MarketingAutonomyLevel;
  if (automaticMode && autonomyEnabled) return 4;
  return 0;
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
 * Nenhum payload de execução pode elevar o nível definido no tenant.
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
  const autonomyEnabled = Boolean(agentConfig?.autonomyEnabledAt);
  const stored = autopilot?.marketingAutonomyPolicy as { level?: unknown; maxTransferFractionPerCycle?: unknown } | null | undefined;
  const level = normalizeLevel(stored?.level, automaticMode, autonomyEnabled);
  const maxTransferFractionPerCycle = normalizeTransferFraction(stored?.maxTransferFractionPerCycle);

  const canRecommend = true;
  const canProduce = level >= 1;
  const canPublish = level >= 2 && automaticMode && autonomyEnabled;
  const canOptimizeBudget = level >= 3 && automaticMode && autonomyEnabled;
  const canOperateFull = level >= 4 && automaticMode && autonomyEnabled;
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
      ? `Marketing IA no nível ${level}, com modo Automático e autonomia server-side habilitados.`
      : level < 2
        ? `Nível ${level}: publicação autônoma não está autorizada.`
        : !automaticMode
          ? 'Marketing não está no modo Automático.'
          : 'Autonomia do tenant não está habilitada no Agent Config.',
  };
}
