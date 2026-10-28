import { describe, expect, it } from "vitest";
import {
  checkpointFromState,
  classifyBrowserError,
  isBrowserSnapshotLoading,
  isRetryableBrowserError,
  validateBrowserUrl,
} from "./browser-agent.js";

describe("validateBrowserUrl", () => {
  it("allows public https URLs", () => {
    expect(validateBrowserUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("blocks localhost and private IPv4 ranges", () => {
    expect(() => validateBrowserUrl("http://localhost:3000")).toThrow();
    expect(() => validateBrowserUrl("http://127.0.0.1")).toThrow();
    expect(() => validateBrowserUrl("http://10.0.0.10")).toThrow();
    expect(() => validateBrowserUrl("http://192.168.1.10")).toThrow();
    expect(() => validateBrowserUrl("http://172.16.0.10")).toThrow();
    expect(() => validateBrowserUrl("http://169.254.1.1")).toThrow();
  });

  it("rejects non-http protocols", () => {
    expect(() => validateBrowserUrl("file:///etc/passwd")).toThrow();
    expect(() => validateBrowserUrl("ftp://example.com/file")).toThrow();
  });

  it("honors connection-scoped allowed hosts", () => {
    expect(
      validateBrowserUrl("https://portal.example.com/orders", ["example.com"]),
    ).toBe("https://portal.example.com/orders");

    expect(() =>
      validateBrowserUrl("https://evil.example.net", ["example.com"]),
    ).toThrow("Host não permitido");
  });
});

describe("read-only Browser Agent snapshot readiness", () => {
  it("does not report a loading SPA shell as a completed check", () => {
    expect(isBrowserSnapshotLoading({ text: "Carregando o sistema…", interactive: [] })).toBe(true);
    expect(isBrowserSnapshotLoading({ text: "Loading...", interactive: [] })).toBe(true);
  });

  it("allows meaningful public content or an interactive loaded page", () => {
    expect(isBrowserSnapshotLoading({ text: "Produtos VendorAI disponíveis", interactive: [] })).toBe(false);
    expect(isBrowserSnapshotLoading({ text: "Carregando o sistema…", interactive: [{}] })).toBe(false);
  });
});

describe("browser recovery primitives", () => {
  it("classifies selector changes for re-planning", () => {
    expect(classifyBrowserError(new Error("No node found for selector: #save"))).toBe("selector_stale");
    expect(isRetryableBrowserError(new Error("No node found for selector: #save"))).toBe(false);
  });

  it("retries only transient navigation failures", () => {
    expect(classifyBrowserError(new Error("Navigation timeout of 30000 ms exceeded"))).toBe("navigation_timeout");
    expect(isRetryableBrowserError(new Error("Navigation timeout of 30000 ms exceeded"))).toBe(true);
    expect(classifyBrowserError(new Error("APPROVAL_REQUIRED: confirmação"))).toBe("approval_required");
    expect(isRetryableBrowserError(new Error("APPROVAL_REQUIRED: confirmação"))).toBe(false);
  });

  it("creates a compact checkpoint signature", () => {
    const checkpoint = checkpointFromState({
      url: "https://example.com/orders",
      title: "Orders",
      text: "Pedido 123 pronto para envio",
      interactive: [{}, {}],
    });
    expect(checkpoint.url).toBe("https://example.com/orders");
    expect(checkpoint.interactiveCount).toBe(2);
    expect(checkpoint.textSignature).toMatch(/^[0-9a-f]{8}$/);
  });
});
