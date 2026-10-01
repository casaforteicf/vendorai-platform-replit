import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthProvider = "whatsapp" | "instagram" | "google-ads" | "meta-ads" | "youtube" | "linkedin" | "tiktok" | "search-console" | "sketchfab";

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  provider: OAuthProvider;
  returnTo?: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pendingNonces = new Map<string, number>();

function getOAuthStateSecret(): string {
  const secret = [
    process.env["OAUTH_STATE_SECRET"],
    process.env["JWT_SECRET"],
    process.env["SESSION_SECRET"],
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
  if (!secret || secret.length < 32) {
    throw new Error(
      "OAUTH_STATE_SECRET, JWT_SECRET or SESSION_SECRET must be configured with at least 32 characters",
    );
  }
  return secret;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", getOAuthStateSecret()).update(payload).digest();
}

function cleanupExpiredNonces(now: number): void {
  for (const [nonce, expiresAt] of pendingNonces.entries()) {
    if (expiresAt <= now) pendingNonces.delete(nonce);
  }
}

export function createOAuthState(
  tenantId: string,
  userId: string,
  provider: OAuthProvider,
  returnTo?: string,
): string {
  const now = Date.now();
  cleanupExpiredNonces(now);

  const payload: OAuthStatePayload = {
    tenantId,
    userId,
    provider,
    ...(returnTo ? { returnTo } : {}),
    nonce: randomBytes(24).toString("base64url"),
    issuedAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  };

  pendingNonces.set(payload.nonce, payload.expiresAt);
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function consumeOAuthState(state: string, provider: OAuthProvider): OAuthStatePayload {
  const [encodedPayload, encodedSignature, ...extra] = state.split(".");
  if (!encodedPayload || !encodedSignature || extra.length > 0) {
    throw new Error("Invalid OAuth state format");
  }

  const actualSignature = Buffer.from(encodedSignature, "base64url");
  const expectedSignature = sign(encodedPayload);
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as OAuthStatePayload;

  const now = Date.now();
  cleanupExpiredNonces(now);
  if (
    !payload.tenantId ||
    !payload.userId ||
    !payload.nonce ||
    payload.provider !== provider ||
    payload.expiresAt <= now ||
    payload.issuedAt > now + 30_000
  ) {
    throw new Error("Expired or invalid OAuth state");
  }

  const nonceExpiresAt = pendingNonces.get(payload.nonce);
  if (!nonceExpiresAt || nonceExpiresAt !== payload.expiresAt) {
    throw new Error("OAuth state already used or unknown");
  }

  pendingNonces.delete(payload.nonce);
  return payload;
}
