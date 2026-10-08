/**
 * Copia TODOS os arquivos do bucket Supabase Storage para o Cloudflare R2,
 * preservando as chaves (keys). Idempotente: pula o que já existe no R2 com o
 * mesmo tamanho. Lê do Supabase com a service role (não precisa de chave S3 do
 * Supabase) e grava no R2 via API S3 (aws4fetch).
 *
 * Variáveis usadas:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (leitura)
 *   R2_ACCOUNT_ID|R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (escrita)
 *   SUPABASE_STORAGE_BUCKET   (opcional; se ausente, deriva de PRIVATE_OBJECT_DIR)
 *   MIGRATE_DRY_RUN=1         (opcional; só lista, não grava)
 *   MIGRATE_LIMIT=N           (opcional; para teste, copia no máximo N arquivos)
 *   MIGRATE_CONCURRENCY=N     (opcional; padrão 4)
 *
 * Rodar: pnpm --filter @workspace/api-server exec tsx src/scripts/migrate-storage-to-r2.ts
 */
import { webcrypto } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

if (typeof (globalThis as any).crypto === "undefined" || !(globalThis as any).crypto?.subtle) {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}

const DRY_RUN = process.env["MIGRATE_DRY_RUN"] === "1";
const LIMIT = Number(process.env["MIGRATE_LIMIT"] || "0") || 0;
const CONCURRENCY = Math.max(1, Number(process.env["MIGRATE_CONCURRENCY"] || "4") || 4);

function resolveBucket(): string {
  const explicit = process.env["SUPABASE_STORAGE_BUCKET"];
  if (explicit) return explicit;
  const priv = process.env["PRIVATE_OBJECT_DIR"] || "";
  const seg = priv.replace(/^\/+/, "").split("/")[0];
  if (!seg) throw new Error("Não consegui determinar o bucket (defina SUPABASE_STORAGE_BUCKET)");
  return seg;
}

function resolveR2() {
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];
  if (!accessKeyId || !secretAccessKey || !bucket) throw new Error("Faltam variáveis R2_*");
  let endpoint = process.env["R2_ENDPOINT"];
  if (!endpoint) {
    const acc = process.env["R2_ACCOUNT_ID"];
    if (!acc) throw new Error("Faltam R2_ENDPOINT ou R2_ACCOUNT_ID");
    endpoint = `https://${acc}.r2.cloudflarestorage.com`;
  }
  endpoint = endpoint.replace(/\/+$/, "");
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return { client, endpoint, bucket };
}

function encodeKey(key: string): string {
  return key.split("/").map((s) => encodeURIComponent(s)).join("/");
}

interface SupaEntry {
  name: string;
  id: string | null;
  metadata: { size?: number; mimetype?: string } | null;
}

async function listAllKeys(sb: SupabaseClient, bucket: string): Promise<Array<{ key: string; size: number; mime?: string }>> {
  const out: Array<{ key: string; size: number; mime?: string }> = [];
  const queue: string[] = [""]; // prefixos a visitar (raiz)
  while (queue.length) {
    const prefix = queue.shift()!;
    let offset = 0;
    const pageSize = 1000;
    for (;;) {
      const { data, error } = await sb.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Erro listando "${prefix}": ${error.message}`);
      const entries = (data ?? []) as unknown as SupaEntry[];
      if (entries.length === 0) break;
      for (const e of entries) {
        const full = prefix ? `${prefix}/${e.name}` : e.name;
        const isFolder = e.id === null && (e.metadata === null || e.metadata === undefined);
        if (isFolder) {
          queue.push(full);
        } else {
          out.push({ key: full, size: e.metadata?.size ?? 0, mime: e.metadata?.mimetype });
        }
      }
      if (entries.length < pageSize) break;
      offset += pageSize;
    }
  }
  return out;
}

async function r2Head(r2: ReturnType<typeof resolveR2>, key: string): Promise<{ exists: boolean; size?: number }> {
  const res = await r2.client.fetch(`${r2.endpoint}/${r2.bucket}/${encodeKey(key)}`, { method: "HEAD" });
  if (!res.ok) return { exists: false };
  const len = res.headers.get("content-length");
  return { exists: true, size: len ? Number(len) : undefined };
}

async function main() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceKey) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const bucket = resolveBucket();
  const r2 = resolveR2();

  console.log(`[migrate] bucket Supabase="${bucket}" -> R2 bucket="${r2.bucket}" (dry_run=${DRY_RUN}, limit=${LIMIT || "∞"}, conc=${CONCURRENCY})`);
  console.log("[migrate] listando arquivos no Supabase...");
  let files = await listAllKeys(sb, bucket);
  console.log(`[migrate] ${files.length} arquivos encontrados.`);
  if (LIMIT > 0) files = files.slice(0, LIMIT);

  let copied = 0, skipped = 0, failed = 0, done = 0;
  const total = files.length;

  async function worker(slice: typeof files) {
    for (const f of slice) {
      done++;
      try {
        const head = await r2Head(r2, f.key);
        if (head.exists && (f.size === 0 || head.size === f.size)) {
          skipped++;
        } else if (DRY_RUN) {
          copied++; // contabiliza como "copiaria"
        } else {
          const { data, error } = await sb.storage.from(bucket).download(f.key);
          if (error || !data) throw new Error(`download: ${error?.message ?? "sem dados"}`);
          const buf = Buffer.from(await data.arrayBuffer());
          const headers: Record<string, string> = {};
          if (f.mime) headers["Content-Type"] = f.mime;
          const put = await r2.client.fetch(`${r2.endpoint}/${r2.bucket}/${encodeKey(f.key)}`, {
            method: "PUT",
            body: new Uint8Array(buf),
            headers,
          });
          if (!put.ok) throw new Error(`PUT R2 (${put.status}): ${(await put.text()).slice(0, 150)}`);
          copied++;
        }
      } catch (err: any) {
        failed++;
        console.error(`[migrate] ERRO "${f.key}": ${err?.message ?? err}`);
      }
      if (done % 50 === 0 || done === total) {
        console.log(`[migrate] progresso ${done}/${total} (copiados=${copied} pulados=${skipped} erros=${failed})`);
      }
    }
  }

  // divide em CONCURRENCY fatias
  const slices: (typeof files)[] = Array.from({ length: CONCURRENCY }, () => []);
  files.forEach((f, i) => slices[i % CONCURRENCY]!.push(f));
  await Promise.all(slices.map((s) => worker(s)));

  console.log(`[migrate] FIM — total=${total} copiados=${copied} pulados=${skipped} erros=${failed}`);
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[migrate] FALHOU:", err?.message ?? err);
  process.exit(1);
});
