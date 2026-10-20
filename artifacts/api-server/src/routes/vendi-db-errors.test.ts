import { describe, expect, it } from "vitest";
import { getPostgresDiagnostic } from "./vendi-db-errors.js";

describe("getPostgresDiagnostic", () => {
  it("unwraps a PostgreSQL error nested in a Drizzle query error", () => {
    const result = getPostgresDiagnostic({
      message: "Failed query: insert ... params: [private mission content]",
      cause: Object.assign(new Error("relation missing"), {
        code: "42P01",
        schema: "public",
        table: "vendi_missions",
      }),
    });

    expect(result).toEqual({
      code: "42P01",
      schema: "public",
      table: "vendi_missions",
      errorTypes: ["Object", "Error"],
    });
    expect(JSON.stringify(result)).not.toContain("private mission content");
  });

  it("returns a permission SQLSTATE without leaking the database message", () => {
    const result = getPostgresDiagnostic({
      cause: Object.assign(new Error("permission denied for relation"), {
        code: "42501",
        table: "vendi_missions",
      }),
    });

    expect(result).toEqual({ code: "42501", table: "vendi_missions", errorTypes: ["Object", "Error"] });
    expect(JSON.stringify(result)).not.toContain("permission denied");
  });

  it("handles absent, malformed, and cyclic causes", () => {
    expect(getPostgresDiagnostic(new Error("unknown"))).toEqual({ code: null, errorTypes: ["Error"] });
    expect(getPostgresDiagnostic({ code: "42" })).toEqual({ code: null, errorTypes: ["Object"] });

    const cyclic: Record<string, unknown> = {};
    cyclic.cause = cyclic;
    expect(getPostgresDiagnostic(cyclic)).toEqual({ code: null, errorTypes: ["Object"] });
  });

  it("unwraps common driver and ORM wrapper properties and SQLSTATE aliases", () => {
    const result = getPostgresDiagnostic({
      name: "OrmQueryError",
      driverError: {
        name: "DatabaseError",
        sqlState: "42501",
        table: "vendi_missions",
      },
    });

    expect(result).toEqual({
      code: "42501",
      table: "vendi_missions",
      errorTypes: ["OrmQueryError", "DatabaseError"],
    });
  });

  it("does not expose error messages in diagnostics for unknown failures", () => {
    const result = getPostgresDiagnostic({
      name: "OrmQueryError",
      message: "secret objective and connection string",
      cause: new Error("secret objective and connection string"),
    });

    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).toEqual({ code: null, errorTypes: ["OrmQueryError", "Error"] });
  });
});
