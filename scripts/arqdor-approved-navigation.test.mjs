import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const src = readFileSync(new URL("../artifacts/frontend/src/modules/arqdor/workspace/ArqWorkspace.tsx", import.meta.url), "utf8");
const nav = src.match(/const FLOW_STEPS: FlowStep\[\] = \[([\s\S]*?)\n\]/)?.[1];
assert.ok(nav, "navigation config missing");
const labels = [...nav.matchAll(/label:'([^']+)'/g)].map(m => m[1]);
assert.deepEqual(labels, ["Projetos","Modelagem 2D/3D","Materiais","Render","Especificações","Orçamento","Entrega"]);
assert.equal((src.match(/<FlowNav\s/g)||[]).length, 1, "duplicate main navigation");
assert.ok(!src.includes("Gerar Render\n"), "duplicate Render CTA");
for (const module of ["home","bim","biblioteca","renders","especificacao","orcamento","office"]) {
  assert.ok(src.includes("case '"+module+"'"), "missing route "+module);
}
console.log("ARQDOR_SETE_AMBIENTES_STATIC_OK");
