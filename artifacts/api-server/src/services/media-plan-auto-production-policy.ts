/**
 * Regras (puras) da produção automática do Plano de Mídia.
 *
 * A produção automática só roda para planos que optaram por publicação
 * automática (`publicacaoOrganica.modo = "automatico"`), a menos que a
 * variável global `MARKETING_AUTO_PRODUCTION_ENABLED=true` force todos.
 *
 * O teto mensal da automação é separado do limite do plano: mesmo em planos
 * maiores, a IA só produz até `MARKETING_AUTO_PRODUCTION_MONTHLY_LIMIT`
 * (padrão 50) por mês. O restante continua disponível para geração manual.
 */

export const DEFAULT_AUTOMATIC_MONTHLY_LIMIT = 50;

export interface OrganicPublicationSettings {
  modo?: string;
  horario?: string;
  timezone?: string;
}

export function planAllowsAutomaticProduction(
  settings: OrganicPublicationSettings | null | undefined,
  globalOverride = false,
): boolean {
  if (globalOverride) return true;
  return settings?.modo === "automatico";
}

export function automaticProductionLimit(planLimit: number, configuredLimit = DEFAULT_AUTOMATIC_MONTHLY_LIMIT): number {
  const safePlanLimit = Number.isFinite(planLimit) && planLimit > 0 ? Math.floor(planLimit) : 20;
  const safeConfigured = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.floor(configuredLimit)
    : DEFAULT_AUTOMATIC_MONTHLY_LIMIT;
  return Math.min(safePlanLimit, safeConfigured);
}
