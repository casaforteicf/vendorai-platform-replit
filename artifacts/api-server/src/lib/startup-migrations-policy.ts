/**
 * Política de migrations no boot.
 *
 * Em produção o schema é gerenciado pelo pipeline privilegiado; a API roda
 * com o role restrito e não deve tentar aplicar migrations. O código só
 * reconhecia `RAILWAY_ENVIRONMENT_NAME`, mas o container define
 * `RAILWAY_ENVIRONMENT=production`. Resultado: a API tentava migrar, batia em
 * checksum divergente e subia em modo degradado (databaseReady=false), sem
 * schedulers/workers.
 *
 * Esta função centraliza a decisão e aceita as duas variáveis do Railway.
 */
export interface StartupMigrationPolicy {
  railwayEnvironment: string;
  productionManagedSchema: boolean;
  homologationManagedSchema: boolean;
}

export function resolveStartupMigrationPolicy(
  env: NodeJS.ProcessEnv = process.env,
): StartupMigrationPolicy {
  const railwayEnvironment = String(
    env["RAILWAY_ENVIRONMENT_NAME"] ?? env["RAILWAY_ENVIRONMENT"] ?? "",
  )
    .trim()
    .toLowerCase();
  const homologationManagedSchema = ["1", "true"].includes(
    String(env["VENDORAI_HOMOLOGATION_SEED"] ?? "").trim().toLowerCase(),
  );

  return {
    railwayEnvironment,
    productionManagedSchema: railwayEnvironment === "production",
    homologationManagedSchema,
  };
}
