import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// The corrupted bytes are the UTF-8 encoding of U+FFFD (EF BF BD) decoded as latin1,
// which gives three latin1 chars: ï (0xEF) + ¿ (0xBF) + ½ (0xBD).
const FFFD = "\u00EF\u00BF\u00BD";

// Fix site_generator_core.ts — "n<FFFD>o" -> "não"
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const before = text;
  text = text.replace(new RegExp("n" + FFFD + "o", "g"), "n\u00e3o");
  if (text !== before) {
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed site_generator_core.ts");
  } else {
    console.log("site_generator_core.ts: no change");
  }
}

// Fix content.ts — "gera<FFFD><FFFD>es" -> "gerações", "conte<FFFD>do" -> "conteúdo"
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const before = text;
  text = text.replace(new RegExp("gera" + FFFD + FFFD + "es", "g"), "gera\u00e7\u00f5es");
  text = text.replace(new RegExp("conte" + FFFD + "do", "g"), "conte\u00fado");
  if (text !== before) {
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed content.ts");
  } else {
    console.log("content.ts: no change");
  }
}