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
 * Esta camada também corrige a experiência mobile e padroniza pontos de
 * usabilidade do legado sem alterar os endpoints nem a persistência atual.
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

    const normalizeLegacyUi = () => {
      root.querySelectorAll<HTMLHeadingElement>("h2").forEach((heading) => {
        const label = heading.textContent?.replace(/\s+/g, " ").trim();
        if (label !== "Logo da Plataforma") return;

        const headingBlock = heading.parentElement;
        const card = headingBlock?.parentElement;
        if (!headingBlock || !card) return;

        const children = Array.from(card.children) as HTMLElement[];
        const headingIndex = children.indexOf(headingBlock);
        if (headingIndex < 0) return;

        // A identidade visual do tenant tem uma única fonte: Perfil da Empresa.
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

      // Remove mistura de idioma nos CTAs do cadastro de produtos/serviços.
      root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (button.textContent?.trim() === "Add") {
          button.textContent = "Adicionar";
        }
      });

      // Evita que controles legados criem largura maior que o viewport.
      root.querySelectorAll<HTMLElement>("input, textarea, select, [role='combobox']").forEach((element) => {
        element.style.maxWidth = "100%";
      });
    };

    normalizeLegacyUi();
    const observer = new MutationObserver(normalizeLegacyUi);
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

        /* Garante que a página nunca expanda além da largura disponível. */
        .vendor-config-without-site,
        .vendor-config-without-site > div,
        .vendor-config-without-site form,
        .vendor-config-without-site fieldset {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }

        .vendor-config-without-site input,
        .vendor-config-without-site textarea,
        .vendor-config-without-site select,
        .vendor-config-without-site [role="combobox"],
        .vendor-config-without-site [role="tabpanel"] {
          max-width: 100%;
          min-width: 0;
        }

        .vendor-config-without-site button {
          max-width: 100%;
        }

        .vendor-config-without-site h1,
        .vendor-config-without-site h2,
        .vendor-config-without-site h3,
        .vendor-config-without-site p,
        .vendor-config-without-site label,
        .vendor-config-without-site span {
          overflow-wrap: anywhere;
        }

        /* As abas antigas usavam grid + w-max e colidiam no mobile.
           Mantemos todas as funções, mas transformamos a barra em navegação
           horizontal rolável, sem sobreposição de textos. */
        .vendor-config-without-site [role="tablist"] {
          display: flex !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          justify-content: flex-start !important;
          gap: 0.25rem;
          overflow-x: auto;
          overflow-y: hidden;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
        }

        .vendor-config-without-site [role="tablist"] > [role="tab"] {
          flex: 0 0 auto !important;
          width: auto !important;
          min-width: max-content !important;
          white-space: nowrap !important;
        }

        .vendor-config-without-site textarea {
          width: 100%;
          min-height: 7rem;
          max-height: 18rem;
          resize: vertical;
        }

        @media (max-width: 640px) {
          .vendor-config-without-site {
            overflow-x: clip;
            padding-bottom: 9rem;
          }

          .vendor-config-without-site [role="tablist"] {
            position: relative;
            padding: 0.25rem;
          }

          .vendor-config-without-site [role="tablist"] > [role="tab"] {
            font-size: 0.875rem;
            padding-left: 0.75rem;
            padding-right: 0.75rem;
          }

          .vendor-config-without-site [role="tabpanel"] {
            overflow-x: clip;
          }

          .vendor-config-without-site input,
          .vendor-config-without-site textarea,
          .vendor-config-without-site [role="combobox"] {
            width: 100% !important;
          }

          .vendor-config-without-site button {
            white-space: normal;
            line-height: 1.2;
          }

          /* Títulos e textos do legado estavam grandes demais para telas
             estreitas; reduzimos somente dentro de Configurações. */
          .vendor-config-without-site h1 {
            font-size: 1.75rem;
            line-height: 1.15;
          }

          .vendor-config-without-site h2 {
            line-height: 1.2;
          }
        }
      `}</style>
      <ConfiguracoesLegacy />
    </div>
  );
}
