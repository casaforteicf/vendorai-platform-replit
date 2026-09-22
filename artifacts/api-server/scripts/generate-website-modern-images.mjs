import { access, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mediaRoot = resolve(scriptDir, "../../website/public/media/vendorai-official");
const CONCURRENCY = 4;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectPngFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPngFiles(absolute)));
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".png") {
      files.push(absolute);
    }
  }

  return files;
}

function webpPath(sourcePath) {
  return sourcePath.slice(0, -extname(sourcePath).length) + ".webp";
}

async function convert(source) {
  const output = webpPath(source);
  const sourceStat = await stat(source);
  const outputExists = await exists(output);
  const outputStat = outputExists ? await stat(output) : null;

  if (!outputStat || outputStat.mtimeMs < sourceStat.mtimeMs) {
    await sharp(source)
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toFile(output);
  }

  const finalStat = await stat(output);
  return {
    sourceBytes: sourceStat.size,
    modernBytes: finalStat.size,
    relativePath: relative(mediaRoot, source),
  };
}

const sources = await collectPngFiles(mediaRoot);
let originalBytes = 0;
let modernBytes = 0;
let converted = 0;

for (let index = 0; index < sources.length; index += CONCURRENCY) {
  const batch = sources.slice(index, index + CONCURRENCY);
  const results = await Promise.all(batch.map(convert));

  for (const result of results) {
    originalBytes += result.sourceBytes;
    modernBytes += result.modernBytes;
    converted += 1;
  }
}

const savedBytes = Math.max(0, originalBytes - modernBytes);
const savedPercent = originalBytes > 0 ? ((savedBytes / originalBytes) * 100).toFixed(1) : "0.0";
const kb = (bytes) => (bytes / 1024).toFixed(1);

console.log(
  `[modern-images] ${converted} arquivos oficiais: ${kb(originalBytes)} KB PNG -> ${kb(modernBytes)} KB WebP (${savedPercent}% menor)`,
);
