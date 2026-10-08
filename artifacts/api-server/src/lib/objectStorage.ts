import { randomUUID, webcrypto } from "crypto";
import { Readable } from "stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

// ─────────────────────────────────────────────────────────────────────────
// Camada de storage — migração Supabase Storage → Cloudflare R2.
//
// Mantém EXATAMENTE a mesma API pública de antes (objectStorageClient,
// ObjectStorageService, ObjectNotFoundError e todos os métodos, incluindo
// getPublicUrl / getObjectEntityUploadURL / savePrivateBuffer). Nenhum dos
// arquivos que já usavam storage precisa mudar.
//
// Backend selecionado em runtime pelas variáveis de ambiente:
//   • R2 configurado (R2_ACCOUNT_ID|R2_ENDPOINT + R2_ACCESS_KEY_ID +
//     R2_SECRET_ACCESS_KEY + R2_BUCKET):
//       - ESCRITA (upload/save) → R2
//       - LEITURA (download/exists/metadata) → R2 e, se não achar, cai no
//         Supabase (compatível com arquivos ainda não copiados).
//       - getPublicUrl → URL ABSOLUTA servida pelo próprio backend
//         (STORAGE_PUBLIC_BASE_URL + /api/storage/...), que é pública e
//         transmite os bytes do R2. Praça.ai e as redes sociais continuam
//         conseguindo baixar a mídia por URL.
//   • R2 NÃO configurado → comportamento 100% Supabase (idêntico ao de hoje,
//     bucket público + getPublicUrl do Supabase). Seguro pra subir antes mesmo
//     de ligar o R2.
//
// Endereçamento: PRIVATE_OBJECT_DIR / PUBLIC_OBJECT_SEARCH_PATHS continuam no
// formato "/<bucket>/<prefixo>". A "chave" (objectName) é a MESMA nos dois
// backends — no R2 ela vira a key dentro do R2_BUCKET; por isso a cópia via
// rclone é um sync direto do conteúdo do bucket Supabase pra dentro do
// R2_BUCKET, preservando as keys.
// ─────────────────────────────────────────────────────────────────────────

// aws4fetch usa Web Crypto (crypto.subtle). Garante o polyfill em qualquer
// runtime Node.
if (typeof (globalThis as any).crypto === "undefined" || !(globalThis as any).crypto?.subtle) {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}

// ───────────────────────────── Supabase client ─────────────────────────────

function getSupabaseClient(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados " +
        "para upload/download de arquivos via Supabase.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function hasSupabaseConfigured(): boolean {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

const ensuredBuckets = new Map<string, Promise<void>>();
const OBJECT_STORAGE_FILE_SIZE_LIMIT = "50MB";

async function ensureBucketExists(client: SupabaseClient, bucketName: string): Promise<void> {
  let promise = ensuredBuckets.get(bucketName);
  if (!promise) {
    promise = (async () => {
      const { data: buckets } = await client.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === bucketName);
      if (!exists) {
        const { error } = await client.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: OBJECT_STORAGE_FILE_SIZE_LIMIT,
        });
        if (error && !/already exists/i.test(error.message)) {
          throw error;
        }
      } else {
        const { error } = await client.storage.updateBucket(bucketName, {
          public: true,
          fileSizeLimit: OBJECT_STORAGE_FILE_SIZE_LIMIT,
        });
        if (error) throw error;
      }
    })();
    ensuredBuckets.set(bucketName, promise);
  }
  return promise;
}

// ───────────────────────────────── R2 (S3) ─────────────────────────────────

interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

let cachedR2: { client: AwsClient; config: R2Config } | null = null;
let r2Resolved = false;

function resolveR2Config(): R2Config | null {
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];
  if (!accessKeyId || !secretAccessKey || !bucket) return null;

  let endpoint = process.env["R2_ENDPOINT"];
  if (!endpoint) {
    const accountId = process.env["R2_ACCOUNT_ID"];
    if (!accountId) return null;
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }
  endpoint = endpoint.replace(/\/+$/, "");

  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function getR2(): { client: AwsClient; config: R2Config } | null {
  if (r2Resolved) return cachedR2;
  r2Resolved = true;
  const config = resolveR2Config();
  if (!config) {
    cachedR2 = null;
    return null;
  }
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  cachedR2 = { client, config };
  return cachedR2;
}

function isR2Enabled(): boolean {
  return getR2() !== null;
}

function encodeR2Key(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function r2ObjectUrl(config: R2Config, key: string): string {
  return `${config.endpoint}/${config.bucket}/${encodeR2Key(key)}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

const R2 = {
  async put(key: string, buffer: Buffer, contentType?: string): Promise<void> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    const res = await r2.client.fetch(r2ObjectUrl(r2.config, key), {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers,
    });
    if (!res.ok) {
      throw new Error(`Falha ao gravar no R2 (${res.status}): ${await safeText(res)}`);
    }
  },

  async head(key: string): Promise<{ exists: boolean; contentType?: string; size?: number }> {
    const r2 = getR2();
    if (!r2) return { exists: false };
    const res = await r2.client.fetch(r2ObjectUrl(r2.config, key), { method: "HEAD" });
    if (!res.ok) return { exists: false };
    const ct = res.headers.get("content-type") ?? undefined;
    const len = res.headers.get("content-length");
    return { exists: true, contentType: ct, size: len ? Number(len) : undefined };
  },

  async get(key: string): Promise<{ buffer: Buffer; contentType?: string }> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const res = await r2.client.fetch(r2ObjectUrl(r2.config, key), { method: "GET" });
    if (!res.ok) {
      throw new Error(`Falha ao baixar do R2 (${res.status}): ${await safeText(res)}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? undefined;
    return { buffer, contentType: ct };
  },

  async delete(key: string): Promise<void> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const res = await r2.client.fetch(r2ObjectUrl(r2.config, key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Falha ao apagar do R2 (${res.status}): ${await safeText(res)}`);
    }
  },

  async presignPut(key: string, expiresInSec: number): Promise<string> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const ttl = Math.max(60, Math.min(7 * 24 * 60 * 60, Math.floor(expiresInSec)));
    const url = `${r2ObjectUrl(r2.config, key)}?X-Amz-Expires=${ttl}`;
    const signed = await r2.client.sign(url, { method: "PUT", aws: { signQuery: true } });
    return signed.url;
  },
};

// Base pública do backend, usada pra montar as URLs que Praça.ai / redes
// sociais consomem quando o R2 está ligado (bucket privado servido pelo
// backend). Sem R2, não é usada.
function storagePublicBaseUrl(): string {
  const raw = process.env["STORAGE_PUBLIC_BASE_URL"] || "https://api.appvendorai.com";
  return raw.replace(/\/+$/, "");
}

// ─────────────────────────── Handle unificado ──────────────────────────────

class ObjectFileHandle {
  private supabase: SupabaseClient | null = null;

  constructor(
    private bucketName: string,
    private objectName: string,
  ) {}

  private sb(): SupabaseClient {
    if (!this.supabase) this.supabase = getSupabaseClient();
    return this.supabase;
  }

  private splitPath(): { dir: string; base: string } {
    const idx = this.objectName.lastIndexOf("/");
    return idx === -1
      ? { dir: "", base: this.objectName }
      : { dir: this.objectName.slice(0, idx), base: this.objectName.slice(idx + 1) };
  }

  private async sbExists(): Promise<boolean> {
    if (!hasSupabaseConfigured()) return false;
    const { dir, base } = this.splitPath();
    const { data, error } = await this.sb().storage.from(this.bucketName).list(dir, { search: base });
    if (error) return false;
    return !!data?.some((f) => f.name === base);
  }

  private async sbDownload(): Promise<Buffer> {
    const { data, error } = await this.sb().storage.from(this.bucketName).download(this.objectName);
    if (error || !data) {
      throw new Error(`Falha ao baixar arquivo do Supabase Storage: ${error?.message ?? "erro desconhecido"}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  private async sbMetadata(): Promise<{ contentType?: string; size?: number }> {
    const { dir, base } = this.splitPath();
    const { data } = await this.sb().storage.from(this.bucketName).list(dir, { search: base });
    const meta = data?.find((f) => f.name === base);
    return { contentType: meta?.metadata?.["mimetype"], size: meta?.metadata?.["size"] };
  }

  async save(buffer: Buffer, opts: { contentType?: string; resumable?: boolean } = {}): Promise<void> {
    if (isR2Enabled()) {
      await R2.put(this.objectName, buffer, opts.contentType);
      return;
    }
    await ensureBucketExists(this.sb(), this.bucketName);
    const { error } = await this.sb()
      .storage.from(this.bucketName)
      .upload(this.objectName, buffer, { contentType: opts.contentType, upsert: true });
    if (error) throw error;
  }

  async exists(): Promise<[boolean]> {
    if (isR2Enabled()) {
      const head = await R2.head(this.objectName);
      if (head.exists) return [true];
      return [await this.sbExists()];
    }
    return [await this.sbExists()];
  }

  async download(): Promise<[Buffer]> {
    if (isR2Enabled()) {
      const head = await R2.head(this.objectName);
      if (head.exists) {
        const { buffer } = await R2.get(this.objectName);
        return [buffer];
      }
      return [await this.sbDownload()];
    }
    return [await this.sbDownload()];
  }

  createReadStream(): Readable {
    const stream = new Readable({ read() {} });
    this.download()
      .then(([buffer]) => {
        stream.push(buffer);
        stream.push(null);
      })
      .catch((err) => stream.destroy(err));
    return stream;
  }

  async getMetadata(): Promise<[{ contentType?: string; size?: number }]> {
    if (isR2Enabled()) {
      const head = await R2.head(this.objectName);
      if (head.exists) return [{ contentType: head.contentType, size: head.size }];
      return [await this.sbMetadata()];
    }
    return [await this.sbMetadata()];
  }

  async delete(): Promise<void> {
    if (isR2Enabled()) {
      await R2.delete(this.objectName);
      return;
    }
    const { error } = await this.sb().storage.from(this.bucketName).remove([this.objectName]);
    if (error) throw error;
  }

  /** URL pública da mídia. Com R2 ligado, aponta pro backend (rota pública que
   *  transmite os bytes do R2). Sem R2, mantém a URL pública do Supabase. */
  getPublicUrl(): string {
    if (isR2Enabled()) {
      return `${storagePublicBaseUrl()}${objectNameToPublicRoute(this.objectName)}`;
    }
    const { data } = this.sb().storage.from(this.bucketName).getPublicUrl(this.objectName);
    return data.publicUrl;
  }
}

class BucketHandle {
  constructor(private bucketName: string) {}

  file(objectName: string): ObjectFileHandle {
    return new ObjectFileHandle(this.bucketName, objectName);
  }
}

export const objectStorageClient = {
  bucket(bucketName: string): BucketHandle {
    return new BucketHandle(bucketName);
  },
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Prefixo (objectName) do PRIVATE_OBJECT_DIR, ex: ".private"
function privatePrefix(): string {
  try {
    const p = parseObjectPath(process.env["PRIVATE_OBJECT_DIR"] || "").objectName;
    return p ? (p.endsWith("/") ? p : `${p}/`) : "";
  } catch {
    return "";
  }
}

// Primeiro prefixo (objectName) de PUBLIC_OBJECT_SEARCH_PATHS, ex: "public"
function publicPrefix(): string {
  const raw = (process.env["PUBLIC_OBJECT_SEARCH_PATHS"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (raw.length === 0) return "";
  try {
    const p = parseObjectPath(raw[0]!).objectName;
    return p ? (p.endsWith("/") ? p : `${p}/`) : "";
  } catch {
    return "";
  }
}

// Dado o objectName (key), devolve o caminho da rota pública do backend que
// serve aquele objeto, ex: "/api/storage/objects/uploads/uuid" ou
// "/api/storage/public-objects/foo/bar.png".
function objectNameToPublicRoute(objectName: string): string {
  const priv = privatePrefix();
  if (priv && objectName.startsWith(priv)) {
    return `/api/storage/objects/${objectName.slice(priv.length)}`;
  }
  const pub = publicPrefix();
  if (pub && objectName.startsWith(pub)) {
    return `/api/storage/public-objects/${objectName.slice(pub.length)}`;
  }
  return `/api/storage/objects/${objectName}`;
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env["PUBLIC_OBJECT_SEARCH_PATHS"] || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error("PUBLIC_OBJECT_SEARCH_PATHS não configurado. Ex: /app-uploads/public");
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env["PRIVATE_OBJECT_DIR"] || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR não configurado. Ex: /app-uploads/private");
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<ObjectFileHandle | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async downloadObject(file: ObjectFileHandle, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `public, max-age=${cacheTtlSec}`,
    };
    headers["Content-Length"] = String(metadata.size || buffer.byteLength);

    return new Response(new Uint8Array(buffer), { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    if (isR2Enabled()) {
      return R2.presignPut(objectName, 60 * 10);
    }

    const client = getSupabaseClient();
    await ensureBucketExists(client, bucketName);
    const { data, error } = await client.storage.from(bucketName).createSignedUploadUrl(objectName);
    if (error || !data) {
      throw new Error(`Falha ao gerar URL de upload: ${error?.message ?? "erro desconhecido"}`);
    }
    return data.signedUrl;
  }

  async getObjectEntityFile(objectPath: string): Promise<ObjectFileHandle> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const objectFile = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    // 1) URL assinada de upload do Supabase:
    //    .../object/upload/sign/<bucket>/<objectName>?token=...
    const supaMarker = "/object/upload/sign/";
    const supaIdx = rawPath.indexOf(supaMarker);
    if (supaIdx !== -1) {
      const afterMarker = rawPath.slice(supaIdx + supaMarker.length).split("?")[0]!;
      const firstSlash = afterMarker.indexOf("/");
      if (firstSlash === -1) return rawPath;
      const bucketName = afterMarker.slice(0, firstSlash);
      const objectName = decodeURIComponent(afterMarker.slice(firstSlash + 1));
      const rawObjectPath = `/${bucketName}/${objectName}`;
      if (!rawObjectPath.startsWith(objectEntityDir)) return rawObjectPath;
      return `/objects/${rawObjectPath.slice(objectEntityDir.length)}`;
    }

    // 2) URL presignada do R2/S3: https://<host>/<bucket>/<key>?X-Amz-...
    if (/[.]r2[.]cloudflarestorage[.]com\//i.test(rawPath) || isR2EndpointUrl(rawPath)) {
      try {
        const u = new URL(rawPath);
        const segs = u.pathname.replace(/^\/+/, "").split("/");
        if (segs.length >= 2) {
          segs.shift(); // remove o bucket
          const objectName = decodeURIComponent(segs.join("/"));
          const privObj = parseObjectPath(objectEntityDir.replace(/\/$/, "")).objectName;
          const privPrefix = privObj.endsWith("/") ? privObj : `${privObj}/`;
          if (objectName.startsWith(privPrefix)) {
            return `/objects/${objectName.slice(privPrefix.length)}`;
          }
          return `/objects/${objectName}`;
        }
      } catch {
        /* cai no retorno padrão */
      }
    }

    return rawPath;
  }

  async savePrivateBuffer(buffer: Buffer, contentType: string, originalName: string): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
    const safeName = `${objectId}.${ext}`;
    const fullPath = `${privateDir}/quotes/${safeName}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, { contentType, resumable: false });
    return `/objects/quotes/${safeName}`;
  }

  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return true;
  }
}

function isR2EndpointUrl(rawPath: string): boolean {
  const endpoint = process.env["R2_ENDPOINT"];
  if (!endpoint) return false;
  try {
    return rawPath.includes(new URL(endpoint).host);
  } catch {
    return false;
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1]!;
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}
