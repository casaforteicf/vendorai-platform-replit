import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Inspect site_generator_core.ts around line 19
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const lines = text.split("\n");
  console.log("site_generator_core.ts line 19:");
  console.log("  text:", JSON.stringify(lines[18]));
  console.log("  hex:", Buffer.from(lines[18], "latin1").toString("hex"));
}

// Inspect content.ts quota response
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const i = text.indexOf("if (used >= limit)");
  console.log("\ncontent.ts quota response:");
  console.log("  text:", JSON.stringify(text.substring(i, i+260)));
}