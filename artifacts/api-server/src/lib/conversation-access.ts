import type { Request } from "express";
import { and, eq, exists, or } from "drizzle-orm";
import {
  db,
  conversationsTable,
  leadsTable,
  usersTable,
  whatsappConnectionsTable,
} from "@workspace/db";

function isTrustedInternalActor(req: Request): boolean {
  return req.user?.actorType === "ai" || req.user?.actorType === "system";
}

export async function canViewAllConversations(req: Request): Promise<boolean> {
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

  return user?.permissions?.includes("conversations:view_all") === true;
}

export function conversationOwnedByUserCondition(userId: string) {
  return or(
    eq(conversationsTable.assignedTo, userId),
    exists(
      db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.id, conversationsTable.leadId),
            eq(leadsTable.assignedTo, userId),
          ),
        ),
    ),
    exists(
      db
        .select({ id: whatsappConnectionsTable.id })
        .from(whatsappConnectionsTable)
        .where(
          and(
            eq(whatsappConnectionsTable.id, conversationsTable.whatsappConnectionId),
            eq(whatsappConnectionsTable.assignedUserId, userId),
          ),
        ),
    ),
  )!;
}

export async function canAccessConversation(
  req: Request,
  tenantId: string,
  conversationId: string,
): Promise<boolean> {
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return false;
  }

  const conditions = [
    eq(conversationsTable.id, conversationId),
    eq(conversationsTable.tenantId, tenantId),
  ];

  if (!(await canViewAllConversations(req))) {
    const userId = req.user?.sub;
    if (!userId) return false;
    conditions.push(conversationOwnedByUserCondition(userId));
  }

  const [conversation] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(...conditions))
    .limit(1);

  return Boolean(conversation);
}