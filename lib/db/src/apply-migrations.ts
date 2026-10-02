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
 * Advisory lock : 7767366262. Migrations transacionais usam
 *                 pg_advisory_xact_lock para o lock morrer junto com a
 *                 transação/conexão. O lock de sessão fica restrito às
 *                 raras migrations marcadas como -- no-transaction.
 */
import type pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

export const ADVISORY_LOCK_KEY = "7767366262";
export const CONTROL_TABLE = "vendorai_schema_migrations";

// Migrations corrigidas depois de chegarem a algum ambiente precisam aceitar
// o checksum original. Isso mantém a proteção contra alterações arbitrárias,
// mas permite tornar o SQL idempotente sem derrubar bancos que já aplicaram a
// primeira versão.
const LEGACY_CHECKSUMS: Readonly<Record<string, readonly string[]>> = {
  "161": ["a52c13b2b5c54e67b3acb36efe8317772f6ea2ba19e59acdcfaacf9f521c3f87"],
  // A migration de múltiplos números WhatsApp chegou primeiro a produção
  // com a versão 209. Ela agora é 229, liberando 209 para a política de
  // autonomia de marketing sem invalidar o histórico já registrado.
  "209": ["69bf9ffc9a006584e2168840d8c7318bea3b243fd7c40bf30a352893b110716b"],
};

export function isAcceptedMigrationChecksum(
  version: string,
  current: string,
  stored: string,
): boolean {
  return current === stored || LEGACY_CHECKSUMS[version]?.includes(stored) === true;
}

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

  // Legacy databases recorded unique migrations by numeric prefix. Keep that
  // identity where it is unambiguous. For historical duplicate-prefix groups,
  // use the full filename as the stable identity so every SQL file can be
  // tracked independently without renaming old migrations.
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.version, (counts.get(file.version) ?? 0) + 1);
  return files.map((file) =>
    (counts.get(file.version) ?? 0) > 1
      ? { ...file, version: path.basename(file.filePath) }
      : file,
  );
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

function legacyNumericVersion(file: MigrationFile): string | null {
  if (!file.version.endsWith(".sql")) return null;
  return /^(\\d+)_/.exec(path.basename(file.filePath))?.[1] ?? null;
}

function appliedKeyForFile(
  file: MigrationFile,
  applied: Map<string, string>,
): string | null {
  if (applied.has(file.version)) return file.version;
  const legacyVersion = legacyNumericVersion(file);
  if (!legacyVersion) return null;
  const stored = applied.get(legacyVersion);
  if (!stored) return null;
  const checksum = sha256(fs.readFileSync(file.filePath, "utf8"));
  return isAcceptedMigrationChecksum(legacyVersion, checksum, stored)
    ? legacyVersion
    : null;
}

function assertLegacyDuplicateHistoryIsResolvable(
  files: MigrationFile[],
  applied: Map<string, string>,
): void {
  const groups = new Map<string, MigrationFile[]>();
  for (const file of files) {
    const legacyVersion = legacyNumericVersion(file);
    if (!legacyVersion) continue;
    const group = groups.get(legacyVersion) ?? [];
    group.push(file);
    groups.set(legacyVersion, group);
  }
  for (const [legacyVersion, group] of groups) {
    const stored = applied.get(legacyVersion);
    if (!stored) continue;
    const matches = group.filter((file) => {
      const checksum = sha256(fs.readFileSync(file.filePath, "utf8"));
      return isAcceptedMigrationChecksum(legacyVersion, checksum, stored);
    });
    if (matches.length !== 1) {
      throw new Error(
        `Legacy migration history for duplicate version ${legacyVersion} is ambiguous. ` +
          `Expected exactly one matching file by checksum, found ${matches.length}.`,
      );
    }
  }
}

function assertAppliedChecksum(
  file: MigrationFile,
  applied: Map<string, string>,
): void {
  const appliedKey = appliedKeyForFile(file, applied);
  if (!appliedKey) return;
  const stored = applied.get(appliedKey)!;
  const content = fs.readFileSync(file.filePath, "utf8");
  const checksum = sha256(content);
  if (!isAcceptedMigrationChecksum(appliedKey, checksum, stored)) {
    throw new Error(
      `Checksum mismatch for migration ${file.version} ("${file.name}"). ` +
        `Migration file was modified after being applied.`,
    );
  }
}

/**
 * Aplica todas as migrations pendentes (mesma lógica do `migrate up` do
 * CLI). Idempotente: se não houver pendências, é um no-op rápido e não
 * disputa advisory lock.
 *
 * Para migrations transacionais, o lock é transaction-scoped. Isso evita
 * que Supavisor/conexões encerradas no meio de um deploy deixem um lock de
 * sessão órfão bloqueando os boots seguintes. Depois de adquirir o lock a
 * função relê a tabela de controle, porque outra réplica pode ter aplicado
 * a mesma migration enquanto esta aguardava.
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

    const files = readMigrationFiles(opts.migrationsDir);
    const initialApplied = await getApplied(client);

    // Valida checksum antes de qualquer lock. Em boot normal, quando não há
    // pendência, a função termina aqui sem poder ficar presa por lock antigo.
    // Bancos legados podem ter uma única migration de um grupo duplicado
    // registrada pelo prefixo numérico; nesse caso identificamos o arquivo
    // exato pelo checksum e deixamos as demais migrations do grupo pendentes.
    assertLegacyDuplicateHistoryIsResolvable(files, initialApplied);
    for (const file of files) assertAppliedChecksum(file, initialApplied);

    const pending = files.filter((file) => !appliedKeyForFile(file, initialApplied));
    if (pending.length === 0) return result;

    for (const file of pending) {
      const content = fs.readFileSync(file.filePath, "utf8");
      const checksum = sha256(content);
      const t0 = Date.now();

      if (file.noTransaction) {
        // Algumas operações PostgreSQL não podem rodar dentro de BEGIN. Para
        // essas raras migrations mantemos lock de sessão, mas somente durante
        // a migration que realmente está pendente.
        await client.query(`SELECT pg_advisory_lock($1::bigint)`, [ADVISORY_LOCK_KEY]);
        try {
          const appliedAfterLock = await getApplied(client);
          const appliedKey = appliedKeyForFile(file, appliedAfterLock);
          if (appliedKey) {
            assertAppliedChecksum(file, appliedAfterLock);
            continue;
          }

          await client.query(content);
          await recordMigration(client, file.version, file.name, checksum);
        } finally {
          await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [ADVISORY_LOCK_KEY]).catch(() => {});
        }
      } else {
        await client.query("BEGIN");
        try {
          // Transaction-level advisory locks são liberados automaticamente em
          // COMMIT/ROLLBACK e também quando a conexão morre durante o deploy.
          await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [ADVISORY_LOCK_KEY]);

          const appliedAfterLock = await getApplied(client);
          const appliedKey = appliedKeyForFile(file, appliedAfterLock);
          if (appliedKey) {
            assertAppliedChecksum(file, appliedAfterLock);
            await client.query("COMMIT");
            continue;
          }

          await client.query(content);
          await recordMigration(client, file.version, file.name, checksum);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        }
      }

      const ms = Date.now() - t0;
      log.info?.(`  ✓  ${file.version}  ${file.name}  (${ms}ms)`);
      result.applied.push({ version: file.version, name: file.name, ms });
    }
  } finally {
    client.release();
  }

  return result;
}