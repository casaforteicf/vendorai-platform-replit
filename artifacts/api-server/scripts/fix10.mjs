import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Fix site_generator_core.ts — convert CRLF to LF
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  let text = buf.toString("utf8");
  const before = text;
  text = text.replace(/\r\n/g, "\n");
  if (text !== before) {
    writeFileSync(f, text, "utf8");
    console.log("LF converted: site_generator_core.ts");
  } else {
    console.log("no change: site_generator_core.ts");
  }
}

// Fix content.ts — replace \u0014 with em-dash
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  let text = buf.toString("utf8");
  const before = text;
  text = text.replace(/\u0014/g, "\u2014");
  if (text !== before) {
    writeFileSync(f, text, "utf8");
    console.log("fixed em-dash: content.ts");
  } else {
    console.log("no change: content.ts");
  }
}