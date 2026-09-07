import {
  contentAutopilotConfigTable,
  db,
  type ContentAutopilotAutomationMode,
  type MarketingAutonomyLevel,
} from '@workspace/db';
import { resolveMarketingAgentAutonomyPolicy } from './marketingAgentAutonomyPolicy.js';

function automationModeForLevel(level: MarketingAutonomyLevel): ContentAutopilotAutomationMode {
  if (level === 0) return 'suggestion';
  if (level === 1) return 'semi';
  return 'automatic';
}

export async function getMarketingAutonomySettings(tenantId: string) {
  return resolveMarketingAgentAutonomyPolicy(tenantId);
}

export async function updateMarketingAutonomySettings(input: {
  tenantId: string;
  level: MarketingAutonomyLevel;
  maxTransferFractionPerCycle: number;
}) {
  const now = new Date();
  const policy = {
    level: input.level,
    maxTransferFractionPerCycle: input.maxTransferFractionPerCycle,
    updatedAt: now.toISOString(),
  };
  const automationMode = automationModeForLevel(input.level);

  await db.insert(contentAutopilotConfigTable).values({
    tenantId: input.tenantId,
    ativo: true,
    automationMode,
    marketingAutonomyPolicy: policy,
  }).onConflictDoUpdate({
    target: contentAutopilotConfigTable.tenantId,
    set: {
      ativo: true,
      automationMode,
      marketingAutonomyPolicy: policy,
      updatedAt: now,
    },
  });

  // A configuração do Marketing não deve ligar/desligar autonomyEnabledAt do
  // Agent Config. Esse campo é compartilhado por outros agentes e precisa ser
  // governado fora da UI de Marketing.
  return resolveMarketingAgentAutonomyPolicy(input.tenantId);
}
