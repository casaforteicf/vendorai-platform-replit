#!/usr/bin/env node
/** MULTI-05: dependency-free release configuration regression tests. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = filename => JSON.parse(readFileSync(path.join(root, filename), "utf8"));
const app = json("app.json").expo;
const eas = json("eas.json");
const pkg = json("package.json");
test("identificadores Android/iOS definidos e coerentes", () => {
  assert.match(app.android.package, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i);
  assert.equal(app.android.package, app.ios.bundleIdentifier);
});
test("Expo é a entrada nativa e o modo preview não publica em loja", () => {
  assert.equal(pkg.main, "expo-router/entry");
  assert.equal(eas.build.preview.distribution, "internal");
  assert.equal(eas.build.preview.android.buildType, "apk");
  assert.ok(eas.build.production);
});
test("desenvolvimento não depende de configuração Replit", () => {
  for (const name of ["dev", "dev:lan"]) {
    assert.ok(pkg.scripts[name], `script ${name} ausente`);
    assert.doesNotMatch(pkg.scripts[name], /REPLIT_|\$PORT|REACT_NATIVE_PACKAGER_HOSTNAME/);
  }
});
test("auditoria estrutural e typecheck permanecem disponíveis", () => {
  assert.equal(pkg.scripts["audit:readiness"], "node scripts/audit-mobile-readiness.mjs");
  assert.ok(pkg.scripts.typecheck.includes("tsc"));
});
test("configuração não modifica branding nem força permissões sem declaração", () => {
  assert.ok(app.icon.startsWith("./assets/"));
  assert.ok(Array.isArray(app.android.permissions));
  assert.ok(app.plugins.some(p => p === "expo-secure-store"));
});
