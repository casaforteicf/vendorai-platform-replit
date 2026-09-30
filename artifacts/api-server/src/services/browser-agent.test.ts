import { describe, expect, it } from "vitest";
import { validateBrowserUrl } from "./browser-agent.js";

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
