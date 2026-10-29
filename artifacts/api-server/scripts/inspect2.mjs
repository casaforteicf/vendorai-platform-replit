import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Inspect site_generator_core.ts around "useAnthropic"
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const i = text.indexOf("useAnthropic");
  const seg = text.substring(i, i + 80);
  console.log("site_gen segment:", JSON.stringify(seg));
  console.log("site_gen hex:", Buffer.from(seg, "latin1").toString("hex"));
}

// Inspect content.ts around quota response
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const i = text.indexOf("if (used >= limit)");
  const seg = text.substring(i, i + 200);
  console.log("\ncontent segment:", JSON.stringify(seg));
  console.log("content hex:", Buffer.from(seg, "latin1").toString("hex"));
}