import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

/**
 * Reverte dupla codificação UTF-8: percorre bytes latin1 e, quando encontra
 * sequência UTF-8 válida (2/3/4 bytes), mantém como UTF-8.
 */
function revertDoubleEncoding(text) {
  const bytes = Buffer.from(text, "latin1");
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b >= 0xC2 && b <= 0xDF && i + 1 < bytes.length &&
        bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF) {
      out.push(b, bytes[i + 1]); i += 2;
    } else if (b >= 0xE0 && b <= 0xEF && i + 2 < bytes.length &&
               bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF &&
               bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF) {
      out.push(b, bytes[i + 1], bytes[i + 2]); i += 3;
    } else if (b >= 0xF0 && b <= 0xF4 && i + 3 < bytes.length &&
               bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF &&
               bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF &&
               bytes[i + 3] >= 0x80 && bytes[i + 3] <= 0xBF) {
      out.push(b, bytes[i + 1], bytes[i + 2], bytes[i + 3]); i += 4;
    } else {
      out.push(b); i += 1;
    }
  }
  return Buffer.from(out).toString("utf8");
}

const files = [
  "src/routes/site_generator_core.ts",
  "src/routes/content.ts",
  "src/services/media-plan-auto-production.ts",
  "src/lib/ai-gateway.ts",
  "src/routes/onboarding.ts",
  "src/routes/changelog.ts",
];

for (const f of files) {
  const path = resolve(root, f);
  const buf = readFileSync(path);
  const text = buf.toString("latin1");
  const fixed = revertDoubleEncoding(text);
  if (fixed !== text) {
    writeFileSync(path, Buffer.from(fixed, "utf8"));
    console.log("reverted:", f);
  } else {
    console.log("no change:", f);
  }
}