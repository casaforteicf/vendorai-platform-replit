export type GuardResult = {
  allowed: boolean;
  reason?: string;
};

export function guardCopilotAction(action: string, context: {
  hasProject?: boolean;
  hasBudgetApproval?: boolean;
  hasCanonicalProductId?: boolean;
  hasHealthyApi?: boolean;
}): GuardResult {
  if (!context.hasHealthyApi) {
    return { allowed: false, reason: "API em warning/offline. Ação bloqueada por segurança." };
  }

  if (action.includes("procurement") && !context.hasBudgetApproval) {
    return { allowed: false, reason: "Procurement depende de aprovação financeira." };
  }

  if (action.includes("purchase") && !context.hasCanonicalProductId) {
    return { allowed: false, reason: "Compra depende de canonicalProductId." };
  }

  if (!context.hasProject) {
    return { allowed: false, reason: "Projeto real não carregado." };
  }

  return { allowed: true };
}
