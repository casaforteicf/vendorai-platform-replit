import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const verticalSourcePath = path.resolve(repoRoot, "lib/vendor-brain/src/marketing-verticals.ts");
const localizationSourcePath = path.resolve(repoRoot, "lib/vendor-brain/src/marketing-verticals-localization.ts");
const slugOverridesPath = path.resolve(siteRoot, "src/data/publicVerticalSlugs.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const verticalSource = fs.readFileSync(verticalSourcePath, "utf8");
const localizationSource = fs.readFileSync(localizationSourcePath, "utf8");
const slugOverrides = JSON.parse(fs.readFileSync(slugOverridesPath, "utf8"));

function capture(block, key) {
  return block.match(new RegExp(`${key}:\\s*'([^']*)'`))?.[1]?.trim() || "";
}

function captureArray(block, key) {
  const body = block.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`))?.[1] || "";
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1].trim()).filter(Boolean);
}

function parseVerticals(source) {
  const starts = [...source.matchAll(/\bv\(\{\s*id:'([^']+)'/g)];
  const result = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const block = source.slice(start.index ?? 0, starts[index + 1]?.index ?? source.length);
    const id = start[1];
    const name = capture(block, "name");
    const semanticSlug = capture(block, "slug");
    const macrosegment = capture(block, "macrosegment");
    const corePain = capture(block, "corePain");
    const promise = capture(block, "promise");
    const googleIntentSeeds = captureArray(block, "googleIntentSeeds");
    if (!id || !name || !semanticSlug) continue;
    result.push({ id, name, semanticSlug, macrosegment, corePain, promise, googleIntentSeeds });
  }
  return result;
}

function parseSpanishCopy(source) {
  const startIndex = source.indexOf("const ES_COPY");
  const endIndex = source.indexOf("export function localizeMarketingVertical");
  const section = source.slice(startIndex >= 0 ? startIndex : 0, endIndex > startIndex ? endIndex : source.length);
  const starts = [...section.matchAll(/\n\s*'([^']+)':\s*\{/g)];
  const result = {};
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const block = section.slice(match.index ?? 0, starts[index + 1]?.index ?? section.length);
    const id = match[1];
    const name = capture(block, "name");
    const corePain = capture(block, "corePain");
    const promise = capture(block, "promise");
    if (name) result[id] = { name, corePain, promise };
  }
  return result;
}

function compact(value = "", max = 158) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const shortened = normalized.slice(0, max - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > max * 0.75 ? lastSpace : shortened.length).trim()}…`;
}

function titleFor(name, spanish = false) {
  const title = spanish ? `CRM con IA para ${name} | VendorAI` : `CRM com IA para ${name} | VendorAI`;
  if (title.length <= 68) return title;
  const compactTitle = spanish ? `${name} — CRM e IA | VendorAI` : `${name} — CRM e IA | VendorAI`;
  return compactTitle.length <= 68 ? compactTitle : `${compactTitle.slice(0, 67).trimEnd()}…`;
}

function descriptionFor(name, promise, corePain, spanish = false) {
  const benefit = promise || corePain;
  if (spanish) {
    return compact(`CRM e IA para ${name}. ${benefit} Pipeline, seguimiento, agentes de IA y Revenue Scout conectados en una sola jornada comercial.`);
  }
  return compact(`CRM e IA para ${name}. ${benefit} Pipeline, follow-up, agentes de IA e Revenue Scout conectados em uma única jornada comercial.`);
}

const verticals = parseVerticals(verticalSource);
const esCopy = parseSpanishCopy(localizationSource);

if (verticals.length !== 50) {
  throw new Error(`[vertical-seo] expected 50 verticals, found ${verticals.length}`);
}

let updated = 0;
for (const vertical of verticals) {
  const publicSlug = slugOverrides[vertical.id] ?? vertical.semanticSlug;
  const pathname = `/lp/${publicSlug}`;
  const route = manifest.routes?.find((item) => item.pathname === pathname);
  if (!route) throw new Error(`[vertical-seo] missing public route ${pathname}`);

  const spanish = esCopy[vertical.id];
  if (!spanish?.name) throw new Error(`[vertical-seo] missing Spanish copy for ${vertical.id}`);

  route.title = titleFor(vertical.name);
  route.description = descriptionFor(vertical.name, vertical.promise, vertical.corePain);
  route.name = vertical.name;
  route.esTitle = titleFor(spanish.name, true);
  route.esDescription = descriptionFor(spanish.name, spanish.promise, spanish.corePain, true);
  route.primaryKeyword = vertical.googleIntentSeeds[0] || `CRM ${vertical.name}`;
  route.secondaryKeywords = vertical.googleIntentSeeds.slice(1);
  route.verticalId = vertical.id;
  route.macrosegment = vertical.macrosegment;

  if (manifest.verticals?.[publicSlug]) {
    manifest.verticals[publicSlug] = {
      ...manifest.verticals[publicSlug],
      title: vertical.name,
      description: route.description,
      esTitle: route.esTitle,
      esDescription: route.esDescription,
      primaryKeyword: route.primaryKeyword,
      secondaryKeywords: route.secondaryKeywords,
    };
  }
  updated += 1;
}

if (updated !== 50) throw new Error(`[vertical-seo] expected to enrich 50 routes, enriched ${updated}`);

const paths = verticals.map((vertical) => `/lp/${slugOverrides[vertical.id] ?? vertical.semanticSlug}`);
if (new Set(paths).size !== 50) throw new Error("[vertical-seo] public vertical paths are not unique");

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[vertical-seo] enriched ${updated} vertical routes with PT/ES metadata and search intent`);
