import { chromium, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MEDIA_BASE_URL || "https://app.appvendorai.com";
const MEDIA_EMAIL = process.env.MEDIA_EMAIL;
const MEDIA_PASSWORD = process.env.MEDIA_PASSWORD;
const MEDIA_AUTH_TOKEN = process.env.MEDIA_AUTH_TOKEN;
const TENANT_ID = process.env.MEDIA_TENANT_ID || "70ea6eb6-ffd8-4dc6-9224-d628a6d4e67d";
const OUTPUT_ROOT = process.env.MEDIA_OUTPUT_DIR || path.resolve(process.cwd(), "media-output");

async function getToken(context: BrowserContext, page: Page): Promise<string> {
  if (MEDIA_AUTH_TOKEN) return MEDIA_AUTH_TOKEN;
  if (!MEDIA_EMAIL || !MEDIA_PASSWORD) {
    throw new Error("Defina MEDIA_AUTH_TOKEN ou MEDIA_EMAIL + MEDIA_PASSWORD.");
  }
  const response = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: MEDIA_EMAIL, password: MEDIA_PASSWORD },
  });
  if (!response.ok()) throw new Error(`Login falhou: ${response.status()}`);
  const body = await response.json();
  return body.token as string;
}

async function switchTenant(context: BrowserContext, token: string): Promise<string> {
  const response = await context.request.post(`${BASE_URL}/api/auth/switch-tenant`, {
    data: { targetTenantId: TENANT_ID },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok()) {
    const body = await response.json();
    return body.token as string;
  }
  return token;
}

async function authenticate(context: BrowserContext, page: Page) {
  const token = await switchTenant(context, await getToken(context, page));
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token }) => localStorage.setItem("vendorai_token", token), { token });
}

async function settle(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function gentleTour(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = await page.evaluate(() => window.innerHeight);
  if (height > viewport + 120) {
    await page.evaluate(() => window.scrollTo({ top: Math.min(window.innerHeight * 0.65, document.documentElement.scrollHeight), behavior: "smooth" }));
    await page.waitForTimeout(1400);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(1200);
  }
}

async function record(name: string, routes: string[], action?: (page: Page) => Promise<void>) {
  const rawDir = path.join(OUTPUT_ROOT, "videos", "raw");
  const finalDir = path.join(OUTPUT_ROOT, "videos");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(finalDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: rawDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  await authenticate(context, page);

  for (const route of routes) {
    await settle(page, route);
    await gentleTour(page);
  }
  if (action) await action(page);
  await page.waitForTimeout(1200);

  const video = page.video();
  await page.close();
  const sourcePath = video ? await video.path() : null;
  await context.close();
  await browser.close();
  if (sourcePath) await fs.rename(sourcePath, path.join(finalDir, `${name}.webm`));
}

await record("crm-demo", ["/leads", "/deals", "/conversations", "/agenda"]);
await record("prospector-demo", ["/app/prospector"]);
await record("revenue-scout-demo", ["/scout", "/scout/oportunidades"]);
await record("financeiro-erp-demo", ["/erp"]);
await record("jarvis-demo", ["/"], async (page) => {
  const launcher = page.locator('button[aria-label="Abrir JARVIS"]');
  if (await launcher.count()) {
    await launcher.first().click();
    await page.waitForTimeout(1800);
  }
});
