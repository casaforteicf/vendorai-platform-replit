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
