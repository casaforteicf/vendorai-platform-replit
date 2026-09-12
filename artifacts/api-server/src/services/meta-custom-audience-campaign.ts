import { eq } from "drizzle-orm";
import { adCampaignsTable, db } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { publishCampaignToMetaAds } from "./meta-ads-campaign-publish.js";
import {
  getMetaAdsConnectionByTenantId,
  refreshMetaAdsToken,
  META_GRAPH_BASE,
} from "./meta-ads-oauth.js";

async function getActiveMetaToken(tenantId: string): Promise<string> {
  let conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.accessToken) {
    throw new Error("Meta Ads precisa estar conectado antes de publicar o remarketing.");
  }

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (expiresAt && expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(conn.id);
    conn = await getMetaAdsConnectionByTenantId(tenantId);
  }
  if (!conn?.accessToken || conn.status !== "active") {
    throw new Error("Não foi possível obter um token Meta Ads ativo.");
  }
  return conn.accessToken;
}

async function metaRequest<T>(path: string, accessToken: string, method: "GET" | "POST", params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url.toString());
    const text = await response.text();
    if (!response.ok) throw new Error(`Meta Ads recusou a atualização da audiência (${response.status}): ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta Ads recusou a atualização da audiência (${response.status}): ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Publica usando o fluxo Meta já existente (sempre PAUSED) e, antes de qualquer
 * ativação, substitui interesses amplos pela Custom Audience selecionada.
 * Se a troca de targeting falhar, a campanha permanece pausada na Meta.
 */
export async function publishMetaCampaignWithCustomAudience(input: {
  tenantId: string;
  campaignId: string;
  audienceKey: string;
  audienceLabel: string;
  externalAudienceId: string;
}) {
  const result = await publishCampaignToMetaAds(input.tenantId, input.campaignId);
  const accessToken = await getActiveMetaToken(input.tenantId);

  try {
    const current = await metaRequest<{ targeting?: Record<string, unknown> }>(
      result.adSetId,
      accessToken,
      "GET",
      { fields: "targeting" },
    );
    const targeting = asRecord(current.targeting);
    delete targeting["flexible_spec"];
    targeting["custom_audiences"] = [{ id: input.externalAudienceId }];

    await metaRequest(result.adSetId, accessToken, "POST", {
      targeting: JSON.stringify(targeting),
    });

    const [campaign] = await db
      .select({ segmentacao: adCampaignsTable.segmentacao })
      .from(adCampaignsTable)
      .where(eq(adCampaignsTable.id, input.campaignId))
      .limit(1);
    const segmentacao = asRecord(campaign?.segmentacao);
    const rawExisting = Array.isArray(segmentacao["metaCustomAudiences"])
      ? segmentacao["metaCustomAudiences"] as Array<Record<string, unknown>>
      : [];
    const metaCustomAudiences = [
      ...rawExisting.filter((item) => item["key"] !== input.audienceKey),
      {
        key: input.audienceKey,
        label: input.audienceLabel,
        externalAudienceId: input.externalAudienceId,
        appliedAt: new Date().toISOString(),
        appliedToAdSetId: result.adSetId,
      },
    ];

    await db
      .update(adCampaignsTable)
      .set({
        segmentacao: {
          ...segmentacao,
          metaCustomAudiences,
          metaAudienceTargetingMode: "custom_audience",
          metaAudienceTargetingAppliedAt: new Date().toISOString(),
        } as any,
        updatedAt: new Date(),
      })
      .where(eq(adCampaignsTable.id, input.campaignId));

    logger.info({ tenantId: input.tenantId, campaignId: input.campaignId, adSetId: result.adSetId, audienceKey: input.audienceKey }, "meta remarketing: Custom Audience aplicada ao ad set pausado");
    return {
      ...result,
      audienceKey: input.audienceKey,
      audienceLabel: input.audienceLabel,
      externalAudienceId: input.externalAudienceId,
      targetingMode: "custom_audience" as const,
      campaignActivated: false,
      spendActivated: false,
    };
  } catch (error) {
    logger.error({ error, tenantId: input.tenantId, campaignId: input.campaignId, adSetId: result.adSetId }, "meta remarketing: campanha publicada pausada, mas Custom Audience não foi aplicada");
    throw new Error(
      `A campanha foi publicada PAUSADA, mas a audiência não pôde ser aplicada. Nenhum gasto foi ativado. ${error instanceof Error ? error.message : "Revise a audiência na Meta."}`,
    );
  }
}
