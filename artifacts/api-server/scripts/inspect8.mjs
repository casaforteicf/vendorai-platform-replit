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
    const seg = text.substring(i - 60, i + 130);
    console.log("content.ts block:", JSON.stringify(seg));
    console.log("content.ts hex:", Buffer.from(seg, "utf8").toString("hex"));
  }
}

// Inspect site_generator_core.ts around "useAnthropic"
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const text = readFileSync(f, "utf8");
  const i = text.indexOf("useAnthropic");
  console.log("\nsite_gen found at:", i);
  if (i >= 0) {
    const seg = text.substring(i, i + 80);
    console.log("site_gen block:", JSON.stringify(seg));
    console.log("site_gen hex:", Buffer.from(seg, "utf8").toString("hex"));
  }
}