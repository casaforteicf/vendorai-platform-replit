import { useParams } from "wouter";
import { MARKETING_VERTICALS } from "@workspace/vendor-brain/marketing-verticals";
import { usePublicCountry } from "@/lib/publicCountry";
import LegacyLpRouter from "./LpPage";
import OfficialVerticalLp from "./OfficialVerticalLpV2";

export default function UnifiedLpRouter() {
  usePublicCountry();
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const officialProfile = MARKETING_VERTICALS.find(
    (profile) => profile.slug === slug || profile.id === slug,
  );

  if (officialProfile) {
    return <OfficialVerticalLp profile={officialProfile} />;
  }

  // Preserve previously published/specialized landing pages that are not part
  // of the official 50-profile architecture.
  return <LegacyLpRouter />;
}
