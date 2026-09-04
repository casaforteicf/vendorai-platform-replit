import { createHmac, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

const rootSecret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
if (!rootSecret) throw new Error("JWT_SECRET (or SESSION_SECRET as fallback) is required");

function derive(label: string): string {
  return createHmac("sha256", rootSecret!).update(label).digest("hex");
}

// Dedicated secrets are preferred when provisioned. The domain-separated
// derivation keeps App User credentials cryptographically distinct from the
// internal VendorAI JWT even before those optional variables exist.
const appUserJwtSecret =
  process.env["APP_USER_JWT_SECRET"] ?? derive("vendorai:app-user-jwt:v1");
const appUserAuthPepper =
  process.env["APP_USER_AUTH_PEPPER"] ?? derive("vendorai:app-user-auth-pepper:v1");

const ISSUER = "vendorai-app-runtime";

export interface AppUserJwtPayload {
  sub: string;
  type: "app_user";
  tenantId: string;
  appInstanceId: string;
  membershipId: string;
  roleKey: string;
  permissions: string[];
}

export function signAppUserToken(payload: AppUserJwtPayload): string {
  return jwt.sign(payload, appUserJwtSecret, {
    expiresIn: "12h",
    issuer: ISSUER,
    audience: `app:${payload.appInstanceId}`,
  });
}

export function verifyAppUserToken(token: string, appInstanceId: string): AppUserJwtPayload {
  const payload = jwt.verify(token, appUserJwtSecret, {
    issuer: ISSUER,
    audience: `app:${appInstanceId}`,
  }) as AppUserJwtPayload;

  if (payload.type !== "app_user" || payload.appInstanceId !== appInstanceId) {
    throw new Error("Invalid App User token");
  }
  return payload;
}

export function hashAppUserChallenge(input: {
  challengeId: string;
  appInstanceId: string;
  appUserId: string;
  code: string;
}): string {
  return createHmac("sha256", appUserAuthPepper)
    .update(`${input.challengeId}:${input.appInstanceId}:${input.appUserId}:${input.code}`)
    .digest("hex");
}

export function challengeHashMatches(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
