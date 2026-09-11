import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://app.appvendorai.com';
const OUT = path.resolve('e2e/final-media');
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, 'videos'), { recursive: true });
await fs.mkdir(path.join(OUT, 'jarvis'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const auth = await browser.newContext();
const response = await auth.request.post(`${BASE}/api/auth/demo-login`, {
  data: { email: 'demo', password: 'demo' },
  headers: { 'Content-Type': 'application/json' },
});
if (!response.ok()) throw new Error(`demo login ${response.status()}: ${(await response.text()).slice(0,300)}`);
const session = await response.json();
await auth.close();

async function makeContext(video = false) {
  const raw = path.join(OUT, 'raw');
  if (video) await fs.mkdir(raw, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(video ? { recordVideo: { dir: raw, size: { width: 1440, height: 900 } } } : {}),
  });
  await ctx.addInitScript(({ token, user }) => {
    localStorage.setItem('vendorai_token', token);
    localStorage.setItem('vendorai_user_cache', JSON.stringify(user));
    sessionStorage.setItem('vendorai_demo_session', 'active');
  }, { token: session.token, user: session.user });
  return ctx;
}

async function settle(page, route, hold = 4500) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const t = (document.body?.innerText || '').replace(/\s+/g,' ').trim();
    return t.length > 120 && !(/entrar|login|senha/i.test(t) && t.length < 600);
  }, undefined, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(hold);
}

async function gentle(page) {
  await page.evaluate(() => window.scrollTo({ top: Math.min(window.innerHeight * .65, document.documentElement.scrollHeight), behavior: 'smooth' }));
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(2200);
}

async function record(name, routes, hold = 4500, finalHold = 3500, action) {
  const ctx = await makeContext(true);
  const page = await ctx.newPage();
  for (const route of routes) {
    await settle(page, route, hold);
    await gentle(page);
  }
  if (action) await action(page);
  await page.waitForTimeout(finalHold);
  const v = page.video();
  await page.close();
  const src = v ? await v.path() : null;
  await ctx.close();
  if (!src) throw new Error(`video not created: ${name}`);
  await fs.rename(src, path.join(OUT, 'videos', `${name}.webm`));
}

async function openJarvis(page) {
  await settle(page, '/dashboard', 3000);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vendorai:open-support', { detail: {} })));
  const panel = page.locator('[aria-label="JARVIS"]');
  await panel.waitFor({ state: 'visible', timeout: 12000 });
  await page.waitForTimeout(2500);
}

try {
  await record('crm-demo', ['/leads', '/deals'], 6000, 5000);
  await record('crm-short', ['/leads', '/deals'], 3200, 2200);
  await record('financeiro-erp-demo', ['/erp'], 8500, 6500);
  await record('financeiro-erp-short', ['/erp'], 4200, 2600);

  const shotCtx = await makeContext(false);
  const shot = await shotCtx.newPage();
  await openJarvis(shot);
  await shot.screenshot({ path: path.join(OUT, 'jarvis', 'desktop-aberto.png'), fullPage: true, animations: 'disabled' });
  await shotCtx.close();

  await record('jarvis-demo', ['/dashboard'], 4200, 8500, async page => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vendorai:open-support', { detail: {} })));
    await page.locator('[aria-label="JARVIS"]').waitFor({ state: 'visible', timeout: 12000 });
    await page.waitForTimeout(2500);
  });
  await record('jarvis-short', ['/dashboard'], 2600, 3800, async page => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vendorai:open-support', { detail: {} })));
    await page.locator('[aria-label="JARVIS"]').waitFor({ state: 'visible', timeout: 12000 });
  });
} finally {
  await browser.close();
}
