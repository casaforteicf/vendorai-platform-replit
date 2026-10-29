import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Force LF line endings on all affected files
const files = [
  "src/routes/content.ts",
  "src/services/media-plan-auto-production.ts",
  "src/routes/site_generator_core.ts",
  "src/lib/ai-gateway.ts",
  "src/routes/onboarding.ts",
  "src/routes/changelog.ts",
];

for (const f of files) {
  const path = resolve(root, f);
  const buf = readFileSync(path);
  let text = buf.toString("latin1");
  const before = text;
  // Convert all CRLF to LF
  text = text.replace(/\r\n/g, "\n");
  if (text !== before) {
    writeFileSync(path, Buffer.from(text, "latin1"));
    console.log("LF converted:", f);
  } else {
    console.log("already LF:", f);
  }
}