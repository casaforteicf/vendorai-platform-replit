import { useEffect } from "react";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";

/**
 * Configurações permanece focada em administração da conta.
 *
 * O workspace de Sites foi movido para Marketing → Sites & Content Autopilot.
 * Mantemos ConfiguracoesLegacy intacto durante a migração para preservar todas
 * as configurações existentes (perfil, análise, calendário, integrações, IA,
 * contrato, equipe e faturamento) sem duplicar lógica ou arriscar regressões.
 *
 * A identidade visual do tenant também tem uma única fonte: a logo cadastrada
 * em Perfil da Empresa. O antigo bloco "Logo da Plataforma" fica preservado no
 * legado por compatibilidade, mas não é mais exibido nem usado como entrada.
 */
export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const legacySiteDeepLink = params.get("tab") === "site";

  useEffect(() => {
    if (legacySiteDeepLink) {
      window.location.replace("/content-autopilot?view=settings");
    }
  }, [legacySiteDeepLink]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
    if (!root) return;

    const hideDuplicatePlatformLogo = () => {
      root.querySelectorAll<HTMLHeadingElement>("h2").forEach((heading) => {
        const label = heading.textContent?.replace(/\s+/g, " ").trim();
        if (label !== "Logo da Plataforma") return;

        const headingBlock = heading.parentElement;
        const card = headingBlock?.parentElement;
        if (!headingBlock || !card) return;

        const children = Array.from(card.children) as HTMLElement[];
        const headingIndex = children.indexOf(headingBlock);
        if (headingIndex < 0) return;

        // O bloco legado é composto pelo cabeçalho, input de upload e preview.
        // Ocultamos somente esses três elementos; Cor da marca e Rede de
        // Parceiros continuam no mesmo card e com a mesma lógica existente.
        children.slice(headingIndex, headingIndex + 3).forEach((element) => {
          element.hidden = true;
          element.dataset.legacyPlatformLogoHidden = "true";
        });

        const brandColorBlock = children[headingIndex + 3];
        if (brandColorBlock) {
          brandColorBlock.style.paddingTop = "0";
          brandColorBlock.style.borderTopWidth = "0";
        }
      });
    };

    hideDuplicatePlatformLogo();
    const observer = new MutationObserver(hideDuplicatePlatformLogo);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
