import { ObjectStorageService } from "./objectStorage.js";

const storage = new ObjectStorageService();

/**
 * Meta/LinkedIn/TikTok/YouTube baixam a mídia por URL pública. Objetos do
 * Storage são privados (`/objects/...`), então precisam de URL assinada antes
 * de ir para as APIs — sem isso a publicação falha com mídia inválida.
 *
 * URLs http(s) já públicas (ex.: assinadas antes) passam direto.
 */
export async function resolvePublicMediaUrl(url: string | null | undefined, ttlSeconds = 3600): Promise<string> {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const path = value.startsWith("/api/storage/") ? value.slice("/api/storage".length) : value;
  if (!path.startsWith("/objects/")) return value;

  try {
    return await storage.getObjectEntitySignedUrl(path, ttlSeconds);
  } catch {
    return value;
  }
}
