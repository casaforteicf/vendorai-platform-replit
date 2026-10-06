import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  authenticatePage,
  collectDiagnostics,
  getVendorSession,
} from "../helpers/vendorai-session";

test("Assistência exibe importação de pedido antigo em produção", async ({ page, request }, testInfo) => {
  const session = await getVendorSession(request);
  const diagnostics = collectDiagnostics(page);

  await authenticatePage(page, session);
  await page.goto(`${BASE_URL}/pipeline-operacional/suporte`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Novo chamado/i })).toBeVisible();
  await page.getByRole("button", { name: /Novo chamado/i }).click();

  await expect(page.getByRole("heading", { name: /Abrir chamado de assistência/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Importar pedido antigo/i })).toBeVisible();
  await expect(page.getByText(/PDF, imagem ou Word/i)).toBeVisible();
  await expect(page.getByText(/arquivo original fica preservado/i)).toBeVisible();

  expect(diagnostics.pageErrors, "A tela de assistência não pode gerar erro fatal de JavaScript").toEqual([]);
  expect(diagnostics.serverErrors, "A abertura do fluxo não pode gerar respostas 5xx").toEqual([]);

  await testInfo.attach("support-legacy-order-diagnostics.json", {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
    contentType: "application/json",
  });
});
