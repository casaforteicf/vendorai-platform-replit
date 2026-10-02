import type { Request } from "express";
import { and, eq, exists, or } from "drizzle-orm";
import {
  db,
  leadsTable,
  usersTable,
  activitiesTable,
  agentTasksTable,
} from "@workspace/db";

export function isTrustedInternalActor(req: Request): boolean {
  return req.user?.actorType === "ai" || req.user?.actorType === "system";
}

export async function canViewAllScopedData(
  req: Request,
  permission: string,
): Promise<boolean> {
  if (req.user?.platformRole === "super_admin" || isTrustedInternalActor(req)) {
    return true;
  }

  const userId = req.user?.sub;
  if (!userId) return false;

  const [user] = await db
    .select({ permissions: usersTable.permissions })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return user?.permissions?.includes(permission) === true;
}

export function leadOwnedByUserCondition(userId: string, leadIdColumn: any) {
  return exists(
    db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.id, leadIdColumn),
          eq(leadsTable.assignedTo, userId),
        ),
      ),
  );
}

export async function canAccessLead(
  req: Request,
  tenantId: string,
  leadId: string,
  permission = "leads:view_all",
): Promise<boolean> {
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return false;
  }

  if (await canViewAllScopedData(req, permission)) return true;

  const userId = req.user?.sub;
  if (!userId) return false;

  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.id, leadId),
        eq(leadsTable.tenantId, tenantId),
        eq(leadsTable.assignedTo, userId),
      ),
    )
    .limit(1);

  return Boolean(lead);
}

export async function canAccessActivity(
  req: Request,
  tenantId: string,
  activityId: string,
): Promise<boolean> {
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return false;
  }
  if (await canViewAllScopedData(req, "activities:view_all")) return true;

  const userId = req.user?.sub;
  if (!userId) return false;

  const [activity] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.id, activityId),
        eq(activitiesTable.tenantId, tenantId),
        or(
          eq(activitiesTable.responsavelId, userId),
          leadOwnedByUserCondition(userId, activitiesTable.leadId),
        )!,
      ),
    )
    .limit(1);

  return Boolean(activity);
}

export async function canAccessAgentTask(
  req: Request,
  tenantId: string,
  taskId: string,
): Promise<boolean> {
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return false;
  }
  if (await canViewAllScopedData(req, "tasks:view_all")) return true;

  const userId = req.user?.sub;
  if (!userId) return false;

  const [task] = await db
    .select({ id: agentTasksTable.id })
    .from(agentTasksTable)
    .where(
      and(
        eq(agentTasksTable.id, taskId),
        eq(agentTasksTable.tenantId, tenantId),
        leadOwnedByUserCondition(userId, agentTasksTable.leadId),
      ),
    )
    .limit(1);

  return Boolean(task);
}