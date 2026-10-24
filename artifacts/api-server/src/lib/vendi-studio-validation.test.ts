import { describe, expect, it } from "vitest";
import { vendiStudioCreateSchema as schema } from "./vendi-studio-validation.js";
describe("Vendi Studio project payload", () => {
  it("accepts application and other digital products", () => {
    for (const kind of ["web_app","mobile_app","website","book","ebook","course","agent","design","media","other"])
      expect(schema.safeParse({ title: "Projeto", kind }).success).toBe(true);
  });
  it("normalizes title and defaults kind", () => {
    const parsed = schema.parse({title:"  Novo projeto  "});
    expect(parsed.title).toBe("Novo projeto");
    expect(parsed.kind).toBe("web_app");
  });
  it("rejects empty title, unknown type, extra keys and huge briefing", () => {
    expect(schema.safeParse({title:" "}).success).toBe(false);
    expect(schema.safeParse({title:"ok",kind:"unsafe"}).success).toBe(false);
    expect(schema.safeParse({title:"ok",tenantId:"victim"}).success).toBe(false);
    expect(schema.safeParse({title:"ok",brief:"x".repeat(20001)}).success).toBe(false);
  });
});
