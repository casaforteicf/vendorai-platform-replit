import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

export const BASE_URL = (process.env.E2E_BASE_URL || "https://app.appvendorai.com").replace(/\/$/, "");

export type VendorSession = {
  token: string;
  user: {
    id?: string;
    tenantId?: string;
    platformRole?: string;
    tenantVertical?: string;
    [key: string]: unknown;
  };
};

let cachedSession: VendorSession | null = null;

export async function getVendorSession(request: APIRequestContext): Promise<VendorSession> {
  if (cachedSession) return cachedSession;

  const staticToken = process.env.E2E_AUTH_TOKEN?.trim();
  if (staticToken) {
    const me = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${staticToken}` },
    });
    expect(me.ok(), "E2E_AUTH_TOKEN inválido ou expirado").toBeTruthy();
    const body = await me.json();
    cachedSession = { token: staticToken, user: body.user ?? body };
    return cachedSession;
  }

  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  const endpoint = email && password ? "/api/auth/login" : "/api/auth/demo-login";
  const credentials = email && password
    ? { email, password }
    : { email: "demo", password: "demo" };

  const response = await request.post(`${BASE_URL}${endpoint}`, {
    data: credentials,
    headers: { "Content-Type": "application/json" },
  });

  const responseText = await response.text();
  expect(
    response.ok(),
    `Falha no login E2E (${response.status()}): ${responseText.slice(0, 400)}`,
  ).toBeTruthy();

  const body = JSON.parse(responseText);
  expect(body.token, "Login E2E não retornou token").toBeTruthy();
  cachedSession = { token: body.token as string, user: body.user ?? {} };
  return cachedSession;
}

export async function authenticatePage(page: Page, session: VendorSession): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("vendorai_token", token);
    localStorage.setItem("vendorai_user_cache", JSON.stringify(user ?? {}));
    sessionStorage.setItem("vendorai_demo_session", "active");
  }, session);
}

export type Diagnostics = {
  pageErrors: string[];
  consoleErrors: string[];
  serverErrors: string[];
};

export function collectDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    serverErrors: [],
  };

  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.stack || error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });

  page.on("response", (response) => {
    const url = response.url();
    if (
      response.status() >= 500 &&
      (url.startsWith(BASE_URL) || url.startsWith(new URL(BASE_URL).origin))
    ) {
      diagnostics.serverErrors.push(`${response.status()} ${response.request().method()} ${url}`);
    }
  });

  return diagnostics;
}

export async function attachDiagnostics(testInfo: TestInfo, diagnostics: Diagnostics): Promise<void> {
  await testInfo.attach("vendorai-diagnostics.json", {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
    contentType: "application/json",
  });
}

export async function expectAppScreen(page: Page, expectedPath: string): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return text.length >= 80;
  }, undefined, { timeout: 30_000 });

  await page.waitForTimeout(800);

  const state = await page.evaluate(() => ({
    path: location.pathname,
    text: (document.body?.innerText || "").replace(/\s+/g, " ").trim(),
  }));

  expect(state.path, `Rota inesperada ao abrir ${expectedPath}`).toBe(expectedPath);
  expect(state.text.length, `Tela ${expectedPath} sem conteúdo suficiente`).toBeGreaterThanOrEqual(80);
  expect(state.text, `Tela ${expectedPath} caiu no login`).not.toMatch(/entrar\s+na\s+sua\s+conta|esqueci minha senha/i);
  expect(state.text, `Tela ${expectedPath} caiu no onboarding`).not.toMatch(/Etapa 1 de 3|Vamos começar!|Nome da empresa/i);
  expect(state.text, `Tela ${expectedPath} exibiu erro fatal`).not.toMatch(/application error|erro interno do servidor|internal server error|unexpected application error/i);
}
