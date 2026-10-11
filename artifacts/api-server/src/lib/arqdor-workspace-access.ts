/**
 * MULTI-07: pure authorization policy. Database membership must be looked up
 * by (tenantId, projectId, userId) and server-authenticated identity.
 */
export type ArqdorMemberPermission = "owner" | "editor" | "viewer";
export interface ArqdorMembership {
  tenantId: string;
  projectId: string;
  userId: string;
  permission: ArqdorMemberPermission;
}
export interface ArqdorAuthenticatedActor {
  tenantId: string;
  userId: string;
  accessScope?: string;
  actorType?: string;
  active: boolean;
}
export function canEditArqdorWorkspaceProject(
  actor: ArqdorAuthenticatedActor,
  projectTenantId: string,
  projectId: string,
  membership: ArqdorMembership | null,
): boolean {
  if (!actor.active || !actor.tenantId || !actor.userId || !projectId ||
    actor.tenantId !== projectTenantId || actor.actorType === "ai" ||
    actor.actorType === "system" ||
    (actor.accessScope && actor.accessScope !== "tenant") ||
    !membership || membership.tenantId !== actor.tenantId ||
    membership.projectId !== projectId || membership.userId !== actor.userId) return false;
  return membership.permission === "owner" || membership.permission === "editor";
}
