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
