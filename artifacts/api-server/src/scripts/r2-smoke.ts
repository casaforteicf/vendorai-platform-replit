/**
 * Teste de fumaça do Cloudflare R2.
 *
 * Usa as variáveis R2_* do ambiente, faz PUT → HEAD → GET → DELETE de um
 * objeto minúsculo em __smoke/ e confirma que as credenciais, o endpoint e o
 * bucket funcionam. NÃO toca em nenhum arquivo real. Sai com código 0 em
 * sucesso, 1 em falha — pra poder ser usado como gate antes do deploy.
 *
 * Rodar:  pnpm --filter @workspace/api-server exec tsx src/scripts/r2-smoke.ts
 */
import { webcrypto } from "crypto";
import { AwsClient } from "aws4fetch";

if (typeof (globalThis as any).crypto === "undefined" || !(globalThis as any).crypto?.subtle) {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}

function resolveEndpoint(): string {
  let endpoint = process.env["R2_ENDPOINT"];
  if (!endpoint) {
    const accountId = process.env["R2_ACCOUNT_ID"];
    if (!accountId) throw new Error("Faltam R2_ENDPOINT ou R2_ACCOUNT_ID");
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }
  return endpoint.replace(/\/+$/, "");
}

async function main() {
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET"];
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Faltam R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET");
  }
  const endpoint = resolveEndpoint();
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

  const key = `__smoke/test-${Date.now()}.txt`;
  const url = `${endpoint}/${bucket}/${key}`;
  const body = `r2-smoke ${new Date().toISOString()}`;

  console.log(`[r2-smoke] endpoint=${endpoint} bucket=${bucket}`);
  console.log(`[r2-smoke] PUT ${key} ...`);
  let res = await client.fetch(url, { method: "PUT", body, headers: { "Content-Type": "text/plain" } });
  if (!res.ok) throw new Error(`PUT falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);

  console.log(`[r2-smoke] HEAD ...`);
  res = await client.fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`HEAD falhou (${res.status})`);

  console.log(`[r2-smoke] GET ...`);
  res = await client.fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`GET falhou (${res.status})`);
  const got = await res.text();
  if (got !== body) throw new Error(`Conteúdo divergente: esperado "${body}", veio "${got}"`);

  console.log(`[r2-smoke] DELETE ...`);
  res = await client.fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE falhou (${res.status})`);

  console.log("[r2-smoke] OK — R2 gravando, lendo e apagando com sucesso.");
}

main().catch((err) => {
  console.error("[r2-smoke] FALHOU:", err?.message ?? err);
  process.exit(1);
});
