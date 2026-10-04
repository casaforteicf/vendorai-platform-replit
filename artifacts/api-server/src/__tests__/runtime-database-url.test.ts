import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeConnectionString,
  recoverPostgresConnectionString,
  safeConnectionTarget,
} from "@workspace/db/runtime-connection-string";

describe("runtime database connection string recovery", () => {
  it("recovers the first valid URL when two PostgreSQL URLs are concatenated", () => {
    const valid = "postgresql://vendorai_app.project:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
    expect(recoverPostgresConnectionString(valid + valid)).toBe(valid);
  });

  it("drops accidental prefix garbage before the PostgreSQL scheme", () => {
    expect(
      recoverPostgresConnectionString("garbagepostgresql://user:secret@db.example.com:5432/postgres"),
    ).toBe("postgresql://user:secret@db.example.com:5432/postgres");
  });

  it("keeps a custom-role Supabase pooler URL intact", () => {
    const value = "postgresql://vendorai_app.project:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
    expect(normalizeRuntimeConnectionString(value, true)).toBe(value);
  });

  it("does not rewrite the postgres user for non-Supabase APP_DATABASE_URL hosts", () => {
    const value = "postgresql://postgres:secret@postgres.railway.internal:5432/railway";
    expect(normalizeRuntimeConnectionString(value, true)).toBe(value);
  });

  it("sanitizes an invalid database path instead of logging embedded credentials", () => {
    const target = safeConnectionTarget(
      "postgresql://user:secret@db.example.com:5432/postgrespostgresql://other:leak@db.example.com/postgres",
    );
    expect(target?.database).toBe("(redacted-invalid-path)");
    expect(JSON.stringify(target)).not.toContain("leak");
    expect(JSON.stringify(target)).not.toContain("secret");
  });
});
