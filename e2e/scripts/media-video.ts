import { chromium, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MEDIA_BASE_URL || "https://app.appvendorai.com";
const MEDIA_AUTH_TOKEN = process.env.MEDIA_AUTH_TOKEN;
const OUTPUT_ROOT = process.env.MEDIA_OUTPUT_DIR || path.resolve(process.cwd(), "media-output");

type DemoSession = { token: string; user?: unknown };
let sharedSession: DemoSession | undefined = MEDIA_AUTH_TOKEN ? { token: MEDIA_AUTH_TOKEN } : undefined;

async function getSession(context: BrowserContext): Promise<DemoSession> {
  if (sharedSession) return sharedSession;

  const response = await context.request.post(`${BASE_URL}/api/auth/demo-login`, {
    data: { email: "demo", password: "demo" },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login demo falhou (${response.status()}): ${body.slice(0, 300)}`);
  }
  const body = await response.json();
  sharedSession = { token: body.token as string, user: body.user };
  return sharedSession;
}

async function authenticate(context: BrowserContext, page: Page) {
  const session = await getSession(context);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("vendorai_token", token);
    if (user) localStorage.setItem("vendorai_user_cache", JSON.stringify(user));
    sessionStorage.setItem("vendorai_demo_session", "active");
  }, session);
}

async function waitForRealContent(page: Page) {
  await page.waitForFunction(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return text.length >= 80;
  }, undefined, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
}

async function settle(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await waitForRealContent(page);
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
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: {} }));
  });
  await page.waitForTimeout(1800);
});
