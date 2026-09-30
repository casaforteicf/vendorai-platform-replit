import { and, eq } from "drizzle-orm";
import { db, agentConfigsTable, tenantAgentConfigsTable } from "@workspace/db";
import { agentKeyForRuntime, primaryRuntimeForKey, resolveActivation } from "./agent-activation-policy.js";

/** Read fresh state: an explicit Hub switch wins over the legacy JSON. */
export async function isAgentActive(tenantId: string, runtimeName: string): Promise<boolean> {
  const agentKey = agentKeyForRuntime(runtimeName);
  const [[modern], [legacy]] = await Promise.all([
    db.select({ ativo: tenantAgentConfigsTable.ativo }).from(tenantAgentConfigsTable)
      .where(and(eq(tenantAgentConfigsTable.tenantId, tenantId), eq(tenantAgentConfigsTable.agentKey, agentKey))).limit(1),
    db.select({ agents: agentConfigsTable.agents }).from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId)).limit(1),
  ]);
  const entries = legacy?.agents as Record<string, { enabled?: boolean }> | undefined;
  const primary = primaryRuntimeForKey(agentKey);
  // Aliases retain their own legacy opt-out in addition to the Hub master switch.
  if (runtimeName !== primary && entries?.[runtimeName]?.enabled === false) return false;
  return resolveActivation(modern?.ativo, entries?.[runtimeName]?.enabled ?? entries?.[primary]?.enabled);
}
