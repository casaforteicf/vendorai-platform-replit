import { acquireBrowserLease } from "./browser-fleet.js";
import { validateBrowserUrl } from "./browser-agent.js";

export type RenderedFetchResult = {
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; href: string }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  fetchedAt: string;
  nodeId: string;
};

export async function fetchRenderedPage(input: {
  url: string;
  allowedHosts?: string[];
  timeoutMs?: number;
  maxTextChars?: number;
}): Promise<RenderedFetchResult> {
  const lease = await acquireBrowserLease();
  let healthy = true;
  const context = await lease.browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.goto(validateBrowserUrl(input.url, input.allowedHosts ?? []), {
      waitUntil: "domcontentloaded",
      timeout: Math.min(Math.max(input.timeoutMs ?? 30_000, 3_000), 60_000),
    });
    await page.waitForNetworkIdle({ idleTime: 350, timeout: 4_000 }).catch(() => undefined);

    const result = await page.evaluate((maxTextChars) => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const text = clean(document.body?.innerText).slice(0, maxTextChars);
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 200)
        .map((node) => ({
          text: clean((node as HTMLElement).innerText || node.getAttribute("aria-label")),
          href: (node as HTMLAnchorElement).href,
        }))
        .filter((item) => item.href);
      const tables = Array.from(document.querySelectorAll("table"))
        .slice(0, 20)
        .map((table) => {
          const rows = Array.from(table.querySelectorAll("tr")).slice(0, 100);
          const matrix = rows.map((row) =>
            Array.from(row.querySelectorAll("th,td")).map((cell) => clean(cell.textContent)),
          );
          const first = matrix[0] ?? [];
          const hasHeader = Boolean(rows[0]?.querySelector("th"));
          return {
            headers: hasHeader ? first : [],
            rows: hasHeader ? matrix.slice(1) : matrix,
          };
        });
      return { url: location.href, title: document.title, text, links, tables };
    }, Math.min(Math.max(input.maxTextChars ?? 30_000, 1_000), 100_000));

    return { ...result, fetchedAt: new Date().toISOString(), nodeId: lease.nodeId };
  } catch (error) {
    healthy = false;
    throw error;
  } finally {
    await context.close().catch(() => undefined);
    lease.browser.disconnect();
    lease.release(healthy);
  }
}

export async function fetchRenderedBatch(
  requests: Array<{ url: string; allowedHosts?: string[] }>,
  concurrency = 4,
) {
  const limit = Math.min(Math.max(concurrency, 1), 12);
  const results = new Array<RenderedFetchResult | { url: string; error: string }>(requests.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= requests.length) return;
      const request = requests[index]!;
      try {
        results[index] = await fetchRenderedPage(request);
      } catch (error: any) {
        results[index] = { url: request.url, error: error?.message ?? "FETCH_FAILED" };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, requests.length) }, () => worker()));
  return results;
}
