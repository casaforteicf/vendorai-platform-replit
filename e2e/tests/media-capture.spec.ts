import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MEDIA_BASE_URL || "https://app.appvendorai.com";
const MEDIA_AUTH_TOKEN = process.env.MEDIA_AUTH_TOKEN;
const MEDIA_AUTH_EMAIL = process.env.MEDIA_AUTH_EMAIL || "marcos@vendor.ai";
const MEDIA_AUTH_PASSWORD = process.env.MEDIA_AUTH_PASSWORD || "Homolog@2026!";
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
  { key: "agents", path: "/agentes" },
  { key: "propostas", path: "/propostas" },
  { key: "marketing-content", path: "/content?tab=planejamento" },
  { key: "marketing-media-plan", path: "/marketing/plano-de-midia" },
] as const;

async function getSession(page: Page): Promise<DemoSession> {
  if (sharedSession) return sharedSession;

  const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: MEDIA_AUTH_EMAIL, password: MEDIA_AUTH_PASSWORD },
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login de homologação falhou (${response.status()}): ${body.slice(0, 300)}`);
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
    const looksLikeOnboarding = /Etapa 1 de 3|Vamos começar!|Nome da empresa/i.test(text);
    return hasAppContent && !looksLikeLogin && !looksLikeOnboarding;
  }, undefined, { timeout: 30_000 });

  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
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
  const pageState = await page.evaluate(() => ({
    text: (document.body?.innerText || "").replace(/\s+/g, " ").trim(),
    url: location.href,
  }));
  if (pageState.text.length < 80) throw new Error(`Captura recusada: ${module}/${variant} ainda não contém conteúdo real`);
  if (/Etapa 1 de 3|Vamos começar!|Nome da empresa/i.test(pageState.text)) {
    throw new Error(`Captura recusada: ${module}/${variant} caiu no onboarding (${pageState.url})`);
  }

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
  await prepareVisual(page, "/dashboard");
  const launcher = page.locator('button[aria-label="Abrir JARVIS"]');
  if (await launcher.count()) {
    await launcher.first().click();
  } else {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: {} }));
    });
  }
  const panel = page.locator('[aria-label="JARVIS"]');
  await expect(panel).toBeVisible({ timeout: 12_000 });
  await page.waitForTimeout(2500);
  await saveScreenshot(page, "jarvis", "desktop-aberto");
});
