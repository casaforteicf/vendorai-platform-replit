import { describe, expect, it } from "vitest";
import {
  extractObjectPaths,
  groupMissingBySource,
  normalizeObjectPath,
} from "../lib/storage-integrity.js";

describe("normalizeObjectPath", () => {
  it("mantém o path canônico", () => {
    expect(normalizeObjectPath("/objects/quotes/a.png")).toBe("/objects/quotes/a.png");
  });

  it("normaliza URLs relativas /api/storage/objects", () => {
    expect(normalizeObjectPath("/api/storage/objects/uploads/abc-123")).toBe(
      "/objects/uploads/abc-123",
    );
  });

  it("normaliza URL absoluta e remove query string", () => {
    expect(
      normalizeObjectPath(
        "https://app.exemplo.com/api/storage/objects/quotes/a.pdf?token=segredo#page=1",
      ),
    ).toBe("/objects/quotes/a.pdf");
  });

  it("remove pontuação de fechamento vinda de JSON serializado", () => {
    expect(normalizeObjectPath('/api/storage/objects/quotes/a.jpg"]')).toBe(
      "/objects/quotes/a.jpg",
    );
  });

  it("decodifica percent-encoding mantendo as barras", () => {
    expect(normalizeObjectPath("/objects/tenants/t%201/uploads/a%20b.png")).toBe(
      "/objects/tenants/t 1/uploads/a b.png",
    );
  });

  it("retorna null para valores sem object path", () => {
    expect(normalizeObjectPath("https://exemplo.com/logo.png")).toBeNull();
    expect(normalizeObjectPath("/brand/arqdor-logo.png")).toBeNull();
    expect(normalizeObjectPath("")).toBeNull();
    expect(normalizeObjectPath(null)).toBeNull();
  });
});

describe("extractObjectPaths", () => {
  it("extrai e deduplica paths de um array JSON", () => {
    const value = JSON.stringify([
      "/api/storage/objects/quotes/a.jpg",
      "https://app/api/storage/objects/quotes/b.png",
      "/api/storage/objects/quotes/a.jpg",
    ]);
    expect(extractObjectPaths(value).sort()).toEqual([
      "/objects/quotes/a.jpg",
      "/objects/quotes/b.png",
    ]);
  });

  it("extrai de texto com múltiplas referências embaralhadas", () => {
    const value = 'url: /objects/uploads/1, outra: "/objects/uploads/2" e fim';
    expect(extractObjectPaths(value).sort()).toEqual([
      "/objects/uploads/1",
      "/objects/uploads/2",
    ]);
  });

  it("ignora valores sem referência", () => {
    expect(extractObjectPaths("apenas texto")).toEqual([]);
    expect(extractObjectPaths(undefined)).toEqual([]);
  });
});

describe("groupMissingBySource", () => {
  it("conta cada origem uma vez por objeto e ordena por volume", () => {
    const grouped = groupMissingBySource([
      { path: "/objects/a", sources: ["renders.result", "media.storage"] },
      { path: "/objects/b", sources: ["renders.result"] },
      { path: "/objects/c", sources: ["renders.result", "tenants.logo_url"] },
    ]);
    expect(grouped).toEqual([
      { source: "renders.result", count: 3 },
      { source: "media.storage", count: 1 },
      { source: "tenants.logo_url", count: 1 },
    ]);
  });
});
