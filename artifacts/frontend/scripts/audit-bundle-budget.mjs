import fs from "node:fs";
import path from "node:path";

const assetsDir = path.resolve(process.cwd(), "dist/public/assets");
if (!fs.existsSync(assetsDir)) {
  console.error("[bundle-budget] dist/public/assets não encontrado. Rode o build antes.");
  process.exit(1);
}

const budgets = [
  { label: "main index", pattern: /^index-local-.*\.js$/, maxKb: 120, pick: "largest" },
  { label: "Dashboard", pattern: /^Dashboard-local-.*\.js$/, maxKb: 50 },
  { label: "Leads", pattern: /^Leads-local-.*\.js$/, maxKb: 50 },
  { label: "LeadWorkspace", pattern: /^LeadWorkspace-local-.*\.js$/, maxKb: 50 },
  { label: "SidebarLayout", pattern: /^SidebarLayout-local-.*\.js$/, maxKb: 30 },
  { label: "AppLegacy", pattern: /^AppLegacy-local-.*\.js$/, maxKb: 80 },
  { label: "ArqWorkspace", pattern: /^ArqWorkspace-local-.*\.js$/, maxKb: 150 },
  { label: "ConceptPlanner", pattern: /^ConceptPlanner-local-.*\.js$/, maxKb: 350 },
];

const files = fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
const failures = [];

for (const budget of budgets) {
  const matches = files.filter((name) => budget.pattern.test(name));
  if (!matches.length) {
    failures.push(`${budget.label}: chunk não encontrado`);
    continue;
  }

  const measured = matches
    .map((name) => ({ name, kb: fs.statSync(path.join(assetsDir, name)).size / 1024 }))
    .sort((a, b) => b.kb - a.kb);

  const target = budget.pick === "largest" ? measured[0] : measured[0];
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
