/**
 * UI-01.02 — Backwards-compatible adapter for the CURRENT authenticated tenant.
 *
 * Does not create extra memberships, grant access or persist tenant overrides.
 * The API must supply verified organization/project memberships before the
 * context switcher can offer other organizations or projects.
 */
import {
  type ExperienceContext,
  type ExperienceKey,
  type MembershipRole,
  visibleExperiences,
} from "./unifiedExperienceCatalog";

export interface CurrentSessionIdentity {
  id: string;
  tenantId?: string | null;
  platformRole?: string | null;
  role?: string | null;
  userFunction?: string | null;
}

const BUSINESS_MODULES: readonly ExperienceKey[] = [
  "business", "commerce", "professional", "execution", "finance",
];

/** Canonical conservative role mapping: unknown roles never receive extra access. */
function resolveLegacyRole(user: CurrentSessionIdentity): MembershipRole | null {
  const tokens = [user.role, user.userFunction, user.platformRole]
    .filter((value): value is string => typeof value === "string")
    .map(value => value.trim().toLowerCase());
  if (tokens.some(value => ["tenant_admin", "administrador"].includes(value))) return "tenant_admin";
  if (tokens.includes("gerente")) return "manager";
  if (tokens.some(value => ["vendedor", "sales"].includes(value))) return "sales";
  return null;
}

/**
 * Generates exactly one organization-context descriptor for the session tenant.
 * No personal/project memberships can be inferred from a legacy tenant JWT.
 * Module enablement is provided by the caller from authorized backend data.
 */
export function legacySessionOrganizationContext(
  user: CurrentSessionIdentity | null,
  enabledModules: readonly ExperienceKey[],
  tenantLabel: string,
): ExperienceContext | null {
  if (!user?.id || !user.tenantId || !tenantLabel.trim()) return null;
  const role = resolveLegacyRole(user);
  if (!role) return null;
  const enabled = new Set(enabledModules);
  return {
    id: `organization:${user.tenantId}`,
    kind: "organization",
    label: tenantLabel.trim(),
    tenantId: user.tenantId,
    roles: [role],
    enabledExperiences: BUSINESS_MODULES.filter(module => enabled.has(module)),
  };
}

/**
 * Renders routes only after the caller has fetched enabled modules from the
 * backend. Do not use this function as a server-side permission check.
 */
export function legacySessionMenu(
  context: ExperienceContext | null,
): ReadonlyArray<{ title: string; href: string }> {
  if (!context) return [];
  return visibleExperiences(context).map(experience => ({
    title: experience.title,
    href: experience.entryPath,
  }));
}
