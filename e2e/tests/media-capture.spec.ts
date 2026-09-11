import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MEDIA_BASE_URL || "https://app.appvendorai.com";
const MEDIA_AUTH_TOKEN = process.env.MEDIA_AUTH_TOKEN;
const OUTPUT_ROOT = process.env.MEDIA_OUTPUT_DIR || path.resolve(process.cwd(), "media-output");

type DemoSession = { token: string; user?: unknown };
let sharedSession: DemoSession | undefined = MEDIA_AUTH_TOKEN ? { token: MEDIA_AUTH_TOKEN } : undefined;

const screens = [
  { key: "crm-leads", path: "/leads" },
  { key: "crm-pipeline", path: "/deals" },
  { key: "omnichannel", path: "/conversations" },
  { key: "agenda", path: "/agenda" },
  { key: "prospector", path: "/app/prospector" },
  { key: "revenue-scout", path: "/scout" },
  { key: "revenue-opportunities", path: "/scout/oportunidades" },
  { key: "financeiro-erp", path: "/erp" },
  { key: "catalogo", path: "/catalogo" },
  { key: "analytics", path: "/analytics" },
] as const;

async function getSession(page: Page): Promise<DemoSession> {
  if (sharedSession) return sharedSession;

  const response = await page.request.post(`${BASE_URL}/api/auth/demo-login`, {
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

async function authenticate(page: Page): Promise<void> {
  const session = await getSession(page);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("vendorai_token", token);
    if (user) localStorage.setItem("vendorai_user_cache", JSON.stringify(user));
    sessionStorage.setItem("vendorai_demo_session", "active");
  }, session);
}

async function waitForRealContent(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const hasAppContent = text.length >= 80;
    const looksLikeLogin = /entrar|login|senha/i.test(text) && text.length < 500;
    return hasAppContent && !looksLikeLogin;
  }, undefined, { timeout: 30_000 });

  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function prepareVisual(page: Page, targetPath: string): Promise<void> {
  await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: "domcontentloaded" });
  await waitForRealContent(page);
  await page.evaluate(() => {
    document.querySelectorAll('[data-radix-toast-viewport], [role="dialog"][data-state="closed"]').forEach((el) => el.remove());
    window.scrollTo(0, 0);
  });
}

async function saveScreenshot(page: Page, module: string, variant: string): Promise<void> {
  const textLength = await page.evaluate(() => (document.body?.innerText || "").trim().length);
  if (textLength < 80) throw new Error(`Captura recusada: ${module}/${variant} ainda não contém conteúdo real`);

  const dir = path.join(OUTPUT_ROOT, module);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${variant}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

for (const screen of screens) {
  test(`captura ${screen.key} desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await prepareVisual(page, screen.path);
    await saveScreenshot(page, screen.key, "desktop-1440");
  });

  test(`captura ${screen.key} mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareVisual(page, screen.path);
    await saveScreenshot(page, screen.key, "mobile-390");
  });
}

test("captura JARVIS oficial aberto", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepareVisual(page, "/");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: {} }));
  });
  const panel = page.locator('[aria-label="JARVIS"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  await saveScreenshot(page, "jarvis", "desktop-aberto");
});
