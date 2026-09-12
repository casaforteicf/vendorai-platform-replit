import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const host = "appvendorai.com";
const baseUrl = `https://${host}`;
const indexNowKey = crypto
  .createHash("sha256")
  .update("appvendorai.com:indexnow:vendorai")
  .digest("hex");
const keyLocation = `${baseUrl}/${indexNowKey}.txt`;

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
}

function collectUrlsFromSitemap(filePath, visited = new Set()) {
  const resolved = path.resolve(filePath);
  if (visited.has(resolved) || !fs.existsSync(resolved)) return [];
  visited.add(resolved);

  const xml = fs.readFileSync(resolved, "utf8");
  const locs = extractLocs(xml);
  if (/<sitemapindex\b/i.test(xml)) {
    return locs.flatMap((loc) => {
      try {
        const url = new URL(loc);
        if (url.hostname !== host) return [];
        return collectUrlsFromSitemap(path.join(outDir, path.basename(url.pathname)), visited);
      } catch {
        return [];
      }
    });
  }

  return locs.filter((loc) => {
    try {
      const url = new URL(loc);
      return url.hostname === host && url.protocol === "https:" && !url.search && !url.hash;
    } catch {
      return false;
    }
  });
}

const sitemapPath = path.join(outDir, "sitemap.xml");
const urls = [...new Set(collectUrlsFromSitemap(sitemapPath))];
if (!urls.length) {
  throw new Error("IndexNow aborted: no canonical URLs found in final sitemap");
}

const payload = {
  host,
  key: indexNowKey,
  keyLocation,
  urlList: urls,
};

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

const body = await response.text();
if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow submission failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 500)}` : ""}`);
}

console.log(`[indexnow] submitted ${urls.length} canonical URLs; HTTP ${response.status}${response.status === 202 ? " (accepted, key validation pending)" : ""}`);
