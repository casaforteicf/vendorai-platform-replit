import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Inspect content.ts around "failed to persist generation"
{
  const f = resolve(root, "src/routes/content.ts");
  const text = readFileSync(f, "utf8");
  const i = text.indexOf("failed to persist generation");
  console.log("content.ts found at:", i);
  if (i >= 0) {
    const seg = text.substring(i - 40, i + 170);
    console.log("content.ts block:", JSON.stringify(seg));
  }
}

// Inspect site_generator_core.ts around callAI
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const text = readFileSync(f, "utf8");
  const i = text.indexOf("async function callAI");
  console.log("\nsite_gen callAI found at:", i);
  if (i >= 0) {
    const seg = text.substring(i, i + 200);
    console.log("site_gen callAI:", JSON.stringify(seg));
  } else {
    console.log("site_gen callAI: NOT FOUND");
  }
}