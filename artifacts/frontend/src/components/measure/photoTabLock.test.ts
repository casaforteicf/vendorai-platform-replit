import { afterEach, describe, expect, it, vi } from "vitest";
import { withPhotoTabLock } from "./photoTabLock";

afterEach(() => vi.restoreAllMocks());

describe("photoTabLock", () => {
  it("serializes tasks for the same photo queue", async () => {
    let tail = Promise.resolve();
    let active = 0;
    let maxActive = 0;
    const request = vi.fn(async (_name: string, _options: unknown, callback: () => Promise<string>) => {
      const previous = tail;
      let finish!: () => void;
      tail = new Promise<void>(resolve => { finish = resolve; });
      await previous;
      try { return await callback(); } finally { finish(); }
    });
    vi.stubGlobal("navigator", { locks: { request } });
    const job = () => withPhotoTabLock("run-1", async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return "ok";
    });
    expect(await Promise.all([job(), job()])).toEqual(["ok", "ok"]);
    expect(maxActive).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("refuses unsafe cross-tab sync when locks are absent", async () => {
    vi.stubGlobal("navigator", {});
    await expect(withPhotoTabLock("run-1", async () => "unsafe")).rejects.toThrow("Bloqueio entre abas indisponível");
    vi.unstubAllGlobals();
  });
});
