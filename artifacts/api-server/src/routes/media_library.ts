import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  mediaAssetsTable,
  mediaJobsTable,
  mediaProjectsTable,
  mediaVersionsTable,
} from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const PROJECT_KINDS = new Set(["video", "reel", "story", "feed", "audio", "mixed"]);
const PROJECT_STATUSES = new Set(["draft", "processing", "ready", "archived"]);
const ASSET_TYPES = new Set(["video", "image", "audio", "document"]);
const ASSET_ROLES = new Set([
  "source",
  "reference",
  "broll",
  "voice",
  "music",
  "thumbnail",
  "output",
]);
const ASSET_SOURCES = new Set(["upload", "generated", "external", "imported"]);

function clampLimit(value: unknown, fallback = 40, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function withAccessUrl<T extends { storageUrl?: string | null }>(asset: T): Promise<T & { accessUrl?: string | null }> {
  const storageUrl = String(asset.storageUrl ?? "");
  if (!storageUrl.startsWith("/objects/")) return { ...asset, accessUrl: storageUrl || null };
  try {
    return { ...asset, accessUrl: await objectStorage.getObjectEntitySignedUrl(storageUrl, 300) };
  } catch {
    return { ...asset, accessUrl: null };
  }
}

async function withAccessUrls<T extends { storageUrl?: string | null }>(assets: T[]) {
  return Promise.all(assets.map((asset) => withAccessUrl(asset)));
}

async function findProject(tenantId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(mediaProjectsTable)
    .where(and(eq(mediaProjectsTable.id, projectId), eq(mediaProjectsTable.tenantId, tenantId)))
    .limit(1);
  return project ?? null;
}

router.use("/tenants/:tenantId/media", requireSameTenanOrSuperAdmin());

router.get("/tenants/:tenantId/media/projects", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const status = nonEmptyString(req.query["status"]);
  const kind = nonEmptyString(req.query["kind"]);
  const limit = clampLimit(req.query["limit"]);

  if (status && !PROJECT_STATUSES.has(status)) {
    res.status(422).json({ error: "status de projeto inválido" });
    return;
  }
  if (kind && !PROJECT_KINDS.has(kind)) {
    res.status(422).json({ error: "kind de projeto inválido" });
    return;
  }

  const filters = [eq(mediaProjectsTable.tenantId, tenantId)];
  if (status) filters.push(eq(mediaProjectsTable.status, status));
  if (kind) filters.push(eq(mediaProjectsTable.kind, kind));

  const projects = await db
    .select()
    .from(mediaProjectsTable)
    .where(and(...filters))
    .orderBy(desc(mediaProjectsTable.updatedAt))
    .limit(limit);

  res.json({ projects });
});

router.post("/tenants/:tenantId/media/projects", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = asRecord(req.body);
  const title = nonEmptyString(body["title"]);
  const kind = nonEmptyString(body["kind"]) ?? "video";
  const source = nonEmptyString(body["source"]) ?? "content_studio";

  if (!title) {
    res.status(422).json({ error: "title é obrigatório" });
    return;
  }
  if (!PROJECT_KINDS.has(kind)) {
    res.status(422).json({ error: "kind de projeto inválido" });
    return;
  }

  const [project] = await db
    .insert(mediaProjectsTable)
    .values({
      tenantId,
      userId: req.user?.sub ?? null,
      title,
      kind,
      status: "draft",
      source,
      context: asRecord(body["context"]),
      updatedAt: new Date(),
    })
    .returning();

  res.status(201).json({ project });
});

router.get("/tenants/:tenantId/media/projects/:projectId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const projectId = String(req.params["projectId"]);
  const project = await findProject(tenantId, projectId);

  if (!project) {
    res.status(404).json({ error: "Projeto de mídia não encontrado" });
    return;
  }

  const [assets, versions, jobs] = await Promise.all([
    db
      .select()
      .from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.tenantId, tenantId), eq(mediaAssetsTable.projectId, projectId)))
      .orderBy(desc(mediaAssetsTable.createdAt)),
    db
      .select()
      .from(mediaVersionsTable)
      .where(and(eq(mediaVersionsTable.tenantId, tenantId), eq(mediaVersionsTable.projectId, projectId)))
      .orderBy(desc(mediaVersionsTable.createdAt)),
    db
      .select()
      .from(mediaJobsTable)
      .where(and(eq(mediaJobsTable.tenantId, tenantId), eq(mediaJobsTable.projectId, projectId)))
      .orderBy(desc(mediaJobsTable.createdAt))
      .limit(50),
  ]);

  res.json({ project, assets: await withAccessUrls(assets), versions, jobs });
});

router.patch("/tenants/:tenantId/media/projects/:projectId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const projectId = String(req.params["projectId"]);
  const existing = await findProject(tenantId, projectId);
  if (!existing) {
    res.status(404).json({ error: "Projeto de mídia não encontrado" });
    return;
  }

  const body = asRecord(req.body);
  const changes: {
    title?: string;
    kind?: string;
    status?: string;
    context?: Record<string, unknown>;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body["title"] !== undefined) {
    const title = nonEmptyString(body["title"]);
    if (!title) {
      res.status(422).json({ error: "title não pode ser vazio" });
      return;
    }
    changes.title = title;
  }

  if (body["kind"] !== undefined) {
    const kind = nonEmptyString(body["kind"]);
    if (!kind || !PROJECT_KINDS.has(kind)) {
      res.status(422).json({ error: "kind de projeto inválido" });
      return;
    }
    changes.kind = kind;
  }

  if (body["status"] !== undefined) {
    const status = nonEmptyString(body["status"]);
    if (!status || !PROJECT_STATUSES.has(status)) {
      res.status(422).json({ error: "status de projeto inválido" });
      return;
    }
    changes.status = status;
  }

  if (body["context"] !== undefined) changes.context = asRecord(body["context"]);

  const [project] = await db
    .update(mediaProjectsTable)
    .set(changes)
    .where(and(eq(mediaProjectsTable.id, projectId), eq(mediaProjectsTable.tenantId, tenantId)))
    .returning();

  res.json({ project });
});

router.get("/tenants/:tenantId/media/assets", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const type = nonEmptyString(req.query["type"]);
  const projectId = nonEmptyString(req.query["projectId"]);
  const limit = clampLimit(req.query["limit"], 60, 150);

  if (type && !ASSET_TYPES.has(type)) {
    res.status(422).json({ error: "type de ativo inválido" });
    return;
  }

  const filters = [eq(mediaAssetsTable.tenantId, tenantId)];
  if (type) filters.push(eq(mediaAssetsTable.type, type));
  if (projectId) filters.push(eq(mediaAssetsTable.projectId, projectId));

  const assets = await db
    .select()
    .from(mediaAssetsTable)
    .where(and(...filters))
    .orderBy(desc(mediaAssetsTable.createdAt))
    .limit(limit);

  res.json({ assets: await withAccessUrls(assets) });
});

router.post("/tenants/:tenantId/media/assets/request-upload", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = asRecord(req.body);
  const projectId = nonEmptyString(body["projectId"]);
  const name = nonEmptyString(body["name"]);
  const contentType = nonEmptyString(body["contentType"]);
  const type = nonEmptyString(body["type"]);
  const size = Number(body["size"] ?? 0);

  if (!name || !contentType || !type || !ASSET_TYPES.has(type)) {
    res.status(422).json({ error: "name, contentType e type válidos são obrigatórios" });
    return;
  }
  if (!Number.isFinite(size) || size <= 0) {
    res.status(422).json({ error: "size deve ser maior que zero" });
    return;
  }
  if (projectId && !(await findProject(tenantId, projectId))) {
    res.status(404).json({ error: "Projeto de mídia não encontrado" });
    return;
  }

  try {
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType, type, projectId },
    });
  } catch (error) {
    req.log.error({ err: error, tenantId }, "media-library: failed to request upload URL");
    res.status(500).json({ error: "Falha ao preparar upload da mídia" });
  }
});

router.post("/tenants/:tenantId/media/assets/import-dropbox", async (req, res) => {
  // tenant-audit: reviewed route is already protected by requireSameTenanOrSuperAdmin()
  const tenantId = String(req.params["tenantId"]);
  const body = asRecord(req.body);
  const rawUrl = nonEmptyString(body["url"]);
  const originalFilename = nonEmptyString(body["originalFilename"]) ?? "arquivo-importado.pptx";

  if (!rawUrl) {
    res.status(422).json({ error: "url é obrigatória" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    res.status(422).json({ error: "url inválida" });
    return;
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (parsedUrl.protocol !== "https:" || !host.endsWith(".dropboxusercontent.com")) {
    res.status(422).json({ error: "origem não permitida" });
    return;
  }

  try {
    const upstream = await fetch(parsedUrl, { redirect: "follow" });
    if (!upstream.ok) {
      res.status(422).json({ error: `Falha ao baixar arquivo: HTTP ${upstream.status}` });
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024) {
      res.status(buffer.length > 50 * 1024 * 1024 ? 413 : 422).json({ error: buffer.length ? "Arquivo excede o limite de 50 MB" : "Arquivo vazio" });
      return;
    }
    const mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const storageUrl = await objectStorage.saveMediaBuffer(buffer, mimeType, originalFilename);
    const [asset] = await db.insert(mediaAssetsTable).values({
      tenantId,
      projectId: null,
      userId: req.user?.sub ?? null,
      type: "document",
      role: "source",
      storageUrl,
      mimeType,
      fileSize: buffer.length,
      originalFilename,
      source: "imported",
      metadata: {
        folderPath: "Apresentações",
        title: "Vendor.ai — Apresentação Comercial Master",
        official: true,
        usage: "comercial",
        importedFrom: "dropbox_temporary_link",
        importedAt: new Date().toISOString(),
      },
    }).returning();

    res.status(201).json({ asset });
  } catch (error) {
    req.log.error({ err: error, tenantId }, "media-library: import-dropbox failed");
    res.status(500).json({ error: "Falha ao importar apresentação" });
  }
});

router.post("/tenants/:tenantId/media/assets", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = asRecord(req.body);
  const projectId = nonEmptyString(body["projectId"]);
  const type = nonEmptyString(body["type"]);
  const role = nonEmptyString(body["role"]) ?? "source";
  const source = nonEmptyString(body["source"]) ?? "upload";
  const storageUrl = nonEmptyString(body["storageUrl"]);
  const originalFilename = nonEmptyString(body["originalFilename"]);
  const requestedMimeType = nonEmptyString(body["mimeType"]);
  const requestedFileSize = Number(body["fileSize"] ?? 0);

  if (!type || !ASSET_TYPES.has(type)) {
    res.status(422).json({ error: "type de ativo inválido" });
    return;
  }
  if (!ASSET_ROLES.has(role)) {
    res.status(422).json({ error: "role de ativo inválido" });
    return;
  }
  if (!ASSET_SOURCES.has(source)) {
    res.status(422).json({ error: "source de ativo inválido" });
    return;
  }
  if (!storageUrl) {
    res.status(422).json({ error: "storageUrl é obrigatório" });
    return;
  }
  if (projectId && !(await findProject(tenantId, projectId))) {
    res.status(404).json({ error: "Projeto de mídia não encontrado" });
    return;
  }

  let mimeType = requestedMimeType;
  let fileSize = Number.isFinite(requestedFileSize) && requestedFileSize > 0
    ? Math.floor(requestedFileSize)
    : null;

  if (source === "upload") {
    if (!storageUrl.startsWith("/objects/")) {
      res.status(422).json({ error: "Uploads devem usar um storageUrl /objects/... válido" });
      return;
    }
    try {
      const file = await objectStorage.getObjectEntityFile(storageUrl);
      const [storedMetadata] = await file.getMetadata();
      mimeType = mimeType ?? storedMetadata.contentType ?? null;
      fileSize = fileSize ?? (storedMetadata.size ? Number(storedMetadata.size) : null);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(422).json({ error: "Arquivo ainda não foi enviado para o Object Storage" });
        return;
      }
      req.log.error({ err: error, tenantId, storageUrl }, "media-library: asset verification failed");
      res.status(500).json({ error: "Falha ao validar arquivo de mídia" });
      return;
    }
  }

  const [asset] = await db
    .insert(mediaAssetsTable)
    .values({
      tenantId,
      projectId,
      userId: req.user?.sub ?? null,
      type,
      role,
      storageUrl,
      mimeType,
      fileSize,
      originalFilename,
      source,
      metadata: asRecord(body["metadata"]),
    })
    .returning();

  let version = null;
  if (projectId && asset) {
    const operation = nonEmptyString(body["operation"]) ?? (role === "output" ? "generated" : "original");
    const [createdVersion] = await db
      .insert(mediaVersionsTable)
      .values({
        tenantId,
        projectId,
        assetId: asset.id,
        parentVersionId: nonEmptyString(body["parentVersionId"]),
        operation,
        label: nonEmptyString(body["label"]),
        metadata: asRecord(body["versionMetadata"]),
      })
      .returning();
    version = createdVersion ?? null;

    await db
      .update(mediaProjectsTable)
      .set({ status: role === "output" ? "ready" : "draft", updatedAt: new Date() })
      .where(and(eq(mediaProjectsTable.id, projectId), eq(mediaProjectsTable.tenantId, tenantId)));
  }

  res.status(201).json({ asset, version });
});

router.patch("/tenants/:tenantId/media/assets/:assetId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const assetId = String(req.params["assetId"]);
  const body = asRecord(req.body);

  const [existing] = await db
    .select()
    .from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Ativo de mídia não encontrado" });
    return;
  }

  const changes: { metadata?: Record<string, unknown>; projectId?: string | null; role?: string } = {};

  if (body["metadata"] !== undefined) {
    changes.metadata = { ...asRecord(existing.metadata), ...asRecord(body["metadata"]) };
  }

  if (body["role"] !== undefined) {
    const role = nonEmptyString(body["role"]);
    if (!role || !ASSET_ROLES.has(role)) {
      res.status(422).json({ error: "role de ativo inválido" });
      return;
    }
    changes.role = role;
  }

  if (body["projectId"] !== undefined) {
    const projectId = nonEmptyString(body["projectId"]);
    if (projectId && !(await findProject(tenantId, projectId))) {
      res.status(404).json({ error: "Projeto de mídia não encontrado" });
      return;
    }
    changes.projectId = projectId;
  }

  if (!Object.keys(changes).length) {
    res.status(422).json({ error: "Nenhuma alteração válida informada" });
    return;
  }

  const [asset] = await db
    .update(mediaAssetsTable)
    .set(changes)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.tenantId, tenantId)))
    .returning();

  res.json({ asset });
});

router.delete("/tenants/:tenantId/media/assets/:assetId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const assetId = String(req.params["assetId"]);

  const [existing] = await db
    .select()
    .from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Ativo de mídia não encontrado" });
    return;
  }

  if (existing.storageUrl.startsWith("/objects/")) {
    try {
      const file = await objectStorage.getObjectEntityFile(existing.storageUrl);
      await file.delete();
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        req.log.error(
          { err: error, tenantId, assetId, storageUrl: existing.storageUrl },
          "media-library: failed to delete stored asset",
        );
        res.status(500).json({ error: "Não foi possível excluir o arquivo físico da mídia" });
        return;
      }
    }
  }

  await db
    .delete(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.tenantId, tenantId)));

  res.json({ deleted: true, assetId });
});

router.get("/tenants/:tenantId/media/projects/:projectId/versions", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const projectId = String(req.params["projectId"]);
  if (!(await findProject(tenantId, projectId))) {
    res.status(404).json({ error: "Projeto de mídia não encontrado" });
    return;
  }

  const versions = await db
    .select()
    .from(mediaVersionsTable)
    .where(and(eq(mediaVersionsTable.tenantId, tenantId), eq(mediaVersionsTable.projectId, projectId)))
    .orderBy(desc(mediaVersionsTable.createdAt));

  res.json({ versions });
});

router.post("/tenants/:tenantId/media/projects/:projectId/versions", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const projectId = String(req.params["projectId"]);
  const body = asRecord(req.body);
  const assetId = nonEmptyString(body["assetId"]);
  const operation = nonEmptyString(body["operation"]) ?? "edit";

  if (!(await findProject(tenantId, projectId))) {
    res.status(404).json({ error: "Projeto de mídia não encontrado" });
    return;
  }

  if (assetId) {
    const [asset] = await db
      .select({ id: mediaAssetsTable.id })
      .from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.tenantId, tenantId)))
      .limit(1);
    if (!asset) {
      res.status(404).json({ error: "Ativo de mídia não encontrado" });
      return;
    }
  }

  const parentVersionId = nonEmptyString(body["parentVersionId"]);
  if (parentVersionId) {
    const [parent] = await db
      .select({ id: mediaVersionsTable.id })
      .from(mediaVersionsTable)
      .where(
        and(
          eq(mediaVersionsTable.id, parentVersionId),
          eq(mediaVersionsTable.tenantId, tenantId),
          eq(mediaVersionsTable.projectId, projectId),
        ),
      )
      .limit(1);
    if (!parent) {
      res.status(404).json({ error: "Versão pai não encontrada neste projeto" });
      return;
    }
  }

  const [version] = await db
    .insert(mediaVersionsTable)
    .values({
      tenantId,
      projectId,
      assetId,
      parentVersionId,
      operation,
      label: nonEmptyString(body["label"]),
      metadata: asRecord(body["metadata"]),
    })
    .returning();

  await db
    .update(mediaProjectsTable)
    .set({ updatedAt: new Date() })
    .where(and(eq(mediaProjectsTable.id, projectId), eq(mediaProjectsTable.tenantId, tenantId)));

  res.status(201).json({ version });
});

export default router;