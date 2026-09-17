import { eq, and } from "drizzle-orm";
import { db, tenantsTable, planModulesTable, agentActionsLogTable } from "@workspace/db";
import type { Logger } from "pino";
import type { ModuleKey } from "@workspace/db";

const AGENT_TO_MODULE: Record<string, ModuleKey> = {
  sdr: "agent_sdr",
  closer: "agent_closer",
  followup: "agent_followup",
  reactivation: "agent_reactivation",
  scheduler: "agent_scheduler",
  service: "agent_service",
  onboarding: "agent_onboarding",
  relacionamento: "agent_scheduler",
  financeiro: "agent_service",
  cobranca: "agent_service",
  reception: "agent_sdr",
  pharmacy: "agent_service",
};

// Product-led upgrade language. We no longer direct customers to retired
// Starter/PME+/Enterprise tiers; capabilities are sold as products or Growth.
export const PLAN_UPGRADE_HINT: Partial<Record<ModuleKey, string>> = {
  agent_sdr: "Ative o Vendor AI Team ou o Growth para usar agentes de IA.",
  agent_closer: "Ative o Vendor AI Team ou o Growth para usar agentes de IA.",
  agent_followup: "Ative o Vendor AI Team ou o Growth para automatizar follow-up.",
  agent_reactivation: "Ative o Vendor AI Team ou o Growth para automatizar reativação.",
  agent_scheduler: "Ative o Vendor AI Team ou o Growth para automação de agenda.",
  agent_service: "Ative o Vendor AI Team ou o Growth para atendimento automatizado.",
  agent_onboarding: "Ative o Vendor AI Team ou o Growth para onboarding automatizado.",
  customer_intelligence: "Ative o Vendor Revenue Scout ou o Growth.",
  intelligence_full: "Ative o Vendor JARVIS/Revenue Scout ou o Growth.",
  prospector_alpha: "Ative o Vendor Prospector ou o Growth.",
  google_calendar: "Ative o Vendor Agenda ou o Growth.",
  knowledge_base: "Ative o Vendor Knowledge AI ou o Growth.",
  executive_report: "Ative o Vendor BI & Analytics ou o Growth.",
};

export function agentNameToModuleKey(agentName: string): ModuleKey | undefined {
  return AGENT_TO_MODULE[agentName];
}

export async function checkPlanModule(
  tenantId: string,
  moduleKey: ModuleKey,
  log: Logger,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const [tenant] = await db
    .select({ planId: tenantsTable.planId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) {
    log.warn({ tenantId }, "plan-guard: tenant not found");
    return { allowed: false, reason: "Tenant not found" };
  }

  if (!tenant.planId) {
    // Legacy mode remains permissive during the commercial migration.
    log.debug({ tenantId }, "plan-guard: no plan assigned — allowing (legacy mode)");
    return { allowed: true };
  }

  const [moduleRow] = await db
    .select({ id: planModulesTable.id })
    .from(planModulesTable)
    .where(
      and(
        eq(planModulesTable.planId, tenant.planId),
        eq(planModulesTable.moduleKey, moduleKey),
      ),
    )
    .limit(1);

  if (!moduleRow) {
    log.warn({ tenantId, moduleKey, planId: tenant.planId }, "plan-guard: module not in base plan");
    return {
      allowed: false,
      reason: PLAN_UPGRADE_HINT[moduleKey] ?? "Este recurso requer um produto adicional ou o Growth.",
    };
  }

  return { allowed: true };
}

export async function logBlockedAction(
  tenantId: string,
  leadId: string | null,
  agentName: string,
  actionType: string,
  reason: string,
): Promise<void> {
  await db.insert(agentActionsLogTable).values({
    tenantId,
    leadId,
    agentName,
    actionType,
    status: "blocked_by_plan",
    payload: { blockedReason: reason },
  });
}

export async function checkAgentPlan(
  tenantId: string,
  agentName: string,
  log: Logger,
  leadId?: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const moduleKey = agentNameToModuleKey(agentName);
  if (!moduleKey) return { allowed: true };

  const result = await checkPlanModule(tenantId, moduleKey, log);
  if (!result.allowed) {
    await logBlockedAction(tenantId, leadId ?? null, agentName, "dispatch", result.reason);
  }
  return result;
}
