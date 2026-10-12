#!/usr/bin/env node
/** MULTI-07 static API checks. Database migration & functional QA remain required. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/routes/arqdor_workspace_members.ts"), "utf8");
const index = readFileSync(resolve(root, "src/routes/index.ts"), "utf8");
test("membership routes are mounted and disabled by default", () => {
  assert.match(index, /router\.use\(arqdorWorkspaceMembersRouter\)/);
  assert.match(source, /ARQDOR_PROJECT_ACL_ENABLED !== "true"/);
  assert.match(source, /requireRole\("super_admin", "tenant_admin"\)/);
});
test("writes validate active user and tenant, do not grant owner", () => {
  assert.match(source, /eq\(usersTable\.tenantId, tenantId\)/);
  assert.match(source, /eq\(usersTable\.active, true\)/);
  assert.match(source, /\["editor", "viewer"\]/);
  assert.match(source, /existing\?\.permission === "owner"/);
});
test("revocation excludes owners inside SQL write condition", () => {
  assert.match(source, /arqdorWorkspaceMembersTable\.permission\} <> 'owner'/);
  assert.match(source, /router\.delete\("\/arqdor\/projects\/:id\/members\/:userId"/);
});

test("grants and revocations write audit records in the same transaction", () => {
  assert.match(source, /tx\.insert\(arqdorWorkspaceMemberAuditTable\)/);
  assert.match(source, /action: existing \? "change" : "grant"/);
  assert.match(source, /action: "revoke"/);
  assert.match(source, /const removed = await db\.transaction\(async tx =>/);
  assert.match(source, /if \(!changed\.length\) return "owner-immutable"/);
});
