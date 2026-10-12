import { createHash } from "node:crypto";

/** Canonical fingerprint for a reviewed restoration retry. No secrets or auth tokens. */
export function restoreRequestFingerprint(input: {
  actorUserId: string;
  expectedUpdatedAt: Date;
  rooms: unknown;
  openingOverrides: unknown;
}): string {
  if (!input.actorUserId || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
    throw new Error("RESTORE_INVALID_FINGERPRINT_INPUT");
  }
  return createHash("sha256").update(JSON.stringify({
    actorUserId: input.actorUserId,
    expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
    rooms: input.rooms,
    openingOverrides: input.openingOverrides,
  })).digest("hex");
}
