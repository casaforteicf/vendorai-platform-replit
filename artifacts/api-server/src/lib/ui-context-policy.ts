/**
 * UI-01.5 — conservative context access policy.
 * This is an additional boundary for context discovery, NOT a replacement
 * for resource-specific authorization, licenses, RLS or module permissions.
 */
export interface UiContextPrincipal {
  sub?: string;
  tenantId?: string;
  accessScope?: string;
  actorType?: string;
}
export interface UiContextMembership {
  userId: string;
  tenantId: string;
  active: boolean;
}
export type UiContextDecision =
  | { allowed: true; tenantId: string; userId: string }
  | { allowed: false; error: "UI_CONTEXT_SCOPE_DENIED" | "INVALID_SESSION_CONTEXT" | "INACTIVE_OR_UNKNOWN_MEMBERSHIP" };

export function authorizeContextDiscovery(
  principal: UiContextPrincipal | undefined,
  membership: UiContextMembership | null,
): UiContextDecision {
  if (!principal || (principal.accessScope && principal.accessScope !== "tenant") ||
      (principal.actorType && principal.actorType !== "human")) {
    return { allowed: false, error: "UI_CONTEXT_SCOPE_DENIED" };
  }
  if (!principal.sub || !principal.tenantId) {
    return { allowed: false, error: "INVALID_SESSION_CONTEXT" };
  }
  if (!membership?.active || membership.userId !== principal.sub ||
      membership.tenantId !== principal.tenantId) {
    return { allowed: false, error: "INACTIVE_OR_UNKNOWN_MEMBERSHIP" };
  }
  return { allowed: true, tenantId: principal.tenantId, userId: principal.sub };
}
