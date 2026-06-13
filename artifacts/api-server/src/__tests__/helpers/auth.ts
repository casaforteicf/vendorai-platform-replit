import jwt from "jsonwebtoken";

export const TEST_SECRET = "test-jwt-secret-for-unit-tests";

export const TENANT_A = "tenant-alpha";
export const TENANT_B = "tenant-beta";

export function makeToken(
  tenantId: string,
  platformRole: "super_admin" | "tenant_admin" | "member" = "tenant_admin"
): string {
  return jwt.sign(
    {
      sub: `user-${tenantId}`,
      email: `user@${tenantId}.example.com`,
      platformRole,
      tenantId,
      role: "admin",
    },
    TEST_SECRET,
    { expiresIn: "1h" }
  );
}

export const tokenA = makeToken(TENANT_A);
export const tokenB = makeToken(TENANT_B);
export const tokenSuperAdmin = makeToken("platform", "super_admin");
