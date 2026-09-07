import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
import { ConfigurationHistoryPanel } from "@/components/ConfigurationHistoryPanel";
import { ConfigurationAccessPanel } from "@/components/ConfigurationAccessPanel";

export default function Configuracoes() {
  const legacySiteDeepLink = new URLSearchParams(window.location.search).get("tab") === "site";

  return (
    <>
      {!legacySiteDeepLink && <ConfigurationAccessPanel />}
      {!legacySiteDeepLink && <ConfigurationHistoryPanel />}
      <ConfiguracoesNormalized />
    </>
  );
}