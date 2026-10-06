import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  attachmentFolderLockObjectsTable,
  attachmentFolderLocksTable,
  db,
} from "@workspace/db";
import { verifyAttachmentFolderUnlockToken } from "./jwt.js";

export function normalizeAttachmentObjectPath(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/storage/objects/")) return raw.replace("/api/storage", "");
  if (raw.startsWith("/objects/")) return raw;
  return "";
}

export function attachmentUnlockCookieName(lockId: string): string {
  return `vai_folder_unlock_${lockId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48)}`;
}

function readCookie(req: Request, name: string): string {
  const header = String(req.headers.cookie ?? "");
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export async function getLockedObjectRecord(tenantId: string, objectPath: string) {
  const normalized = normalizeAttachmentObjectPath(objectPath);
  if (!normalized) return null;
  const [row] = await db
    .select({
      lockId: attachmentFolderLockObjectsTable.lockId,
      leadId: attachmentFolderLockObjectsTable.leadId,
      folderPath: attachmentFolderLockObjectsTable.folderPath,
      tenantId: attachmentFolderLockObjectsTable.tenantId,
    })
    .from(attachmentFolderLockObjectsTable)
    .where(and(
      eq(attachmentFolderLockObjectsTable.tenantId, tenantId),
      eq(attachmentFolderLockObjectsTable.objectPath, normalized),
    ))
    .limit(1);
  return row ?? null;
}

export async function requestCanAccessLockedObject(req: Request, tenantId: string, objectPath: string): Promise<boolean> {
  const record = await getLockedObjectRecord(tenantId, objectPath);
  if (!record) return true;
  const user = (req as any).user;
  if (user?.platformRole === "super_admin") return true;

  const cookie = readCookie(req, attachmentUnlockCookieName(record.lockId));
  if (!cookie) return false;
  try {
    const payload = verifyAttachmentFolderUnlockToken(cookie);
    return payload.tenantId === record.tenantId
      && payload.leadId === record.leadId
      && payload.lockId === record.lockId
      && payload.folderPath === record.folderPath
      && payload.sub === user?.sub;
  } catch {
    return false;
  }
}

export async function getFolderLockByPath(tenantId: string, leadId: string, folderPath: string) {
  const [lock] = await db
    .select()
    .from(attachmentFolderLocksTable)
    .where(and(
      eq(attachmentFolderLocksTable.tenantId, tenantId),
      eq(attachmentFolderLocksTable.leadId, leadId),
      eq(attachmentFolderLocksTable.folderPath, folderPath),
    ))
    .limit(1);
  return lock ?? null;
}
