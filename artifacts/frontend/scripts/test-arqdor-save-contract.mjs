#!/usr/bin/env node
/**
 * MULTI-06: source-level safety gate for current Arqdor workspace persistence.
 * Complements runtime tests; it cannot prove API or offline sync behavior.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/modules/arqdor/workspace/WorkspaceContext.tsx"), "utf8");
const workspace = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/modules/arqdor/workspace/ArqWorkspace.tsx"), "utf8");

test("remote PUT validates HTTP status instead of treating error as save success", () => {
  assert.match(source, /if \(!response\.ok\) throw/);
  assert.match(source, /setSaveError\('/);
});
test("does not send invalid or unauthorized project context", () => {
  assert.match(source, /if \(!tok \|\| !ctx\.id\?\.trim\(\)\)/);
});
test("save errors are actually visible in Arqdor workspace", () => {
  assert.match(workspace, /workspaceSaveError/);
  assert.match(workspace, /role="alert"/);
});
test("draft infrastructure remains opt-in without unsafe automatic upload", () => {
  assert.doesNotMatch(source, /saveArqdorDraft|inspectArqdorDraftRecovery/);
});
