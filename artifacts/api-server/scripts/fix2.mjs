import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Fix onboarding.ts — the instruction string has a missing closing quote before segmentTip
{
  const f = resolve(root, "src/routes/onboarding.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const bad = 'parts.push("", "## INSTRU\u00c7\u00d5ES ESPEC\u00cdFICAS DO SEGMENTO"", segmentTip);';
  const good = 'parts.push("", "## INSTRU\u00c7\u00d5ES ESPEC\u00cdFICAS DO SEGMENTO", segmentTip);';
  if (text.includes(bad)) {
    text = text.replace(bad, good);
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed onboarding.ts");
  } else {
    console.log("onboarding.ts: pattern not found");
  }
}

// Fix site_generator_core.ts — corrupted text at line 505
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  let text = buf.toString("latin1");
  const bad = '? "" USE as imagens fornecidas (campo \'imagem\')';
  const good = '? "n\u00e3o USE as imagens fornecidas (campo \'imagem\')';
  if (text.includes(bad)) {
    text = text.replace(bad, good);
    writeFileSync(f, Buffer.from(text, "latin1"));
    console.log("fixed site_generator_core.ts");
  } else {
    console.log("site_generator_core.ts: pattern not found");
  }
}