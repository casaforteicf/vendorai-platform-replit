#!/usr/bin/env node
/**
 * Read-only multiplatform readiness audit. Run from any working directory:
 * node artifacts/frontend/scripts/audit-install-readiness.mjs
 * No network calls, writes, deployment, token access or service worker registration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(frontend, "../..");
const read = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return ""; } };
const html = read("artifacts/frontend/index.html");
const manifest = read("artifacts/api-server/src/routes/manifest.ts");
const routes = read("artifacts/api-server/src/routes/index.ts");
const mobile = read("artifacts/mobile/package.json");
const checks = [
  ["HTML manifest link", /rel="manifest"\s+href="\/api\/manifest\.json"/.test(html), "Manifest link points to /api/manifest.json"],
  ["PWA manifest handler", /router\.get\("\/manifest\.json"/.test(manifest), "Backend defines /manifest.json; confirm /api mount and reverse proxy"],
  ["Standalone display", /display:\s*"standalone"/.test(manifest), "Manifest requests standalone display"],
  ["Brand icon asset", /logo-icon\.svg/.test(manifest), "Check HTTP 200 and maskable artwork visually"],
  ["Mobile project", /"expo":\s*"~54/.test(mobile), "Expo project exists; does not prove release builds"],
];
const warnings = [
  ["Service worker recovery unregisters workers", /registration\.unregister\(\)/.test(html), "Could invalidate future offline worker registrations"],
  ["Recovery clears browser caches", /caches\.delete\(cacheName\)/.test(html), "Must protect future tenant-scoped offline project caches"],
  ["No explicit offline promise", true, "Installed PWA is not automatically an offline-capable application"],
];
let failed=0;
for (const [name,ok,note] of checks){ console.log(`[${ok?"PASS":"FAIL"}] ${name}: ${note}`); if(!ok)failed++; }
for(const [name,present,note] of warnings) if(present) console.log(`[REVIEW] ${name}: ${note}`);
console.log("[MANUAL] Confirm actual /api/manifest.json response on Cloudflare Pages with the intended API proxy.");
console.log("[MANUAL] Install and launch on Windows Chromium, Android Chrome, iOS Safari.");
console.log("[MANUAL] Test logout/revocation, private caches, restore, network loss and reconnection.");
console.log("[MANUAL] Review mobile Expo release configuration, package identifiers and signing.");
console.log(`Result: ${checks.length-failed}/${checks.length} structural checks pass. Runtime installation NOT validated.`);
if(failed) process.exitCode=1;
