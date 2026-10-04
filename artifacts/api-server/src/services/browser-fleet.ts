import puppeteer, { type Browser } from "puppeteer-core";

type FleetNode = {
  id: string;
  endpoint: string;
  activeLeases: number;
  failures: number;
  cooldownUntil: number;
};

export type BrowserLease = {
  nodeId: string;
  browser: Browser;
  release: (healthy?: boolean) => void;
};

const nodes = new Map<string, FleetNode>();

function configuredEndpoints(): string[] {
  const multi = (process.env["BROWSER_CDP_URLS"] ?? "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const single = (process.env["BROWSER_CDP_URL"] ?? "").trim();
  return Array.from(new Set([...multi, ...(single ? [single] : [])]));
}

function syncNodes() {
  const endpoints = configuredEndpoints();
  const keep = new Set<string>();
  endpoints.forEach((endpoint, index) => {
    const id = `chromium-${index + 1}`;
    keep.add(id);
    const current = nodes.get(id);
    if (!current || current.endpoint !== endpoint) {
      nodes.set(id, {
        id,
        endpoint,
        activeLeases: 0,
        failures: 0,
        cooldownUntil: 0,
      });
    }
  });
  for (const id of nodes.keys()) if (!keep.has(id)) nodes.delete(id);
}

export function browserFleetStatus() {
  syncNodes();
  return [...nodes.values()].map((node) => ({
    id: node.id,
    activeLeases: node.activeLeases,
    failures: node.failures,
    coolingDown: node.cooldownUntil > Date.now(),
    configured: Boolean(node.endpoint),
  }));
}

function chooseNode(): FleetNode {
  syncNodes();
  const now = Date.now();
  const candidates = [...nodes.values()].filter((node) => node.cooldownUntil <= now);
  const pool = candidates.length ? candidates : [...nodes.values()];
  if (!pool.length) throw new Error("BROWSER_FLEET_NOT_CONFIGURED");
  return pool.sort((a, b) =>
    a.activeLeases - b.activeLeases || a.failures - b.failures || a.id.localeCompare(b.id)
  )[0]!;
}

export async function acquireBrowserLease(): Promise<BrowserLease> {
  const node = chooseNode();
  node.activeLeases++;
  try {
    const browser = await puppeteer.connect({ browserWSEndpoint: node.endpoint, protocolTimeout: 300_000 });
    let released = false;
    return {
      nodeId: node.id,
      browser,
      release(healthy = true) {
        if (released) return;
        released = true;
        node.activeLeases = Math.max(0, node.activeLeases - 1);
        if (healthy) {
          node.failures = Math.max(0, node.failures - 1);
        } else {
          node.failures++;
          if (node.failures >= 3) {
            node.cooldownUntil = Date.now() + Math.min(60_000, node.failures * 5_000);
          }
        }
      },
    };
  } catch (error) {
    node.activeLeases = Math.max(0, node.activeLeases - 1);
    node.failures++;
    if (node.failures >= 3) {
      node.cooldownUntil = Date.now() + Math.min(60_000, node.failures * 5_000);
    }
    throw error;
  }
}

export function browserFleetConfigured() {
  return configuredEndpoints().length > 0;
}
