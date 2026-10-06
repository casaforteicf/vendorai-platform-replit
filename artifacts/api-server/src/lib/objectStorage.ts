import { randomUUID } from "crypto";
import { Readable } from "stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────
// Backend trocado de Replit Object Storage (sidecar http://127.0.0.1:1106,
// que só existe dentro do ambiente Replit) pro Supabase Storage — mesmo
// projeto Supabase já usado pelo banco de dados, funciona normalmente no
// Railway. A API pública desta classe (ObjectStorageService,
// objectStorageClient, ObjectNotFoundError) foi mantida EXATAMENTE igual —
// nenhum dos ~11 arquivos que já usavam isso precisou mudar.
//
// Endereçamento: continua usando PRIVATE_OBJECT_DIR / PUBLIC_OBJECT_SEARCH_PATHS
// no formato "/<bucket>/<prefixo>" (ex: /app-uploads/private). O primeiro
// segmento agora é o nome real do bucket no Supabase Storage (criado
// automaticamente na primeira vez que for usado).
// ─────────────────────────────────────────────────────────────────────────

function getSupabaseClient(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados " +
        "(Railway → Variables) para upload/download de arquivos funcionar.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
          public: true,
          fileSizeLimit: OBJECT_STORAGE_FILE_SIZE_LIMIT,
        });
        if (error && !/already exists/i.test(error.message)) {
          throw error;
        }
      } else {
        // O bucket já pode ter sido criado com outro limite. Mantemos o limite
        // por bucket compatível com o limite global para que a preparação do
        // upload nunca falhe antes de gerar a URL assinada.
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

/** Handle de arquivo — mesma forma de uso que um File do @google-cloud/storage
 *  (save/exists/download/createReadStream/getMetadata), backed by Supabase. */
class SupabaseFileHandle {
  constructor(
    private client: SupabaseClient,
    private bucketName: string,
    private objectName: string,
  ) {}

  private splitPath(): { dir: string; base: string } {
    const idx = this.objectName.lastIndexOf("/");
    return idx === -1
      ? { dir: "", base: this.objectName }
      : { dir: this.objectName.slice(0, idx), base: this.objectName.slice(idx + 1) };
  }

  async save(buffer: Buffer, opts: { contentType?: string; resumable?: boolean } = {}): Promise<void> {
    await ensureBucketExists(this.client, this.bucketName);
    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(this.objectName, buffer, { contentType: opts.contentType, upsert: true });
    if (error) throw error;
  }

  async exists(): Promise<[boolean]> {
    const { dir, base } = this.splitPath();
    const { data, error } = await this.client.storage.from(this.bucketName).list(dir, { search: base });
    if (error) return [false];
    return [!!data?.some((f) => f.name === base)];
  }

  async download(): Promise<[Buffer]> {
    const { data, error } = await this.client.storage.from(this.bucketName).download(this.objectName);
    if (error || !data) {
      throw new Error(`Falha ao baixar arquivo do Supabase Storage: ${error?.message ?? "erro desconhecido"}`);
    }
    return [Buffer.from(await data.arrayBuffer())];
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
    const { dir, base } = this.splitPath();
    const { data } = await this.client.storage.from(this.bucketName).list(dir, { search: base });
    const meta = data?.find((f) => f.name === base);
    return [{ contentType: meta?.metadata?.["mimetype"], size: meta?.metadata?.["size"] }];
  }

  async delete(): Promise<void> {
    const { error } = await this.client.storage.from(this.bucketName).remove([this.objectName]);
    if (error) throw error;
  }

  getPublicUrl(): string {
    const { data } = this.client.storage.from(this.bucketName).getPublicUrl(this.objectName);
    return data.publicUrl;
  }

  async getSignedUrl(expiresInSec: number = 300): Promise<string> {
    const ttl = Math.max(60, Math.min(3600, Math.floor(expiresInSec)));
    const { data, error } = await this.client.storage.from(this.bucketName).createSignedUrl(this.objectName, ttl);
    if (error || !data?.signedUrl) {
      throw new Error(`Falha ao gerar URL assinada: ${error?.message ?? "erro desconhecido"}`);
    }
    return data.signedUrl;
  }
}

class SupabaseBucketHandle {
  constructor(
    private client: SupabaseClient,
    private bucketName: string,
  ) {}

  file(objectName: string): SupabaseFileHandle {
    return new SupabaseFileHandle(this.client, this.bucketName, objectName);
  }
}

export const objectStorageClient = {
  bucket(bucketName: string): SupabaseBucketHandle {
    return new SupabaseBucketHandle(getSupabaseClient(), bucketName);
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
        "PUBLIC_OBJECT_SEARCH_PATHS não configurado. Defina no Railway, ex: /app-uploads/public",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env["PRIVATE_OBJECT_DIR"] || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR não configurado. Defina no Railway, ex: /app-uploads/private");
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<SupabaseFileHandle | null> {
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

  async downloadObject(file: SupabaseFileHandle, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `public, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(new Uint8Array(buffer), { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

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

  async getObjectEntityFile(objectPath: string): Promise<SupabaseFileHandle> {
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
    // Extrai bucketName + objectName da signed upload URL do Supabase, no
    // formato .../object/upload/sign/<bucket>/<objectName>?token=...
    const marker = "/object/upload/sign/";
    const idx = rawPath.indexOf(marker);
    if (idx === -1) return rawPath;

    const afterMarker = rawPath.slice(idx + marker.length).split("?")[0]!;
    const firstSlash = afterMarker.indexOf("/");
    if (firstSlash === -1) return rawPath;
    const bucketName = afterMarker.slice(0, firstSlash);
    const objectName = decodeURIComponent(afterMarker.slice(firstSlash + 1));
    const rawObjectPath = `/${bucketName}/${objectName}`;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
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

  // ACL não é usado por nenhum caller hoje (bucket é público); mantido como
  // no-op só pra não quebrar import caso algo volte a chamar isso.
  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return true;
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