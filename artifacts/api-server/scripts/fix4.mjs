import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Fix site_generator_core.ts — line 19 has n<FFFD>o instead of não
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const before = text;
  // n + U+FFFD + o -> não
  text = text.replace(/n\uFFFD\o/g, "n\u00e3o");
  if (text !== before) {
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed site_generator_core.ts");
  } else {
    console.log("site_generator_core.ts: no change");
  }
}

// Fix content.ts — quota response has gera<FFFD><FFFD>es and conte<FFFD>do
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const before = text;
  // gera<FFFD><FFFD>es -> gerações
  text = text.replace(/gera\uFFFD\uFFFD\es/g, "gera\u00e7\u00f5es");
  // conte<FFFD>do -> conteúdo
  text = text.replace(/conte\uFFFD\do/g, "conte\u00fado");
  if (text !== before) {
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed content.ts");
  } else {
    console.log("content.ts: no change");
  }
}