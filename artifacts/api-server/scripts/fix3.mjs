import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Fix site_generator_core.ts — corrupted "não" (double-encoded as nÃµo)
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  // Replace double-encoded "não" variants
  const before = text;
  text = text.replace(/n\u00c3\u00a3o/g, "n\u00e3o");       // nÃ³o -> não
  text = text.replace(/n\u00c3\u00b5o/g, "n\u00e3o");       // nÃµo -> não
  text = text.replace(/n\u00c3\u00a7o/g, "n\u00e3o");       // nÃ§o -> não
  if (text !== before) {
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed site_generator_core.ts");
  } else {
    console.log("site_generator_core.ts: no change");
  }
}

// Fix content.ts — replace double-encoded quota response block
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const before = text;
  // Fix double-encoded Portuguese chars in the quota response
  text = text.replace(/gera\u00c3\u00a7\u00c3\u00b5es/g, "gera\u00e7\u00f5es");
  text = text.replace(/conte\u00c3\u00bado/g, "conte\u00fado");
  text = text.replace(/gera\u00c3\u00a7\u00c3\u00b5es/g, "gera\u00e7\u00f5es");
  if (text !== before) {
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed content.ts");
  } else {
    console.log("content.ts: no change");
  }
}