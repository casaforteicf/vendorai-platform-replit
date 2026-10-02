import { test, expect } from "@playwright/test";
import { BASE_URL, authenticatePage, getVendorSession } from "../helpers/vendorai-session";

test.describe.configure({ mode: "serial" });

const criticalPaths = [
  "/dashboard",
  "/leads",
  "/deals",
  "/conversations",
  "/agenda",
  "/propostas",
  "/app/prospector",
  "/configuracoes",
] as const;

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`UI layout ${viewport.name}: rotas críticas sem overflow horizontal`, async ({ page, request }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const session = await getVendorSession(request);
    await authenticatePage(page, session);

    for (const path of criticalPaths) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);

      const audit = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const scrollWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth || 0,
        );

        const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((element) => {
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden") return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.left < -3 || rect.right > viewportWidth + 3);
          })
          .slice(0, 15)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              className: String(element.className).slice(0, 120),
              text: (element.innerText || "").slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            };
          });

        return { viewportWidth, scrollWidth, offenders };
      });

      expect(
        audit.scrollWidth,
        `${path} apresentou overflow horizontal: ${JSON.stringify(audit.offenders)}`,
      ).toBeLessThanOrEqual(audit.viewportWidth + 3);
    }
  });
}
