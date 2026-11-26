#!/usr/bin/env node
/**
 * Gate de encoding do código-fonte.
 *
 * O lote ALINHA-01 encontrou U+FFFD (caractere de substituição) e NUL em
 * arquivos de produção, o que corrompeu prompts, mensagens e um separador de
 * campanha (" · " -> " � ") e quebrou a geração do Plano de Mídia. Este gate
 * impede que o problema volte: qualquer arquivo .ts/.tsx com esses bytes
 * reprova a validação.
 *
 * Uso: node scripts/check-source-encoding.mjs [diretórios...]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DEFAULT_DIRS = ["artifacts/api-server/src", "artifacts/frontend/src", "lib"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage", "test-results"]);

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_DIRS;

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    const extension = full.slice(full.lastIndexOf("."));
    if (EXTENSIONS.has(extension)) files.push(full);
  }
  return files;
}

const problems = [];
for (const target of targets) {
  const absolute = join(ROOT, target);
  try {
    if (!statSync(absolute).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const file of walk(absolute)) {
    const buffer = readFileSync(file);
    const replacement = buffer.toString("utf8").split("\uFFFD").length - 1;
    const nulCount = buffer.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
    if (replacement > 0 || nulCount > 0) {
      problems.push({ file: relative(ROOT, file), replacement, nul: nulCount });
    }
  }
}

if (problems.length === 0) {
  console.log("check-source-encoding: OK (nenhum U+FFFD ou NUL em .ts/.tsx)");
  process.exit(0);
}

console.error("check-source-encoding: arquivos com caracteres corrompidos:");
for (const problem of problems) {
  console.error(`  ${problem.file} — U+FFFD: ${problem.replacement}, NUL: ${problem.nul}`);
}
console.error("Corrija os bytes antes de commitar (não use substituição automática sem revisar).");
process.exit(1);
