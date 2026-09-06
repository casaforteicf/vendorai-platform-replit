import { useEffect } from "react";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";

const SECTION_LABELS: Record<string, { label: string; title: string }> = {
  Perfil: { label: "Empresa", title: "Dados da empresa, marca, posicionamento e contexto institucional" },
  "Análise": { label: "Inteligência", title: "Parâmetros, análises e sinais usados pela inteligência comercial" },
  "Calendário": { label: "Agenda", title: "Regras de agenda, disponibilidade e calendários conectados" },
  "Integrações": { label: "Integrações", title: "WhatsApp, Meta, Google e demais conexões externas" },
  IA: { label: "IA e Agentes", title: "Configurações, limites e comportamento dos agentes de IA" },
  Contrato: { label: "Documentos", title: "Contratos, modelos, variáveis e assinatura eletrônica" },
  Equipe: { label: "Equipe", title: "Usuários, acessos e gestão da equipe" },
  Faturamento: { label: "Faturamento", title: "Plano, consumo, cobrança e dados de faturamento" },
};

export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const legacySiteDeepLink = params.get("tab") === "site";

  useEffect(() => {
    if (legacySiteDeepLink) window.location.replace("/content-autopilot?view=settings");
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

      const primaryTabList = root.querySelector<HTMLElement>("[role='tablist']");
      primaryTabList?.querySelectorAll<HTMLElement>("[role='tab']").forEach((tab) => {
        const current = tab.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const next = SECTION_LABELS[current];
        if (!next) return;
        const textNodes = Array.from(tab.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
        const targetTextNode = textNodes.find((node) => node.textContent?.trim());
        if (targetTextNode) targetTextNode.textContent = ` ${next.label}`;
        else if (tab.textContent !== next.label) tab.append(document.createTextNode(` ${next.label}`));
        tab.title = next.title;
        tab.setAttribute("aria-label", next.label);
        tab.dataset.configSection = next.label.toLowerCase().replace(/\s+/g, "-");
      });

      // Produtos e Serviços do contexto antigo deixam de parecer um segundo cadastro.
      root.querySelectorAll<HTMLElement>("h2, h3, h4, label").forEach((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        if (text !== "Produtos e Serviços") return;
        element.textContent = "Produtos e Serviços — referência legada";
        const container = element.parentElement;
        if (!container || container.querySelector("[data-catalog-source-note='true']")) return;
        const note = document.createElement("div");
        note.dataset.catalogSourceNote = "true";
        note.className = "catalog-source-note";
        note.innerHTML = '<strong>Fonte oficial: Catálogo.</strong><span> Cadastre e mantenha produtos, serviços, preços, estoque e imagens somente no Catálogo.</span><a href="/catalogo">Abrir Catálogo</a>';
        container.appendChild(note);
      });

      root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (button.textContent?.trim() === "Add") button.textContent = "Adicionar";
      });

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
        .vendor-config-without-site > div > div:nth-child(2) > div:first-child [role="tablist"] > button:nth-child(3) { display: none !important; }
        .vendor-config-without-site,
        .vendor-config-without-site > div,
        .vendor-config-without-site form,
        .vendor-config-without-site fieldset { width: 100%; max-width: 100%; min-width: 0; }
        .vendor-config-without-site input,
        .vendor-config-without-site textarea,
        .vendor-config-without-site select,
        .vendor-config-without-site [role="combobox"],
        .vendor-config-without-site [role="tabpanel"] { max-width: 100%; min-width: 0; }
        .vendor-config-without-site button { max-width: 100%; }
        .vendor-config-without-site h1,
        .vendor-config-without-site h2,
        .vendor-config-without-site h3,
        .vendor-config-without-site p,
        .vendor-config-without-site label,
        .vendor-config-without-site span { overflow-wrap: anywhere; }
        .vendor-config-without-site [role="tablist"] {
          display: flex !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important;
          justify-content: flex-start !important; gap: .25rem; overflow-x: auto; overflow-y: hidden;
          overscroll-behavior-x: contain; scrollbar-width: thin; -webkit-overflow-scrolling: touch;
        }
        .vendor-config-without-site [role="tablist"] > [role="tab"] {
          flex: 0 0 auto !important; width: auto !important; min-width: max-content !important; white-space: nowrap !important;
        }
        .vendor-config-without-site textarea {
          width: 100%; min-height: 6rem; max-height: 18rem; resize: vertical; transition: min-height 160ms ease;
        }
        .vendor-config-without-site textarea:focus { min-height: 10rem; }
        .catalog-source-note {
          display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .55rem; margin-top: .6rem; padding: .75rem;
          border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--muted) / .45); font-size: .8rem;
        }
        .catalog-source-note a { margin-left: auto; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
        @media (max-width: 640px) {
          .vendor-config-without-site { overflow-x: clip; padding-bottom: 9rem; }
          .vendor-config-without-site [role="tablist"] { position: relative; padding: .25rem; }
          .vendor-config-without-site [role="tablist"] > [role="tab"] { font-size: .875rem; padding-left: .75rem; padding-right: .75rem; }
          .vendor-config-without-site [role="tabpanel"] { overflow-x: clip; }
          .vendor-config-without-site input,
          .vendor-config-without-site textarea,
          .vendor-config-without-site [role="combobox"] { width: 100% !important; }
          .vendor-config-without-site textarea { min-height: 5.5rem; max-height: 14rem; }
          .vendor-config-without-site textarea:focus { min-height: 9rem; }
          .vendor-config-without-site button { white-space: normal; line-height: 1.2; }
          .vendor-config-without-site h1 { font-size: 1.75rem; line-height: 1.15; }
          .vendor-config-without-site h2 { line-height: 1.2; }
          .catalog-source-note { display: block; }
          .catalog-source-note a { display: inline-block; margin-top: .5rem; margin-left: 0; }
        }
      `}</style>
      <ConfiguracoesLegacy />
    </div>
  );
}
