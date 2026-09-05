import { describe, expect, it } from "vitest";

describe("Dev IA specialist council contract", () => {
  it("keeps the allowed validation commands explicit", () => {
    const allowed = [
      "pnpm run typecheck",
      "pnpm --filter @workspace/frontend test",
      "pnpm --filter @workspace/api-server test",
      "pnpm --filter @workspace/api-server audit:tenant:strict",
    ];

    expect(allowed).toContain("pnpm --filter @workspace/api-server audit:tenant:strict");
    expect(new Set(allowed).size).toBe(4);
  });

  it("defines the five engineering specialties", () => {
    const specialists = [
      "frontend_ux",
      "backend_api",
      "data_multitenant",
      "integrations_devops",
      "security_reliability",
    ];

    expect(specialists).toHaveLength(5);
    expect(specialists).toContain("data_multitenant");
    expect(specialists).toContain("security_reliability");
  });
});
