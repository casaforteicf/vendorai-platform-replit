import { chromium, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MEDIA_BASE_URL || "https://app.appvendorai.com";
const MEDIA_AUTH_TOKEN = process.env.MEDIA_AUTH_TOKEN;
const OUTPUT_ROOT = process.env.MEDIA_OUTPUT_DIR || path.resolve(process.cwd(), "media-output");

type DemoSession = { token: string; user?: unknown };
let sharedSession: DemoSession | undefined = MEDIA_AUTH_TOKEN ? { token: MEDIA_AUTH_TOKEN } : undefined;

type RecordOptions = {
  holdMs?: number;
  scroll?: boolean;
  action?: (page: Page) => Promise<void>;
  finalHoldMs?: number;
};

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

async function installSession(context: BrowserContext, session: DemoSession) {
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("vendorai_token", token);
    if (user) localStorage.setItem("vendorai_user_cache", JSON.stringify(user));
    sessionStorage.setItem("vendorai_demo_session", "active");
  }, session);
}

async function waitForRealContent(page: Page) {
  await page.waitForFunction(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const hasContent = text.length >= 120;
    const looksLikeLogin = /entrar|login|senha/i.test(text) && text.length < 600;
    const hasBusy = Boolean(document.querySelector('[aria-busy="true"], [data-loading="true"]'));
    return hasContent && !looksLikeLogin && !hasBusy;
  }, undefined, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1800);
}

async function settle(page: Page, route: string, holdMs: number) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await waitForRealContent(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(holdMs);
}

async function gentleTour(page: Page) {
  const { height, viewport } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }));
  if (height <= viewport + 180) {
    await page.waitForTimeout(2500);
    return;
  }
  await page.evaluate(() => window.scrollTo({
    top: Math.min(window.innerHeight * 0.72, document.documentElement.scrollHeight),
    behavior: "smooth",
  }));
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(2600);
}

async function record(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  session: DemoSession,
  name: string,
  routes: string[],
  options: RecordOptions = {},
) {
  const rawDir = path.join(OUTPUT_ROOT, "videos", "raw");
  const finalDir = path.join(OUTPUT_ROOT, "videos");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(finalDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: rawDir, size: { width: 1440, height: 900 } },
  });
  await installSession(context, session);
  const page = await context.newPage();
  const holdMs = options.holdMs ?? 5200;

  for (const route of routes) {
    await settle(page, route, holdMs);
    if (options.scroll !== false) await gentleTour(page);
    await page.waitForTimeout(1800);
  }

  if (options.action) {
    await options.action(page);
    await page.waitForTimeout(options.finalHoldMs ?? 6500);
  } else {
    await page.waitForTimeout(options.finalHoldMs ?? 4200);
  }

  const video = page.video();
  await page.close();
  const sourcePath = video ? await video.path() : null;
  await context.close();
  if (sourcePath) await fs.rename(sourcePath, path.join(finalDir, `${name}.webm`));
}

const browser = await chromium.launch({ headless: true });
const authContext = await browser.newContext();
const session = await getSession(authContext);
await authContext.close();

try {
  await record(browser, session, "crm-demo", ["/leads", "/deals", "/conversations", "/agenda"], {
    holdMs: 5600,
    finalHoldMs: 5200,
  });
  await record(browser, session, "crm-short", ["/leads", "/deals"], {
    holdMs: 3600,
    finalHoldMs: 2600,
  });

  await record(browser, session, "prospector-demo", ["/app/prospector"], {
    holdMs: 7000,
    finalHoldMs: 6500,
  });
  await record(browser, session, "prospector-short", ["/app/prospector"], {
    holdMs: 4000,
    finalHoldMs: 2500,
  });

  await record(browser, session, "revenue-scout-demo", ["/scout", "/scout/oportunidades"], {
    holdMs: 6200,
    finalHoldMs: 5600,
  });
  await record(browser, session, "revenue-scout-short", ["/scout/oportunidades"], {
    holdMs: 4200,
    finalHoldMs: 2600,
  });

  await record(browser, session, "financeiro-erp-demo", ["/erp"], {
    holdMs: 7600,
    finalHoldMs: 6500,
  });
  await record(browser, session, "financeiro-erp-short", ["/erp"], {
    holdMs: 4200,
    finalHoldMs: 2600,
  });

  await record(browser, session, "jarvis-demo", ["/"], {
    holdMs: 5200,
    scroll: false,
    finalHoldMs: 8500,
    action: async (page) => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: {} }));
      });
      await page.locator('[aria-label="JARVIS"]').waitFor({ state: "visible", timeout: 12_000 });
      await page.waitForTimeout(1800);
    },
  });
  await record(browser, session, "jarvis-short", ["/"], {
    holdMs: 3200,
    scroll: false,
    finalHoldMs: 3600,
    action: async (page) => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: {} }));
      });
      await page.locator('[aria-label="JARVIS"]').waitFor({ state: "visible", timeout: 12_000 });
    },
  });
} finally {
  await browser.close();
}
