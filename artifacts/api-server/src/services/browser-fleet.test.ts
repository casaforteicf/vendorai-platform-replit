import { afterEach, describe, expect, it, vi } from "vitest";
import { browserFleetConfigured, browserFleetStatus } from "./browser-fleet.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("browser fleet", () => {
  it("keeps backward compatibility with BROWSER_CDP_URL", () => {
    vi.stubEnv("BROWSER_CDP_URL", "ws://chromium-one");
    vi.stubEnv("BROWSER_CDP_URLS", "");
    expect(browserFleetConfigured()).toBe(true);
    expect(browserFleetStatus()).toEqual([
      expect.objectContaining({ id: "chromium-1", activeLeases: 0, configured: true }),
    ]);
  });

  it("builds a native multi-node Chromium fleet", () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    vi.stubEnv("BROWSER_CDP_URLS", "ws://one,ws://two\nws://three");
    const fleet = browserFleetStatus();
    expect(fleet).toHaveLength(3);
    expect(fleet.map((node) => node.id)).toEqual(["chromium-1", "chromium-2", "chromium-3"]);
    expect(fleet.every((node) => node.activeLeases === 0)).toBe(true);
  });

  it("reports unconfigured state when no Chromium endpoint exists", () => {
    vi.stubEnv("BROWSER_CDP_URL", "");
    vi.stubEnv("BROWSER_CDP_URLS", "");
    expect(browserFleetConfigured()).toBe(false);
    expect(browserFleetStatus()).toEqual([]);
  });
});
