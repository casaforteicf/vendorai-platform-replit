import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// Inspect site_generator_core.ts line 19 as esbuild would see it (UTF-8)
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  console.log("site_gen line 19:", JSON.stringify(lines[18]));
  console.log("site_gen line 19 hex:", Buffer.from(lines[18], "utf8").toString("hex"));
}

// Inspect content.ts quota response as esbuild would see it (UTF-8)
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  const text = buf.toString("utf8");
  const pattern = "  if (used >= limit) {\n    res.status(402).json({\n      error: `Limite mensal de ${limit} gerações atingido. Upgrade de plano para gerar mais conteúdo.`,\n      monthlyUsed: used,\n      monthlyLimit: limit,\n    });\n    return;\n  }";
  const i = text.indexOf(pattern);
  console.log("\ncontent.ts pattern found at:", i);
  if (i >= 0) {
    const seg = text.substring(i, i + 200);
    console.log("content.ts actual:", JSON.stringify(seg));
  } else {
    // Show what's actually there
    const j = text.indexOf("if (used >= limit)");
    console.log("content.ts actual block:", JSON.stringify(text.substring(j, j + 220)));
  }
}