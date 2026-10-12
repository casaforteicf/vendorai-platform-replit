import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(dir, "../src/modules/arqdor/workspace/ArqdorDraftRecoveryPanel.tsx"), "utf8");
const workspace = readFileSync(resolve(dir, "../src/modules/arqdor/workspace/ArqWorkspace.tsx"), "utf8");
test("recovery review is opt-in and mounted", () => {
  assert.match(panel, /VITE_MULTI09_RECOVERY_REVIEW/);
  assert.match(workspace, /<ArqdorDraftRecoveryPanel \/>/);
});
test("recovery requires both server snapshot and edit permission", () => {
  assert.match(panel, /\/snapshot/);
  assert.match(panel, /\/edit-access/);
  assert.match(panel, /authorization\.canEdit !== true/);
});
test("recovery applies only after manual confirmation and refreshed access", () => {
  assert.doesNotMatch(panel, /method: "PUT"|method: "POST"|setProjectCtx\(/);
  assert.match(panel, /reviewEncryptedRecovery\(/);
  assert.match(panel, /window\.confirm\(/);
  assert.match(panel, /snapshot\.revision !== candidate\.revision/);
  assert.match(panel, /applyRecoveredDraft\(candidate\.context\)/);
});
