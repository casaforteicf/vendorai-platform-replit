import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

const errors: string[] = [];
const warnings: string[] = [];

const protectedFrontendSurfaces = [
  "artifacts/frontend/src/pages/partner-hub/PartnerHubPage.tsx",
  "artifacts/frontend/src/pages/partner-hub/PartnerDetailPage.tsx",
  "artifacts/frontend/src/pages/vcn/VCNPage.tsx",
  "artifacts/frontend/src/pages/vcn/VCNCompanyDetailPage.tsx",
  "artifacts/frontend/src/pages/ecosystem-hub/CompanyDetailPage.tsx",
  "artifacts/frontend/src/pages/poe/POEPage.tsx",
  "artifacts/frontend/src/modules/arqdor/workspace/modules/ProjectModule.tsx",
];

for (const file of protectedFrontendSurfaces) {
  const source = read(file);
  if (/\bMOCK_[A-Z0-9_]+\b/.test(source)) {
    errors.push(`${file}: produção não pode depender de constantes MOCK_*.`);
  }
  if (/from\s+["'][^"']*(?:mock-data|mock-project|\/mock\/)[^"']*["']/.test(source)) {
    errors.push(`${file}: produção não pode importar fonte de dados mock.`);
  }
}

const vehicleLookup = read("artifacts/api-server/src/services/vehicle-lookup.ts");
if (/VEHICLE_LOOKUP_PROVIDER\s*\?\?\s*["']mock["']/.test(vehicleLookup)) {
  errors.push("vehicle-lookup.ts: VEHICLE_LOOKUP_PROVIDER não pode assumir mock por padrão.");
}
if (!/configured\s*===\s*["']mock["'][\s\S]{0,160}NODE_ENV\s*!==\s*["']production["']/.test(vehicleLookup)) {
  errors.push("vehicle-lookup.ts: provider mock deve ser permitido somente fora de produção.");
}

const archRoutes = read("artifacts/api-server/src/routes/arch.ts");
const routePattern = /router\.(get|post|patch|delete)\(["'](\/arch\/prompt-variations[^"']*)["']/g;
const counts = new Map<string, number>();
for (const match of archRoutes.matchAll(routePattern)) {
  const key = `${match[1].toUpperCase()} ${match[2]}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
for (const [route, count] of counts) {
  if (count > 1) warnings.push(`arch.ts: ${route} registrado ${count} vezes; consolidar em um único handler.`);
}

const agentRoutes = read("artifacts/api-server/src/routes/agents.ts");
if (/callOpenAI\(openaiMessages,\s*tenantId\s*\)/.test(agentRoutes)) {
  errors.push("agents.ts: toda chamada ao wrapper de IA deve informar agentName para passar pelo ai-gateway com feature/billing corretos.");
}
if (!agentRoutes.includes("callOpenAI(openaiMessages, tenantId, agentName, req.log)")) {
  errors.push("agents.ts: handler genérico deve encaminhar agentName e logger ao ai-gateway.");
}
if (!agentRoutes.includes('callOpenAI(openaiMessages, tenantId, "scheduler", req.log)')) {
  errors.push("agents.ts: scheduler deve ser atribuído explicitamente ao feature agent_scheduler no ai-gateway.");
}

const agentEngine = read("artifacts/api-server/src/lib/agent-engine.ts");
if (/until full migration|Fallback:\s*direct call/i.test(agentEngine)) {
  warnings.push("agent-engine.ts: migração para ai-gateway ainda possui fallback direto; manter como dívida rastreada até remoção.");
}

if (warnings.length) {
  console.warn("\n[production-integrity] Avisos:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) {
  console.error("\n[production-integrity] Falhas críticas:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("[production-integrity] OK — superfícies críticas sem dependência implícita de mocks.");
