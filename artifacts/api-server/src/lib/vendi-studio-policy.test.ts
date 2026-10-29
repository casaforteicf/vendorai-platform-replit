import { describe, expect, it } from "vitest";
import { canUseVendiStudio } from "./vendi-studio-policy.js";
import type { JwtPayload } from "../lib/jwt.js";
const user: JwtPayload = { sub: "user-1", tenantId: "tenant-a", email: "test@example.com", platformRole: "tenant_admin", role: "admin" };
describe("Vendi Studio pilot access", () => {
  it("denies disabled tenant, including administrators", () => expect(canUseVendiStudio(user, false)).toBe(false));
  it("allows explicitly enabled human tenant administrator", () => expect(canUseVendiStudio(user, true)).toBe(true));
  it("denies members and partners", () => {
    expect(canUseVendiStudio({ ...user, platformRole: "member" }, true)).toBe(false);
    expect(canUseVendiStudio({ ...user, platformRole: "partner" }, true)).toBe(false);
  });
  it("denies scoped guest links", () => expect(canUseVendiStudio({ ...user, accessScope: "preprojeto" }, true)).toBe(false));
  it("denies internal agents even with an admin role", () => expect(canUseVendiStudio({ ...user, actorType: "ai" }, true)).toBe(false));
  it("denies missing user and tenant", () => {
    expect(canUseVendiStudio(undefined, true)).toBe(false);
    expect(canUseVendiStudio({ ...user, tenantId: "" }, true)).toBe(false);
  });
});
