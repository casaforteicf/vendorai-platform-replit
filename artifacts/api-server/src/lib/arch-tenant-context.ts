export type ArchTenantUser = {
  tenantId?: string | null;
  platformRole?: string | null;
};

function headerTenantId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw?.trim();
  return normalized || null;
}

export function resolveArchTenantId(
  user: ArchTenantUser | null | undefined,
  tenantHeader: string | string[] | undefined,
) {
  const sessionTenantId = user?.tenantId?.trim() || null;

  if (user?.platformRole !== "super_admin") {
    return sessionTenantId;
  }

  return headerTenantId(tenantHeader) ?? sessionTenantId;
}
