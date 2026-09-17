import { useParams } from "wouter";
import { MARKETING_VERTICALS } from "@workspace/vendor-brain/marketing-verticals";
import { usePublicCountry } from "@/lib/publicCountry";
import publicVerticalSlugs from "@/data/publicVerticalSlugs.json";
import LegacyLpRouter from "./LpPage";
import OfficialVerticalLp from "./OfficialVerticalLpV2";
import LpCommercialOffer from "./LpCommercialOffer";

const publicSlugOverrides = publicVerticalSlugs as Record<string, string>;

export default function UnifiedLpRouter() {
  usePublicCountry();
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const officialProfile = MARKETING_VERTICALS.find((profile) => {
    const publicSlug = publicSlugOverrides[profile.id] ?? profile.slug;
    return publicSlug === slug || profile.slug === slug || profile.id === slug;
  });

  return (
    <>
      {officialProfile ? <OfficialVerticalLp profile={officialProfile} /> : <LegacyLpRouter />}
      <LpCommercialOffer />
    </>
  );
}
