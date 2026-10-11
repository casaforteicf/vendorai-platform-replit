#!/usr/bin/env node
/** MULTI-07 static migration checks (does not connect to the database). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
const sql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../lib/db/migrations/024_arqdor_workspace_members.sql"), "utf8");
const schema = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../lib/db/src/schema/arqdor_workspace_members.ts"), "utf8");
test("membership rows belong to the same project and tenant", () => {
  assert.match(sql, /FOREIGN KEY \(project_id, tenant_id\)/);
  assert.match(sql, /REFERENCES arqdor_workspace_projects\(id, tenant_id\)/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, project_id, user_id\)/);
});
test("only valid roles and active same-tenant user allowed", () => {
  assert.match(sql, /permission IN \('owner', 'editor', 'viewer'\)/);
  assert.match(sql, /users\.tenant_id = NEW\.tenant_id AND users\.active = TRUE/);
});
test("no automatic unverified owner migration", () => {
  assert.doesNotMatch(sql, /INSERT INTO arqdor_workspace_members/i);
  assert.match(schema, /arqdorWorkspaceMembersTable/);
});

test("ACL probe is read-only and disabled until migration is explicitly enabled", () => {
  const routes = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/routes/arch.ts"), "utf8");
  const resolver = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib/arqdor-workspace-membership.ts"), "utf8");
  assert.match(routes, /router\.get\("\/arqdor\/projects\/:id\/edit-access", authenticate/);
  assert.match(routes, /process\.env\.ARQDOR_PROJECT_ACL_ENABLED !== "true"/);
  assert.match(routes, /canActorEditArqdorProject\(req\.user, tid, id\)/);
  assert.match(resolver, /actor\?\.active/);
});
