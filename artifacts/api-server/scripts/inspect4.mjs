import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// site_generator_core.ts — line 19 exactly
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const lines = text.split("\n");
  console.log("site_gen line 19:", JSON.stringify(lines[18]));
  console.log("site_gen line 19 hex:", Buffer.from(lines[18], "latin1").toString("hex"));
}

// content.ts — check the exact pattern the plugin expects (build.mjs line 195)
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  // The plugin pattern from build.mjs
  const pattern = "  if (used >= limit) {\n    res.status(402).json({\n      error: `Limite mensal de ${limit} gerações atingido. Upgrade de plano para gerar mais conteúdo.`,\n      monthlyUsed: used,\n      monthlyLimit: limit,\n    });\n    return;\n  }";
  const i = text.indexOf(pattern);
  console.log("\ncontent.ts pattern found at:", i);
  // Show the actual bytes around the found position
  if (i >= 0) {
    const seg = text.substring(i, i + 200);
    console.log("content.ts actual:", JSON.stringify(seg));
  }
}