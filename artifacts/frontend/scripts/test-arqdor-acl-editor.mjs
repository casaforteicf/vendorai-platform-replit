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

test("MULTI-08.4 serializes requests and stops on switching projects", () => {
  assert.match(source, /latestPendingRef\.current = ctx/);
  assert.match(source, /while \(latestPendingRef\.current && !writeBlockedRef\.current\)/);
  assert.match(source, /if \(saveInFlightRef\.current \|\| writeBlockedRef\.current\) return/);
  assert.match(source, /activeProjectRef\.current !== ctx\.id/);
  assert.match(source, /remoteRevisionRef\.current = null/);
  assert.match(source, /writeBlockedRef\.current = true/);
});
