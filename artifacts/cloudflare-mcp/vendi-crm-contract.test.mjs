import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mcp = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../api-server/src/routes/browser_agent_mcp.ts", import.meta.url), "utf8");

test("Vendi CRM native tool uses existing protected MCP API", () => {
  assert.match(mcp, /"vendi_crm_summary"/);
  assert.match(mcp, /readOnlyHint:\s*true/);
  assert.match(mcp, /vendorApi<unknown>\("\/internal\/browser-mcp\/crm-summary"/);
  assert.match(mcp, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(api, /router\.use\("\/internal\/browser-mcp"/);
  assert.match(api, /router\.post\("\/internal\/browser-mcp\/crm-summary"/);
});

test("Vendi CRM native tool resolves tenant and excludes deleted leads", () => {
  const start = api.indexOf('router.post("/internal/browser-mcp/crm-summary"');
  const end = api.indexOf('router.get("/internal/browser-mcp/status"', start);
  assert.ok(start >= 0 && end > start, "crm-summary route must exist");
  const handler = api.slice(start, end);
  assert.match(handler, /resolveTenantId\(parsed\.data\.tenantKey\)/);
  assert.match(handler, /eq\(leadsTable\.tenantId, tenantId\)/);
  assert.match(handler, /isNull\(leadsTable\.excluidoEm\)/);
  assert.match(handler, /activeLeads/);
  assert.doesNotMatch(handler, /\.insert\(|\.update\(|\.delete\(/);
});

test("Browser Agent exposes explicit homolog routing and never silently falls back", () => {
  const connections = mcp.slice(mcp.indexOf('"browser_agent_connections"'), mcp.indexOf('"browser_agent_run"'));
  const run = mcp.slice(mcp.indexOf('"browser_agent_run"'), mcp.indexOf("return server;", mcp.indexOf('"browser_agent_run"')));
  assert.match(connections, /environment:\s*z\.enum\(\["default", "homolog"\]\)/);
  assert.match(connections, /environment === "homolog" \? requiredEnv\("VENDI_HOMOLOG_API_BASE"\)/);
  assert.match(connections, /\}, targetBase\)/);
  assert.match(run, /environment === "homolog" && \(mode === "autonomo" \|\| allowWrite === true\)/);
  assert.match(run, /mode: environment === "homolog" \? "assistido" : mode/);
  assert.match(run, /allowWrite: environment === "homolog" \? false : allowWrite/);
  assert.match(run, /\}, targetBase\)/);
});

test("Browser backend honors explicit assisted and read-only requests despite autonomy", () => {
  const run = api.slice(api.indexOf('router.post("/internal/browser-mcp/run"'));
  assert.match(run, /parsed\.data\.mode === "assistido"/);
  assert.match(run, /parsed\.data\.allowWrite === false/);
  assert.match(run, /resolveTenantId\(parsed\.data\.tenantKey\)/);
  assert.match(run, /eq\(browserAgentConnectionsTable\.tenantId, tenantId\)/);
});
