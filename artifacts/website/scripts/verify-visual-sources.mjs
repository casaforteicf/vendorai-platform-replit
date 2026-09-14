import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const websiteRoot = resolve(process.cwd());
const sourceRoot = join(websiteRoot, "src");
const siteGenerator = resolve(websiteRoot, "../api-server/src/routes/site_config.ts");
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const forbidden = [
  "images.unsplash.com",
  "source.unsplash.com",
  "images.pexels.com",
  "pexels.com/photo",
];

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (allowedExtensions.has(extname(entry.name))) files.push(full);
  }
  return files;
}

const files = [...await collect(sourceRoot), siteGenerator];
const violations = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const token of forbidden) {
    if (text.includes(token)) {
      violations.push(`${relative(websiteRoot, file)} -> ${token}`);
    }
  }
}

if (violations.length) {
  console.error("[visual-sources] External random stock is not allowed in public LPs/site generator:");
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`[visual-sources] OK: ${files.length} source files checked; no random Unsplash/Pexels sources.`);
