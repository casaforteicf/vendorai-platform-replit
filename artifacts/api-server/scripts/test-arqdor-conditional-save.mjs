#!/usr/bin/env node
/** MULTI-04 source gate: conditional endpoint should remain separate from legacy PUT. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import test from "node:test";
const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/routes/arch.ts"), "utf8");
test("legacy route remains and conditional update is separate", () => {
  assert.match(source, /router\.put\("\/arqdor\/projects\/:id", authenticate/);
  assert.match(source, /router\.put\("\/arqdor\/projects\/:id\/conditional", authenticate/);
});
test("conditional save scopes by tenant and performs atomic row revision comparison", () => {
  const start = source.indexOf('router.put("/arqdor/projects/:id/conditional"');
  const end = source.indexOf("// POST /arch/copilot/chat", start);
  assert.ok(start > 0 && end > start);
  const code = source.slice(start, end);
  assert.match(code, /eq\(arqdorWorkspaceProjectsTable\.tenantId, tid\)/);
  assert.match(code, /xmin::text =/);
  assert.match(code, /status\(409\)/);
  assert.doesNotMatch(code, /onConflictDoUpdate|\.insert\(/);
});

test("conditional revision and write endpoints fail closed for non-admin roles", () => {
  assert.match(source, /router\.get\("\/arqdor\/projects\/:id\/revision", authenticate, requireRole\("super_admin", "tenant_admin"\)/);
  assert.match(source, /router\.put\("\/arqdor\/projects\/:id\/conditional", authenticate, requireRole\("super_admin", "tenant_admin"\)/);
});

test("experimental conditional routes reject guest and internal actors", () => {
  assert.match(source, /function canUseArqdorConditionalSave\(/);
  assert.match(source, /user\.tenantId === tenant/);
  assert.match(source, /user\.accessScope === "tenant"/);
  assert.match(source, /user\.actorType === "human"/);
  const gate = 'if (!canUseArqdorConditionalSave(req.user, tid))';
  assert.equal(source.split(gate).length - 1, 2);
});

test("member conditional save requires feature flag and atomic membership check", () => {
  const begin = source.indexOf('router.put("/arqdor/projects/:id/member-conditional"');
  const end = source.indexOf('router.put("/arqdor/projects/:id/conditional"', begin);
  assert.ok(begin > 0 && end > begin);
  const code = source.slice(begin, end);
  assert.match(code, /ARQDOR_PROJECT_ACL_ENABLED !== "true"/);
  assert.match(code, /m\.permission IN \('owner','editor'\)/);
  assert.match(code, /u\.active = TRUE/);
  assert.match(code, /xmin::text =/);
  assert.match(code, /req\.user\.sub/);
  assert.doesNotMatch(code, /onConflictDoUpdate/);
});

test("member save locks project before conditional update", () => {
  const begin = source.indexOf('router.put("/arqdor/projects/:id/member-conditional"');
  const end = source.indexOf('router.put("/arqdor/projects/:id/conditional"', begin);
  const code = source.slice(begin, end);
  assert.match(code, /db\.transaction\(async tx =>/);
  assert.match(code, /\.for\("update"\)/);
  assert.match(code, /return tx\.update\(arqdorWorkspaceProjectsTable\)/);
});
