import { useLayoutEffect } from "react";
import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
import { ConfigurationHistoryPanel } from "@/components/ConfigurationHistoryPanel";
import { ConfigurationAccessPanel } from "@/components/ConfigurationAccessPanel";
import { ConfigurationRollbackPanel } from "@/components/ConfigurationRollbackPanel";
import { ConfigurationGovernancePanel } from "@/components/ConfigurationGovernancePanel";
import { ConfigurationImpactSimulator } from "@/components/ConfigurationImpactSimulator";
import { ConfigurationPostChangeValidation } from "@/components/ConfigurationPostChangeValidation";
import { ConfigurationSectionGuard } from "@/components/ConfigurationSectionGuard";
import { ConfigurationCatalogProductsBridge } from "@/components/ConfigurationCatalogProductsBridge";
import { JarvisPermissionsCenter } from "@/components/support/JarvisPermissionsCenter";

export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const legacySiteDeepLink = params.get("tab") === "site";

  useLayoutEffect(() => {
    if (params.get("installation") === "1") return;
    const next = new URL(window.location.href);
    next.searchParams.set("installation", "1");
    window.history.replaceState(window.history.state, "", `${next.pathname}${next.search}${next.hash}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  return (
    <>
      {!legacySiteDeepLink && <ConfigurationSectionGuard />}
      {!legacySiteDeepLink && <JarvisPermissionsCenter />}
      {!legacySiteDeepLink && <ConfigurationAccessPanel />}
      {!legacySiteDeepLink && <ConfigurationGovernancePanel />}
      {!legacySiteDeepLink && <ConfigurationImpactSimulator />}
      {!legacySiteDeepLink && <ConfigurationPostChangeValidation />}
      {!legacySiteDeepLink && <ConfigurationHistoryPanel />}
      {!legacySiteDeepLink && <ConfigurationRollbackPanel />}
      <ConfiguracoesNormalized />
      {!legacySiteDeepLink && <ConfigurationCatalogProductsBridge />}
    </>
  );
}
