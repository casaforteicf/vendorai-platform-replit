/**
 * Auditoria de integridade entre o banco e o object storage (R2/Supabase).
 *
 * Percorre todas as colunas text/jsonb/array com nomes ligados a mídia,
 * extrai referências `/objects/...` e verifica, uma a uma, se o objeto
 * existe no backend ativo. É read-only por padrão.
 *
 * Uso:
 *   pnpm --filter @workspace/api-server audit:storage
 *   pnpm --filter @workspace/api-server audit:storage -- --json
 *   pnpm --filter @workspace/api-server audit:storage -- --strict
 *   pnpm --filter @workspace/api-server audit:storage -- --fix-brand
 *
 * `--fix-brand` anula SOMENTE logos/favicons órfãos (tenants,
 * business_profiles, tenant_themes). Renders, anexos, mensagens e demais
 * referências históricas são apenas reportados — nunca apagados.
 */
import { pool } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import {
  BRAND_REFERENCE_COLUMNS,
  extractObjectPaths,
  groupMissingBySource,
  type MissingObject,
} from "../lib/storage-integrity.js";

interface Options {
  json: boolean;
  strict: boolean;
  fixBrand: boolean;
  concurrency: number;
}

interface TableColumn {
  table: string;
  column: string;
}

interface BrandRepair {
  table: string;
  column: string;
  rows: number;
}

/** Resumo do backend ativo sem depender de helpers de configuração (mantém
 *  este script independente de outros PRs e sem expor segredos). */
function describeStorageBackend(): string {
  const r2Ready = Boolean(
    process.env["R2_ACCESS_KEY_ID"] &&
      process.env["R2_SECRET_ACCESS_KEY"] &&
      process.env["R2_BUCKET"] &&
      (process.env["R2_ACCOUNT_ID"] || process.env["R2_ENDPOINT"]),
  );
  return r2Ready
    ? `r2 (${process.env["R2_BUCKET"]})`
    : `supabase (${process.env["SUPABASE_URL"] ?? "não configurado"})`;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const SCAN_COLUMN_PATTERN =
  "(url|logo|favicon|image|imagem|foto|media|arquivo|anexo|pdf|video|render|document|signature|thumbnail|avatar|banner|icon|file|storage)";

function parseOptions(argv: string[]): Options {
  const concurrencyArg = argv.find((arg) => arg.startsWith("--concurrency="));
  const parsedConcurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 8;
  return {
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
    fixBrand: argv.includes("--fix-brand"),
    concurrency: Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
      ? Math.min(32, Math.floor(parsedConcurrency))
      : 8,
  };
}

async function listScannableColumns(): Promise<TableColumn[]> {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
        AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND c.data_type IN ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
        AND c.column_name ~* $1
      ORDER BY c.table_name, c.column_name`,
    [SCAN_COLUMN_PATTERN],
  );
  return rows
    .filter((row) => IDENTIFIER.test(row.table_name) && IDENTIFIER.test(row.column_name))
    .map((row) => ({ table: row.table_name, column: row.column_name }));
}

async function collectReferences(columns: TableColumn[]): Promise<Map<string, Set<string>>> {
  const pathSources = new Map<string, Set<string>>();
  for (const { table, column } of columns) {
    const source = `${table}.${column}`;
    try {
      const { rows } = await pool.query<{ val: string | null }>(
        `SELECT "${column}"::text AS val
           FROM "${table}"
          WHERE "${column}" IS NOT NULL
            AND "${column}"::text LIKE '%/objects/%'`,
      );
      for (const row of rows) {
        for (const path of extractObjectPaths(row.val)) {
          const sources = pathSources.get(path) ?? new Set<string>();
          sources.add(source);
          pathSources.set(path, sources);
        }
      }
    } catch (error) {
      // Colunas de extensões/versões antigas podem não existir mais; não
      // interrompe a auditoria inteira por causa de uma tabela.
      console.error(
        `[audit-storage] aviso: falha ao ler ${source}: ${(error as Error).message}`,
      );
    }
  }
  return pathSources;
}

async function checkObjects(
  paths: string[],
  pathSources: Map<string, Set<string>>,
  concurrency: number,
): Promise<{ ok: number; missing: MissingObject[]; otherErrors: Array<{ path: string; error: string }> }> {
  const service = new ObjectStorageService();
  let cursor = 0;
  let ok = 0;
  const missing: MissingObject[] = [];
  const otherErrors: Array<{ path: string; error: string }> = [];

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= paths.length) return;
      const path = paths[index]!;
      try {
        await service.getObjectEntityFile(path);
        ok++;
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          missing.push({ path, sources: [...(pathSources.get(path) ?? [])] });
        } else {
          otherErrors.push({ path, error: (error as Error).message });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length || 1) }, worker));
  return { ok, missing, otherErrors };
}

async function fixBrandReferences(missing: MissingObject[]): Promise<BrandRepair[]> {
  const missingPaths = new Set(missing.map((item) => item.path));
  if (missingPaths.size === 0) return [];

  const existing = new Set(
    (await listScannableColumns())
      .filter(({ table, column }) =>
        BRAND_REFERENCE_COLUMNS.some((ref) => ref.table === table && ref.column === column),
      )
      .map(({ table, column }) => `${table}.${column}`),
  );

  const repairs: BrandRepair[] = [];
  for (const ref of BRAND_REFERENCE_COLUMNS) {
    if (!existing.has(`${ref.table}.${ref.column}`)) continue;
    const { rows } = await pool.query<{ val: string | null }>(
      `SELECT "${ref.column}"::text AS val FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`,
    );
    const orphanValues = new Set<string>();
    for (const row of rows) {
      if (!row.val) continue;
      if (extractObjectPaths(row.val).some((path) => missingPaths.has(path))) {
        orphanValues.add(row.val);
      }
    }
    for (const value of orphanValues) {
      const result = await pool.query(
        `UPDATE "${ref.table}" SET "${ref.column}" = NULL WHERE "${ref.column}" = $1`,
        [value],
      );
      repairs.push({ table: ref.table, column: ref.column, rows: result.rowCount ?? 0 });
    }
  }
  return repairs;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = Date.now();
  console.error(`[audit-storage] backend: ${describeStorageBackend()}`);

  const columns = await listScannableColumns();
  console.error(`[audit-storage] colunas analisadas: ${columns.length}`);

  const pathSources = await collectReferences(columns);
  const paths = [...pathSources.keys()];
  console.error(`[audit-storage] referências únicas: ${paths.length}; verificando...`);

  const { ok, missing, otherErrors } = await checkObjects(paths, pathSources, options.concurrency);
  const repairs = options.fixBrand ? await fixBrandReferences(missing) : [];
  const missingBySource = groupMissingBySource(missing);

  const report = {
    backend: describeStorageBackend(),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totals: {
      scannedColumns: columns.length,
      uniqueObjects: paths.length,
      present: ok,
      missing: missing.length,
      otherErrors: otherErrors.length,
      missingBySource,
      brandReferencesCleared: repairs.reduce((total, item) => total + item.rows, 0),
    },
    brandRepairs: repairs,
    missing: missing.slice(0, 200),
    otherErrors: otherErrors.slice(0, 50),
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nStorage: ${report.backend}`);
    console.log(`Objetos únicos: ${paths.length}`);
    console.log(`  presentes: ${ok}`);
    console.log(`  ausentes:  ${missing.length}`);
    console.log(`  erros:     ${otherErrors.length}`);
    if (missingBySource.length > 0) {
      console.log("\nAusentes por origem:");
      for (const item of missingBySource.slice(0, 30)) {
        console.log(`  ${String(item.count).padStart(5)}  ${item.source}`);
      }
    }
    if (repairs.length > 0) {
      console.log("\nLogos/favicons órfãos anulados (--fix-brand):");
      for (const repair of repairs) {
        console.log(`  ${repair.table}.${repair.column}: ${repair.rows}`);
      }
    } else if (options.fixBrand) {
      console.log("\nNenhum logo/favicon órfão para anular.");
    }
    console.log(`\nConcluído em ${report.durationMs}ms.`);
  }

  if (options.strict && (missing.length > 0 || otherErrors.length > 0)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[audit-storage] falhou:", error);
    process.exitCode = 2;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
