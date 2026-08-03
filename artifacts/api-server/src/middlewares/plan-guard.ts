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
};

export const PLAN_UPGRADE_HINT: Partial<Record<ModuleKey, string>> = {
  agent_scheduler: "Disponível a partir do plano PME+",
  agent_service: "Disponível a partir do plano PME+",
  agent_onboarding: "Disponível a partir do plano PME+",
  intelligence_full: "Inteligência completa disponível a partir do plano PME+",
  prospector_alpha: "Prospector Alpha disponível no plano PME+ ou como add-on",
  google_calendar: "Google Calendar disponível a partir do plano PME+",
  google_sheets: "Google Sheets disponível no plano Enterprise",
  knowledge_base: "Base de conhecimento disponível no plano Enterprise",
  byok: "BYOK disponível no plano Enterprise",
  partner_portal: "Portal de parceiros disponível no plano Enterprise",
  executive_report: "Relatório executivo disponível no plano Enterprise",
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
    // Legacy mode: allow all tenants without a plan (gradual migration)
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
    log.warn({ tenantId, moduleKey, planId: tenant.planId }, "plan-guard: module not in plan");
    return { allowed: false, reason: `Este módulo não está disponível no seu plano atual` };
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
  if (!moduleKey) {
    // Unknown agent name — allow (developer error, not plan issue)
    return { allowed: true };
  }

  const result = await checkPlanModule(tenantId, moduleKey, log);
  if (!result.allowed) {
    await logBlockedAction(tenantId, leadId ?? null, agentName, "dispatch", result.reason);
  }
  return result;
}
