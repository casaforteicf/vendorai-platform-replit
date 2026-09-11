import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MEDIA_BASE_URL || "https://app.appvendorai.com";
const MEDIA_EMAIL = process.env.MEDIA_EMAIL;
const MEDIA_PASSWORD = process.env.MEDIA_PASSWORD;
const MEDIA_AUTH_TOKEN = process.env.MEDIA_AUTH_TOKEN;
const TENANT_ID = process.env.MEDIA_TENANT_ID || "70ea6eb6-ffd8-4dc6-9224-d628a6d4e67d";
const OUTPUT_ROOT = process.env.MEDIA_OUTPUT_DIR || path.resolve(process.cwd(), "media-output");

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

async function getToken(page: Page): Promise<string> {
  if (MEDIA_AUTH_TOKEN) return MEDIA_AUTH_TOKEN;
  if (!MEDIA_EMAIL || !MEDIA_PASSWORD) {
    throw new Error("Defina MEDIA_AUTH_TOKEN ou MEDIA_EMAIL + MEDIA_PASSWORD para capturar mídia oficial.");
  }

  const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: MEDIA_EMAIL, password: MEDIA_PASSWORD },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.token as string;
}

async function switchTenantIfPossible(page: Page, token: string): Promise<string> {
  const me = await page.request.get(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (me.ok()) {
    const body = await me.json();
    if (body?.user?.tenantId === TENANT_ID || body?.tenantId === TENANT_ID) return token;
  }

  const response = await page.request.post(`${BASE_URL}/api/auth/switch-tenant`, {
    data: { targetTenantId: TENANT_ID },
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok()) {
    throw new Error(`Não foi possível acessar o tenant demo oficial (${response.status()}). Use uma credencial vinculada diretamente ao tenant ou habilite a troca de tenant.`);
  }
  const body = await response.json();
  return body.token as string;
}

async function authenticate(page: Page): Promise<void> {
  const token = await switchTenantIfPossible(page, await getToken(page));
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token }) => localStorage.setItem("vendorai_token", token), { token });
}

async function prepareVisual(page: Page, targetPath: string): Promise<void> {
  await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.querySelectorAll('[data-radix-toast-viewport], [role="dialog"][data-state="closed"]').forEach((el) => el.remove());
    window.scrollTo(0, 0);
  });
}

async function saveScreenshot(page: Page, module: string, variant: string): Promise<void> {
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
  const launcher = page.locator('button[aria-label="Abrir JARVIS"]');
  if (await launcher.count()) await launcher.first().click();
  const panel = page.locator('div[aria-label="JARVIS"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await saveScreenshot(page, "jarvis", "desktop-aberto");
});
