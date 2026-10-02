import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  attachDiagnostics,
  authenticatePage,
  collectDiagnostics,
  expectAppScreen,
  getVendorSession,
} from "../helpers/vendorai-session";

test.describe.configure({ mode: "serial" });

test("P0-01 autenticação e sessão", async ({ page, request }) => {
  const session = await getVendorSession(request);
  expect(session.token.length).toBeGreaterThan(20);

  await authenticatePage(page, session);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await expectAppScreen(page, "/dashboard");
});

const criticalScreens = [
  ["P0-02 Dashboard", "/dashboard"],
  ["P0-03 CRM / Leads", "/leads"],
  ["P0-04 Pipeline / Negócios", "/deals"],
  ["P0-05 Conversas", "/conversations"],
  ["P0-06 Agenda", "/agenda"],
  ["P0-07 Orçamentos / Propostas", "/propostas"],
  ["P0-08 Prospector", "/app/prospector"],
  ["P0-09 Configurações", "/configuracoes"],
] as const;

for (const [name, path] of criticalScreens) {
  test(name, async ({ page, request }, testInfo) => {
    const session = await getVendorSession(request);
    const diagnostics = collectDiagnostics(page);

    await authenticatePage(page, session);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    await expectAppScreen(page, path);
    await attachDiagnostics(testInfo, diagnostics);

    expect(diagnostics.pageErrors, `Erros JS fatais em ${path}`).toEqual([]);
    expect(diagnostics.serverErrors, `Respostas 5xx em ${path}`).toEqual([]);

    if (process.env.E2E_STRICT_CONSOLE === "1") {
      expect(diagnostics.consoleErrors, `console.error em ${path}`).toEqual([]);
    }
  });
}

test("P0-10 isolamento de tenant", async ({ request }) => {
  const session = await getVendorSession(request);
  const tenantId = String(session.user?.tenantId ?? "");
  expect(tenantId, "Sessão E2E sem tenantId").toBeTruthy();

  const ownResponse = await request.get(`${BASE_URL}/api/tenants/${tenantId}/deals`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(
    ownResponse.status(),
    "A API do próprio tenant deve responder sem erro de servidor",
  ).toBeLessThan(500);

  const foreignTenantId = process.env.E2E_FOREIGN_TENANT_ID || "00000000-0000-4000-8000-000000000001";
  const foreignResponse = await request.get(`${BASE_URL}/api/tenants/${foreignTenantId}/deals`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });

  expect(foreignResponse.status(), "Consulta cruzada não pode causar erro 5xx").toBeLessThan(500);

  if (foreignResponse.ok()) {
    const body = await foreignResponse.json();
    expect(Array.isArray(body), "Resposta cruzada deve ser lista vazia ou bloqueio explícito").toBeTruthy();
    expect(body, "Tenant não pode enxergar negócios de outro tenant").toHaveLength(0);
  } else {
    expect([401, 403, 404]).toContain(foreignResponse.status());
  }

  for (const path of [
    `/api/tenants/${foreignTenantId}/activities`,
    `/api/tenants/${foreignTenantId}/activities/overdue`,
    `/api/tenants/${foreignTenantId}/conversations`,
  ]) {
    const response = await request.get(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    expect(response.status(), `Consulta cruzada em ${path} não pode causar erro 5xx`).toBeLessThan(500);

    if (response.ok()) {
      const body = await response.json();
      expect(Array.isArray(body), `Resposta cruzada em ${path} deve ser lista vazia ou bloqueio explícito`).toBeTruthy();
      expect(body, `Tenant não pode enxergar dados de outro tenant em ${path}`).toHaveLength(0);
    } else {
      expect([401, 403, 404]).toContain(response.status());
    }
  }
});

test("P0 mobile: dashboard, leads e propostas sem crash", async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await getVendorSession(request);
  const diagnostics = collectDiagnostics(page);
  await authenticatePage(page, session);

  for (const path of ["/dashboard", "/leads", "/propostas"]) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    await expectAppScreen(page, path);
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.serverErrors).toEqual([]);
});
