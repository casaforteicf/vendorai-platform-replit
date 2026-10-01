import { inflateRawSync } from "node:zlib";

export type SketchfabSearchItem = {
  uid: string;
  name: string;
  description: string | null;
  viewerUrl: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorUid: string | null;
  licenseLabel: string | null;
  licenseSlug: string | null;
  isDownloadable: boolean;
  vertexCount: number | null;
  faceCount: number | null;
};

export type SketchfabOAuthTokens = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
};

export type SketchfabArchiveEntry = {
  path: string;
  data: Buffer;
};

const API = "https://api.sketchfab.com/v3";
const OAUTH = "https://sketchfab.com/oauth2";

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredEnv(name: "SKETCHFAB_CLIENT_ID" | "SKETCHFAB_CLIENT_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

export function sketchfabConfigured(): boolean {
  return Boolean(process.env["SKETCHFAB_CLIENT_ID"]?.trim() && process.env["SKETCHFAB_CLIENT_SECRET"]?.trim());
}

export function getSketchfabRedirectUri(): string {
  const explicit = process.env["SKETCHFAB_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;
  const apiBase = process.env["PUBLIC_API_URL"]?.trim()
    || process.env["APP_URL"]?.trim()
    || (process.env["NODE_ENV"] === "production" ? "https://appvendorai.com" : "http://localhost:3000");
  const base = apiBase.replace(/\/$/, "");
  return `${base.endsWith("/api") ? base : `${base}/api`}/auth/sketchfab/callback`;
}

export function buildSketchfabOAuthUrl(state: string): string {
  const url = new URL(`${OAUTH}/authorize/`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requiredEnv("SKETCHFAB_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getSketchfabRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSketchfabCode(code: string): Promise<SketchfabOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: requiredEnv("SKETCHFAB_CLIENT_ID"),
    client_secret: requiredEnv("SKETCHFAB_CLIENT_SECRET"),
    redirect_uri: getSketchfabRedirectUri(),
  });
  const response = await fetch(`${OAUTH}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) throw new Error(`Sketchfab OAuth exchange failed (${response.status})`);
  return response.json() as Promise<SketchfabOAuthTokens>;
}

export async function refreshSketchfabAccessToken(refreshToken: string): Promise<SketchfabOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("SKETCHFAB_CLIENT_ID"),
    client_secret: requiredEnv("SKETCHFAB_CLIENT_SECRET"),
    refresh_token: refreshToken,
  });
  const response = await fetch(`${OAUTH}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) throw new Error(`Sketchfab OAuth refresh failed (${response.status})`);
  return response.json() as Promise<SketchfabOAuthTokens>;
}

export async function getSketchfabMe(accessToken: string) {
  const response = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Sketchfab profile lookup failed (${response.status})`);
  return response.json() as Promise<{ uid?: string; username?: string; displayName?: string }>;
}

function normalizeModel(row: any): SketchfabSearchItem {
  const images = Array.isArray(row?.thumbnails?.images) ? row.thumbnails.images : [];
  const thumb = images
    .filter((x: any) => typeof x?.url === "string")
    .sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0))[0]?.url ?? null;
  return {
    uid: String(row?.uid ?? ""),
    name: String(row?.name ?? "Modelo 3D"),
    description: textOrNull(row?.description),
    viewerUrl: textOrNull(row?.viewerUrl) ?? `https://sketchfab.com/3d-models/${row?.uid ?? ""}`,
    thumbnailUrl: textOrNull(thumb),
    authorName: textOrNull(row?.user?.displayName) ?? textOrNull(row?.user?.username),
    authorUid: textOrNull(row?.user?.uid),
    licenseLabel: textOrNull(row?.license?.label),
    licenseSlug: textOrNull(row?.license?.slug),
    isDownloadable: Boolean(row?.isDownloadable),
    vertexCount: Number.isFinite(Number(row?.vertexCount)) ? Number(row.vertexCount) : null,
    faceCount: Number.isFinite(Number(row?.faceCount)) ? Number(row.faceCount) : null,
  };
}

export async function searchSketchfabModels(query: string, limit = 24): Promise<SketchfabSearchItem[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL(`${API}/search`);
  url.searchParams.set("type", "models");
  url.searchParams.set("q", q);
  url.searchParams.set("downloadable", "true");
  url.searchParams.set("sort_by", "-likeCount");
  url.searchParams.set("count", String(Math.min(48, Math.max(1, limit))));
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "VendorAI-Arqdor/1.0" } });
  if (!response.ok) throw new Error(`Sketchfab search failed (${response.status})`);
  const payload = await response.json() as any;
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows.map(normalizeModel).filter((item: SketchfabSearchItem) => item.uid && item.isDownloadable);
}

export async function getSketchfabModel(uid: string, accessToken?: string): Promise<SketchfabSearchItem> {
  const response = await fetch(`${API}/models/${encodeURIComponent(uid)}`, {
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "User-Agent": "VendorAI-Arqdor/1.0",
    },
  });
  if (!response.ok) throw new Error(`Sketchfab model lookup failed (${response.status})`);
  return normalizeModel(await response.json());
}

export async function getSketchfabDownload(uid: string, accessToken: string) {
  const response = await fetch(`${API}/models/${encodeURIComponent(uid)}/download`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "User-Agent": "VendorAI-Arqdor/1.0" },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Sketchfab download failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json() as Promise<{ gltf?: { url?: string; size?: number; expires?: number }; usdz?: { url?: string; size?: number; expires?: number } }>;
}

export async function downloadSketchfabGltfArchive(url: string, declaredSize?: number): Promise<Buffer> {
  const maxBytes = 45 * 1024 * 1024;
  if (declaredSize && declaredSize > maxBytes) throw new Error("sketchfab_archive_too_large");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Sketchfab archive download failed (${response.status})`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("sketchfab_archive_too_large");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("sketchfab_archive_too_large");
  return buffer;
}

function safeZipPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === ".." || part.includes("\0"))) return null;
  return parts.join("/");
}

export function extractZipArchive(zip: Buffer): SketchfabArchiveEntry[] {
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("invalid_zip_archive");

  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (entryCount > 600) throw new Error("zip_too_many_entries");

  const files: SketchfabArchiveEntry[] = [];
  let ptr = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index++) {
    if (ptr + 46 > zip.length || zip.readUInt32LE(ptr) !== CENTRAL) throw new Error("invalid_zip_central_directory");
    const flags = zip.readUInt16LE(ptr + 8);
    const method = zip.readUInt16LE(ptr + 10);
    const compressedSize = zip.readUInt32LE(ptr + 20);
    const uncompressedSize = zip.readUInt32LE(ptr + 24);
    const nameLength = zip.readUInt16LE(ptr + 28);
    const extraLength = zip.readUInt16LE(ptr + 30);
    const commentLength = zip.readUInt16LE(ptr + 32);
    const localOffset = zip.readUInt32LE(ptr + 42);
    const rawName = zip.subarray(ptr + 46, ptr + 46 + nameLength).toString("utf8");
    ptr += 46 + nameLength + extraLength + commentLength;

    if (rawName.endsWith("/")) continue;
    const path = safeZipPath(rawName);
    if (!path) throw new Error("unsafe_zip_path");
    if (flags & 0x1) throw new Error("encrypted_zip_not_supported");
    if (![0, 8].includes(method)) throw new Error("unsupported_zip_compression");
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL) throw new Error("invalid_zip_local_header");
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    if (uncompressedSize && data.length !== uncompressedSize) throw new Error("zip_size_mismatch");
    totalUncompressed += data.length;
    if (totalUncompressed > 180 * 1024 * 1024) throw new Error("zip_uncompressed_too_large");
    files.push({ path, data });
  }

  if (!files.length) throw new Error("empty_zip_archive");
  return files;
}

export function contentTypeForModelAsset(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "gltf") return "model/gltf+json";
  if (ext === "glb") return "model/gltf-binary";
  if (ext === "bin") return "application/octet-stream";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "ktx2") return "image/ktx2";
  return "application/octet-stream";
}
