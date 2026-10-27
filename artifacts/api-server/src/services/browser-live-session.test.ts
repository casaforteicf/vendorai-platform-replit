import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ blocked: false, page: null as any, browser: null as any, plan: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { connect: vi.fn(async () => runtime.browser) } }));
vi.mock("../lib/ai-gateway.js", () => ({ callOpenAI: vi.fn() }));
vi.mock("./browser-agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./browser-agent.js")>()),
  planBrowserAction: runtime.plan,
}));
import { assertBrowserPageAccessible, isRecoverableSelectorError } from "./browser-agent.js";
import {
  createLiveBrowserSession, getLiveBrowserSession, setLiveBrowserPaused,
  startLiveBrowserMission, closeLiveBrowserSession,
} from "./browser-live-session.js";

const ids: string[] = [];
async function session(onMissionResult?: any) {
  const result = await createLiveBrowserSession({ tenantId: "tenant-a", startUrl: "https://example.com",
    existing: { browser: runtime.browser, page: runtime.page }, onMissionResult });
  ids.push(result.id);
  return result.id;
}
async function waitForStatus(id: string, status: string) {
  await vi.waitFor(async () => expect((await getLiveBrowserSession("tenant-a", id)).status).toBe(status));
}
beforeEach(() => {
  vi.stubEnv("BROWSER_CDP_URL", "ws://test-runtime");
  runtime.blocked = false;
  runtime.plan.mockReset().mockResolvedValue({ action: "finish", outcome: "completed", answer: "Verified" });
  const context = { close: vi.fn(async () => {}) };
  runtime.page = {
    setViewport: vi.fn(async () => {}), url: () => "https://example.com", title: async () => "Example",
    cookies: async () => [], browserContext: () => context,
    evaluate: async () => ({ title: runtime.blocked ? "Just a moment" : "Example", text: runtime.blocked ? "Cloudflare verify you are human" : "Ready", url: "https://example.com" }),
    goto: vi.fn(async () => {}), click: vi.fn(async () => {}), waitForNetworkIdle: async () => {},
  };
  runtime.browser = { disconnect: vi.fn() };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const id of ids.splice(0)) await closeLiveBrowserSession("tenant-a", id);
});
describe("human handoff", () => {
  it("classifies stale dynamic selectors as recoverable navigation errors", () => {
    expect(isRecoverableSelectorError(new Error("No element found for selector: #radix-_r_i_"))).toBe(true);
    expect(isRecoverableSelectorError(new Error("failed to find element matching selector"))).toBe(true);
    expect(isRecoverableSelectorError(new Error("APPROVAL_REQUIRED: ação de alto risco exige confirmação explícita"))).toBe(false);
  });
  it("detects a Cloudflare challenge URL before its text renders", () => {
    expect(() => assertBrowserPageAccessible({ title: "", text: "", url: "https://chatgpt.com/?__cf_chl_rt_tk=test" })).toThrow("BROWSER_BLOCKED");
    expect(() => assertBrowserPageAccessible({ title: "ChatGPT", text: "Ready", url: "https://chatgpt.com/" })).not.toThrow();
  });
  it("pauses without asking AI to solve the challenge and resumes on the same page", async () => {
    runtime.blocked = true;
    const onResult = vi.fn(async () => {});
    const id = await session(onResult);
    startLiveBrowserMission("tenant-a", id, "Read the page");
    await waitForStatus(id, "paused");
    expect(runtime.plan).not.toHaveBeenCalled();
    await expect(setLiveBrowserPaused("tenant-a", id, false)).rejects.toThrow("BROWSER_BLOCKED");
    expect(runtime.page.browserContext().close).not.toHaveBeenCalled();
    runtime.blocked = false;
    await setLiveBrowserPaused("tenant-a", id, false);
    await waitForStatus(id, "completed");
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sessionId: id })));
    expect(runtime.page.goto).not.toHaveBeenCalled();
  });
  it("does not report blocked output or step exhaustion as completed", async () => {
    const onResult = vi.fn(async () => {});
    runtime.plan.mockResolvedValue({ action: "finish", outcome: "blocked", answer: "Module unavailable" });
    const id = await session(onResult);
    startLiveBrowserMission("tenant-a", id, "Read the page");
    await waitForStatus(id, "error");
    expect((await getLiveBrowserSession("tenant-a", id)).pauseReason).toBeNull();
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
      ok: false, sessionId: id, answer: "Module unavailable",
    })));
    runtime.plan.mockResolvedValue({ action: "navigate", url: "https://example.com" });
    const otherId = await session();
    startLiveBrowserMission("tenant-a", otherId, "Read the page", 1);
    await waitForStatus(otherId, "error");
  });
  it("rejects access from another tenant", async () => {
    const id = await session();
    await expect(getLiveBrowserSession("tenant-b", id)).rejects.toThrow("não encontrada");
  });
  it("discards a plan made before the user took manual control", async () => {
    let resolvePlan!: (value: any) => void;
    runtime.plan.mockImplementationOnce(() => new Promise(resolve => { resolvePlan = resolve; }));
    const id = await session();
    startLiveBrowserMission("tenant-a", id, "Read the page");
    await vi.waitFor(() => expect(resolvePlan).toBeTypeOf("function"));
    await setLiveBrowserPaused("tenant-a", id, true);
    await setLiveBrowserPaused("tenant-a", id, false);
    resolvePlan({ action: "click", selector: "#stale" });
    await waitForStatus(id, "completed");
    expect(runtime.page.click).not.toHaveBeenCalled();
  });
});
