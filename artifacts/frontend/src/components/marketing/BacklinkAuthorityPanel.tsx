import AiVisibilityPanel from "./AiVisibilityPanel";
import AiVisibilityDimensionsPanel from "./AiVisibilityDimensionsPanel";
import AiVisibilityIntelligencePanel from "./AiVisibilityIntelligencePanel";
import BacklinkAuthorityCorePanel from "./BacklinkAuthorityCorePanel";

export default function BacklinkAuthorityPanel({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-4">
      <AiVisibilityPanel tenantId={tenantId} />
      <AiVisibilityDimensionsPanel tenantId={tenantId} />
      <AiVisibilityIntelligencePanel tenantId={tenantId} />
      <BacklinkAuthorityCorePanel tenantId={tenantId} />
    </div>
  );
}
