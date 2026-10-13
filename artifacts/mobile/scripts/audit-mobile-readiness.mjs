#!/usr/bin/env node
/** MULTI-05 read-only Expo/mobile release gate. Run: node artifacts/mobile/scripts/audit-mobile-readiness.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(mobile, name), "utf8"));
const app = read("app.json").expo;
const eas = read("eas.json");
const pkg = read("package.json");
const findings = [];
const check = (ok, label) => { findings.push({ ok, label }); console.log(`[${ok ? "PASS" : "FAIL"}] ${label}`); };
check(Boolean(app?.ios?.bundleIdentifier && app?.android?.package), "Identifiers present for both mobile platforms");
check(app.ios.bundleIdentifier === app.android.package, "Bundle and package identifiers are aligned");
check(Boolean(app?.icon && fs.existsSync(path.join(mobile, app.icon))), "Configured original icon asset exists (visual approval still needed)");
check(Boolean(eas?.build?.preview?.android?.buildType === "apk"), "Android internal APK preview profile available");
check(Boolean(eas?.build?.production), "EAS production profile defined (not published)");
check(Boolean(pkg?.scripts?.typecheck), "Mobile TypeScript validation command available");
check(pkg.main === "expo-router/entry", "Expo Router entry is configured");
const flags = [
  ["Expo development depends on Replit-specific environment variables", /REPLIT_|\$PORT/.test(pkg.scripts?.dev || "")],
  ["Native wake-word plugin requires Android/iOS hardware validation", (app.plugins || []).some(p => typeof p === "string" && p.includes("wake-word"))],
  ["No confirmation that builds are signed or published", true],
  ["Web IndexedDB Arqdor drafts are NOT automatically supported by Expo native", true],
];
for (const [label, yes] of flags) if (yes) console.log(`[REVIEW] ${label}`);
console.log("[MANUAL] Validate Expo config, lockfile, typecheck, actual EAS preview build, sign-in and tenant switching on device.");
console.log("[MANUAL] Verify notifications/microphone permissions, camera, links, project isolation, logout and data deletion.");
console.log("[MANUAL] Obtain approval of original icon; do not generate or alter artwork.");
const failed = findings.filter(f => !f.ok).length;
console.log(`MULTI-05 structural checks: ${findings.length - failed}/${findings.length}; device QA NOT completed.`);
if (failed) process.exitCode = 1;
