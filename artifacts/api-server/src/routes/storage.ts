import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { verifyToken } from "../lib/jwt.js";
import { pool } from "@workspace/db";

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

async function legacyObjectBelongsToTenant(tenantId: string, objectPath: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT (
      EXISTS (SELECT 1 FROM media_assets WHERE tenant_id::text=$1 AND position($2 in coalesce(storage_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM arch_ai_renders WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(mask_file_url::text,'')) > 0 OR
        position($2 in coalesce(original_image_url::text,'')) > 0 OR
        position($2 in coalesce(result_image_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM arch_render_videos WHERE tenant_id::text=$1 AND position($2 in coalesce(video_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM arch_specifications WHERE tenant_id::text=$1 AND position($2 in coalesce(render_image_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM arch_suggestions WHERE tenant_id::text=$1 AND position($2 in coalesce(image_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM arch_catalogo WHERE tenant_id::text=$1 AND position($2 in coalesce(imagens::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM business_profiles WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(logo_url::text,'')) > 0 OR
        position($2 in coalesce(favicon_url::text,'')) > 0 OR
        position($2 in coalesce(proposal_template_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM tenants WHERE id::text=$1 AND position($2 in coalesce(logo_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM campaigns WHERE tenant_id::text=$1 AND position($2 in coalesce(image_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM ad_campaigns WHERE tenant_id::text=$1 AND position($2 in coalesce(imagem_escolhida_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM content_studio_uploads WHERE tenant_id::text=$1 AND position($2 in coalesce(file_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM content_autopilot_articles WHERE tenant_id::text=$1 AND position($2 in coalesce(imagens::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM deals WHERE tenant_id::text=$1 AND position($2 in coalesce(quote_file_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM activities WHERE tenant_id::text=$1 AND position($2 in coalesce(anexo_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM messages WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(media_url::text,'')) > 0 OR
        position($2 in coalesce(midia_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM obra_lancamentos WHERE tenant_id::text=$1 AND position($2 in coalesce(documento_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM obra_portal_documents WHERE tenant_id::text=$1 AND position($2 in coalesce(url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM produtos_catalogo WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(imagem_url::text,'')) > 0 OR
        position($2 in coalesce(imagens::text,'')) > 0 OR
        position($2 in coalesce(video_url::text,'')) > 0 OR
        position($2 in coalesce(texture_url::text,'')) > 0 OR
        position($2 in coalesce(model3d_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM propostas WHERE tenant_id::text=$1 AND position($2 in coalesce(arquivo_importado_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM tenant_themes WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(logo_url::text,'')) > 0 OR
        position($2 in coalesce(logo_light_bg_url::text,'')) > 0 OR
        position($2 in coalesce(logo_dark_bg_url::text,'')) > 0 OR
        position($2 in coalesce(logo_icon_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM work_card_attachments WHERE tenant_id::text=$1 AND position($2 in coalesce(url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM vendor_shield_delivery_evidence WHERE tenant_id::text=$1 AND position($2 in coalesce(storage_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM vendor_shield_validation_steps WHERE tenant_id::text=$1 AND position($2 in coalesce(evidence_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM vendor_stories WHERE tenant_id::text=$1 AND position($2 in coalesce(media_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM variedades_dia WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(video_url::text,'')) > 0 OR
        position($2 in coalesce(imagem_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM fretes_cargas WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(fotos_coleta_urls::text,'')) > 0 OR
        position($2 in coalesce(fotos_entrega_urls::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM installation_visits WHERE tenant_id::text=$1 AND (
        position($2 in coalesce(customer_signature_url::text,'')) > 0 OR
        position($2 in coalesce(company_signature_url::text,'')) > 0))
      OR EXISTS (SELECT 1 FROM lead_products WHERE tenant_id::text=$1 AND position($2 in coalesce(imagem_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM leads WHERE tenant_id::text=$1 AND position($2 in coalesce(logo_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM social_publications WHERE tenant_id::text=$1 AND position($2 in coalesce(media_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM whatsapp_messages WHERE tenant_id::text=$1 AND position($2 in coalesce(media_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM praca_entrega_falhas WHERE tenant_id::text=$1 AND position($2 in coalesce(foto_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM praca_entrega_provas WHERE tenant_id::text=$1 AND position($2 in coalesce(foto_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM fretes_veiculos WHERE tenant_id::text=$1 AND position($2 in coalesce(foto_url::text,'')) > 0)
      OR EXISTS (SELECT 1 FROM veiculos_estoque WHERE tenant_id::text=$1 AND position($2 in coalesce(vistoria_laudo_url::text,'')) > 0)
    ) AS allowed`,
    [tenantId, objectPath],
  );
  return rows[0]?.allowed === true;
}

async function requireStorageObjectAccess(req: Request, res: Response, objectPath: string): Promise<boolean> {
  const user = (req as any).user;
  if (user?.platformRole === "super_admin") return true;
  const tenantId = String(user?.tenantId ?? "").trim();
  if (!tenantId) {
    res.status(403).json({ error: "Tenant context required" });
    return false;
  }

  const tenantRoot = "/objects/tenants/";
  if (objectPath.startsWith(tenantRoot)) {
    const ownPrefix = `${tenantRoot}${tenantId}/`;
    if (objectPath.startsWith(ownPrefix)) return true;
    res.status(403).json({ error: "Cross-tenant storage access denied" });
    return false;
  }

  if (await legacyObjectBelongsToTenant(tenantId, objectPath)) return true;
  res.status(403).json({ error: "Storage object is not linked to this tenant" });
  return false;
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

    const uploadURL = await objectStorageService.getObjectEntityUploadURL((req as any).user?.tenantId);
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
    if (!(await requireStorageObjectAccess(req, res, objectPath))) return;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const objectResponse = await objectStorageService.downloadObject(objectFile, 3600);

    objectResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.setHeader("Cache-Control", "private, max-age=900");
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
