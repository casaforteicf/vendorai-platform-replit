import { useEffect } from "react";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";

/**
 * Configurações permanece focada em administração da conta.
 *
 * O workspace de Sites foi movido para Marketing → Sites & Content Autopilot.
 * Mantemos ConfiguracoesLegacy intacto durante a migração para preservar todas
 * as configurações existentes (perfil, análise, calendário, integrações, IA,
 * contrato, equipe e faturamento) sem duplicar lógica ou arriscar regressões.
 */
export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const legacySiteDeepLink = params.get("tab") === "site";

  useEffect(() => {
    if (legacySiteDeepLink) {
      window.location.replace("/content-autopilot?view=settings");
    }
  }, [legacySiteDeepLink]);

  if (legacySiteDeepLink) return null;

  return (
    <div className="vendor-config-without-site">
      <style>{`
        /* Esconde apenas a antiga aba Site do primeiro tablist de Configurações.
           O conteúdo e a lógica permanecem preservados em ConfiguracoesLegacy
           e são reutilizados no novo hub de Marketing. */
        .vendor-config-without-site > div > div:nth-child(2) > div:first-child [role="tablist"] > button:nth-child(3) {
          display: none !important;
        }
      `}</style>
      <ConfiguracoesLegacy />
    </div>
  );
}
