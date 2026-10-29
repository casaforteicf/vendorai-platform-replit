import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Check ALL non-ASCII bytes in site_generator_core.ts
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const bad = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 127) {
      bad.push({ pos: i, char: c, hex: c.toString(16), ctx: text.substring(Math.max(0,i-10), i+10) });
    }
  }
  console.log("site_generator_core.ts non-ASCII count:", bad.length);
  for (const b of bad.slice(0, 15)) {
    console.log(`  pos=${b.pos} U+${b.hex} ctx=${JSON.stringify(b.ctx)}`);
  }
}

// Check ALL non-ASCII bytes in content.ts
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const bad = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 127) {
      bad.push({ pos: i, char: c, hex: c.toString(16), ctx: text.substring(Math.max(0,i-10), i+10) });
    }
  }
  console.log("\ncontent.ts non-ASCII count:", bad.length);
  for (const b of bad.slice(0, 15)) {
    console.log(`  pos=${b.pos} U+${b.hex} ctx=${JSON.stringify(b.ctx)}`);
  }
}