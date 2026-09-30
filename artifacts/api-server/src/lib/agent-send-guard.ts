import { isAgentActive } from "./agent-activation.js";

export async function assertAutomatedSendAllowed(input: {
  tenantId: string;
  agentName?: string | null;
  humanLock?: string | null;
  disabled?: boolean | null;
}): Promise<void> {
  if (!input.agentName) return; // Manual operator messages remain available.
  if (input.humanLock === "human" || input.disabled) {
    throw new Error("AGENT_BLOCKED: atendimento humano ou agente desativado para o contato");
  }
  if (!(await isAgentActive(input.tenantId, input.agentName))) {
    throw new Error("AGENT_DISABLED: agente sem ativação explícita para esta empresa");
  }
}
