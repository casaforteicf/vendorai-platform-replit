import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Inspect site_generator_core.ts around line 19 with more context
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  console.log("site_gen line 17:", JSON.stringify(lines[16]));
  console.log("site_gen line 18:", JSON.stringify(lines[17]));
  console.log("site_gen line 19:", JSON.stringify(lines[18]));
  console.log("site_gen line 20:", JSON.stringify(lines[19]));
  console.log("site_gen line 21:", JSON.stringify(lines[20]));
}

// Inspect content.ts around the 0x14 byte
{
  const f = resolve(root, "src/routes/content.ts");
  const text = readFileSync(f, "utf8");
  const i = text.indexOf("generation \u0014 returning");
  console.log("\ncontent.ts 0x14 found at:", i);
  if (i >= 0) {
    const seg = text.substring(i - 100, i + 100);
    console.log("content.ts block:", JSON.stringify(seg));
  }
}