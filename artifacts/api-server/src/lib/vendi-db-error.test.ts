import { describe, expect, it } from "vitest";
import { getVendiPostgresErrorCode } from "./vendi-db-error.js";

describe("getVendiPostgresErrorCode", () => {
  it("reads a PostgreSQL code from a wrapped Drizzle cause", () => {
    expect(getVendiPostgresErrorCode({
      message: "Failed query: insert ... params: private mission text",
      cause: { code: "42P01" },
    })).toBe("42P01");
  });

  it("accepts a direct PostgreSQL error", () => {
    expect(getVendiPostgresErrorCode({ code: "42501" })).toBe("42501");
  });

  it("returns undefined when no PostgreSQL code exists", () => {
    expect(getVendiPostgresErrorCode(new Error("connection failed"))).toBeUndefined();
  });
});
