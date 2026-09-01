import { eq } from "drizzle-orm";
import { db, googleAdsConnectionsTable } from "@workspace/db";

export type GoogleDataManagerActionConfig = {
  leadConversionActionId?: string | null;
  trialConversionActionId?: string | null;
  saleConversionActionId?: string | null;
};

function normalizeConversionActionId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Conversion Action ID deve conter somente números");
  }
  return normalized;
}

export async function configureGoogleDataManagerActions(
  tenantId: string,
  config: GoogleDataManagerActionConfig,
) {
  const [connection] = await db
    .select({ id: googleAdsConnectionsTable.id })
    .from(googleAdsConnectionsTable)
    .where(eq(googleAdsConnectionsTable.tenantId, tenantId))
    .limit(1);

  if (!connection) {
    throw new Error("Conecte uma conta Google Ads antes de configurar o Data Manager");
  }

  const leadConversionActionId = normalizeConversionActionId(config.leadConversionActionId);
  const trialConversionActionId = normalizeConversionActionId(config.trialConversionActionId);
  const saleConversionActionId = normalizeConversionActionId(config.saleConversionActionId);
  const anyConfigured = Boolean(
    leadConversionActionId || trialConversionActionId || saleConversionActionId,
  );

  const [updated] = await db
    .update(googleAdsConnectionsTable)
    .set({
      dataManagerLeadConversionActionId: leadConversionActionId,
      dataManagerTrialConversionActionId: trialConversionActionId,
      dataManagerSaleConversionActionId: saleConversionActionId,
      dataManagerConfiguredAt: anyConfigured ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(googleAdsConnectionsTable.id, connection.id))
    .returning({
      leadConversionActionId: googleAdsConnectionsTable.dataManagerLeadConversionActionId,
      trialConversionActionId: googleAdsConnectionsTable.dataManagerTrialConversionActionId,
      saleConversionActionId: googleAdsConnectionsTable.dataManagerSaleConversionActionId,
      configuredAt: googleAdsConnectionsTable.dataManagerConfiguredAt,
    });

  return updated;
}
