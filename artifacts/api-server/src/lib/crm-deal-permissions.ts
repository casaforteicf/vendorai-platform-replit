import { seesWholeTenantWallet, type CrmWalletViewer } from "./crm-visibility.js";

export type CrmDealActor = CrmWalletViewer & { sub?: string | null };

/**
 * Regra única para trocar o responsável de um negócio.
 *
 * Reatribuir a carteira é ação administrativa (super_admin, tenant_admin ou
 * função "administrador"), como já acontece na reatribuição de leads. A
 * exceção é a primeira atribuição: um negócio ainda sem responsável pode ser
 * assumido pelo próprio usuário, sem exigir administrador.
 *
 * Manter a regra em um único lugar evita que o PATCH de avanço e a
 * transferência entre pipelines respondam coisas diferentes para o mesmo
 * usuário/função — divergência que gerava 403 indevido no fluxo de mover card.
 */
export function canChangeDealOwner(
  user: CrmDealActor,
  currentOwnerId: string | null | undefined,
  nextOwnerId: string | null | undefined,
): boolean {
  if (nextOwnerId === currentOwnerId) return true;
  if (seesWholeTenantWallet(user)) return true;
  if (currentOwnerId) return false;
  return Boolean(nextOwnerId) && nextOwnerId === user?.sub;
}
