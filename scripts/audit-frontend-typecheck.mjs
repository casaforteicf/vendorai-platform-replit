#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function parseBaseline(argv) {
  const arg = argv.find((value) => value.startsWith("--baseline="));
  if (!arg) return null;
  const value = Number.parseInt(arg.slice("--baseline=".length), 10);
  if (!Number.isInteger(value) || value < 0) {
    console.error("[frontend-typecheck] baseline inválido.");
    process.exit(2);
  }
  return value;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

const baseline = parseBaseline(process.argv.slice(2));

const shared = run(
  "pnpm",
  [
    "exec",
    "tsc",
    "--build",
    "lib/api-client-react/tsconfig.json",
    "lib/vendor-brain/tsconfig.json",
  ],
  { stdio: "inherit", encoding: undefined },
);

if (shared.status !== 0) {
  console.error("[frontend-typecheck] falha ao gerar declarações compartilhadas.");
  process.exit(shared.status ?? 1);
}

const result = run("pnpm", ["--filter", "@workspace/frontend", "typecheck"]);
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const matches = [...output.matchAll(/([^\n]+?\(\d+,\d+\): error TS\d+:[^\n]*)/g)];
const errors = matches.map((match) => match[1]);
const count = errors.length;

const byFile = new Map();
for (const error of errors) {
  const file = error.split("(")[0] || "desconhecido";
  byFile.set(file, (byFile.get(file) ?? 0) + 1);
}

const topFiles = [...byFile.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log("\nVendorAI frontend typecheck audit");
console.log("================================");
console.log(`Erros TypeScript: ${count}`);
if (baseline !== null) console.log(`Baseline transitório: ${baseline}`);
if (topFiles.length) {
  console.log("Maiores concentrações:");
  for (const [file, fileCount] of topFiles) {
    console.log(`- ${file}: ${fileCount}`);
  }
}

if (result.status === 0 && count === 0) {
  console.log("[frontend-typecheck] OK — frontend sem erros TypeScript.");
  process.exit(0);
}

if (baseline === null) {
  console.error("[frontend-typecheck] existem erros e nenhum baseline foi informado.");
  console.error(errors.slice(0, 25).join("\n"));
  process.exit(1);
}

if (count > baseline) {
  console.error(
    `[frontend-typecheck] REGRESSÃO — ${count} erros, baseline ${baseline}. Novos erros não podem entrar.`,
  );
  console.error(errors.slice(0, 40).join("\n"));
  process.exit(1);
}

if (count < baseline) {
  console.log(
    `[frontend-typecheck] MELHORIA — redução de ${baseline - count} erro(s). Atualize o baseline para ${count}.`,
  );
} else {
  console.log("[frontend-typecheck] baseline respeitado — nenhum aumento no total de erros.");
}

process.exit(0);
