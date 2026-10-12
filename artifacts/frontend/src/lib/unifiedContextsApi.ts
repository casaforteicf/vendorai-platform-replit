import type { ExperienceContext } from "./unifiedExperienceCatalog";

export interface VerifiedContextResponse {
  currentContextId: string;
  contexts: ExperienceContext[];
  capabilitiesStatus: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Fail-closed decoder: malformed discovery data never enables experiences.
 * Membership/authentication are still enforced exclusively by the backend.
 */
export function decodeVerifiedContexts(input: unknown): VerifiedContextResponse | null {
  if (!isRecord(input) || !Array.isArray(input.contexts) ||
      typeof input.currentContextId !== "string" ||
      input.capabilitiesStatus !== "pending_backend_entitlement_mapping") return null;

  const contexts: ExperienceContext[] = [];
  for (const raw of input.contexts) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id ||
        typeof raw.label !== "string" || !raw.label ||
        raw.kind !== "organization" || typeof raw.tenantId !== "string" || !raw.tenantId ||
        !Array.isArray(raw.roles) || !raw.roles.every((r: unknown) => ["tenant_admin", "sales", "member"].includes(String(r))) ||
        !Array.isArray(raw.enabledExperiences) || raw.enabledExperiences.length !== 0) {
      return null;
    }
    contexts.push({
      id: raw.id, kind: "organization", label: raw.label,
      tenantId: raw.tenantId, roles: raw.roles as ExperienceContext["roles"], enabledExperiences: [],
    });
  }
  if (!contexts.some(ctx => ctx.id === input.currentContextId)) return null;
  return {
    currentContextId: input.currentContextId,
    contexts,
    capabilitiesStatus: "pending_backend_entitlement_mapping",
  };
}

/** Session token is injected by the existing authenticated-fetch layer. */
export async function loadVerifiedContexts(signal?: AbortSignal): Promise<VerifiedContextResponse | null> {
  const response = await fetch("/api/ui/contexts", {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) return null;
  return decodeVerifiedContexts(await response.json());
}
