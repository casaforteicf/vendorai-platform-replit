/**
 * Apaga do Supabase Storage os arquivos de um prefixo (padrão ".private") —
 * mas SOMENTE depois de confirmar, arquivo por arquivo, que ele existe no R2.
 * Se algum não estiver no R2, NÃO apaga (protege). Idempotente e seguro.
 *
 * Segurança:
 *   - Por padrão roda em DRY-RUN (não apaga nada; só verifica e conta).
 *   - Só apaga de verdade com DELETE_CONFIRM=YES_DELETE.
 *
 * Variáveis:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID|R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   SUPABASE_STORAGE_BUCKET (opcional; senão deriva de PRIVATE_OBJECT_DIR)
 *   DELETE_PREFIX (padrão ".private")
 *   DELETE_CONFIRM=YES_DELETE  (obrigatório pra apagar de verdade)
 *   DELETE_CONCURRENCY (padrão 5)
 *
 * Rodar: pnpm --filter @workspace/api-server exec tsx src/scripts/delete-supabase-after-r2.ts
 */
import { webcrypto } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

if (typeof (globalThis as any).crypto === "undefined" || !(globalThis as any).crypto?.subtle) {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}

const PREFIX = process.env["DELETE_PREFIX"] ?? ".private";
const CONFIRM = process.env["DELETE_CONFIRM"] === "YES_DELETE";
const CONCURRENCY = Math.max(1, Number(process.env["DELETE_CONCURRENCY"] || "5") || 5);

function resolveBucket(): string {
  const explicit = process.env["SUPABASE_STORAGE_BUCKET"];
  if (explicit) return explicit;
  const priv = process.env["PRIVATE_OBJECT_DIR"] || "";
  const seg = priv.replace(/^\/+/, "").split("/")[0];
  if (!seg) throw new Error("Defina SUPABASE_STORAGE_BUCKET");
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

interface SupaEntry { name: string; id: string | null; metadata: { size?: number } | null; }

async function listKeys(sb: SupabaseClient, bucket: string, root: string): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [root];
  while (queue.length) {
    const prefix = queue.shift()!;
    let offset = 0;
    const pageSize = 1000;
    for (;;) {
      const { data, error } = await sb.storage.from(bucket).list(prefix, {
        limit: pageSize, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Erro listando "${prefix}": ${error.message}`);
      const entries = (data ?? []) as unknown as SupaEntry[];
      if (entries.length === 0) break;
      for (const e of entries) {
        const full = prefix ? `${prefix}/${e.name}` : e.name;
        const isFolder = e.id === null && (e.metadata === null || e.metadata === undefined);
        if (isFolder) queue.push(full);
        else out.push(full);
      }
      if (entries.length < pageSize) break;
      offset += pageSize;
    }
  }
  return out;
}

async function r2Exists(r2: ReturnType<typeof resolveR2>, key: string): Promise<boolean> {
  const res = await r2.client.fetch(`${r2.endpoint}/${r2.bucket}/${encodeKey(key)}`, { method: "HEAD" });
  return res.ok;
}

async function main() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceKey) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const bucket = resolveBucket();
  const r2 = resolveR2();

  console.log(`[delete] bucket="${bucket}" prefixo="${PREFIX}" modo=${CONFIRM ? "APAGAR_DE_VERDADE" : "DRY_RUN (nao apaga)"} conc=${CONCURRENCY}`);
  console.log(`[delete] listando "${PREFIX}" no Supabase...`);
  const keys = await listKeys(sb, bucket, PREFIX);
  console.log(`[delete] ${keys.length} arquivos no prefixo.`);

  let noR2 = 0, protegidos = 0, apagados = 0, erros = 0, done = 0;
  const total = keys.length;
  const toDelete: string[] = [];

  async function worker(slice: string[]) {
    for (const key of slice) {
      done++;
      try {
        const existsR2 = await r2Exists(r2, key);
        if (existsR2) {
          noR2++; // confirmados no R2
          if (CONFIRM) toDelete.push(key);
        } else {
          protegidos++;
          console.error(`[delete] PROTEGIDO (nao esta no R2, nao sera apagado): ${key}`);
        }
      } catch (err: any) {
        erros++;
        console.error(`[delete] ERRO verificando "${key}": ${err?.message ?? err}`);
      }
      if (done % 100 === 0 || done === total) {
        console.log(`[delete] verificados ${done}/${total} (no_R2=${noR2} protegidos=${protegidos} erros=${erros})`);
      }
    }
  }
  const slices: string[][] = Array.from({ length: CONCURRENCY }, () => []);
  keys.forEach((k, i) => slices[i % CONCURRENCY]!.push(k));
  await Promise.all(slices.map((s) => worker(s)));

  if (!CONFIRM) {
    console.log(`[delete] DRY-RUN FIM — candidatos=${total} confirmados_no_R2=${noR2} protegidos_sem_R2=${protegidos} erros=${erros}`);
    console.log(`[delete] (nada foi apagado). Para apagar de verdade, rode com DELETE_CONFIRM=YES_DELETE`);
    if (protegidos > 0 || erros > 0) process.exit(2);
    return;
  }

  console.log(`[delete] apagando ${toDelete.length} arquivos do Supabase (em lotes)...`);
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error } = await sb.storage.from(bucket).remove(batch);
    if (error) { erros += batch.length; console.error(`[delete] ERRO apagando lote: ${error.message}`); }
    else { apagados += batch.length; }
    console.log(`[delete] apagados ${apagados}/${toDelete.length}`);
  }
  console.log(`[delete] FIM — confirmados_no_R2=${noR2} apagados=${apagados} protegidos_sem_R2=${protegidos} erros=${erros}`);
  if (protegidos > 0 || erros > 0) process.exit(2);
}

main().catch((err) => { console.error("[delete] FALHOU:", err?.message ?? err); process.exit(1); });
