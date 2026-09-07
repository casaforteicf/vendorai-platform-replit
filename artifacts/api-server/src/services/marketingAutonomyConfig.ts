import { eq } from 'drizzle-orm';
import {
  agentConfigsTable,
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

  const [existingAgentConfig] = await db
    .select({ id: agentConfigsTable.id })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, input.tenantId))
    .limit(1);

  if (existingAgentConfig) {
    await db.update(agentConfigsTable).set({
      autonomyEnabledAt: input.level >= 2 ? now : null,
      updatedAt: now,
    }).where(eq(agentConfigsTable.tenantId, input.tenantId));
  } else {
    await db.insert(agentConfigsTable).values({
      tenantId: input.tenantId,
      setupCompletedAt: now,
      autonomyEnabledAt: input.level >= 2 ? now : null,
    });
  }

  return resolveMarketingAgentAutonomyPolicy(input.tenantId);
}
