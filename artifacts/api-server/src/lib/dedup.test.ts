import { describe, it, expect } from "vitest";
import { normalizePhone, normalizeDocument, storePhone, storeDocument } from "./dedup.js";

describe("normalizePhone", () => {
  it("prepends 55 to 11-digit Brazilian number", () => {
    expect(normalizePhone("11999998888")).toBe("5511999998888");
  });
  it("keeps number already with 55", () => {
    expect(normalizePhone("5511999998888")).toBe("5511999998888");
  });
  it("strips non-digits", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("5511999998888");
  });
  it("returns null for empty string", () => {
    expect(normalizePhone("")).toBe(null);
  });
  it("returns null for undefined", () => {
    expect(normalizePhone(undefined)).toBe(null);
  });
  it("returns null for null", () => {
    expect(normalizePhone(null)).toBe(null);
  });
  it("handles 10-digit landline", () => {
    expect(normalizePhone("1133334444")).toBe("551133334444");
  });
  it("handles number with +55 prefix", () => {
    expect(normalizePhone("+5511999998888")).toBe("5511999998888");
  });
  it("handles 13-digit number (with 55)", () => {
    expect(normalizePhone("55119999988888")).toBe("55119999988888");
  });
});

describe("normalizeDocument", () => {
  it("removes dots and dashes from CPF", () => {
    expect(normalizeDocument("123.456.789-00")).toBe("12345678900");
  });
  it("removes dots, dashes and slash from CNPJ", () => {
    expect(normalizeDocument("12.345.678/0001-00")).toBe("12345678000100");
  });
  it("returns null for empty string", () => {
    expect(normalizeDocument("")).toBe(null);
  });
  it("returns null for undefined", () => {
    expect(normalizeDocument(undefined)).toBe(null);
  });
  it("returns null for null", () => {
    expect(normalizeDocument(null)).toBe(null);
  });
  it("returns cleaned CPF without formatting", () => {
    expect(normalizeDocument("98765432100")).toBe("98765432100");
  });
});

describe("storePhone", () => {
  it("normalizes before storage", () => {
    expect(storePhone("11999998888")).toBe("5511999998888");
  });
  it("returns null for empty input", () => {
    expect(storePhone("")).toBe(null);
  });
  it("returns null for undefined", () => {
    expect(storePhone(undefined)).toBe(null);
  });
});

describe("storeDocument", () => {
  it("normalizes before storage", () => {
    expect(storeDocument("123.456.789-00")).toBe("12345678900");
  });
  it("returns null for empty input", () => {
    expect(storeDocument("")).toBe(null);
  });
  it("returns null for undefined", () => {
    expect(storeDocument(undefined)).toBe(null);
  });
});
