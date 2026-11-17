import { randomUUID, webcrypto } from "crypto";
import { Readable } from "stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

// ─────────────────────────────────────────────────────────────────────────
// Camada de storage — Cloudflare R2 (primário) com Supabase Storage de
// fallback de leitura. A API pública desta classe (ObjectStorageService,
// objectStorageClient, ObjectNotFoundError e todos os métodos, incluindo
// getObjectEntitySignedUrl / getObjectEntityUploadURL / savePrivateBuffer)
// foi mantida EXATAMENTE igual — nenhum dos arquivos que já usavam storage
// precisa mudar. A segmentação por tenant das pastas (uploads/generated) e a
// proteção das rotas de serving continuam intactas.
//
// Backend selecionado em runtime pelas variáveis de ambiente:
//   • R2 configurado (R2_ACCOUNT_ID|R2_ENDPOINT + R2_ACCESS_KEY_ID +
//     R2_SECRET_ACCESS_KEY + R2_BUCKET):
//       - ESCRITA (upload/save/delete) → R2
//       - LEITURA (download/exists/metadata) → R2 e, se não achar, cai no
//         Supabase (compatível com arquivos ainda não copiados).
//       - getObjectEntitySignedUrl → URL PRESIGNADA do R2 (token na query,
//         com TTL, sem sessão). Mesma semântica da signed URL do Supabase:
//         pública e temporária. Praça.ai / redes sociais continuam baixando.
//   • R2 NÃO configurado → comportamento 100% Supabase (idêntico ao de antes).
//
// Endereçamento: PRIVATE_OBJECT_DIR / PUBLIC_OBJECT_SEARCH_PATHS continuam no
// formato "/<bucket>/<prefixo>". A "chave" (objectName) é a MESMA nos dois
// backends — no R2 ela vira a key dentro do R2_BUCKET.
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
// O projeto atual do Supabase aplica limite global de 50 MB. O limite por
// bucket nunca pode ser maior que o limite global.
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

// ─────────────────────── Configuração / diagnóstico ───────────────────────

export type StorageBackend = "r2" | "supabase" | "unconfigured" | "misconfigured";

export interface SupabaseKeyInspection {
  configured: boolean;
  valid: boolean;
  format: "jwt" | "sb_secret" | "unknown" | "missing";
  issue: string | null;
}

export interface StorageConfigurationStatus {
  backend: StorageBackend;
  r2Configured: boolean;
  r2Bucket: string | null;
  r2EndpointHost: string | null;
  supabase: SupabaseKeyInspection & { url: string | null };
  privateObjectDir: string | null;
  publicSearchPaths: string[];
  errors: string[];
}

/**
 * Valida o formato da service role key do Supabase SEM chamar a rede.
 *
 * O incidente de 17/11/2026 foi causado por uma chave truncada no deploy (93
 * caracteres, apenas 2 segmentos JWT). O erro só aparecia no upload, como um
 * `StorageApiError: Invalid Compact JWS` cru — 500 opaco para o usuário. Esta
 * checagem transforma o problema em erro de configuração explícito.
 */
export function inspectSupabaseServiceRoleKey(
  rawKey: string | undefined | null,
): SupabaseKeyInspection {
  const original = String(rawKey ?? "");
  const key = original.trim();
  if (!key) {
    return { configured: false, valid: false, format: "missing", issue: "SUPABASE_SERVICE_ROLE_KEY não definida" };
  }
  if (/\s/.test(key)) {
    return {
      configured: true,
      valid: false,
      format: "unknown",
      issue: "SUPABASE_SERVICE_ROLE_KEY contém espaços/quebras de linha",
    };
  }
  if (key.startsWith("sb_secret_")) {
    return {
      configured: true,
      valid: key.length >= 20,
      format: "sb_secret",
      issue: key.length < 20 ? "chave sb_secret_ curta demais" : null,
    };
  }
  const parts = key.split(".");
  if (parts.length !== 3) {
    return {
      configured: true,
      valid: false,
      format: "unknown",
      issue: `JWT inválido: esperados 3 segmentos, recebidos ${parts.length} segmentos (chave truncada?)`,
    };
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      role?: string;
      ref?: string;
    };
    if (payload.role && payload.role !== "service_role") {
      return {
        configured: true,
        valid: false,
        format: "jwt",
        issue: `chave não é service_role (role=${payload.role})`,
      };
    }
    return { configured: true, valid: true, format: "jwt", issue: null };
  } catch {
    return { configured: true, valid: false, format: "jwt", issue: "payload do JWT não é JSON válido" };
  }
}

/**
 * Inspeciona a configuração de storage sem expor segredos. Usado no boot, no
 * endpoint /api/storage/health e nos testes. Uma configuração R2 PARCIAL é
 * tratada como erro (não como "R2 desligado"): cair silenciosamente no
 * Supabase foi exatamente o que escondeu os assets quebrados em produção.
 */
export function inspectStorageConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfigurationStatus {
  const accessKeyId = String(env["R2_ACCESS_KEY_ID"] ?? "").trim();
  const secretAccessKey = String(env["R2_SECRET_ACCESS_KEY"] ?? "").trim();
  const bucket = String(env["R2_BUCKET"] ?? "").trim();
  const endpointEnv = String(env["R2_ENDPOINT"] ?? "").trim();
  const accountId = String(env["R2_ACCOUNT_ID"] ?? "").trim();

  const r2Missing: string[] = [];
  if (!accessKeyId) r2Missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) r2Missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) r2Missing.push("R2_BUCKET");
  if (!endpointEnv && !accountId) r2Missing.push("R2_ACCOUNT_ID|R2_ENDPOINT");

  const r2Provided = Boolean(accessKeyId || secretAccessKey || bucket || endpointEnv || accountId);
  const r2Configured = r2Provided && r2Missing.length === 0;

  let r2EndpointHost: string | null = null;
  const endpoint = endpointEnv || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (endpoint) {
    try {
      r2EndpointHost = new URL(endpoint).host;
    } catch {
      r2EndpointHost = null;
    }
  }

  const supabaseUrl = String(env["SUPABASE_URL"] ?? "").trim() || null;
  const supabaseKey = inspectSupabaseServiceRoleKey(env["SUPABASE_SERVICE_ROLE_KEY"]);
  const privateObjectDir = String(env["PRIVATE_OBJECT_DIR"] ?? "").trim() || null;
  const publicSearchPaths = Array.from(
    new Set(
      String(env["PUBLIC_OBJECT_SEARCH_PATHS"] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  );

  const errors: string[] = [];
  if (r2Provided && !r2Configured) {
    errors.push(`Configuração R2 incompleta: faltam ${r2Missing.join(", ")}`);
  }
  if (r2Provided && !r2EndpointHost) {
    errors.push("R2_ACCOUNT_ID/R2_ENDPOINT inválido (não foi possível montar a URL do endpoint)");
  }

  let backend: StorageBackend;
  if (r2Configured) {
    backend = "r2";
  } else if (r2Provided) {
    backend = "misconfigured";
  } else if (supabaseKey.valid) {
    backend = "supabase";
  } else if (supabaseKey.configured || supabaseUrl) {
    backend = "misconfigured";
    if (supabaseKey.issue) errors.push(supabaseKey.issue);
  } else {
    backend = "unconfigured";
    errors.push(
      "Nenhum backend de storage configurado: defina R2_* (recomendado) ou SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (!privateObjectDir) {
    errors.push("PRIVATE_OBJECT_DIR não configurado");
  } else if (privateObjectDir.split("/").filter(Boolean).length < 2) {
    errors.push("PRIVATE_OBJECT_DIR deve seguir o formato /<bucket>/<prefixo> (ex: /vendorai-uploads/.private)");
  }

  return {
    backend,
    r2Configured,
    r2Bucket: bucket || null,
    r2EndpointHost,
    supabase: { ...supabaseKey, url: supabaseUrl },
    privateObjectDir,
    publicSearchPaths,
    errors,
  };
}

/** Erro de configuração — a rota deve responder 503 (não 500) e com detalhe
 *  acionável para o operador. */
export class StorageConfigurationError extends Error {
  readonly code = "storage_misconfigured";
  constructor(readonly issues: string[]) {
    super(`Storage mal configurado: ${issues.join("; ")}`);
    this.name = "StorageConfigurationError";
  }
}

/** Garante que há backend utilizável ANTES de gerar uma URL de upload. */
export function assertStorageReadyForUpload(env: NodeJS.ProcessEnv = process.env): StorageConfigurationStatus {
  const status = inspectStorageConfiguration(env);
  if (status.backend !== "r2" && status.backend !== "supabase") {
    throw new StorageConfigurationError(status.errors);
  }
  if (status.errors.length > 0) {
    throw new StorageConfigurationError(status.errors);
  }
  return status;
}

/** Resumo seguro para log de boot (sem chaves). */
export function describeStorageConfiguration(status = inspectStorageConfiguration()): string {
  const target =
    status.backend === "r2"
      ? `${status.r2EndpointHost ?? "?"}/${status.r2Bucket ?? "?"}`
      : status.backend === "supabase"
        ? `${status.supabase.url ?? "?"} (fallback)`
        : "nenhum";
  return `storage=${status.backend} target=${target} privateDir=${status.privateObjectDir ?? "?"}`;
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

  /** Verifica credenciais e conectividade com uma listagem mínima do bucket.
   *  Não baixa nem grava nada. */
  async probe(): Promise<void> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const res = await r2.client.fetch(
      `${r2.config.endpoint}/${r2.config.bucket}?list-type=2&max-keys=1`,
      { method: "GET" },
    );
    if (!res.ok) {
      throw new Error(`R2 respondeu ${res.status}: ${await safeText(res)}`);
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

  async presignGet(key: string, expiresInSec: number): Promise<string> {
    const r2 = getR2();
    if (!r2) throw new Error("R2 não está configurado.");
    const ttl = Math.max(60, Math.min(7 * 24 * 60 * 60, Math.floor(expiresInSec)));
    const url = `${r2ObjectUrl(r2.config, key)}?X-Amz-Expires=${ttl}`;
    const signed = await r2.client.sign(url, { method: "GET", aws: { signQuery: true } });
    return signed.url;
  },
};

function isR2EndpointUrl(rawPath: string): boolean {
  const r2 = getR2();
  if (r2) {
    try {
      if (rawPath.includes(new URL(r2.config.endpoint).host)) return true;
    } catch {
      /* ignore */
    }
  }
  const endpoint = process.env["R2_ENDPOINT"];
  if (!endpoint) return false;
  try {
    return rawPath.includes(new URL(endpoint).host);
  } catch {
    return false;
  }
}

/** Handle de arquivo — mesma forma de uso de antes (save/exists/download/
 *  createReadStream/getMetadata/getSignedUrl). R2 primário quando ligado,
 *  com fallback de leitura no Supabase. O Supabase client é criado sob
 *  demanda (lazy), então o modo R2 não exige Supabase pra escrever. */
class SupabaseFileHandle {
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

  /** URL temporária e pública pra baixar o arquivo. Com R2 ligado, devolve uma
   *  URL PRESIGNADA do R2 (token na query, TTL) — mesma semântica da signed URL
   *  do Supabase. Sem R2, usa createSignedUrl do Supabase. */
  async getSignedUrl(expiresInSec: number = 300): Promise<string> {
    const ttl = Math.max(60, Math.min(7 * 24 * 60 * 60, Math.floor(expiresInSec)));
    if (isR2Enabled()) {
      // Se por acaso o objeto só existir no Supabase (ainda não copiado), cai
      // na signed URL do Supabase; senão, presign do R2.
      const head = await R2.head(this.objectName);
      if (!head.exists && (await this.sbExists())) {
        const { data, error } = await this.sb().storage.from(this.bucketName).createSignedUrl(this.objectName, ttl);
        if (!error && data?.signedUrl) return data.signedUrl;
      }
      return R2.presignGet(this.objectName, ttl);
    }
    const { data, error } = await this.sb().storage.from(this.bucketName).createSignedUrl(this.objectName, ttl);
    if (error || !data?.signedUrl) {
      throw new Error(`Falha ao gerar URL assinada: ${error?.message ?? "erro desconhecido"}`);
    }
    return data.signedUrl;
  }
}

class SupabaseBucketHandle {
  constructor(private bucketName: string) {}

  file(objectName: string): SupabaseFileHandle {
    return new SupabaseFileHandle(this.bucketName, objectName);
  }
}

export const objectStorageClient = {
  bucket(bucketName: string): SupabaseBucketHandle {
    return new SupabaseBucketHandle(bucketName);
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
    headers["Content-Length"] = String(metadata.size || buffer.byteLength);

    return new Response(new Uint8Array(buffer), { headers });
  }

  /** Checagem ativa de conectividade/credenciais para o endpoint de saúde. */
  async checkStorageConnectivity(): Promise<{
    ok: boolean;
    backend: StorageBackend;
    latencyMs: number;
    error: string | null;
  }> {
    const status = inspectStorageConfiguration();
    const startedAt = Date.now();
    try {
      if (status.backend === "r2") {
        await R2.probe();
      } else if (status.backend === "supabase") {
        const { error } = await getSupabaseClient().storage.listBuckets();
        if (error) throw new Error(error.message);
      } else {
        throw new StorageConfigurationError(status.errors);
      }
      return { ok: true, backend: status.backend, latencyMs: Date.now() - startedAt, error: null };
    } catch (error) {
      return {
        ok: false,
        backend: status.backend,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getObjectEntityUploadURL(tenantId?: string | null): Promise<string> {
    // Falha ANTES de chamar o provedor: configuração incompleta vira 503 com
    // causa explícita, não um 500 genérico depois de um erro cru do SDK.
    assertStorageReadyForUpload();
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const tenantSegment = String(tenantId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const fullPath = tenantSegment
      ? `${privateObjectDir}/tenants/${tenantSegment}/uploads/${objectId}`
      : `${privateObjectDir}/uploads/${objectId}`;
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

  /** Deletes only a tenant-scoped private object previously produced by savePrivateBuffer. */
  async deleteTenantPrivateBuffer(rawPath: string, tenantId: string): Promise<void> {
    const safeTenant = String(tenantId).trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const expectedPrefix = `/objects/tenants/${safeTenant}/generated/`;
    if (!safeTenant || !rawPath.startsWith(expectedPrefix) || rawPath.slice(expectedPrefix.length).includes("/") || rawPath.length <= expectedPrefix.length)
      throw new Error("Invalid tenant-private object path");
    const fullPath = `${this.getPrivateObjectDir()}/${rawPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).delete();
  }

  // ACL por objeto não é usado; a fronteira público/privado é aplicada pelas
  // rotas do backend e por URLs presignadas/assinadas temporárias.
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
