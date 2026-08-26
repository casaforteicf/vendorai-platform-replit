import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "praca-delivery-evidence";
const MAX_SIZE = 10 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function client(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase Storage não configurado.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

let bucketReady: Promise<void> | null = null;
async function ensurePrivateBucket(storage: SupabaseClient): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data, error } = await storage.storage.getBucket(BUCKET);
      if (error && !/not found/i.test(error.message)) throw error;
      if (!data) {
        const created = await storage.storage.createBucket(BUCKET, {
          public: false,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: Object.keys(MIME_EXT),
        });
        if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
      } else if (data.public) {
        const updated = await storage.storage.updateBucket(BUCKET, {
          public: false,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: Object.keys(MIME_EXT),
        });
        if (updated.error) throw updated.error;
      }
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}

export function validateEvidenceFile(contentType: string, size: number): string {
  const ext = MIME_EXT[contentType];
  if (!ext) throw Object.assign(new Error("Use imagem JPEG, PNG ou WebP."), { statusCode: 422 });
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_SIZE) {
    throw Object.assign(new Error("A imagem deve ter no máximo 10 MB."), { statusCode: 422 });
  }
  return ext;
}

export async function createEvidenceUpload(
  tenantId: string,
  orderId: string,
  volumeId: string,
  contentType: string,
  size: number,
): Promise<{ uploadUrl: string; objectPath: string }> {
  const ext = validateEvidenceFile(contentType, size);
  const storage = client();
  await ensurePrivateBucket(storage);
  const objectPath = `${tenantId}/${orderId}/${volumeId}/${randomUUID()}.${ext}`;
  const { data, error } = await storage.storage.from(BUCKET).createSignedUploadUrl(objectPath, { upsert: false });
  if (error || !data) throw new Error(`Falha ao autorizar upload privado: ${error?.message ?? "erro desconhecido"}`);
  return { uploadUrl: data.signedUrl, objectPath };
}

export async function createEvidenceReadUrl(objectPath: string): Promise<string> {
  const storage = client();
  await ensurePrivateBucket(storage);
  const { data, error } = await storage.storage.from(BUCKET).createSignedUrl(objectPath, 300);
  if (error || !data) throw new Error(`Falha ao abrir prova privada: ${error?.message ?? "erro desconhecido"}`);
  return data.signedUrl;
}

export function evidencePathBelongsTo(
  objectPath: string,
  tenantId: string,
  orderId: string,
  volumeId: string,
): boolean {
  return objectPath.startsWith(`${tenantId}/${orderId}/${volumeId}/`) &&
    !objectPath.includes("..") && objectPath.length <= 500;
}
