import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { readFile, rm } from "node:fs/promises";

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

// Hotfixes restritos ao gerador de sites. Cada alteração é guardada por
// correspondência exata; se o fonte mudar, o build falha em vez de aplicar
// uma transformação silenciosa em código incorreto.
const siteGeneratorSafeHotfixPlugin = {
  name: "site-generator-safe-hotfix",
  setup(build) {
    const target = path.resolve(artifactDir, "src/routes/site_generator_core.ts");
    build.onLoad({ filter: /site_generator_core\.ts$/ }, async (args) => {
      if (path.resolve(args.path) !== target) return null;

      let contents = await readFile(args.path, "utf8");
      const replacements = [
        [
          '  const { type, name, sector, desc, pain, tone, color, cta, logoUrl, products = [], whatsapp, instagram, images = [], videos = [], servicos, headline, nicheName, productNames = [] } = config;',
          '  const { type, name, sector, desc, pain, tone, color, cta, logoUrl, products = [], whatsapp, instagram, images = [], videos = [], servicos, headline, nicheName, productNames = [] } = config;\n  const contactEmail = String((config as SiteGeneratorConfig & { email?: string }).email ?? "").trim();',
        ],
        [
          'WhatsApp de contato: wa.me/${waNumber}${igHandle ? `\\nInstagram: ${igUrl} (handle: @${igHandle})` : ""}',
          'WhatsApp de contato: wa.me/${waNumber}${contactEmail ? `\\nEmail oficial: ${contactEmail}` : ""}${igHandle ? `\\nInstagram: ${igUrl} (handle: @${igHandle})` : ""}',
        ],
        [
          '    const desc = config.desc || bp?.diferenciais || bp?.publicoAlvo || "";',
          '    const businessDescription = config.desc || bp?.diferenciais || bp?.publicoAlvo || "";',
        ],
        [
          '        logoUrl: businessProfilesTable.logoUrl,',
          '        logoUrl: businessProfilesTable.logoUrl,\n        telefone: businessProfilesTable.telefone,\n        email: businessProfilesTable.email,\n        instagramUrl: businessProfilesTable.instagramUrl,',
        ],
        [
          '    const logoUrl = config.logoUrl || bp?.logoUrl || undefined;',
          '    const logoUrl = config.logoUrl || bp?.logoUrl || undefined;\n    const whatsapp = config.whatsapp || bp?.telefone || undefined;\n    const instagram = config.instagram || bp?.instagramUrl || undefined;\n    const email = String((config as SiteGeneratorConfig & { email?: string }).email || bp?.email || "").trim() || undefined;',
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
          '    const enrichedConfig = { ...config, name, sector, desc: businessDescription, logoUrl: absoluteLogoUrl, products: absoluteProducts, images: absoluteImages, videos: absoluteVideos, whatsapp, instagram, email } as SiteGeneratorConfig & { email?: string };',
        ],
        [
          '    const prompt = buildGeneratePrompt(enrichedConfig);',
          '    if (config.type === "ecommerce" && absoluteProducts.length === 0) {\n      await persistGenerationJob(jobId, { status: "error", error: "Não há produtos ativos no catálogo para montar o e-commerce. Cadastre ou ative produtos e tente novamente.", createdAt: Date.now() });\n      return;\n    }\n\n    const prompt = buildGeneratePrompt(enrichedConfig);',
        ],
        [
          '    const requiredImagesResult = ensureRequiredImagesInHtml(html, absoluteImages, enrichedConfig.name);',
          '    if (config.type === "ecommerce") {\n      const normalizedHtml = html.toLocaleLowerCase("pt-BR");\n      const expectedNames = absoluteProducts.map((product) => product.name.trim()).filter(Boolean);\n      const productHits = expectedNames.filter((productName) => normalizedHtml.includes(productName.toLocaleLowerCase("pt-BR"))).length;\n      const minimumProductHits = Math.min(3, expectedNames.length);\n      const hasCommerceUi = /(carrinho|cart|comprar|finalizar pedido|adicionar ao carrinho)/i.test(html);\n      if (!hasCommerceUi || productHits < minimumProductHits) {\n        log.warn({ tenantId, productHits, minimumProductHits, hasCommerceUi }, "Site generator: ecommerce output looked like a landing page; retrying with strict commerce guard");\n        try {\n          const retry = await callAI([{ role: "user", content: `${prompt}\\n\\nCORREÇÃO OBRIGATÓRIA: a tentativa anterior não ficou com estrutura real de e-commerce. Gere uma LOJA, não uma landing page. O HTML precisa mostrar o grid de produtos reais do briefing, preços, ações de compra, carrinho funcional com JavaScript e checkout/finalização pelo WhatsApp. Não use métricas fictícias, depoimentos inventados nem seções de recuperação de leads no lugar do catálogo.` }], tenantId, log);\n          const retryHtml = extractHtmlSafe(retry.content, log);\n          if (isValidHtml(retryHtml)) {\n            const retryPrepared = prepareSiteHtml(retryHtml);\n            const retryNormalized = retryPrepared.html.toLocaleLowerCase("pt-BR");\n            const retryHits = expectedNames.filter((productName) => retryNormalized.includes(productName.toLocaleLowerCase("pt-BR"))).length;\n            const retryHasCommerceUi = /(carrinho|cart|comprar|finalizar pedido|adicionar ao carrinho)/i.test(retryPrepared.html);\n            if (retryPrepared.validation.valid && retryHasCommerceUi && retryHits >= minimumProductHits) html = retryPrepared.html;\n          }\n        } catch (retryError) {\n          log.warn({ retryError, tenantId }, "Site generator: strict ecommerce retry failed");\n        }\n\n        const finalNormalized = html.toLocaleLowerCase("pt-BR");\n        const finalHits = expectedNames.filter((productName) => finalNormalized.includes(productName.toLocaleLowerCase("pt-BR"))).length;\n        const finalHasCommerceUi = /(carrinho|cart|comprar|finalizar pedido|adicionar ao carrinho)/i.test(html);\n        if (!finalHasCommerceUi || finalHits < minimumProductHits) {\n          await persistGenerationJob(jobId, { status: "error", error: "A IA não conseguiu montar um e-commerce válido com os produtos do catálogo. Tente novamente; nenhum site incorreto foi salvo.", createdAt: Date.now() });\n          return;\n        }\n      }\n    }\n\n    const requiredImagesResult = ensureRequiredImagesInHtml(html, absoluteImages, enrichedConfig.name);',
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
      siteGeneratorSafeHotfixPlugin,
      workspaceVendorBrainPlugin,
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
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