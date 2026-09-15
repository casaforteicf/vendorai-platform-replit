import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const depthPath = path.resolve(siteRoot, "src/data/agentExecutionDepth.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const depth = JSON.parse(fs.readFileSync(depthPath, "utf8"));

function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(items = []) {
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function buildSection(entry) {
  return `<section data-agent-execution-depth="true" aria-label="Execução prática do agente VendorAI">
<h2>${esc(entry.title)}</h2>
<p>${esc(entry.intro)}</p>
<h3>O que este agente executa</h3>
${list(entry.executions)}
<h3>Como trabalha dentro do VendorAI</h3>
${entry.workflow.map((item) => `<p>${esc(item)}</p>`).join("")}
<h3>Autonomia com governança</h3>
<p>${esc(entry.autonomy)}</p>
<h3>Exemplo operacional</h3>
<p>${esc(entry.example)}</p>
</section>`;
}

let enriched = 0;
for (const [pathname, entry] of Object.entries(depth.pages || {})) {
  const route = (manifest.routes || []).find((item) => item.pathname === pathname);
  if (!route?.staticHtml) throw new Error(`[agent-static-seo] missing staticHtml for ${pathname}`);
  if (route.staticHtml.includes('data-agent-execution-depth="true"')) continue;
  route.staticHtml += buildSection(entry);
  enriched += 1;
}

if (enriched !== 10) {
  throw new Error(`[agent-static-seo] expected to enrich 10 agent routes, enriched ${enriched}`);
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[agent-static-seo] enriched ${enriched} intelligent-agent routes with execution, workflow, autonomy and operational examples`);
