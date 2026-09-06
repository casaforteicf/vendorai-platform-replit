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
 * Esta camada corrige a experiência mobile, reduz redundâncias visuais e
 * apresenta nomes de seção mais próximos da arquitetura final do produto,
 * sem alterar endpoints, persistência ou regras de negócio do legado.
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

      // A primeira barra de abas é a navegação principal de Configurações.
      // Renomeamos apenas os rótulos visuais para refletir a arquitetura final,
      // preservando values, estado, deep links e componentes legados.
      const primaryTabList = root.querySelector<HTMLElement>("[role='tablist']");
      if (primaryTabList) {
        const labels: Record<string, { label: string; title: string }> = {
          Perfil: {
            label: "Empresa",
            title: "Dados da empresa, marca, posicionamento e contexto institucional",
          },
          "Análise": {
            label: "Inteligência",
            title: "Parâmetros, análises e sinais usados pela inteligência comercial",
          },
          "Calendário": {
            label: "Agenda",
            title: "Regras de agenda, disponibilidade e calendários conectados",
          },
          "Integrações": {
            label: "Integrações",
            title: "WhatsApp, Meta, Google e demais conexões externas",
          },
          IA: {
            label: "IA e Agentes",
            title: "Configurações, limites e comportamento dos agentes de IA",
          },
          Contrato: {
            label: "Documentos",
            title: "Contratos, modelos, variáveis e assinatura eletrônica",
          },
          Equipe: {
            label: "Equipe",
            title: "Usuários, acessos e gestão da equipe",
          },
          Faturamento: {
            label: "Faturamento",
            title: "Plano, consumo, cobrança e dados de faturamento",
          },
        };

        primaryTabList.querySelectorAll<HTMLElement>("[role='tab']").forEach((tab) => {
          const current = tab.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const next = labels[current];
          if (!next) return;

          const textNodes = Array.from(tab.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
          const targetTextNode = textNodes.find((node) => node.textContent?.trim());
          if (targetTextNode) {
            targetTextNode.textContent = ` ${next.label}`;
          } else if (tab.textContent !== next.label) {
            tab.append(document.createTextNode(` ${next.label}`));
          }

          tab.title = next.title;
          tab.setAttribute("aria-label", next.label);
          tab.dataset.configSection = next.label.toLowerCase().replace(/\s+/g, "-");
        });
      }

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
          min-height: 6rem;
          max-height: 18rem;
          resize: vertical;
          transition: min-height 160ms ease;
        }

        .vendor-config-without-site textarea:focus {
          min-height: 10rem;
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

          .vendor-config-without-site textarea {
            min-height: 5.5rem;
            max-height: 14rem;
          }

          .vendor-config-without-site textarea:focus {
            min-height: 9rem;
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
