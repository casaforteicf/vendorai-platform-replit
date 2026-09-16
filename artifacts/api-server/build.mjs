import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { readFile, rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const vendorBrainSrcDir = path.resolve(artifactDir, "../../lib/vendor-brain/src");

const workspaceVendorBrainPlugin = {
  name: "workspace-vendor-brain",
  setup(build) {
    build.onResolve({ filter: /^@workspace\/vendor-brain(?:\/(.+))?$/ }, (args) => {
      const prefix = "@workspace/vendor-brain";
      const subpath = args.path.slice(prefix.length).replace(/^\//, "");
      const relativeFile = subpath ? `${subpath}.ts` : "index.ts";
      return { path: path.resolve(vendorBrainSrcDir, relativeFile) };
    });
  },
};

// Hotfix restrito ao gerador de sites: além da colisão local de `desc`, força
// toda geração de site a passar pelo AI Gateway. Isso impede que o gerador
// contorne o hard-cap mensal do tenant ou faça fallback de billing diretamente
// entre chaves globais dos provedores.
const siteGeneratorDescCollisionHotfixPlugin = {
  name: "site-generator-desc-collision-hotfix",
  setup(build) {
    const target = path.resolve(artifactDir, "src/routes/site_generator_core.ts");
    build.onLoad({ filter: /site_generator_core\.ts$/ }, async (args) => {
      if (path.resolve(args.path) !== target) return null;

      let contents = await readFile(args.path, "utf8");
      const replacements = [
        [
          '    const desc = config.desc || bp?.diferenciais || bp?.publicoAlvo || "";',
          '    const businessDescription = config.desc || bp?.diferenciais || bp?.publicoAlvo || "";',
        ],
        [
          '    if (!name || !desc) {',
          '    if (!name || !businessDescription) {',
        ],
        [
          '        .orderBy((desc as any)(produtosCatalogoTable.destaque), produtosCatalogoTable.nome)',
          '        .orderBy(desc(produtosCatalogoTable.destaque), produtosCatalogoTable.nome)',
        ],
        [
          '    const enrichedConfig = { ...config, name, sector, desc, logoUrl: absoluteLogoUrl, products: absoluteProducts, images: absoluteImages, videos: absoluteVideos };',
          '    const enrichedConfig = { ...config, name, sector, desc: businessDescription, logoUrl: absoluteLogoUrl, products: absoluteProducts, images: absoluteImages, videos: absoluteVideos };',
        ],
      ];

      for (const [from, to] of replacements) {
        const first = contents.indexOf(from);
        if (first < 0 || contents.indexOf(from, first + from.length) >= 0) {
          throw new Error(`SiteGenerator hotfix guard failed for: ${from}`);
        }
        contents = contents.replace(from, to);
      }

      const gatewayImportAnchor = 'import { getOpenAIForTenant } from "../lib/agent-engine.js";';
      if (!contents.includes('from "../lib/ai-gateway.js"')) {
        const first = contents.indexOf(gatewayImportAnchor);
        if (first < 0 || contents.indexOf(gatewayImportAnchor, first + gatewayImportAnchor.length) >= 0) {
          throw new Error("SiteGenerator AI cost guard failed (gateway import anchor)");
        }
        contents = contents.replace(
          gatewayImportAnchor,
          `${gatewayImportAnchor}\nimport { AiGatewayError, callAnthropic as gatewayCallAnthropic, callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";`,
        );
      }

      const callAiRegex = /async function callAI\([\s\S]*?\n}\n\nrouter\.get\("\/tenants\/:tenantId\/site-generator\/latest"/;
      const callAiMatch = contents.match(callAiRegex);
      if (!callAiMatch) throw new Error("SiteGenerator AI cost guard failed (callAI function)");
      contents = contents.replace(
        callAiRegex,
        `async function callAI(\n  messages: AiMessage[],\n  tenantId: string,\n  log: { info: (obj: object, msg: string) => void },\n  systemPrompt = SITE_GENERATOR_SYSTEM_PROMPT,\n): Promise<{ content: string; provider: string; model: string }> {\n  const stopOnBudgetOrBilling = (error: unknown) =>\n    error instanceof AiGatewayError && (error.status === 402 || error.status === 429);\n\n  try {\n    log.info({ provider: "anthropic", model: "claude-sonnet-4-6" }, "Calling Anthropic via AI Gateway for site generation");\n    const result = await gatewayCallAnthropic(tenantId, "site_generator", messages, {\n      model: "claude-sonnet-4-6",\n      maxTokens: 32000,\n      system: systemPrompt,\n      log: log as any,\n    });\n    return { content: result.content, provider: "anthropic", model: "claude-sonnet-4-6" };\n  } catch (error) {\n    if (stopOnBudgetOrBilling(error)) throw error;\n    log.info({ err: error, provider: "anthropic" }, "Anthropic indisponível sem erro financeiro — tentando OpenAI pelo Gateway");\n  }\n\n  const openaiMessages = [\n    { role: "system" as const, content: systemPrompt },\n    ...messages.map((message) => ({ role: message.role, content: message.content })),\n  ];\n\n  try {\n    const result = await gatewayCallOpenAI(tenantId, "site_generator", openaiMessages, {\n      model: "gpt-5.6-terra",\n      maxTokens: 32000,\n      log: log as any,\n    });\n    return { content: result.content, provider: "openai", model: "gpt-5.6-terra" };\n  } catch (error) {\n    if (stopOnBudgetOrBilling(error)) throw error;\n    log.info({ err: error, provider: "openai" }, "gpt-5.6-terra indisponível sem erro financeiro — tentando gpt-4o-mini pelo Gateway");\n  }\n\n  try {\n    const result = await gatewayCallOpenAI(tenantId, "site_generator", openaiMessages, {\n      model: "gpt-4o-mini",\n      maxTokens: 16000,\n      log: log as any,\n    });\n    return { content: result.content, provider: "openai", model: "gpt-4o-mini" };\n  } catch (error) {\n    if (stopOnBudgetOrBilling(error)) throw error;\n    log.info({ err: error, provider: "openai" }, "Nenhum provedor operacional disponível para o gerador de sites");\n    throw new Error("Geração temporariamente indisponível. Tente novamente em alguns minutos.");\n  }\n}\n\nrouter.get("/tenants/:tenantId/site-generator/latest"`,
      );

      return { contents, loader: "ts" };
    });
  },
};

// Guard central de custo. Corrige a medição Anthropic em streaming, não soma
// falhas como gasto, bloqueia tenants sem franquia configurada e proíbe fallback
// para outro provedor quando a origem do 429 é billing/crédito.
const aiCostSafetyPlugin = {
  name: "ai-cost-safety",
  setup(build) {
    const target = path.resolve(artifactDir, "src/lib/ai-gateway.ts");
    build.onLoad({ filter: /ai-gateway\.ts$/ }, async (args) => {
      if (path.resolve(args.path) !== target) return null;
      let contents = await readFile(args.path, "utf8");

      const replaceExact = (from, to, label) => {
        const first = contents.indexOf(from);
        if (first < 0 || contents.indexOf(from, first + from.length) >= 0) {
          throw new Error(`AI cost safety guard failed (${label})`);
        }
        contents = contents.replace(from, to);
      };

      replaceExact(
        `  const creditsUsd = Number(tenant.aiCreditsUsd ?? 0);\n\n  // 5b. Platform-subsidized mode: tenant has no plan and no credits but the`,
        `  const creditsUsd = Number(tenant.aiCreditsUsd ?? 0);\n\n  // Segurança financeira: chave compartilhada nunca opera sem uma franquia\n  // mensal do plano ou saldo extra comprado pelo tenant.\n  if (quotaUsd === null && creditsUsd <= 0) {\n    return {\n      ok: false,\n      reason: "Limite mensal de IA não configurado para este tenant. Selecione um plano ou compre créditos antes de usar a IA compartilhada.",\n      httpStatus: 402,\n      details: { quotaUsd: null, creditsUsd: 0, spentThisMonthUsd: 0, dailySpendUsd: dailySpend },\n    };\n  }\n\n  // 5b. Platform-subsidized mode: tenant has no plan and no credits but the`,
        "block unconfigured tenant",
      );

      replaceExact(
        `        eq(aiUsageLogsTable.tenantId, tenantId as string),\n        gte(aiUsageLogsTable.createdAt, startOfMonth),`,
        `        eq(aiUsageLogsTable.tenantId, tenantId as string),\n        eq(aiUsageLogsTable.success, true),\n        eq(aiUsageLogsTable.usedByok, false),\n        gte(aiUsageLogsTable.createdAt, startOfMonth),`,
        "monthly successful shared usage only",
      );

      replaceExact(
        `    if (quota.ok && !quota.usedByok) await incrementDailySpend(tenantId, costUsdEst);`,
        `    // Falha do provedor não é gasto confirmado e não entra no teto diário.`,
        "failed OpenAI daily spend",
      );

      replaceExact(
        `    // 429 quota exceeded → attempt Anthropic fallback if key available\n    if (err?.status === 429 && process.env["ANTHROPIC_API_KEY"]) {`,
        `    // 429 transitório pode usar fallback. Billing/crédito nunca troca de provedor,\n    // evitando drenar o segundo saldo quando o primeiro está esgotado.\n    const billingOrCreditError = /no credits|credit balance|billing|insufficient_quota|credit_balance_exhausted|quota exhausted/i.test(errorMessage ?? "");\n    if (err?.status === 429 && !billingOrCreditError && process.env["ANTHROPIC_API_KEY"]) {`,
        "no billing fallback",
      );

      replaceExact(
        `      if (event.type === "message_delta" && (event.delta as any)?.usage) {\n        outputTokens = (event.delta as any).usage.output_tokens ?? outputTokens;\n      }`,
        `      if (event.type === "message_delta" && (event as any)?.usage) {\n        outputTokens = (event as any).usage.output_tokens ?? outputTokens;\n      }`,
        "Anthropic streamed output usage",
      );

      replaceExact(
        `  // 7. Update daily spend\n  if (!key.usedByok) {\n    await incrementDailySpend(tenantId, costUsd);\n  }\n\n  if (!success) {`,
        `  // 7. Update daily spend somente para chamada concluída com a chave compartilhada.\n  if (success && !key.usedByok) {\n    await incrementDailySpend(tenantId, costUsd);\n  }\n\n  if (!success) {`,
        "Anthropic successful spend only",
      );

      return { contents, loader: "ts" };
    });
  },
};

// Hotfix restrito às duas rotas que ainda carregam a URL antiga do Asaas.
// A API oficial usa /v3/myAccount; /api/v3/myAccount retorna 404. O transform
// é guardado por arquivo e falha o build se o trecho esperado deixar de existir,
// para que esta correção não masque mudanças futuras no código-fonte.
const asaasMyAccountUrlHotfixPlugin = {
  name: "asaas-my-account-url-hotfix",
  setup(build) {
    const targets = new Set([
      path.resolve(artifactDir, "src/routes/onboarding.ts"),
      path.resolve(artifactDir, "src/routes/changelog.ts"),
    ]);
    const from = "https://api.asaas.com/api/v3/myAccount";
    const to = "https://api.asaas.com/v3/myAccount";

    build.onLoad({ filter: /(?:onboarding|changelog)\.ts$/ }, async (args) => {
      const target = path.resolve(args.path);
      if (!targets.has(target)) return null;

      const contents = await readFile(args.path, "utf8");
      const first = contents.indexOf(from);
      if (first < 0 || contents.indexOf(from, first + from.length) >= 0) {
        throw new Error(`Asaas myAccount hotfix guard failed for: ${target}`);
      }

      return { contents: contents.replace(from, to), loader: "ts" };
    });
  },
};

// Migração comercial Growth: a franquia de conteúdo agora é única (200 por
// ciclo), aceita pacotes persistentes de +200 e nunca converte falta de saldo
// em falha da fila. Os dois arquivos legados ainda continham limites por plano;
// este transform é deliberadamente guardado até a refatoração direta deles.
const contentGenerationAllowancePlugin = {
  name: "growth-content-generation-allowance",
  setup(build) {
    const contentRoute = path.resolve(artifactDir, "src/routes/content.ts");
    const autoProduction = path.resolve(artifactDir, "src/services/media-plan-auto-production.ts");
    const oldLimits = `const PLAN_LIMITS: Record<string, number> = {\n  starter: 20,\n  growth: 150,\n  enterprise: 200,\n};\n`;

    const replaceExact = (contents, from, to, label) => {
      const first = contents.indexOf(from);
      if (first < 0 || contents.indexOf(from, first + from.length) >= 0) {
        throw new Error(`Growth generation allowance guard failed (${label})`);
      }
      return contents.replace(from, to);
    };

    const replaceRegex = (contents, regex, to, label) => {
      const match = contents.match(regex);
      if (!match) throw new Error(`Growth generation allowance guard failed (${label})`);
      return contents.replace(regex, to);
    };

    build.onLoad({ filter: /(?:content|media-plan-auto-production)\.ts$/ }, async (args) => {
      const target = path.resolve(args.path);
      if (target !== contentRoute && target !== autoProduction) return null;
      let contents = await readFile(args.path, "utf8");
      contents = replaceExact(contents, oldLimits, "", `${path.basename(target)} old limits`);

      if (target === contentRoute) {
        contents = replaceExact(
          contents,
          'import { ObjectStorageService } from "../lib/objectStorage.js";',
          'import { ObjectStorageService } from "../lib/objectStorage.js";\nimport { consumeContentGenerationCredit, getContentGenerationAllowance } from "../services/content-generation-allowance.js";',
          "content import",
        );
        contents = replaceRegex(
          contents,
          /async function getMonthlyUsage\([\s\S]*?\n}\n\nrouter\.post\("\/tenants\/:tenantId\/content\/generate"/,
          `async function getMonthlyUsage(tenantId: string) {\n  const allowance = await getContentGenerationAllowance(tenantId);\n  return {\n    used: allowance.baseUsed,\n    limit: allowance.baseLimit,\n    configId: allowance.configId,\n    available: allowance.available,\n    baseRemaining: allowance.baseRemaining,\n    extraRemaining: allowance.extraRemaining,\n    extraPurchased: allowance.extraPurchased,\n    packSize: allowance.packSize,\n    packPriceBrl: allowance.packPriceBrl,\n  };\n}\n\nrouter.post("/tenants/:tenantId/content/generate"`,
          "content getMonthlyUsage",
        );
        contents = replaceExact(
          contents,
          "  const { used, limit, configId } = await getMonthlyUsage(tenantId);",
          "  const usage = await getMonthlyUsage(tenantId);\n  const { used, limit, configId } = usage;",
          "content usage",
        );
        contents = replaceExact(
          contents,
          `  if (used >= limit) {\n    res.status(402).json({\n      error: \`Limite mensal de \${limit} gerações atingido. Upgrade de plano para gerar mais conteúdo.\`,\n      monthlyUsed: used,\n      monthlyLimit: limit,\n    });\n    return;\n  }`,
          `  if (usage.available <= 0) {\n    res.status(402).json({\n      error: "Franquia de gerações esgotada. Os itens restantes permanecem pendentes até a renovação ou compra de um pacote extra.",\n      monthlyUsed: used,\n      monthlyLimit: limit,\n      baseRemaining: usage.baseRemaining,\n      extraRemaining: usage.extraRemaining,\n      availableGenerations: usage.available,\n      canPurchaseGenerations: true,\n      generationPackSize: usage.packSize,\n      generationPackPrice: usage.packPriceBrl,\n    });\n    return;\n  }`,
          "content quota response",
        );
        contents = replaceExact(
          contents,
          "  let saved: typeof contentGenerationsTable.$inferSelect | undefined;",
          "  let quotaExhausted = false;\n  let saved: typeof contentGenerationsTable.$inferSelect | undefined;",
          "content quota flag",
        );
        contents = replaceExact(
          contents,
          `    if (configId) {\n      await db\n        .update(agentConfigsTable)\n        .set({ contentGenerationsThisMonth: used + 1 })\n        .where(eq(agentConfigsTable.id, configId));\n    }`,
          `    if (configId) {\n      const consumed = await consumeContentGenerationCredit(tenantId).catch(() => null);\n      if (!consumed) {\n        await db.delete(contentGenerationsTable).where(eq(contentGenerationsTable.id, row.id)).catch(() => undefined);\n        saved = undefined;\n        quotaExhausted = true;\n      }\n    }`,
          "content consume",
        );
        contents = replaceExact(
          contents,
          `  } catch (dbErr) {\n    req.log.error({ err: dbErr }, "content: failed to persist generation — returning result without saving");\n  }\n\n  res.json(saved\n    ? { ...saved, contextSources: libraryContext.sources }\n    : { id: null, tenantId, type, theme, result: finalResult, tokensUsed: result.tokensUsed, contextSources: libraryContext.sources });`,
          `  } catch (dbErr) {\n    req.log.error({ err: dbErr }, "content: failed to persist generation — returning result without saving");\n  }\n\n  if (quotaExhausted) {\n    res.status(402).json({\n      error: "Franquia de gerações esgotada. O conteúdo não foi debitado nem mantido; a fila continua pendente.",\n      monthlyUsed: limit,\n      monthlyLimit: limit,\n      availableGenerations: 0,\n      canPurchaseGenerations: true,\n      generationPackSize: usage.packSize,\n      generationPackPrice: usage.packPriceBrl,\n    });\n    return;\n  }\n\n  res.json(saved\n    ? { ...saved, contextSources: libraryContext.sources }\n    : { id: null, tenantId, type, theme, result: finalResult, tokensUsed: result.tokensUsed, contextSources: libraryContext.sources });`,
          "content exhausted after race",
        );
        contents = replaceExact(
          contents,
          `  res.json({\n    items,\n    monthlyUsed: usage.used,\n    monthlyLimit: usage.limit,\n  });`,
          `  res.json({\n    items,\n    monthlyUsed: usage.used,\n    monthlyLimit: usage.limit,\n    baseRemaining: usage.baseRemaining,\n    extraRemaining: usage.extraRemaining,\n    extraPurchased: usage.extraPurchased,\n    availableGenerations: usage.available,\n    canPurchaseGenerations: usage.available <= 0,\n    generationPackSize: usage.packSize,\n    generationPackPrice: usage.packPriceBrl,\n  });`,
          "content usage payload",
        );
      } else {
        contents = replaceExact(
          contents,
          'import { createVendorAiMediaGenerationJob } from "./vendorai-media-engine.js";',
          'import { createVendorAiMediaGenerationJob } from "./vendorai-media-engine.js";\nimport { consumeContentGenerationCredit, getContentGenerationAllowance } from "./content-generation-allowance.js";',
          "auto production import",
        );
        contents = replaceRegex(
          contents,
          /async function monthlyAllowance\(tenantId: string\) \{[\s\S]*?\n}\n\nasync function generateDraft/,
          `async function monthlyAllowance(tenantId: string) {\n  const allowance = await getContentGenerationAllowance(tenantId);\n  return {\n    allowed: allowance.available > 0,\n    configId: allowance.configId,\n    used: allowance.baseUsed + allowance.extraUsed,\n    limit: allowance.baseLimit + allowance.extraPurchased,\n  };\n}\n\nasync function generateDraft`,
          "auto production allowance",
        );
        contents = replaceExact(
          contents,
          `  await db.update(agentConfigsTable)\n    .set({ contentGenerationsThisMonth: allowance.used + 1 })\n    .where(eq(agentConfigsTable.id, allowance.configId));\n\n  return saved;`,
          `  const consumed = await consumeContentGenerationCredit(input.tenantId).catch(() => null);\n  if (!consumed) {\n    await db.delete(contentGenerationsTable)\n      .where(and(eq(contentGenerationsTable.id, saved.id), eq(contentGenerationsTable.tenantId, input.tenantId)))\n      .catch(() => undefined);\n    throw new Error(\`content_generation_limit:\${allowance.used}/\${allowance.limit}\`);\n  }\n\n  return saved;`,
          "auto production consume",
        );
      }

      return { contents, loader: "ts" };
    });
  },
};

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      siteGeneratorDescCollisionHotfixPlugin,
      aiCostSafetyPlugin,
      asaasMyAccountUrlHotfixPlugin,
      contentGenerationAllowancePlugin,
      workspaceVendorBrainPlugin,
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});