import { createHash } from "node:crypto";

/**
 * Stable, tenant-scoped registration key. Omission means the legacy API
 * remains usable; invalid values must be rejected rather than silently ignored.
 */
export function parseRegistrationRequestId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw Object.assign(new Error("Identificador de solicitação inválido."), { status: 422 });
  }
  return value.toLowerCase();
}

function stable(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("REGISTRATION_NONFINITE_NUMBER");
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, val]) => [key, stable(val)]));
  }
  return value;
}

export function fingerprintRegistrationPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value)) ?? "null").digest("hex");
}

export function matchesRegistrationReplay(
  metadata: Record<string, unknown> | null | undefined,
  actorId: string | null,
  fingerprint: string,
): boolean {
  // A replay must be attributed to an authenticated actor. Treating two null
  // actor IDs as equal could authorize an unattributed request replay.
  if (typeof actorId !== "string" || actorId.trim().length === 0) return false;
  if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(fingerprint)) return false;
  return metadata?.registrationActorId === actorId &&
    metadata?.registrationPayloadHash === fingerprint;
}
