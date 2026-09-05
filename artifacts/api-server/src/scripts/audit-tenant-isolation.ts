#!/usr/bin/env tsx
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
    const nextLine = lines[index + 1] ?? "";
    const guardedMarketingTenant =
      relativeFile === "routes/business_profiles.ts" &&
      /const\s+tenantId\s*=\s*String\(req\.params\.tenantId\)/.test(line) &&
      /if\s*\(!canAccessTenant\(req,\s*tenantId\)\)/.test(nextLine);

    if (
      line.includes("tenant-audit: reviewed") ||
      previousLine.includes("tenant-audit: reviewed") ||
      guardedMarketingTenant
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
