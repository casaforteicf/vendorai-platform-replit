import { and, eq } from "drizzle-orm";
import { db, tenantsTable, usuariosOrganizacaoTable } from "@workspace/db";

export type SessionTenantContext = {
  id: string;
  vertical: string | null;
  logoUrl: string | null;
  whiteLabelCompleto: boolean | null;
  organizacaoId: string | null;
};

export type SessionTenantResolution =
  | { ok: true; tenant: SessionTenantContext }
  | { ok: false; reason: "tenant_not_found" | "cross_org" | "membership_missing" };

/**
 * Resolve o tenant efetivo de uma sessão.
 *
 * users.tenantId é o tenant-base da conta. Após /auth/switch-tenant, o tenant
 * ativo passa a existir no JWT e NÃO deve ser sobrescrito novamente pelo
 * tenant-base. Para um tenant alternado, revalidamos organização + vínculo do
 * usuário no banco a cada /auth/me e /auth/refresh.
 */
export async function resolveSessionTenantContext(input: {
  userId: string;
  baseTenantId: string;
  tokenTenantId: string;
  platformRole?: string;
}): Promise<SessionTenantResolution> {
  const activeTenantId = input.tokenTenantId || input.baseTenantId;

  const [activeTenant] = await db
    .select({
      id: tenantsTable.id,
      vertical: tenantsTable.vertical,
      logoUrl: tenantsTable.logoUrl,
      whiteLabelCompleto: tenantsTable.whiteLabelCompleto,
      organizacaoId: tenantsTable.organizacaoId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, activeTenantId));

  if (!activeTenant) {
    return { ok: false, reason: "tenant_not_found" };
  }

  if (activeTenantId === input.baseTenantId || input.platformRole === "super_admin") {
    return { ok: true, tenant: activeTenant };
  }

  const [baseTenant] = await db
    .select({ organizacaoId: tenantsTable.organizacaoId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, input.baseTenantId));

  if (
    !baseTenant?.organizacaoId ||
    !activeTenant.organizacaoId ||
    baseTenant.organizacaoId !== activeTenant.organizacaoId
  ) {
    return { ok: false, reason: "cross_org" };
  }

  const [membership] = await db
    .select({ id: usuariosOrganizacaoTable.id })
    .from(usuariosOrganizacaoTable)
    .where(
      and(
        eq(usuariosOrganizacaoTable.userId, input.userId),
        eq(usuariosOrganizacaoTable.organizacaoId, activeTenant.organizacaoId),
      ),
    );

  if (!membership) {
    return { ok: false, reason: "membership_missing" };
  }

  return { ok: true, tenant: activeTenant };
}
