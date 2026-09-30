import fs from "node:fs";
import path from "node:path";

const assetsDir = path.resolve(process.cwd(), "dist/public/assets");
if (!fs.existsSync(assetsDir)) {
  console.error("[bundle-budget] dist/public/assets não encontrado. Rode o build antes.");
  process.exit(1);
}

const chunkPattern = (name) => new RegExp("^" + name + "(?:-[A-Za-z0-9_]+)+\\.js$");

const budgets = [
  { label: "main index", pattern: chunkPattern("index"), maxKb: 120, pick: "largest" },
  { label: "Dashboard", pattern: chunkPattern("Dashboard"), maxKb: 50 },
  { label: "Leads", pattern: chunkPattern("Leads"), maxKb: 50 },
  { label: "LeadWorkspace", pattern: chunkPattern("LeadWorkspace"), maxKb: 50 },
  { label: "SidebarLayout", pattern: chunkPattern("SidebarLayout"), maxKb: 30 },
  { label: "AppLegacy", pattern: chunkPattern("AppLegacy"), maxKb: 80 },
  { label: "ArqWorkspace", pattern: chunkPattern("ArqWorkspace"), maxKb: 150, optional: true },
  { label: "ConceptPlanner", pattern: chunkPattern("ConceptPlanner"), maxKb: 350 },
];

const files = fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
const failures = [];

for (const budget of budgets) {
  const matches = files.filter((name) => budget.pattern.test(name));
  if (!matches.length) {
    if (budget.optional) {
      console.log(`[bundle-budget] SKIP ${budget.label}: chunk não emitido separadamente nesta build`);
      continue;
    }
    failures.push(`${budget.label}: chunk não encontrado`);
    continue;
  }

  const measured = matches
    .map((name) => ({ name, kb: fs.statSync(path.join(assetsDir, name)).size / 1024 }))
    .sort((a, b) => b.kb - a.kb);

  const target = measured[0];
  const status = target.kb <= budget.maxKb ? "OK" : "FAIL";
  console.log(`[bundle-budget] ${status} ${budget.label}: ${target.kb.toFixed(2)} kB / ${budget.maxKb} kB (${target.name})`);

  if (target.kb > budget.maxKb) {
    failures.push(`${budget.label}: ${target.kb.toFixed(2)} kB > ${budget.maxKb} kB`);
  }
}

if (failures.length) {
  console.error("\n[bundle-budget] Regressão detectada:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\n[bundle-budget] Todos os limites críticos estão dentro do orçamento.");
