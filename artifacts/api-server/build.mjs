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
