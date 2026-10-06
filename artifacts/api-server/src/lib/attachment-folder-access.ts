import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  activitiesTable,
  attachmentFolderLockObjectsTable,
  attachmentFolderLocksTable,
  db,
  leadsTable,
  mediaAssetsTable,
  workCardAttachmentsTable,
  workCardsTable,
} from "@workspace/db";
import { verifyAttachmentFolderUnlockToken } from "./jwt.js";

export function isAttachmentFolderSchemaMissingError(error: unknown): boolean {
  const current = error as { code?: string; cause?: { code?: string }; message?: string };
  return current?.code === "42P01"
    || current?.cause?.code === "42P01"
    || String(current?.message ?? "").includes("attachment_folder_locks")
    || String(current?.message ?? "").includes("attachment_folder_lock_objects");
}

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
  try {
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
  } catch (error) {
    if (isAttachmentFolderSchemaMissingError(error)) return null;
    throw error;
  }
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
  try {
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
  } catch (error) {
    if (isAttachmentFolderSchemaMissingError(error)) return null;
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeFolder(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split("/").map((part) => part.trim()).filter(Boolean).join(" / ");
}

function inferAttachmentType(mimeType?: string | null, name?: string | null): "image" | "video" | "audio" | "document" {
  const mime = String(mimeType ?? "").toLowerCase();
  const filename = String(name ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(filename)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|m4v|avi)$/i.test(filename)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|aac)$/i.test(filename)) return "audio";
  return "document";
}

function automaticFolder(input: {
  name?: string | null;
  category?: string | null;
  origin?: string | null;
  type?: "image" | "video" | "audio" | "document" | null;
  activityType?: string | null;
  pipeline?: string | null;
}): string {
  const text = [input.name, input.category, input.origin, input.activityType, input.pipeline]
    .filter(Boolean).join(" ").toLowerCase();
  if (/contrato|contract|termo assinado|assinad/.test(text)) return "Documentos / Contratos";
  if (/proposta|orçamento|orcamento|cotação|cotacao/.test(text)) return "Documentos / Propostas e Orçamentos";
  if (/ordem de serviço|ordem de servico|\bos\b|service order/.test(text)) return "Documentos / Ordens de Serviço";
  if (/boleto|linha digitável|linha digitavel/.test(text)) return "Financeiro / Boletos";
  if (/\bpix\b|qr code|qrcode/.test(text)) return "Financeiro / PIX";
  if (/nota fiscal|\bnf-e?\b|\bnfe\b|danfe/.test(text)) return "Financeiro / Notas Fiscais";
  if (/comprovante|recibo|pagamento|baixa financeira/.test(text)) return "Financeiro / Comprovantes e Recibos";
  if (/projeto|planta|render|fachada|memorial|especificaç|especificac/.test(text)) return "Projetos";
  if (/assistência|assistencia|suporte|garantia|manutenção|manutencao/.test(text)) return "Assistência / Suporte";
  if (/execução|execucao|obra|instalação|instalacao|entrega/.test(text)) return "Execução / Obra";
  if (/whatsapp|e-mail|email|conversa|mensagem|omnichannel/.test(text)) return "Conversas / Arquivos recebidos";
  if (input.type === "image") return "Imagens e Fotos";
  if (input.type === "video") return "Vídeos";
  if (input.type === "audio") return "Áudios";
  return "Outros";
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Rebuilds the object mapping for every protected folder of a lead from
 * authoritative server-side sources. This prevents a client from omitting an
 * object path when a folder is protected.
 */
export async function syncProtectedObjectsForLead(tenantId: string, leadId: string): Promise<void> {
  try {
    const locks = await db
    .select()
    .from(attachmentFolderLocksTable)
    .where(and(
      eq(attachmentFolderLocksTable.tenantId, tenantId),
      eq(attachmentFolderLocksTable.leadId, leadId),
    ));
  if (!locks.length) return;

  const [lead, activities, workAttachments, mediaAssets, cards] = await Promise.all([
    db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId))).limit(1),
    db.select().from(activitiesTable).where(and(eq(activitiesTable.tenantId, tenantId), eq(activitiesTable.leadId, leadId))),
    db.select().from(workCardAttachmentsTable).where(and(eq(workCardAttachmentsTable.tenantId, tenantId), eq(workCardAttachmentsTable.leadId, leadId))),
    db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.tenantId, tenantId)),
    db.select({ id: workCardsTable.id, pipeline: workCardsTable.pipeline })
      .from(workCardsTable)
      .where(and(eq(workCardsTable.tenantId, tenantId), eq(workCardsTable.leadId, leadId))),
  ]);

  const discovery = asRecord(lead[0]?.discoveryData);
  const root = asRecord(discovery["vendoraiAttachments"]);
  const files = Array.isArray(root["files"]) ? root["files"] as Array<Record<string, unknown>> : [];
  const overrides = asRecord(root["overrides"]);
  const cardPipeline = new Map(cards.map((card) => [card.id, card.pipeline]));

  const objectsByFolder = new Map<string, Set<string>>();
  const add = (folder: string, url: unknown) => {
    const objectPath = normalizeAttachmentObjectPath(typeof url === "string" ? url : "");
    const normalizedFolder = normalizeFolder(folder);
    if (!objectPath || !normalizedFolder) return;
    const set = objectsByFolder.get(normalizedFolder) ?? new Set<string>();
    set.add(objectPath);
    objectsByFolder.set(normalizedFolder, set);
  };

  for (const file of files) {
    const id = typeof file["id"] === "string" ? String(file["id"]) : "";
    const override = asRecord(overrides[`lead:${id}`]);
    const name = typeof file["name"] === "string" ? file["name"] : "";
    const type = typeof file["type"] === "string" ? file["type"] as "image" | "video" | "audio" | "document" : inferAttachmentType(null, name);
    const folder = normalizeFolder(override["folderPath"] ?? file["folderPath"])
      || automaticFolder({ name, category: typeof file["category"] === "string" ? file["category"] : null, origin: "Upload no cliente", type });
    add(folder, file["storageUrl"]);
  }

  for (const activity of activities) {
    if (!activity.anexoUrl) continue;
    const override = asRecord(overrides[`activity:${activity.id}`]);
    const type = inferAttachmentType(activity.anexoMimeType, activity.anexoNome);
    const folder = normalizeFolder(override["folderPath"]) || automaticFolder({
      name: activity.anexoNome || activity.titulo,
      category: activity.anexoCategoria,
      origin: activity.tipo === "assistencia" ? "Assistência" : "Atividade",
      type,
      activityType: activity.tipo,
    });
    add(folder, activity.anexoUrl);
  }

  for (const attachment of workAttachments) {
    const override = asRecord(overrides[`work:${attachment.id}`]);
    const pipeline = cardPipeline.get(attachment.workCardId) ?? null;
    const type = inferAttachmentType(attachment.mimeType, attachment.nome);
    const folder = normalizeFolder(override["folderPath"]) || automaticFolder({
      name: attachment.nome,
      origin: attachment.origem,
      type,
      pipeline,
    });
    add(folder, attachment.url);
  }

  for (const asset of mediaAssets) {
    const metadata = asRecord(asset.metadata);
    if (metadataString(metadata, "leadId") !== leadId) continue;
    const override = asRecord(overrides[`media:${asset.id}`]);
    const folder = normalizeFolder(override["folderPath"])
      || normalizeFolder(metadata["folderPath"])
      || automaticFolder({
        name: metadataString(metadata, "displayName") || asset.originalFilename,
        category: metadataString(metadata, "category"),
        origin: asset.source,
        type: asset.type as "image" | "video" | "audio" | "document",
      });
    add(folder, asset.storageUrl);
  }

  for (const lock of locks) {
    const objectPaths = [...(objectsByFolder.get(lock.folderPath) ?? new Set<string>())];
    await db.delete(attachmentFolderLockObjectsTable).where(eq(attachmentFolderLockObjectsTable.lockId, lock.id));
    if (objectPaths.length) {
      await db.insert(attachmentFolderLockObjectsTable).values(objectPaths.map((objectPath) => ({
        tenantId,
        leadId,
        lockId: lock.id,
        folderPath: lock.folderPath,
        objectPath,
      })));
    }
  }
  } catch (error) {
    if (isAttachmentFolderSchemaMissingError(error)) return;
    throw error;
  }
}
