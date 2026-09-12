import AiVisibilityPanel from "./AiVisibilityPanel";
import BacklinkAuthorityCorePanel from "./BacklinkAuthorityCorePanel";

export default function BacklinkAuthorityPanel({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-4">
      <AiVisibilityPanel tenantId={tenantId} />
      <BacklinkAuthorityCorePanel tenantId={tenantId} />
    </div>
  );
}
