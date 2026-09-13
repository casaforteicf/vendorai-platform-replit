import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type FollowerQueueStatus = "todo" | "doing" | "done";

export type FollowerQueueSeed = {
  externalKey: string;
  title: string;
  theme?: string | null;
  priority: "alta" | "media";
  pack: Record<string, unknown>;
  dueAt?: string | null;
};

export type FollowerQueuePatch = {
  status?: FollowerQueueStatus;
  priority?: "alta" | "media";
  assigneeUserId?: string | null;
  dueAt?: string | null;
};

export async function syncFollowerGrowthQueue(tenantId: string, actorUserId: string | null, items: FollowerQueueSeed[]) {
  for (const item of items) {
    await db.execute(sql`
      INSERT INTO follower_growth_production_queue (
        tenant_id, external_key, title, theme, priority, status, pack, due_at, created_by_user_id
      ) VALUES (
        ${tenantId}, ${item.externalKey}, ${item.title}, ${item.theme ?? null}, ${item.priority}, 'todo',
        ${JSON.stringify(item.pack)}::jsonb, ${item.dueAt ?? null}, ${actorUserId}
      )
      ON CONFLICT (tenant_id, external_key) DO UPDATE SET
        title = EXCLUDED.title,
        theme = EXCLUDED.theme,
        priority = EXCLUDED.priority,
        pack = EXCLUDED.pack,
        updated_at = now()
    `);
  }
  return listFollowerGrowthQueue(tenantId);
}

export async function listFollowerGrowthQueue(tenantId: string) {
  const result = await db.execute(sql`
    SELECT
      q.id,
      q.external_key AS "externalKey",
      q.title,
      q.theme,
      q.priority,
      q.status,
      q.pack,
      q.assignee_user_id AS "assigneeUserId",
      q.due_at AS "dueAt",
      q.created_by_user_id AS "createdByUserId",
      q.created_at AS "createdAt",
      q.updated_at AS "updatedAt",
      q.completed_at AS "completedAt",
      u.name AS "assigneeName",
      u.email AS "assigneeEmail"
    FROM follower_growth_production_queue q
    LEFT JOIN users u ON u.id = q.assignee_user_id
    WHERE q.tenant_id = ${tenantId}
    ORDER BY
      CASE q.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
      CASE q.priority WHEN 'alta' THEN 0 ELSE 1 END,
      q.updated_at DESC
  `);
  return result.rows ?? [];
}

export async function updateFollowerGrowthQueueItem(
  tenantId: string,
  itemId: string,
  actorUserId: string | null,
  patch: FollowerQueuePatch,
) {
  const beforeResult = await db.execute(sql`
    SELECT status, priority, assignee_user_id, due_at
    FROM follower_growth_production_queue
    WHERE tenant_id = ${tenantId} AND id = ${itemId}
    LIMIT 1
  `);
  const before = beforeResult.rows?.[0] as Record<string, unknown> | undefined;
  if (!before) return null;

  const status = patch.status ?? String(before.status) as FollowerQueueStatus;
  const priority = patch.priority ?? String(before.priority) as "alta" | "media";
  const assigneeUserId = patch.assigneeUserId !== undefined ? patch.assigneeUserId : (before.assignee_user_id as string | null);
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : (before.due_at as string | null);

  const updated = await db.execute(sql`
    UPDATE follower_growth_production_queue
       SET status = ${status},
           priority = ${priority},
           assignee_user_id = ${assigneeUserId},
           due_at = ${dueAt},
           completed_at = CASE WHEN ${status} = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END,
           updated_at = now()
     WHERE tenant_id = ${tenantId} AND id = ${itemId}
     RETURNING id
  `);
  if (!updated.rows?.length) return null;

  const changedStatus = String(before.status) !== status;
  const changedOwner = (before.assignee_user_id ?? null) !== assigneeUserId;
  const changedDueAt = String(before.due_at ?? "") !== String(dueAt ?? "");
  const eventType = changedStatus ? "status_changed" : changedOwner ? "assignee_changed" : changedDueAt ? "deadline_changed" : "updated";

  await db.execute(sql`
    INSERT INTO follower_growth_production_queue_history (
      tenant_id, queue_item_id, actor_user_id, event_type, from_status, to_status, metadata
    ) VALUES (
      ${tenantId}, ${itemId}, ${actorUserId}, ${eventType}, ${String(before.status)}, ${status},
      ${JSON.stringify({ priority, assigneeUserId, dueAt })}::jsonb
    )
  `);

  const list = await listFollowerGrowthQueue(tenantId);
  return list.find((item: any) => item.id === itemId) ?? null;
}

export async function listFollowerGrowthQueueHistory(tenantId: string, itemId?: string) {
  const result = itemId
    ? await db.execute(sql`
        SELECT id, queue_item_id AS "queueItemId", actor_user_id AS "actorUserId", event_type AS "eventType",
               from_status AS "fromStatus", to_status AS "toStatus", metadata, created_at AS "createdAt"
          FROM follower_growth_production_queue_history
         WHERE tenant_id = ${tenantId} AND queue_item_id = ${itemId}
         ORDER BY created_at DESC
         LIMIT 100
      `)
    : await db.execute(sql`
        SELECT id, queue_item_id AS "queueItemId", actor_user_id AS "actorUserId", event_type AS "eventType",
               from_status AS "fromStatus", to_status AS "toStatus", metadata, created_at AS "createdAt"
          FROM follower_growth_production_queue_history
         WHERE tenant_id = ${tenantId}
         ORDER BY created_at DESC
         LIMIT 100
      `);
  return result.rows ?? [];
}
