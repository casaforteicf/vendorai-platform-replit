import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { verifyToken } from "../lib/jwt.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function cookieValue(req: Request, name: string): string {
  const cookieHeader = String(req.headers.cookie ?? "");
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function storageSession(req: Request) {
  const authHeader = String(req.headers.authorization ?? "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearer || cookieValue(req, "vendorai_storage_session");
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function requireStorageSession(req: Request, res: Response): boolean {
  const user = storageSession(req);
  if (!user) {
    res.status(401).json({ error: "Storage authentication required" });
    return false;
  }
  (req as any).user = user;
  return true;
}

function requireStorageBearer(req: Request, res: Response): boolean {
  const authHeader = String(req.headers.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Bearer authentication required" });
    return false;
  }
  try {
    (req as any).user = verifyToken(authHeader.slice(7).trim());
    return true;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return false;
  }
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload (Supabase Storage signed upload URL).
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL via PUT.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!requireStorageBearer(req, res)) return;
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/objects/*
 *
 * Compatibility redirect: old frontend builds incorrectly prepended "public-objects/"
 * to objectPaths that already start with "objects/", producing doubled paths like
 * /storage/public-objects/objects/uploads/UUID. Redirect to the correct route.
 */
router.get("/storage/public-objects/objects/*path", (req: Request, res: Response) => {
  const raw = req.params.path;
  const rest = Array.isArray(raw) ? raw.join("/") : raw;
  res.redirect(301, `/api/storage/objects/${rest}`);
});

/**
 * GET /storage/public-objects/*
 *
 * Serve explicitly public assets through the API. The underlying Supabase bucket
 * can remain private; this route is the public boundary for PUBLIC_OBJECT_SEARCH_PATHS.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const objectResponse = await objectStorageService.downloadObject(file, 3600);
    objectResponse.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(objectResponse.status);
    res.send(Buffer.from(await objectResponse.arrayBuffer()));
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities by streaming the bytes through the API.
 *
 * Important: the production Cloudflare Pages worker proxies /api/* with
 * redirect=manual. Returning a 302 to Supabase here made image loads depend on
 * a second cross-origin redirect, which caused broken Render Studio previews in
 * production. Streaming the object returns a stable 200 image response from the
 * same application origin.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!requireStorageSession(req, res)) return;
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const objectResponse = await objectStorageService.downloadObject(objectFile, 3600);

    objectResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.status(objectResponse.status);
    res.send(Buffer.from(await objectResponse.arrayBuffer()));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
