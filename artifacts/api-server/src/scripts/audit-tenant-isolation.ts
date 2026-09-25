#!/usr/bin/env tsx
// Batch 2 tenant-isolation review trigger.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

interface Finding {
  severity: "high" | "medium" | "info";
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const baselineArg = process.argv.find((arg) => arg.startsWith("--baseline-high="));
const baselineHigh = baselineArg ? Number.parseInt(baselineArg.split("=")[1] ?? "", 10) : null;

if (baselineArg && (!Number.isInteger(baselineHigh) || (baselineHigh ?? -1) < 0)) {
  console.error("Invalid --baseline-high value. Expected a non-negative integer.");
  process.exit(2);
}

const findings: Finding[] = [];

const rules: Array<{
  severity: Finding["severity"];
  rule: string;
  pattern: RegExp;
}> = [
  {
    severity: "high",
    rule: "untrusted-request-tenant",
    pattern:
      /req\.(?:params|query|body)(?:\.(?:tenantId|tenant_id)|\[["'](?:tenantId|tenant_id)["']\])/,
  },
  {
    severity: "high",
    rule: "destructured-request-tenant",
    pattern:
      /\{[^}]*\b(?:tenantId|tenant_id)\b[^}]*\}\s*=\s*req\.(?:params|query|body)/,
  },
  {
    severity: "medium",
    rule: "tenant-route-parameter",
    pattern: /["'`]\/[^"'`]*:(?:tenantId|tenant_id)\b/,
  },
  {
    severity: "info",
    rule: "resolved-request-tenant",
    pattern: /req\.tenantId\b/,
  },
];

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile() || !entry.name.endsWith(".ts")) return [];
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")) return [];
    return [fullPath];
  });
}

for (const filePath of walk(root)) {
  const relativeFile = path.relative(root, filePath).replaceAll(path.sep, "/");
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const previousLine = lines[index - 1] ?? "";
    const previousWindow = lines.slice(Math.max(0, index - 5), index).join(" ");
    const guardWindow = lines.slice(index + 1, index + 3).join(" ");
    const socialGuardWindow = lines.slice(index + 1, index + 6).join(" ");
    const routeWindow = lines.slice(index, index + 24).join(" ");
    // These marketing/site middlewares read the route tenant only to compare it
    // immediately against the authenticated tenant before touching tenant data.
    // Allow one intervening resource-id declaration (e.g. siteId) before the guard.
    const guardedMarketingTenant =
      relativeFile === "routes/business_profiles.ts" &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!canAccessTenant\(req,\s*tenantId\)\)/.test(guardWindow);
    // The implementation status route is intentionally cross-tenant only for Super Admin.
    // Keep this exception exact so ordinary tenant routes remain covered by the audit.
    const guardedImplementationSuperAdminTenant =
      relativeFile === "routes/onboarding_implementation.ts" &&
      /router\.get\("\/superadmin\/tenants\/:tenantId\/implementation",\s*requireRole\("super_admin"\)/.test(previousLine) &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line);
    // Jarvis e-mail/calendar task routes read the route tenant only to compare it
    // immediately against the authenticated tenant before any tenant-scoped query.
    // Super Admin is the only intentional cross-tenant exception.
    const guardedJarvisAgentTaskTenant =
      (relativeFile === "routes/jarvis_email_actions.ts" || relativeFile === "routes/jarvis_external_actions.ts") &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\s*\?\?\s*["']{2}\)/.test(line) &&
      /if\s*\(req\.user\?\.platformRole\s*!==\s*["']super_admin["']\s*&&\s*req\.user\?\.tenantId\s*!==\s*tenantId\)\s*return\s+next\(\)/.test(guardWindow);
    // Finance and commission routers resolve the route tenant only to enforce the
    // shared authenticated same-tenant/super-admin guard before touching tenant data.
    // Keep the allowlist exact so any future router or unguarded access is still flagged.
    const guardedFinanceTenant =
      [
        "routes/finance_integrations.ts",
        "routes/finance_contracts.ts",
        "routes/finance_procurement.ts",
        "routes/commission_engine.ts",
      ].includes(relativeFile) &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!canAccess\(req,\s*tenantId\)/.test(guardWindow);
    // Command Center, goals, feedback and stage-policy routes resolve the route tenant
    // only to enforce the same-tenant/super-admin guard on the immediately following line.
    // Keep this exception scoped to this router and exact guard shape.
    const guardedOfficialMetricsTenant =
      relativeFile === "routes/official_metrics.ts" &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!canAccess\(req,\s*tenantId\)\)\s*return\s+res\.status\(403\)/.test(guardWindow);
    // Meta Growth dashboard/custom-audience routes are authenticated and compare the
    // route tenant against the signed-in tenant (or Super Admin) immediately after reading it.
    const guardedMetaGrowthAuthenticatedTenant =
      relativeFile === "routes/content_performance.ts" &&
      previousLine.includes("/tenants/:tenantId/meta-growth/") &&
      previousLine.includes("authenticate") &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!assertTenantAccess\(req,\s*tenantId\)\)\s*return\s+res\.status\(403\)/.test(guardWindow);
    // Meta engagement ingestion is a webhook rather than a user session. The tenant id
    // is accepted only when the caller proves possession of that tenant's stored webhook secret.
    const guardedMetaGrowthWebhookTenant =
      relativeFile === "routes/content_performance.ts" &&
      previousLine.includes('router.post("/tenants/:tenantId/meta-growth/engagements/ingest"') &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /agentConfigsTable\.tenantId,\s*tenantId/.test(routeWindow) &&
      /config(?:\?\.|\.)webhookSecret\s*!==\s*secret/.test(routeWindow);
    // The identity-role PATCH only changes the current tenant's social connection after
    // the same authenticated tenant/Super Admin guard used by the rest of this router.
    // Provider validation can sit between tenant extraction and the guard, so inspect five lines.
    const guardedSocialIdentityRoleTenant =
      relativeFile === "routes/social-integrations.ts" &&
      previousLine.includes('router.patch("/tenants/:tenantId/social-connections/:provider", authenticate') &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!canAccess\(req,\s*tenantId\)\)\s*return\s+res\.status\(403\)/.test(socialGuardWindow);
    // Generation-pack purchase routes are protected by the shared same-tenant/Super Admin
    // middleware before their handlers run. Keep this exception limited to the two new
    // generation-pack endpoints so existing token-purchase findings remain unchanged.
    const guardedGenerationPackTenant =
      relativeFile === "routes/token_purchases.ts" &&
      previousWindow.includes("/tenants/:tenantId/generation-pack-purchases") &&
      previousWindow.includes("requireSameTenanOrSuperAdmin()") &&
      /const\s+tenantId\s*=\s*String\(req\.params\[["']tenantId["']\]\)/.test(line);
    // The Site Generator QA route reads the route tenant and immediately applies the
    // same-tenant/Super Admin canAccess guard before any tenant-scoped query.
    const guardedSiteGeneratorQaTenant =
      relativeFile === "routes/site_generator_2_runtime.ts" &&
      previousLine.includes('router.get("/tenants/:tenantId/site-generator/:siteId/qa"') &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!canAccess\(req,\s*tenantId\)\)/.test(guardWindow);
    // Facebook Marketplace routes resolve the route tenant only to enforce the
    // shared same-tenant/Super Admin guard immediately before touching catalog,
    // campaign or listing data. Keep the exception exact to this router/guard;
    // any route that omits the immediate guard remains a HIGH candidate.
    const guardedFacebookMarketplaceTenant =
      relativeFile === "routes/facebook_marketplace.ts" &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!hasTenantAccess\(req,\s*tenantId\)\)/.test(guardWindow);

    if (
      line.includes("tenant-audit: reviewed") ||
      previousLine.includes("tenant-audit: reviewed") ||
      guardedMarketingTenant ||
      guardedImplementationSuperAdminTenant ||
      guardedJarvisAgentTaskTenant ||
      guardedFinanceTenant ||
      guardedOfficialMetricsTenant ||
      guardedMetaGrowthAuthenticatedTenant ||
      guardedMetaGrowthWebhookTenant ||
      guardedSocialIdentityRoleTenant ||
      guardedGenerationPackTenant ||
      guardedSiteGeneratorQaTenant ||
      guardedFacebookMarketplaceTenant
    ) {
      return;
    }

    for (const rule of rules) {
      if (!rule.pattern.test(line)) continue;
      findings.push({
        severity: rule.severity,
        file: relativeFile,
        line: index + 1,
        rule: rule.rule,
        excerpt: line.trim().slice(0, 180),
      });
    }
  });
}

const counts = findings.reduce(
  (result, finding) => {
    result[finding.severity] += 1;
    return result;
  },
  { high: 0, medium: 0, info: 0 },
);

console.log("\nVendorAI tenant-isolation audit");
console.log("================================");
console.log(`High: ${counts.high} | Medium: ${counts.medium} | Info: ${counts.info}`);
if (baselineHigh !== null) {
  console.log(`Baseline high-risk candidates: ${baselineHigh}`);
}

for (const finding of findings) {
  console.log(
    `[${finding.severity.toUpperCase()}] ${finding.file}:${finding.line} ${finding.rule}`,
  );
  console.log(`  ${finding.excerpt}`);
}

console.log(
  "\nHigh findings are review candidates, not automatic proof of a vulnerability.",
);
console.log(
  "Mark an intentionally reviewed line with: // tenant-audit: reviewed <reason>",
);

if (strict && counts.high > 0) {
  console.error(`\nTenant audit failed with ${counts.high} high-risk candidate(s).`);
  process.exit(1);
}

if (baselineHigh !== null && counts.high > baselineHigh) {
  console.error(
    `\nTenant audit regression: ${counts.high} high-risk candidate(s), baseline is ${baselineHigh}.`,
  );
  process.exit(1);
}

if (baselineHigh !== null) {
  const delta = counts.high - baselineHigh;
  console.log(
    delta < 0
      ? `\nTenant audit improved by ${Math.abs(delta)} high-risk candidate(s). Update the baseline downward.`
      : "\nTenant audit baseline respected: no new high-risk candidates by count.",
  );
}
