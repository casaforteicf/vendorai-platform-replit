import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Inspect site_generator_core.ts line 19
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  console.log("site_gen line 19:", JSON.stringify(lines[18]));
  console.log("site_gen line 19 hex:", Buffer.from(lines[18], "utf8").toString("hex"));
}

// Inspect content.ts around "content exhausted after race"
{
  const f = resolve(root, "src/routes/content.ts");
  const text = readFileSync(f, "utf8");
  const i = text.indexOf("quotaExhausted = false");
  console.log("\ncontent.ts quotaExhausted found at:", i);
  if (i >= 0) {
    console.log("content.ts block:", JSON.stringify(text.substring(i, i + 300)));
  }
}