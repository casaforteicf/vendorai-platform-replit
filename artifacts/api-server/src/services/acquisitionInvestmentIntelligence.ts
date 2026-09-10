import { eq } from "drizzle-orm";
import {
  adCampaignsTable,
  commerceCheckoutSessionsTable,
  db,
  generatedSitesTable,
} from "@workspace/db";

export type AcquisitionDimension = "vertical" | "offer" | "landing_page" | "channel" | "creative" | "campaign";

export type AcquisitionInvestmentRow = {
  dimension: AcquisitionDimension;
  key: string;
  label: string;
  started: number;
  provisioned: number;
  contacted: number;
  recovered: number;
  conversionPercent: number;
  recoveryPercent: number;
  evidencePercent: number;
  investmentScore: number;
  recommendation: "scale" | "maintain" | "test" | "reduce";
};

type Accumulator = {
  dimension: AcquisitionDimension;
  key: string;
  label: string;
  started: number;
  provisioned: number;
  contacted: number;
  recovered: number;
};

function normalize(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function scoreRow(row: Accumulator): AcquisitionInvestmentRow {
  const conversionPercent = row.started > 0 ? (row.provisioned / row.started) * 100 : 0;
  const recoveryPercent = row.contacted > 0 ? (row.recovered / row.contacted) * 100 : 0;
  const evidencePercent = Math.min(100, (row.started / 10) * 100);
  const investmentScore = Math.min(100, Math.max(0,
    conversionPercent * 0.65 + recoveryPercent * 0.15 + evidencePercent * 0.20,
  ));

  let recommendation: AcquisitionInvestmentRow["recommendation"] = "test";
  if (row.started >= 5 && investmentScore >= 65) recommendation = "scale";
  else if (row.started >= 3 && investmentScore >= 40) recommendation = "maintain";
  else if (row.started >= 5 && conversionPercent === 0) recommendation = "reduce";

  return {
    ...row,
    conversionPercent: Number(conversionPercent.toFixed(2)),
    recoveryPercent: Number(recoveryPercent.toFixed(2)),
    evidencePercent: Number(evidencePercent.toFixed(2)),
    investmentScore: Number(investmentScore.toFixed(2)),
    recommendation,
  };
}

export async function getAcquisitionInvestmentIntelligence() {
  const rows = await db
    .select({
      siteSlug: commerceCheckoutSessionsTable.siteSlug,
      status: commerceCheckoutSessionsTable.status,
      offerSnapshot: commerceCheckoutSessionsTable.offerSnapshot,
      attribution: commerceCheckoutSessionsTable.attribution,
      recoveryAttempts: commerceCheckoutSessionsTable.recoveryAttempts,
      siteTenantId: generatedSitesTable.tenantId,
    })
    .from(commerceCheckoutSessionsTable)
    .innerJoin(generatedSitesTable, eq(generatedSitesTable.id, commerceCheckoutSessionsTable.siteId))
    .limit(10000);

  const campaignRows = await db
    .select({
      tenantId: adCampaignsTable.tenantId,
      utmCode: adCampaignsTable.utmCode,
      plataforma: adCampaignsTable.plataforma,
      contentGenerationId: adCampaignsTable.contentGenerationId,
    })
    .from(adCampaignsTable)
    .limit(5000);

  const campaignByTenantUtm = new Map<string, typeof campaignRows[number]>();
  for (const campaign of campaignRows) {
    if (campaign.utmCode) campaignByTenantUtm.set(`${campaign.tenantId}:${campaign.utmCode}`, campaign);
  }

  const groups = new Map<string, Accumulator>();
  const add = (dimension: AcquisitionDimension, key: string, label: string, provisioned: boolean, contacted: boolean) => {
    const mapKey = `${dimension}:${key}`;
    const current = groups.get(mapKey) ?? { dimension, key, label, started: 0, provisioned: 0, contacted: 0, recovered: 0 };
    current.started += 1;
    if (provisioned) current.provisioned += 1;
    if (contacted) current.contacted += 1;
    if (provisioned && contacted) current.recovered += 1;
    groups.set(mapKey, current);
  };

  for (const row of rows) {
    const paid = row.status === "provisioned";
    const contacted = row.recoveryAttempts > 0;
    const vertical = normalize(row.offerSnapshot.vertical, "sem_vertical");
    const offer = normalize(row.offerSnapshot.offerCode, `plano:${row.offerSnapshot.planSlug}`);
    const campaign = normalize(row.attribution.utmCampaign, "sem_campanha");
    const matchedCampaign = row.attribution.utmCampaign
      ? campaignByTenantUtm.get(`${row.siteTenantId}:${row.attribution.utmCampaign}`)
      : undefined;
    const channel = normalize(
      row.attribution.utmSource,
      matchedCampaign?.plataforma ?? row.attribution.utmMedium ?? "direto",
    );
    const creative = normalize(
      row.attribution.utmContent,
      matchedCampaign?.contentGenerationId ?? "sem_criativo_identificado",
    );

    add("vertical", vertical, vertical, paid, contacted);
    add("offer", offer, offer, paid, contacted);
    add("landing_page", row.siteSlug, row.siteSlug, paid, contacted);
    add("campaign", campaign, campaign, paid, contacted);
    add("channel", channel, channel, paid, contacted);
    add("creative", creative, creative, paid, contacted);
  }

  const scored = Array.from(groups.values()).map(scoreRow);
  const dimensionOrder: AcquisitionDimension[] = ["vertical", "offer", "landing_page", "channel", "creative", "campaign"];
  const dimensions = dimensionOrder.map((dimension) => ({
    dimension,
    rows: scored
      .filter((row) => row.dimension === dimension)
      .sort((a, b) => b.investmentScore - a.investmentScore || b.started - a.started)
      .slice(0, 20),
  }));

  const best = scored
    .filter((row) => row.started >= 3)
    .sort((a, b) => b.investmentScore - a.investmentScore)[0] ?? null;
  const weakest = scored
    .filter((row) => row.started >= 5)
    .sort((a, b) => a.investmentScore - b.investmentScore)[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    scoring: {
      paidConversionWeightPercent: 65,
      recoveryWeightPercent: 15,
      evidenceWeightPercent: 20,
      minimumStartsToScale: 5,
    },
    best,
    weakest,
    dimensions,
  };
}
