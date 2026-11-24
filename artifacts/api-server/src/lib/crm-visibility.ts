/**
 * Fonte única da visibilidade administrativa da carteira do CRM.
 *
 * `buildUserFunctionFilter` (listagens) e as leituras/mutações por ID precisam
 * usar exatamente a mesma regra: super_admin, tenant_admin e usuários com a
 * função "administrador" enxergam todos os leads do tenant. A divergência entre
 * as duas regras fazia o lead aparecer na pipeline e o detalhe responder 403.
 */
export type CrmWalletViewer =
  | {
      platformRole?: string | null;
      userFunction?: string | null;
    }
  | null
  | undefined;

export function seesWholeTenantWallet(user: CrmWalletViewer): boolean {
  return user?.platformRole === "super_admin"
    || user?.platformRole === "tenant_admin"
    || user?.userFunction === "administrador";
}
