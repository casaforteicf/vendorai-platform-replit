import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

/**
 * Replace every U+FFFD (EF BF BD in UTF-8) in the file using context-based
 * replacements. We work on the UTF-8 decoded text.
 */
function fixFile(f, replacements) {
  const path = resolve(root, f);
  let text = readFileSync(path, "utf8");
  let changed = false;
  for (const { from, to } of replacements) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(path, text, "utf8");
    console.log("fixed:", f);
  } else {
    console.log("no change:", f);
  }
}

const FFFD = "\uFFFD";

// site_generator_core.ts — n<FFFD>o -> não
fixFile("src/routes/site_generator_core.ts", [
  { from: `n${FFFD}o`, to: "não" },
]);

// content.ts — gera<FFFD><FFFD>es -> gerações, conte<FFFD>do -> conteúdo
fixFile("src/routes/content.ts", [
  { from: `gera${FFFD}${FFFD}es`, to: "gerações" },
  { from: `conte${FFFD}do`, to: "conteúdo" },
]);