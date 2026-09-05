import { eq } from 'drizzle-orm';
import {
  agentConfigsTable,
  contentAutopilotConfigTable,
  db,
} from '@workspace/db';

export interface MarketingAgentAutonomyPolicyResult {
  tenantId: string;
  allowed: boolean;
  automaticMode: boolean;
  autonomyEnabled: boolean;
  reason: string;
}

/**
 * Server-side source of truth for autonomous Marketing actions.
 *
 * Automatic mode alone is not enough: the tenant must also have explicit
 * agent autonomy enabled. Callers cannot grant this capability via request
 * payloads or local flags.
 */
export async function resolveMarketingAgentAutonomyPolicy(
  tenantId: string,
): Promise<MarketingAgentAutonomyPolicyResult> {
  const [[autopilot], [agentConfig]] = await Promise.all([
    db
      .select({
        ativo: contentAutopilotConfigTable.ativo,
        automationMode: contentAutopilotConfigTable.automationMode,
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
  const allowed = automaticMode && autonomyEnabled;

  return {
    tenantId,
    allowed,
    automaticMode,
    autonomyEnabled,
    reason: allowed
      ? 'Marketing automático ativo e autonomia do tenant habilitada no servidor.'
      : !automaticMode
        ? 'Marketing não está no modo Automático.'
        : 'Autonomia do tenant não está habilitada no Agent Config.',
  };
}
