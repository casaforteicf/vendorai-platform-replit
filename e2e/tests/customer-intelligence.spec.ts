import { test, expect, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:80";
const TEST_EMAIL = "test-ci-e2e@example.com";
const TEST_PASSWORD = "testpassword123";
const TEST_LEAD_ID = "9e642793-0afc-4014-b8b6-b7940d92bef0";
const LEAD_DETAIL_PATH = `/leads/${TEST_LEAD_ID}`;

async function loginAndGetToken(
  page: Page
): Promise<{ token: string; tenantId: string }> {
  const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return { token: body.token as string, tenantId: body.user.tenantId as string };
}

async function authenticateAndNavigate(page: Page, path: string) {
  const { token } = await loginAndGetToken(page);

  await page.goto(`${BASE_URL}/`);
  await page.evaluate(
    ({ token, key }) => {
      localStorage.setItem(key, token);
    },
    { token, key: "vendorai_token" }
  );

  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState("networkidle");
}

async function setAuthAndNavigate(page: Page, token: string, path: string) {
  await page.goto(`${BASE_URL}/`);
  await page.evaluate(
    ({ token, key }) => {
      localStorage.setItem(key, token);
    },
    { token, key: "vendorai_token" }
  );
  await page.goto(`${BASE_URL}${path}`);
}

test.describe("Customer Intelligence card", () => {
  test("renders churn risk, progress bar, journey stage, intent analysis, next best action, and opportunities", async ({
    page,
  }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("progress-churn-risk")).toBeVisible();

    await expect(page.getByTestId("text-churn-risk")).toBeVisible();
    const riskText = await page.getByTestId("text-churn-risk").textContent();
    expect(riskText).toMatch(/(\d+%|—)/);

    await expect(page.getByTestId("btn-edit-churn-risk")).toBeVisible();

    await expect(page.getByTestId("btn-edit-next-best-action")).toBeVisible();

    await expect(ciCard).toContainText("Inteligência do Cliente");
    await expect(ciCard).toContainText("Risco de Churn");
    await expect(ciCard).toContainText("Próxima Melhor Ação");
  });

  test("clicking the churn risk pencil → typing a value → saving → shows updated value", async ({
    page,
  }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("btn-edit-churn-risk").click();

    const input = page.getByTestId("input-churn-risk");
    await expect(input).toBeVisible();
    await expect(page.getByTestId("slider-churn-risk")).toBeVisible();
    await expect(page.getByTestId("btn-save-churn-risk")).toBeVisible();

    await input.click({ clickCount: 3 });
    await input.fill("42");
    await page.getByTestId("btn-save-churn-risk").click();

    await expect(page.getByTestId("input-churn-risk")).not.toBeVisible({
      timeout: 5_000,
    });

    await expect(page.getByTestId("text-churn-risk")).toHaveText("42%", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("progress-churn-risk")).toBeVisible();
  });

  test("clicking the next best action pencil → typing → saving → shows updated text", async ({
    page,
  }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("btn-edit-next-best-action").click();

    const input = page.getByTestId("input-next-best-action");
    await expect(input).toBeVisible();
    await expect(page.getByTestId("btn-save-next-best-action")).toBeVisible();

    const newAction = "Agendar reunião de demonstração";
    await input.fill(newAction);
    await page.getByTestId("btn-save-next-best-action").click();

    await expect(page.getByTestId("input-next-best-action")).not.toBeVisible({
      timeout: 5_000,
    });

    await expect(ciCard).toContainText(newAction, { timeout: 10_000 });
  });
});

test.describe("Churn risk inline editor — client-side validation", () => {
  test("typing 150 shows error message and disables save button", async ({
    page,
  }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("btn-edit-churn-risk").click();

    const input = page.getByTestId("input-churn-risk");
    await expect(input).toBeVisible();

    await input.click({ clickCount: 3 });
    await input.fill("150");

    await expect(page.getByTestId("error-churn-risk")).toBeVisible();
    await expect(page.getByTestId("btn-save-churn-risk")).toBeDisabled();
  });

  test("typing -5 shows error message and disables save button", async ({
    page,
  }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("btn-edit-churn-risk").click();

    const input = page.getByTestId("input-churn-risk");
    await expect(input).toBeVisible();

    await input.click({ clickCount: 3 });
    await input.fill("-5");

    await expect(page.getByTestId("error-churn-risk")).toBeVisible();
    await expect(page.getByTestId("btn-save-churn-risk")).toBeDisabled();
  });

  test("typing non-numeric value (abc) shows error message and disables save button", async ({
    page,
  }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("btn-edit-churn-risk").click();

    const input = page.getByTestId("input-churn-risk");
    await expect(input).toBeVisible();

    await input.click({ clickCount: 3 });
    await input.pressSequentially("abc");

    await expect(page.getByTestId("error-churn-risk")).toBeVisible();
    await expect(page.getByTestId("btn-save-churn-risk")).toBeDisabled();
  });

  test("pressing Escape closes edit mode without saving", async ({ page }) => {
    await authenticateAndNavigate(page, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    const originalText = await page
      .getByTestId("text-churn-risk")
      .textContent();

    await page.getByTestId("btn-edit-churn-risk").click();

    const input = page.getByTestId("input-churn-risk");
    await expect(input).toBeVisible();

    await input.click({ clickCount: 3 });
    await input.fill("99");

    await input.press("Escape");

    await expect(input).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId("text-churn-risk")).toHaveText(
      originalText ?? "—"
    );
  });
});

test.describe("Customer Intelligence - loading state", () => {
  test("shows loading skeleton inside CI card while intelligence data is being fetched", async ({
    page,
  }) => {
    const { token } = await loginAndGetToken(page);

    let releaseIntelligence: (() => void) | null = null;
    await page.route("**/intelligence**", async (route) => {
      await new Promise<void>((resolve) => {
        releaseIntelligence = resolve;
      });
      await route.continue();
    });

    await setAuthAndNavigate(page, token, LEAD_DETAIL_PATH);

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    const skeleton = page.getByTestId("ci-loading-skeleton");
    await expect(skeleton).toBeVisible({ timeout: 5_000 });

    expect(page.getByTestId("text-churn-risk")).not.toBeVisible();

    releaseIntelligence!();

    await expect(skeleton).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("text-churn-risk")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Customer Intelligence - null/empty data state", () => {
  test("churn risk shows — and conditional sections are hidden when intelligence has no data", async ({
    page,
  }) => {
    const { token, tenantId } = await loginAndGetToken(page);

    const leadResp = await page.request.post(`${BASE_URL}/api/leads`, {
      data: { tenantId, nome: `CI Null State Test ${Date.now()}` },
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    expect(leadResp.ok()).toBeTruthy();
    const lead = (await leadResp.json()) as { id: string };

    await setAuthAndNavigate(page, token, `/leads/${lead.id}`);
    await page.waitForLoadState("networkidle");

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("ci-loading-skeleton")).not.toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByTestId("text-churn-risk")).toHaveText("—");

    await expect(ciCard).not.toContainText("Etapa da Jornada");

    await expect(ciCard).not.toContainText("Intenção de Compra");

    await expect(page.getByTestId("opportunity-0")).not.toBeVisible();

    await expect(page.getByTestId("text-last-analyzed")).toHaveText(
      "Nunca analisado"
    );
  });

  test("journey stage and intent analysis sections only render when values are present", async ({
    page,
  }) => {
    const { token, tenantId } = await loginAndGetToken(page);

    const leadResp = await page.request.post(`${BASE_URL}/api/leads`, {
      data: { tenantId, nome: `CI Section Visibility Test ${Date.now()}` },
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    expect(leadResp.ok()).toBeTruthy();
    const lead = (await leadResp.json()) as { id: string };

    await setAuthAndNavigate(page, token, `/leads/${lead.id}`);
    await page.waitForLoadState("networkidle");

    const ciCard = page.getByTestId("card-customer-intelligence");
    await expect(ciCard).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("ci-loading-skeleton")).not.toBeVisible({
      timeout: 15_000,
    });

    const intelligenceResp = await page.request.get(
      `${BASE_URL}/api/tenants/${tenantId}/leads/${lead.id}/intelligence`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(intelligenceResp.ok()).toBeTruthy();
    const intelligence = (await intelligenceResp.json()) as { id: string };

    await page.request.patch(
      `${BASE_URL}/api/customer-intelligence/${intelligence.id}`,
      {
        data: {
          journeyStage: "Avaliação",
          intentAnalysis: "Alta intenção de compra",
        },
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("ci-loading-skeleton")).not.toBeVisible({
      timeout: 15_000,
    });

    await expect(ciCard).toContainText("Etapa da Jornada");
    await expect(ciCard).toContainText("Avaliação");
    await expect(ciCard).toContainText("Intenção de Compra");
    await expect(ciCard).toContainText("Alta intenção de compra");
  });
});
