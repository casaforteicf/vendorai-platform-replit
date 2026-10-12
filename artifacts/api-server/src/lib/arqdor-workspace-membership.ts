import { and, eq } from "drizzle-orm";
import { db, arqdorWorkspaceMembersTable, arqdorWorkspaceProjectsTable, usersTable } from "@workspace/db";
import type { JwtPayload } from "../lib/jwt.js";
import { canEditArqdorWorkspaceProject } from "./arqdor-workspace-access";

/** MULTI-07: server-side membership resolver. Call ONLY after authentication. */
export async function canActorEditArqdorProject(user: JwtPayload | undefined, tenantId: string, projectId: string): Promise<boolean> {
  if (!user?.sub || !tenantId || !projectId || user.tenantId !== tenantId) return false;
  if (user.accessScope && user.accessScope !== "tenant") return false;
  if (user.actorType && user.actorType !== "human") return false;
  const [actor] = await db.select({ id: usersTable.id, tenantId: usersTable.tenantId, active: usersTable.active })
    .from(usersTable).where(and(eq(usersTable.id, user.sub), eq(usersTable.tenantId, tenantId))).limit(1);
  if (!actor?.active) return false;
  const [project] = await db.select({ id: arqdorWorkspaceProjectsTable.id })
    .from(arqdorWorkspaceProjectsTable)
    .where(and(eq(arqdorWorkspaceProjectsTable.id, projectId), eq(arqdorWorkspaceProjectsTable.tenantId, tenantId))).limit(1);
  if (!project) return false;
  const [member] = await db.select({ tenantId: arqdorWorkspaceMembersTable.tenantId, projectId: arqdorWorkspaceMembersTable.projectId, userId: arqdorWorkspaceMembersTable.userId, permission: arqdorWorkspaceMembersTable.permission })
    .from(arqdorWorkspaceMembersTable)
    .where(and(eq(arqdorWorkspaceMembersTable.tenantId, tenantId), eq(arqdorWorkspaceMembersTable.projectId, projectId), eq(arqdorWorkspaceMembersTable.userId, user.sub))).limit(1);
  return canEditArqdorWorkspaceProject({
    tenantId, userId: user.sub, active: actor.active, accessScope: user.accessScope, actorType: user.actorType,
  }, tenantId, projectId, member ?? null);
}
