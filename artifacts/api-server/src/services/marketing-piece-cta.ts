import { desc, eq } from "drizzle-orm";
import { db, generatedSitesTable } from "@workspace/db";
import {
  appendUtm,
  pieceCtaLabel,
  resolveAdDestination,
  type MediaPlanCalendarItemShape,
  type MediaPlanCampaignShape,
  type PieceCta,
} from "@workspace/vendor-brain/media-plan-execution";
import { resolveWhatsappAdCtaUrl } from "./whatsapp-ad-cta.js";

let siteCache = new Map<string, string | null>();

async function latestSiteUrl(tenantId: string): Promise<string | null> {
  if (siteCache.has(tenantId)) return siteCache.get(tenantId) ?? null;
  const [site] = await db
    .select({ slug: generatedSitesTable.siteSlug })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .orderBy(desc(generatedSitesTable.createdAt))
    .limit(1);
  const url = site?.slug ? `https://${site.slug}.appvendorai.com` : null;
  siteCache.set(tenantId, url);
  return url;
}

/**
 * Resolve o destino do CTA de uma peça: WhatsApp (click-to-chat com UTM),
 * landing page publicada do tenant ou o site raiz. Nunca inventa URL.
 */
export async function resolvePieceCta(
  tenantId: string,
  input: {
    campaign?: MediaPlanCampaignShape | null;
    item: Pick<MediaPlanCalendarItemShape, "id" | "canal" | "tipo" | "temaSugerido">;
    medium?: "organic" | "paid";
  },
): Promise<PieceCta | null> {
  const campaign = input.campaign ?? null;
  const siteUrl = await latestSiteUrl(tenantId);
  const destination = resolveAdDestination(
    campaign ?? ({ id: "plan", nome: "Plano", canais: [], objetivo: "", produtoServico: "", publico: "", oferta: "", mensagemCentral: "" } as MediaPlanCampaignShape),
    input.item,
    { hasLandingPage: Boolean(siteUrl) },
  );
  const medium = input.medium ?? "organic";

  if (destination === "whatsapp") {
    try {
      const url = await resolveWhatsappAdCtaUrl(tenantId, {
        utmCode: `${campaign?.id ?? "plano"}-${input.item.id}`.slice(0, 80),
        itemLabel: input.item.temaSugerido.slice(0, 90),
      });
      return {
        label: pieceCtaLabel("whatsapp"),
        destination: "whatsapp",
        url: appendUtm(url, {
          source: input.item.canal,
          medium,
          campaign: campaign?.id ?? null,
          content: input.item.id,
        }),
      };
    } catch {
      return null;
    }
  }

  if (!siteUrl) return null;
  const suffix = destination === "produto" ? "/produtos" : "";
  return {
    label: pieceCtaLabel(destination, campaign?.objetivo),
    destination,
    url: appendUtm(`${siteUrl}${suffix}`, {
      source: input.item.canal,
      medium,
      campaign: campaign?.id ?? null,
      content: input.item.id,
    }),
  };
}
