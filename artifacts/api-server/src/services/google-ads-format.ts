import type { AdCampaign } from "@workspace/db";

export type GoogleCampaignFormat = "search" | "performance_max";

export function resolveGoogleCampaignFormat(campaign: Pick<AdCampaign, "plataforma" | "tipoAnuncio" | "segmentacao">): GoogleCampaignFormat {
  if (campaign.plataforma !== "google" || campaign.tipoAnuncio !== "rsa_pmax") return "search";
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, any>;
  if (segmentacao.googleFormat === "performance_max") return "performance_max";
  const details = String(segmentacao.marketingContext?.specificDetails ?? "").toLowerCase();
  if (/formato:\s*performance\s*max/.test(details) || /\bperformance[_\s-]*max\b/.test(details)) {
    return "performance_max";
  }
  return "search";
}
