import type { HTTPResponse } from "puppeteer-core";
import { acquireBrowserLease } from "./browser-fleet.js";
import { validateBrowserUrl } from "./browser-agent.js";

export type DiscoveredNetworkCall = {
  method: string;
  url: string;
  status: number;
  resourceType: string;
  contentType: string;
};

export type DiscoveredPage = {
  url: string;
  title: string;
  headings: string[];
  forms: Array<{
    action: string;
    method: string;
    fields: Array<{
      name: string | null;
      type: string | null;
      label: string;
      required: boolean;
      selector: string;
    }>;
  }>;
  actions: Array<{ text: string; kind: string; selector: string }>;
  links: Array<{ text: string; href: string }>;
  tables: Array<{ headers: string[]; rowCount: number }>;
};

function dedupeNetwork(calls: DiscoveredNetworkCall[]) {
  const seen = new Set<string>();
  return calls.filter((item) => {
    const key = item.method + "|" + item.url + "|" + item.status;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);
}

export async function discoverWebsite(input: {
  startUrl: string;
  allowedHosts?: string[];
  maxPages?: number;
}) {
  const lease = await acquireBrowserLease();
  const context = await lease.browser.createBrowserContext();
  const page = await context.newPage();
  const network: DiscoveredNetworkCall[] = [];
  const maxPages = Math.min(Math.max(input.maxPages ?? 5, 1), 12);
  const start = new URL(validateBrowserUrl(input.startUrl, input.allowedHosts ?? []));
  const allowed = new Set([start.hostname.toLowerCase(), ...(input.allowedHosts ?? []).map((h) => h.toLowerCase())]);
  let healthy = true;

  const onResponse = (response: HTTPResponse) => {
    const request = response.request();
    const type = request.resourceType();
    const contentType = String(response.headers()["content-type"] ?? "");
    if (["fetch", "xhr"].includes(type) || /json|graphql|xml/i.test(contentType)) {
      try {
        const url = new URL(response.url());
        if ([...allowed].some((host) => url.hostname === host || url.hostname.endsWith("." + host))) {
          network.push({
            method: request.method(),
            url: response.url(),
            status: response.status(),
            resourceType: type,
            contentType,
          });
        }
      } catch {}
    }
  };
  page.on("response", onResponse);

  try {
    const queue = [start.toString()];
    const visited = new Set<string>();
    const pages: DiscoveredPage[] = [];

    while (queue.length && pages.length < maxPages) {
      const target = queue.shift()!;
      if (visited.has(target)) continue;
      visited.add(target);

      await page.goto(validateBrowserUrl(target, [...allowed]), {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForNetworkIdle({ idleTime: 300, timeout: 3500 }).catch(() => undefined);

      const mapped = await page.evaluate(() => {
        const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
        const css = (value: string) => JSON.stringify(value);
        const selector = (el: Element) => {
          const tag = el.tagName.toLowerCase();
          const testId = el.getAttribute("data-testid");
          if (testId) return `[data-testid=${css(testId)}]`;
          const aria = el.getAttribute("aria-label");
          if (aria) return `${tag}[aria-label=${css(aria)}]`;
          const name = (el as HTMLInputElement).name;
          if (name) return `${tag}[name=${css(name)}]`;
          const id = (el as HTMLElement).id;
          if (id && !/^radix-|^_?r_/i.test(id)) return `#${CSS.escape(id)}`;
          return tag;
        };

        const labels = new Map<Element, string>();
        for (const label of Array.from(document.querySelectorAll("label"))) {
          const htmlFor = label.getAttribute("for");
          if (htmlFor) {
            const el = document.getElementById(htmlFor);
            if (el) labels.set(el, clean(label.textContent));
          }
          const nested = label.querySelector("input,textarea,select");
          if (nested) labels.set(nested, clean(label.textContent));
        }

        const forms = Array.from(document.querySelectorAll("form")).slice(0, 30).map((form) => ({
          action: (form as HTMLFormElement).action || location.href,
          method: ((form as HTMLFormElement).method || "get").toUpperCase(),
          fields: Array.from(form.querySelectorAll("input,textarea,select")).slice(0, 80).map((field) => {
            const input = field as HTMLInputElement;
            return {
              name: input.name || null,
              type: input.type || field.tagName.toLowerCase(),
              label: labels.get(field) || input.getAttribute("aria-label") || input.placeholder || input.name || "",
              required: input.required,
              selector: selector(field),
            };
          }),
        }));

        const actions = Array.from(document.querySelectorAll("button,a,[role='button']")).slice(0, 150).map((el) => ({
          text: clean((el as HTMLElement).innerText || el.getAttribute("aria-label")),
          kind: el.tagName.toLowerCase(),
          selector: selector(el),
        })).filter((x) => x.text);

        const links = Array.from(document.querySelectorAll("a[href]")).slice(0, 200).map((a) => ({
          text: clean((a as HTMLElement).innerText),
          href: (a as HTMLAnchorElement).href,
        })).filter((x) => x.href);

        const tables = Array.from(document.querySelectorAll("table")).slice(0, 30).map((table) => ({
          headers: Array.from(table.querySelectorAll("thead th, tr:first-child th")).map((th) => clean(th.textContent)),
          rowCount: table.querySelectorAll("tbody tr").length || Math.max(0, table.querySelectorAll("tr").length - 1),
        }));

        return {
          url: location.href,
          title: document.title,
          headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 80).map((h) => clean(h.textContent)).filter(Boolean),
          forms,
          actions,
          links,
          tables,
        };
      });

      pages.push(mapped);

      for (const link of mapped.links) {
        try {
          const url = new URL(link.href);
          const hostAllowed = [...allowed].some((host) => url.hostname === host || url.hostname.endsWith("." + host));
          if (hostAllowed) {
            url.hash = "";
            if (!visited.has(url.toString()) && queue.length < maxPages * 12) queue.push(url.toString());
          }
        } catch {}
      }
    }

    return {
      startUrl: start.toString(),
      pages,
      networkCalls: dedupeNetwork(network),
      capabilities: {
        hasForms: pages.some((p) => p.forms.length > 0),
        hasTables: pages.some((p) => p.tables.length > 0),
        hasDownloads: pages.some((p) => p.links.some((l) => /\.(pdf|csv|xlsx?|xml|zip)(?:$|\?)/i.test(l.href))),
        pageCount: pages.length,
        networkApiCandidates: dedupeNetwork(network).length,
      },
      discoveredAt: new Date().toISOString(),
      nodeId: lease.nodeId,
    };
  } catch (error) {
    healthy = false;
    throw error;
  } finally {
    page.off("response", onResponse);
    await context.close().catch(() => undefined);
    lease.browser.disconnect();
    lease.release(healthy);
  }
}
