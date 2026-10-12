#!/usr/bin/env node
/** MULTI-08 integration source contract; no browser, DB or runtime QA implied. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/modules/arqdor/workspace/WorkspaceContext.tsx"), "utf8");
test("ACL editor integration is opt-in only", () => {
  assert.match(source, /VITE_MULTI08_PROJECT_ACL === 'true'/);
  assert.match(source, /USE_PROJECT_ACL \? '\/snapshot' : ''/);
  assert.match(source, /USE_PROJECT_ACL \? '\/member-conditional' : ''/);
});
test("revision loaded from same snapshot and required before save", () => {
  assert.match(source, /remoteRevisionRef\.current = data\.revision/);
  assert.match(source, /!remoteRevisionRef\.current/);
  assert.match(source, /expectedRevision: remoteRevisionRef\.current/);
});
test("ACL denial never clears stored project and save handles conflicts", () => {
  assert.match(source, /res\.status === 404 && !USE_PROJECT_ACL/);
  assert.match(source, /response\.status === 409/);
});
