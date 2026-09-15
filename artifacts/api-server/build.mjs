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

// Hotfix restrito ao gerador de sites: a variável local `desc` colide com
// `desc()` do Drizzle apenas no caminho de e-commerce. O transform é guardado
// e falha o build se o trecho esperado mudar, evitando correções silenciosas
// ou aplicação em arquivos não relacionados.
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
          `  } catch (dbErr) {\n    req.log.error({ err: dbErr }, "content: failed to persist generation — returning result without saving");\n  }\n\n  res.json(saved ?? { id: null, tenantId, type, theme, result: finalResult, tokensUsed: result.tokensUsed });`,
          `  } catch (dbErr) {\n    req.log.error({ err: dbErr }, "content: failed to persist generation — returning result without saving");\n  }\n\n  if (quotaExhausted) {\n    res.status(402).json({\n      error: "Franquia de gerações esgotada. O conteúdo não foi debitado nem mantido; a fila continua pendente.",\n      monthlyUsed: limit,\n      monthlyLimit: limit,\n      availableGenerations: 0,\n      canPurchaseGenerations: true,\n      generationPackSize: usage.packSize,\n      generationPackPrice: usage.packPriceBrl,\n    });\n    return;\n  }\n\n  res.json(saved ?? { id: null, tenantId, type, theme, result: finalResult, tokensUsed: result.tokensUsed });`,
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
