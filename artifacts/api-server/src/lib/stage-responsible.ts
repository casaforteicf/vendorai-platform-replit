export function userMatchesStageResponsibleFunctions(
  user: {
    active: boolean | null;
    platformRole?: string | null;
    userFunction: string | null;
    customFunctionId: string | null;
  },
  responsibleFunctions: string[] | null | undefined,
): boolean {
  if (user.active !== true) return false;

  // Administradores podem operar qualquer etapa. A regra vale para o
  // responsável escolhido, não apenas para quem está movendo o negócio.
  if (
    user.platformRole === "super_admin"
    || user.platformRole === "tenant_admin"
    || user.userFunction === "administrador"
  ) {
    return true;
  }

  const configured = responsibleFunctions ?? [];

  // Etapa sem função responsável configurada não restringe o responsável:
  // qualquer usuário ativo do tenant pode assumir. Antes esta condição
  // bloqueava todas as transferências para etapas como "Pedido confirmado",
  // que nascem sem funções configuradas (STAGE_RESPONSIBLE_REQUIRED).
  if (configured.length === 0) return true;

  const refs = new Set<string>();
  if (user.userFunction) refs.add(`builtin:${user.userFunction}`);
  if (user.customFunctionId) refs.add(`custom:${user.customFunctionId}`);
  return configured.some((responsible) => refs.has(responsible));
}
