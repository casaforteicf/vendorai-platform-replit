import { describe, expect, it } from "vitest";

describe("Dev IA specialist validation contract", () => {
  const allowed = [
    "pnpm run typecheck",
    "pnpm --filter @workspace/frontend test",
    "pnpm --filter @workspace/api-server test",
    "pnpm --filter @workspace/api-server audit:tenant:strict",
  ];

  it("keeps the validation surface explicit", () => {
    expect(allowed).toHaveLength(4);
    expect(new Set(allowed).size).toBe(4);
    expect(allowed).toContain("pnpm --filter @workspace/api-server audit:tenant:strict");
  });
});
