import { stat, access } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mediaRoot = resolve(scriptDir, "../../website/public/media/vendorai-official");

const sources = [
  "crm-pipeline/desktop-1440.png",
  "crm-pipeline/mobile-390.png",
  "prospector/desktop-1440.png",
  "prospector/mobile-390.png",
  "omnichannel/desktop-1440.png",
  "omnichannel/mobile-390.png",
  "revenue-scout/desktop-1440.png",
  "revenue-scout/mobile-390.png",
  "jarvis/desktop-aberto.png",
  "agenda/desktop-1440.png",
  "agenda/mobile-390.png",
  "analytics/desktop-1440.png",
  "analytics/mobile-390.png",
  "financeiro-erp/desktop-1440.png",
  "financeiro-erp/mobile-390.png",
];

function webpPath(sourcePath) {
  return sourcePath.slice(0, -extname(sourcePath).length) + ".webp";
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let originalBytes = 0;
let modernBytes = 0;
let converted = 0;

for (const relativePath of sources) {
  const source = resolve(mediaRoot, relativePath);
  if (!(await exists(source))) {
    console.warn(`[modern-images] fonte ausente: ${relativePath}`);
    continue;
  }

  const output = webpPath(source);
  const sourceStat = await stat(source);
  const outputExists = await exists(output);
  const outputStat = outputExists ? await stat(output) : null;

  if (!outputStat || outputStat.mtimeMs < sourceStat.mtimeMs) {
    await sharp(source)
      .webp({ quality: 88, effort: 6, smartSubsample: true })
      .toFile(output);
  }

  const finalStat = await stat(output);
  originalBytes += sourceStat.size;
  modernBytes += finalStat.size;
  converted += 1;
}

const savedBytes = Math.max(0, originalBytes - modernBytes);
const savedPercent = originalBytes > 0 ? ((savedBytes / originalBytes) * 100).toFixed(1) : "0.0";
const kb = (bytes) => (bytes / 1024).toFixed(1);

console.log(
  `[modern-images] ${converted} arquivos: ${kb(originalBytes)} KB PNG -> ${kb(modernBytes)} KB WebP (${savedPercent}% menor)`,
);
