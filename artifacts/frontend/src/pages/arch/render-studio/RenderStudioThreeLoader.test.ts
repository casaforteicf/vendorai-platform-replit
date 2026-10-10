import { afterEach, describe, expect, it, vi } from "vitest";


afterEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('script[src*="three.min.js"]').forEach(node => node.remove());
});

describe("Arqdor Three.js loader", () => {
  it("rejects a failed CDN request and allows retry", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("THREE", undefined);
    const { loadThree } = await import("./RenderStudioParametricWebgl");
    const first = loadThree();
    const firstScript = document.head.querySelector('script[src*="three.min.js"]') as HTMLScriptElement;
    expect(firstScript).toBeTruthy();
    firstScript.onerror?.(new Event("error"));
    await expect(first).rejects.toThrow("Não foi possível carregar Three.js");
    expect(firstScript.isConnected).toBe(false);
    const retry = loadThree();
    const secondScript = document.head.querySelector('script[src*="three.min.js"]') as HTMLScriptElement;
    expect(secondScript).toBeTruthy();
    vi.stubGlobal("THREE", { WebGLRenderer: class {} });
    secondScript.onload?.(new Event("load"));
    await expect(retry).resolves.toBeUndefined();
  });

  it("shares one pending download between simultaneous callers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("THREE", undefined);
    const { loadThree } = await import("./RenderStudioParametricWebgl");
    const first = loadThree();
    const second = loadThree();
    expect(first).toBe(second);
    expect(document.head.querySelectorAll('script[src*="three.min.js"]')).toHaveLength(1);
    const script = document.head.querySelector('script[src*="three.min.js"]') as HTMLScriptElement;
    vi.stubGlobal("THREE", { WebGLRenderer: class {} });
    script.onload?.(new Event("load"));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an incomplete successful download", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("THREE", undefined);
    const { loadThree } = await import("./RenderStudioParametricWebgl");
    const result = loadThree();
    const script = document.head.querySelector('script[src*="three.min.js"]') as HTMLScriptElement;
    script.onload?.(new Event("load"));
    await expect(result).rejects.toThrow("Three.js carregado sem WebGLRenderer");
    expect(script.isConnected).toBe(false);
  });

  it("times out, removes the script, and ignores late load", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("THREE", undefined);
    const { loadThree } = await import("./RenderStudioParametricWebgl");
    const result = loadThree();
    const script = document.head.querySelector('script[src*="three.min.js"]') as HTMLScriptElement;
    const lateLoad = script.onload;
    const rejection = expect(result).rejects.toThrow("Tempo esgotado ao carregar Three.js");
    await vi.advanceTimersByTimeAsync(12000);
    await rejection;
    expect(script.isConnected).toBe(false);
    vi.stubGlobal("THREE", { WebGLRenderer: class {} });
    lateLoad?.(new Event("load"));
    expect(script.isConnected).toBe(false);
  });
});
