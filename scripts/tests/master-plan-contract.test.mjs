import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = JSON.parse(readFileSync(new URL("../../artifacts/frontend/src/pages/admin/master-improvements-registry.json", import.meta.url), "utf8"));
const ui = readFileSync(new URL("../../artifacts/frontend/src/pages/admin/AdminMasterPlan.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../../artifacts/frontend/src/pages/admin/AdminImprovements.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../../artifacts/api-server/src/routes/admin_improvements.ts", import.meta.url), "utf8");

test("master registry contains 244 unique official requirements", () => {
  assert.equal(registry.items.length, 244);
  assert.equal(new Set(registry.items.map(item => item.id)).size, 244);
  for (const item of registry.items) {
    assert.ok(item.module && item.title && item.status && item.homologation && item.production);
    assert.notEqual(item.production, "verified");
  }
});

test("existing improvements center mounts Master Plan without a new router", () => {
  assert.match(center, /import AdminMasterPlan from/);
  assert.match(center, /view === "master"/);
  assert.match(center, /<AdminMasterPlan\s*\/>/);
});

test("GitHub evidence endpoint is read only, scoped to superadmin and bounded", () => {
  assert.match(api, /router\.use\("\/admin\/improvements", requireRole\("super_admin"\)\)/);
  assert.match(api, /router\.get\("\/admin\/improvements\/master-pr-status"/);
  assert.match(api, /\.slice\(0, 50\)/);
  assert.match(api, /productionVerified: false/);
});

test("PR status never automatically claims homologation or production", () => {
  assert.match(ui, /homologação não verificada/);
  assert.match(ui, /refetchInterval: 5 \* 60 \* 1000/);
  assert.match(ui, /Consulta GitHub indisponível/);
  assert.doesNotMatch(ui, /set.*production.*verified/i);
});
