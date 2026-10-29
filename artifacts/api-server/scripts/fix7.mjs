import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

/**
 * Reverte dupla codificação UTF-8.
 * O arquivo foi: UTF-8 -> decodificado como latin1 -> re-escrito.
 * Para reverter: percorremos os bytes latin1 e, quando encontramos uma
 * sequência UTF-8 válida (2 ou 3 bytes), decodificamos como UTF-8.
 */
function revertDoubleEncoding(text) {
  const bytes = Buffer.from(text, "latin1");
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    // 2-byte UTF-8: C2-DF followed by 80-BF
    if (b >= 0xC2 && b <= 0xDF && i + 1 < bytes.length &&
        bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF) {
      out.push(b, bytes[i + 1]);
      i += 2;
    }
    // 3-byte UTF-8: E0-AF followed by 80-BF 80-BF
    else if (b >= 0xE0 && b <= 0xEF && i + 2 < bytes.length &&
             bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF &&
             bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF) {
      out.push(b, bytes[i + 1], bytes[i + 2]);
      i += 3;
    }
    // 4-byte UTF-8: F0-F4 followed by 80-BF 80-BF 80-BF
    else if (b >= 0xF0 && b <= 0xF4 && i + 3 < bytes.length &&
             bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF &&
             bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF &&
             bytes[i + 3] >= 0x80 && bytes[i + 3] <= 0xBF) {
      out.push(b, bytes[i + 1], bytes[i + 2], bytes[i + 3]);
      i += 4;
    }
    else {
      out.push(b);
      i += 1;
    }
  }
  return Buffer.from(out).toString("utf8");
}

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
  const text = buf.toString("latin1");
  const fixed = revertDoubleEncoding(text);
  const before = text;
  if (fixed !== before) {
    writeFileSync(path, Buffer.from(fixed, "utf8"));
    console.log("fixed:", f);
  } else {
    console.log("no change:", f);
  }
}