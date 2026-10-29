import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function fixFile(f, replacements) {
  const path = resolve(root, f);
  const buf = readFileSync(path);
  let text = buf.toString("latin1");
  let changed = false;
  for (const { from, to } of replacements) {
    const i = text.indexOf(from);
    if (i < 0) continue;
    text = text.slice(0, i) + to + text.slice(i + from.length);
    changed = true;
  }
  if (changed) {
    writeFileSync(path, Buffer.from(text, "latin1"));
    console.log("fixed:", f);
  } else {
    console.log("no change:", f);
  }
}

// onboarding.ts — corrupted instruction string (try several variants)
fixFile("src/routes/onboarding.ts", [
  { from: "INSTRU\uFFFD!\uFFFD\"ES", to: "INSTRU\u00c7\u00d5ES" },
  { from: "INSTRUCTION\uFFFD!\uFFFD\"ES", to: "INSTRU\u00c7\u00d5ES" },
]);

// content.ts — corrupted em-dash
fixFile("src/routes/content.ts", [
  { from: "generation \uFFFD\u001d returning", to: "generation \u2014 returning" },
  { from: "generation \uFFFD returning", to: "generation \u2014 returning" },
]);

// site_generator_core.ts — corrupted text at line 505
fixFile("src/routes/site_generator_core.ts", [
  { from: "? \"\" USE as imagens", to: "? \"n\u00e3o USE as imagens" },
  { from: "? \"\uFFFD\uFFFD\" USE as imagens", to: "? \"n\u00e3o USE as imagens" },
]);