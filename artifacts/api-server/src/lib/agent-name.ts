export type AgentName = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding" | "relacionamento" | "financeiro" | "cobranca" | "reception" | "pharmacy";

// Pharmacy is a vertical prompt for the existing service agent, as in plan-guard
// and AI usage billing. Preserve the original prompt identity in task.payload.
export function persistedAgentName(name: AgentName): Exclude<AgentName, "pharmacy"> {
  return name === "pharmacy" ? "service" : name;
}
