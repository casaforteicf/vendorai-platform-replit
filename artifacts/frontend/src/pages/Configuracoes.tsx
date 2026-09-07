import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
import { ConfigurationHistoryPanel } from "@/components/ConfigurationHistoryPanel";
import { ConfigurationAccessPanel } from "@/components/ConfigurationAccessPanel";
import { ConfigurationRollbackPanel } from "@/components/ConfigurationRollbackPanel";
import { ConfigurationGovernancePanel } from "@/components/ConfigurationGovernancePanel";
import { ConfigurationImpactSimulator } from "@/components/ConfigurationImpactSimulator";
import { ConfigurationPostChangeValidation } from "@/components/ConfigurationPostChangeValidation";
import { ConfigurationSectionGuard } from "@/components/ConfigurationSectionGuard";

export default function Configuracoes() {
  const legacySiteDeepLink = new URLSearchParams(window.location.search).get("tab") === "site";

  return (
    <>
      {!legacySiteDeepLink && <ConfigurationSectionGuard />}
      {!legacySiteDeepLink && <ConfigurationAccessPanel />}
      {!legacySiteDeepLink && <ConfigurationGovernancePanel />}
      {!legacySiteDeepLink && <ConfigurationImpactSimulator />}
      {!legacySiteDeepLink && <ConfigurationPostChangeValidation />}
      {!legacySiteDeepLink && <ConfigurationHistoryPanel />}
      {!legacySiteDeepLink && <ConfigurationRollbackPanel />}
      <ConfiguracoesNormalized />
    </>
  );
}
