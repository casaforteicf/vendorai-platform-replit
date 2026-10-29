import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

// site_generator_core.ts — find "AI_PROVIDER = useAnthropic"
{
  const f = resolve(root, "src/routes/site_generator_core.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  const i = text.indexOf("AI_PROVIDER = useAnthropic");
  const seg = text.substring(i, i + 100);
  console.log("site_gen AI_PROVIDER:", JSON.stringify(seg));
  console.log("site_gen hex:", Buffer.from(seg, "latin1").toString("hex"));
}

// content.ts — check the exact pattern the plugin expects
{
  const f = resolve(root, "src/routes/content.ts");
  const buf = readFileSync(f);
  const text = buf.toString("latin1");
  // The plugin looks for this exact block (from build.mjs line 195)
  const pattern = "  if (used >= limit) {\n    res.status(402).json({\n      error: `Limite mensal de ${limit} gerações atingido. Upgrade de plano para gerar mais conteúdo.`,\n      monthlyUsed: used,\n      monthlyLimit: limit,\n    });\n    return;\n  }";
  const i = text.indexOf(pattern);
  console.log("\ncontent.ts plugin pattern found at:", i);
  // Also check the old-limits pattern
  const oldLimits = "const PLAN_LIMITS: Record<string, number> = {\n  starter: 20,\n  growth: 150,\n  enterprise: 200,\n};\n";
  console.log("content.ts oldLimits found at:", text.indexOf(oldLimits));
}