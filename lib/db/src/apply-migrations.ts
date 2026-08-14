/**
 * Motor compartilhado de migrations versionadas — usado tanto pelo CLI
 * (`pnpm --filter @workspace/db run migrate`, ver migrate.ts) quanto pela
 * API em boot (ver artifacts/api-server/src/index.ts), pra garantir que só
 * existe UM lugar que lê e aplica o SQL dos arquivos em lib/db/migrations.
 *
 * Antes disso, a API tinha uma cópia própria do DDL de algumas migrations
 * "críticas" direto no seu index.ts, como rede de segurança pro caso do
 * deploy subir antes do `migrate` rodar. Isso gerava risco de drift (o
 * arquivo de migration e a cópia na API podiam divergir com o tempo).
 * Agora a API aplica as migrations pendentes usando exatamente o mesmo
 * motor e os mesmos arquivos .sql do CLI — sem duplicar SQL em lugar nenhum.
 *
 * Control table : vendorai_schema_migrations
 * Advisory lock : pg_advisory_lock(7767366262)  — evita corrida entre
 *                 réplicas/deploys concorrentes aplicando ao mesmo tempo
 */
import type pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

export const ADVISORY_LOCK_KEY = "7767366262";
export const CONTROL_TABLE = "vendorai_schema_migrations";

/**
 * Resolve a pasta lib/db/migrations de forma resiliente.
 *
 * Não dá pra confiar só em `import.meta.url` (caminho relativo a ESTE
 * arquivo): funciona quando o CLI roda via tsx direto do código-fonte,
 * mas QUEBRA em silêncio quando este módulo é importado pela API — o
 * build da API (artifacts/api-server/build.mjs) usa esbuild com
 * `bundle: true`, empacotando @workspace/db inteiro dentro de um
 * dist/index.mjs só. Nesse contexto, import.meta.url aponta pro bundle
 * da API, não mais pra este arquivo, e "../migrations" relativo a ele
 * não existe — readdir retornava vazio e a função virava um no-op
 * silencioso (sem erro, sem log, só não aplicava nada). Foi exatamente
 * o que aconteceu em produção antes desse fix.
 *
 * Testa múltiplos candidatos (self-relative + relative ao cwd do
 * processo, que no container Docker é /app/artifacts/api-server —
 * WORKDIR /app, `pnpm --filter @workspace/api-server run start`) e usa
 * o primeiro que existir de verdade. Se nenhum existir, lança erro loud
 * em vez de devolver silenciosamente uma lista vazia — melhor a API
 * falhar o boot com um erro claro do que "funcionar" sem nunca aplicar
 * nenhuma migration pendente.
 */
function resolveMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../migrations"), // tsx rodando do código-fonte (CLI)
    path.resolve(here, "../../migrations"), // dist/ compilado um nível mais fundo
    path.resolve(process.cwd(), "../../lib/db/migrations"), // API bundlada, cwd = artifacts/api-server
    path.resolve(process.cwd(), "lib/db/migrations"), // cwd = raiz do monorepo
    "/app/lib/db/migrations", // fallback explícito pro layout do Docker (WORKDIR /app)
  ];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    throw new Error(
      "Não encontrei a pasta lib/db/migrations em nenhum caminho candidato:\n" +
        candidates.map((c) => `  - ${c}`).join("\n") +
        "\nAjuste resolveMigrationsDir() em lib/db/src/apply-migrations.ts se a estrutura de deploy mudou.",
    );
  }
  return found;
}

export const MIGRATIONS_DIR = resolveMigrationsDir();

export interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  noTransaction: boolean;
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function assertUniqueMigrationVersions(files: MigrationFile[]): void {
  const filesByVersion = new Map<string, string[]>();
  for (const file of files) {
    const filenames = filesByVersion.get(file.version) ?? [];
    filenames.push(path.basename(file.filePath));
    filesByVersion.set(file.version, filenames);
  }
  const duplicates = [...filesByVersion.entries()].filter(
    ([, filenames]) => filenames.length > 1,
  );
  if (duplicates.length === 0) return;
  const details = duplicates
    .map(([version, filenames]) => `  ${version}: ${filenames.join(", ")}`)
    .join("\n");
  throw new Error(
    `Duplicate migration version(s) detected:\n${details}\n` +
      "Each numeric migration version must be unique. Resolve the filename conflict before running migrations.",
  );
}

export function readMigrationFiles(
  migrationsDir: string = MIGRATIONS_DIR,
): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) return [];

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(f);
      if (!match) return [];
      const filePath = path.join(migrationsDir, f);
      const content = fs.readFileSync(filePath, "utf8");
      return [
        {
          version: match[1]!,
          name: match[2]!.replace(/_/g, " "),
          filePath,
          noTransaction: content.startsWith("-- no-transaction"),
        },
      ];
    });

  assertUniqueMigrationVersions(files);
  return files;
}

export async function ensureControlTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
      version     TEXT        NOT NULL PRIMARY KEY,
      name        TEXT        NOT NULL,
      checksum    TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getApplied(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const res = await client.query<{ version: string; checksum: string }>(
    `SELECT version, checksum FROM ${CONTROL_TABLE} ORDER BY version`,
  );
  return new Map(res.rows.map((r) => [r.version, r.checksum]));
}

async function recordMigration(
  client: pg.PoolClient,
  version: string,
  name: string,
  checksum: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ${CONTROL_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
    [version, name, checksum],
  );
}

export interface ApplyResult {
  applied: { version: string; name: string; ms: number }[];
}

/**
 * Aplica todas as migrations pendentes (mesma lógica do `migrate up` do
 * CLI). Idempotente: se não houver pendências, é um no-op rápido.
 * Adquire o advisory lock antes de checar/aplicar, então é seguro chamar
 * a partir de múltiplas réplicas subindo ao mesmo tempo.
 */
export async function applyPendingMigrations(
  pool: pg.Pool,
  opts: { migrationsDir?: string; logger?: Pick<Console, "info" | "warn" | "error"> } = {},
): Promise<ApplyResult> {
  const log = opts.logger ?? console;
  const client = await pool.connect();
  const result: ApplyResult = { applied: [] };
  try {
    await ensureControlTable(client);
    await client.query(`SELECT pg_advisory_lock($1::bigint)`, [ADVISORY_LOCK_KEY]);
    try {
      const files = readMigrationFiles(opts.migrationsDir);
      const applied = await getApplied(client);

      // Valida checksum das já aplicadas — se o arquivo mudou depois de
      // aplicado, algo está errado (migration editada retroativamente).
      for (const f of files) {
        if (!applied.has(f.version)) continue;
        const content = fs.readFileSync(f.filePath, "utf8");
        const checksum = sha256(content);
        const stored = applied.get(f.version)!;
        if (stored !== checksum) {
          throw new Error(
            `Checksum mismatch for migration ${f.version} ("${f.name}"). ` +
              `Migration file was modified after being applied.`,
          );
        }
      }

      const pending = files.filter((f) => !applied.has(f.version));
      for (const f of pending) {
        const content = fs.readFileSync(f.filePath, "utf8");
        const checksum = sha256(content);
        const t0 = Date.now();

        if (f.noTransaction) {
          await client.query(content);
          await recordMigration(client, f.version, f.name, checksum);
        } else {
          await client.query("BEGIN");
          try {
            await client.query(content);
            await recordMigration(client, f.version, f.name, checksum);
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          }
        }
        const ms = Date.now() - t0;
        log.info?.(`  ✓  ${f.version}  ${f.name}  (${ms}ms)`);
        result.applied.push({ version: f.version, name: f.name, ms });
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
  return result;
}
