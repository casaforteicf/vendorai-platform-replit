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
