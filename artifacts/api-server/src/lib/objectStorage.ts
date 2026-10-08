import { randomUUID, webcrypto } from "crypto";
import { Readable } from "stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

// ─────────────────────────────────────────────────────────────────────────
// Camada de storage — migração Supabase Storage → Cloudflare R2.
//
// Histórico: antes Replit Object Storage (sidecar), depois Supabase Storage.
// Agora: Cloudflare R2 (API S3) como backend PRIMÁRIO, com FALLBACK de leitura
// no Supabase Storage durante a janela de migração (enquanto os arquivos ainda
// existem nos dois lados). A API pública (ObjectStorageService,
// objectStorageClient, ObjectNotFoundError) foi mantida EXATAMENTE igual —
// nenhum dos arquivos que já usavam isso precisou mudar.
//
// Seleção de backend (em runtime, pelas variáveis de ambiente):
//   • R2 configurado (R2_ACCOUNT_ID|R2_ENDPOINT + R2_ACCESS_KEY_ID +
//     R2_SECRET_ACCESS_KEY + R2_BUCKET):
//       - ESCRITA (upload/save)  → R2
//       - LEITURA (download/exists/metadata/signed) → R2 e, se não achar,
//         cai pro Supabase (compatibilidade com arquivos ainda não copiados).
//   • R2 NÃO configurado:
//       - tudo continua no Supabase (comportamento anterior, 100% intacto).
//   Isso deixa o código seguro pra subir ANTES mesmo do R2 estar ligado.
//
// Endereçamento: continua usando PRIVATE_OBJECT_DIR / PUBLIC_OBJECT_SEARCH_PATHS
// no formato "/<bucket>/<prefixo>". A "chave" do objeto (objectName) é a MESMA
// nos dois backends — no R2 ela vira a key dentro do R2_BUCKET; no Supabase ela
// é o objectName dentro do bucket parseado. Por isso a cópia via rclone é um
// sync direto do conteúdo do bucket Supabase para dentro do R2_BUCKET,
// preservando as keys.
//
// O bucket permanece PRIVADO nos dois casos; o acesso público é feito pelas
// rotas controladas do backend (streaming em /api/storage/*), não por URL
// pública do bucket.
// ─────────────────────────────────────────────────────────────────────────

// aws4fetch usa Web Crypto (crypto.subtle). Em alguns runtimes Node o global
// `crypto` pode não estar presente; garantimos o polyfill a partir do node:crypto.
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
// O projeto atual do Supabase aplica limite global de 50 MB. O limite por
// bucket nunca pode ser maior que o limite global, portanto manter 100 MB aqui
// fazia o próprio updateBucket falhar antes mesmo de gerar a signed upload URL.
const OBJECT_STORAGE_FILE_SIZE_LIMIT = "50MB";

async function ensureBucketExists(client: SupabaseClient, bucketName: string): Promise<void> {
  let promise = ensuredBuckets.get(bucketName);
  if (!promise) {
    promise = (async () => {
      const { data: buckets } = await client.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === bucketName);
      if (!exists) {
        const { error } = await client.storage.createBucket(bucketName, {
          public: false,
          fileSizeLimit: OBJECT_STORAGE_FILE_SIZE_LIMIT,
        });
        if (error && !/already exists/i.test(error.message)) {
          throw error;
        }
      } else {
        const { error } = await client.storage.updateBucket(bucketName, {
          public: false,
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
  endpoint: string; // ex: https://<accountid>.r2.cloudflarestorage.com
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

export function isR2Enabled(): boolean {
  return getR2() !== null;
}

/** Codifica a key preservando as barras (path style), encodando só cada segmento. */
function encodeR2Key(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function r2ObjectUrl(config: R2Config, key: string): string {
  return `${config.endpoint}/${config.bucket}/${encodeR2Key(key)}`;
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
    if (res.status === 404 || res.status === 403) return { exists: false };
    if (!res.ok) return { exists: false };
    const ct = res.headers.get("content-type") ?? undefined;
    const len = res.headers.get("content-length");
    return { exists: true, contentType: ct, size: len ? Number(len) : undefined };
  },

  async get(key: string): Promise<{ buffer: Buffer; contentType?: string; size?: number }> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const res = await r2.client.fetch(r2ObjectUrl(r2.config, key), { method: "GET" });
    if (!res.ok) {
      throw new Error(`Falha ao baixar do R2 (${res.status}): ${await safeText(res)}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? undefined;
    return { buffer, contentType: ct, size: buffer.byteLength };
  },

  async delete(key: string): Promise<void> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const res = await r2.client.fetch(r2ObjectUrl(r2.config, key), { method: "DELETE" });
    // S3/R2 retorna 204 em delete; 404 é idempotente (já não existe).
    if (!res.ok && res.status !== 404) {
      throw new Error(`Falha ao apagar do R2 (${res.status}): ${await safeText(res)}`);
    }
  },

  async presign(key: string, method: "PUT" | "GET", expiresInSec: number): Promise<string> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const ttl = Math.max(60, Math.min(7 * 24 * 60 * 60, Math.floor(expiresInSec)));
    const url = `${r2ObjectUrl(r2.config, key)}?X-Amz-Expires=${ttl}`;
    const signed = await r2.client.sign(url, {
      method,
      aws: { signQuery: true },
    });
    return signed.url;
  },
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

// ─────────────────────────── Handle unificado ──────────────────────────────

/** Handle de arquivo — mesma forma de uso de antes
 *  (save/exists/download/createReadStream/getMetadata/delete/getSignedUrl).
 *  Escreve no backend primário (R2 quando ligado) e lê do primário com
 *  fallback no Supabase durante a transição. */
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

  // ───────── Supabase low-level (usado como primário se R2 off, ou fallback) ─
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

  // ───────────────────────────── API pública ────────────────────────────────
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
      // fallback: arquivo pode ainda estar só no Supabase (não copiado)
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
      // fallback Supabase
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

  async getSignedUrl(expiresInSec: number = 300): Promise<string> {
    if (isR2Enabled()) {
      const head = await R2.head(this.objectName);
      if (head.exists) return R2.presign(this.objectName, "GET", expiresInSec);
      // fallback Supabase se ainda não copiado
    }
    const ttl = Math.max(60, Math.min(7 * 24 * 60 * 60, Math.floor(expiresInSec)));
    const { data, error } = await this.sb().storage.from(this.bucketName).createSignedUrl(this.objectName, ttl);
    if (error || !data?.signedUrl) {
      throw new Error(`Falha ao gerar URL assinada: ${error?.message ?? "erro desconhecido"}`);
    }
    return data.signedUrl;
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
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS não configurado. Ex: /app-uploads/public",
      );
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
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    } else {
      headers["Content-Length"] = String(buffer.byteLength);
    }

    return new Response(new Uint8Array(buffer), { headers });
  }

  async getObjectEntityUploadURL(tenantId?: string | null): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const tenantSegment = String(tenantId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const fullPath = tenantSegment
      ? `${privateObjectDir}/tenants/${tenantSegment}/uploads/${objectId}`
      : `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    if (isR2Enabled()) {
      return R2.presign(objectName, "PUT", 60 * 10);
    }

    const client = getSupabaseClient();
    await ensureBucketExists(client, bucketName);
    const { data, error } = await client.storage.from(bucketName).createSignedUploadUrl(objectName);
    if (error || !data) {
      throw new Error(`Falha ao gerar URL de upload: ${error?.message ?? "erro desconhecido"}`);
    }
    return data.signedUrl;
  }

  async getObjectEntitySignedUrl(objectPath: string, expiresInSec: number = 300): Promise<string> {
    const file = await this.getObjectEntityFile(objectPath);
    return file.getSignedUrl(expiresInSec);
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
    // Caminho da key privada (o prefixo dentro do bucket), ex: ".private".
    let privateObjectName = "";
    try {
      privateObjectName = parseObjectPath(this.getPrivateObjectDir()).objectName;
    } catch {
      privateObjectName = "";
    }
    const privatePrefix = privateObjectName
      ? privateObjectName.endsWith("/")
        ? privateObjectName
        : `${privateObjectName}/`
      : "";

    // 1) URL de upload assinada do Supabase:
    //    .../object/upload/sign/<bucket>/<objectName>?token=...
    const supaMarker = "/object/upload/sign/";
    const supaIdx = rawPath.indexOf(supaMarker);
    if (supaIdx !== -1) {
      const afterMarker = rawPath.slice(supaIdx + supaMarker.length).split("?")[0]!;
      const firstSlash = afterMarker.indexOf("/");
      if (firstSlash === -1) return rawPath;
      const objectName = decodeURIComponent(afterMarker.slice(firstSlash + 1));
      return this.objectNameToEntityPath(objectName, privatePrefix, rawPath);
    }

    // 2) URL presignada do R2/S3:
    //    https://<host>/<bucket>/<key>?X-Amz-...
    if (/[.]r2[.]cloudflarestorage[.]com\//i.test(rawPath) || isR2Like(rawPath)) {
      try {
        const u = new URL(rawPath);
        // pathname = /<bucket>/<key...>
        const segs = u.pathname.replace(/^\/+/, "").split("/");
        if (segs.length >= 2) {
          segs.shift(); // remove o bucket
          const objectName = decodeURIComponent(segs.join("/"));
          return this.objectNameToEntityPath(objectName, privatePrefix, rawPath);
        }
      } catch {
        /* cai no retorno padrão */
      }
    }

    return rawPath;
  }

  /** Dado o objectName (key) e o prefixo privado, devolve "/objects/<entityId>". */
  private objectNameToEntityPath(objectName: string, privatePrefix: string, fallback: string): string {
    if (privatePrefix && objectName.startsWith(privatePrefix)) {
      return `/objects/${objectName.slice(privatePrefix.length)}`;
    }
    // Sem prefixo reconhecível: tenta a partir de "/objects/" se já vier assim
    if (fallback.startsWith("/objects/")) return fallback;
    return `/objects/${objectName}`;
  }

  async saveMediaBuffer(buffer: Buffer, contentType: string, originalName: string): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
    const safeName = `${objectId}.${ext}`;
    const fullPath = `${privateDir}/media/${safeName}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, { contentType, resumable: false });
    return `/objects/media/${safeName}`;
  }

  async savePrivateBuffer(
    buffer: Buffer,
    contentType: string,
    originalName: string,
    tenantId?: string | null,
  ): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
    const safeName = `${objectId}.${ext}`;
    const tenantSegment = String(tenantId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const relativePath = tenantSegment
      ? `tenants/${tenantSegment}/generated/${safeName}`
      : `quotes/${safeName}`;
    const fullPath = `${privateDir}/${relativePath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, { contentType, resumable: false });
    return `/objects/${relativePath}`;
  }

  // ACL por objeto não é usado; a fronteira público/privado é aplicada pelas
  // rotas do backend e URLs assinadas sobre um bucket privado.
  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return true;
  }
}

function isR2Like(rawPath: string): boolean {
  const endpoint = process.env["R2_ENDPOINT"];
  if (!endpoint) return false;
  try {
    const host = new URL(endpoint).host;
    return rawPath.includes(host);
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
