import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const baseUrl = "https://appvendorai.com";
const indexNowKey = crypto
  .createHash("sha256")
  .update("appvendorai.com:indexnow:vendorai")
  .digest("hex");

const privatePaths = ["/login", "/app", "/admin", "/crm", "/tenants", "/settings", "/api"];
const robotsPath = path.join(outDir, "robots.txt");
const currentRobots = fs.existsSync(robotsPath)
  ? fs.readFileSync(robotsPath, "utf8").trim()
  : `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml`;

const oaiBlock = [
  "User-agent: OAI-SearchBot",
  "Allow: /",
  ...privatePaths.map((pathname) => `Disallow: ${pathname}`),
].join("\n");

const withoutOldOaiBlock = currentRobots
  .replace(/User-agent:\s*OAI-SearchBot[\s\S]*?(?=\nUser-agent:|\nSitemap:|$)/i, "")
  .trim();

fs.writeFileSync(robotsPath, `${oaiBlock}\n\n${withoutOldOaiBlock}\n`);

// O llms.txt oficial já vive em public/ e é copiado pelo Vite para o bundle.
// Preservamos esse conteúdo porque ele é a fonte editorial canônica usada pelos
// smoke tests GEO; esta etapa cuida apenas da descoberta/crawling adicional.
const llmsPath = path.join(outDir, "llms.txt");
if (!fs.existsSync(llmsPath)) {
  throw new Error("Search discovery aborted: canonical llms.txt is missing from the website bundle");
}
const llms = fs.readFileSync(llmsPath, "utf8");
if (!llms.startsWith("# VendorAI") || !llms.includes(`${baseUrl}/produtos/crm`)) {
  throw new Error("Search discovery aborted: canonical llms.txt failed integrity checks");
}

fs.writeFileSync(path.join(outDir, `${indexNowKey}.txt`), `${indexNowKey}\n`);

console.log(`[search-discovery] preserved canonical llms.txt, added OAI-SearchBot rules and wrote IndexNow key file ${indexNowKey}.txt`);
