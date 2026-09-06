import { useEffect } from "react";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";

const SECTION_LABELS: Record<string, { label: string; title: string }> = {
  Perfil: { label: "Empresa", title: "Dados da empresa, marca, posicionamento e contexto institucional" },
  "Análise": { label: "Comercial", title: "Parâmetros comerciais, análises e sinais usados pela inteligência" },
  "Calendário": { label: "Agenda e Automações", title: "Regras de agenda, disponibilidade, calendários e automações relacionadas" },
  "Integrações": { label: "Integrações", title: "WhatsApp, Meta, Google e demais conexões externas" },
  IA: { label: "IA e Agentes", title: "Configurações, limites e comportamento dos agentes de IA" },
  Contrato: { label: "Documentos", title: "Contratos, modelos, variáveis e assinatura eletrônica" },
  Equipe: { label: "Equipe e Acessos", title: "Usuários, acessos, permissões e governança da equipe" },
  Faturamento: { label: "Faturamento", title: "Plano, consumo, cobrança e dados de faturamento" },
};

const CONFIG_SEARCH_INDEX = [
  { section: "Empresa", terms: "empresa perfil razão social nome fantasia cnpj telefone email instagram endereço segmento marca logo favicon cor missão visão história público alvo diferenciais concorrentes" },
  { section: "Comercial", terms: "comercial fechamento venda preço desconto margem comissão estoque aprovação inteligência análise regras abordagem" },
  { section: "Agenda e Automações", terms: "agenda calendário disponibilidade horário agendamento automação avaliação google pós-venda gatilho lembrete" },
  { section: "Integrações", terms: "integrações whatsapp instagram facebook meta ads google gmail smtp zapsign pagamento erp estoque ecommerce api webhook token conexão" },
  { section: "IA e Agentes", terms: "ia agentes sdr closer follow-up suporte cobrança financeiro comportamento prompt limites autonomia contexto inteligência" },
  { section: "Documentos", terms: "documentos contrato proposta modelo assinatura zapsign html variáveis linha produto" },
  { section: "Equipe e Acessos", terms: "equipe usuários acessos permissões papéis roles segurança governança" },
  { section: "Faturamento", terms: "faturamento plano cobrança consumo créditos assinatura mensalidade pagamento" },
] as const;

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
      const tabs = primaryTabList ? Array.from(primaryTabList.querySelectorAll<HTMLElement>("[role='tab']")) : [];
      tabs.forEach((tab) => {
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

      if (primaryTabList && !root.querySelector("[data-config-search='true']")) {
        const search = document.createElement("section");
        search.dataset.configSearch = "true";
        search.className = "config-search";
        search.setAttribute("aria-label", "Buscar configurações");

        const label = document.createElement("label");
        label.className = "config-search__label";
        label.textContent = "Buscar configuração";

        const input = document.createElement("input");
        input.type = "search";
        input.className = "config-search__input";
        input.placeholder = "Ex.: desconto, WhatsApp, contrato, logo, comissão...";
        input.autocomplete = "off";
        input.setAttribute("aria-label", "Buscar configuração");

        const results = document.createElement("div");
        results.className = "config-search__results";
        results.hidden = true;

        const openSection = (section: string) => {
          const target = tabs.find((tab) => tab.getAttribute("aria-label") === section);
          target?.click();
          input.value = "";
          results.hidden = true;
          window.setTimeout(() => {
            root.querySelector<HTMLElement>("[role='tabpanel']:not([hidden])")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        };

        const renderResults = () => {
          const query = input.value.trim().toLocaleLowerCase("pt-BR");
          results.replaceChildren();
          if (query.length < 2) {
            results.hidden = true;
            return;
          }
          const matches = CONFIG_SEARCH_INDEX.filter((item) =>
            item.section.toLocaleLowerCase("pt-BR").includes(query) || item.terms.includes(query)
          );
          matches.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "config-search__result";
            button.textContent = item.section;
            button.addEventListener("click", () => openSection(item.section));
            results.appendChild(button);
          });
          if (matches.length === 0) {
            const empty = document.createElement("span");
            empty.className = "config-search__empty";
            empty.textContent = "Nenhuma área encontrada. Tente outro termo.";
            results.appendChild(empty);
          }
          results.hidden = false;
        };

        input.addEventListener("input", renderResults);
        input.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          const first = results.querySelector<HTMLButtonElement>("button");
          if (!first) return;
          event.preventDefault();
          first.click();
        });

        search.append(label, input, results);
        primaryTabList.parentElement?.insertBefore(search, primaryTabList);
      }

      if (primaryTabList && !root.querySelector("[data-config-governance='true']")) {
        const governance = document.createElement("section");
        governance.dataset.configGovernance = "true";
        governance.className = "config-governance";
        governance.setAttribute("aria-label", "Governança das configurações");
        governance.innerHTML = `
          <div class="config-governance__copy">
            <strong>Configuração central do negócio</strong>
            <span>Cada informação deve ter uma única fonte oficial para evitar divergências entre CRM, IA, propostas, marketing e automações.</span>
          </div>
          <div class="config-governance__sources" aria-label="Fontes oficiais">
            <span><b>Empresa</b> identidade e posicionamento</span>
            <span><b>Catálogo</b> produtos, serviços, preços e estoque</span>
            <span><b>IA e Agentes</b> comportamento e limites</span>
            <span><b>Integrações</b> conexões e saúde</span>
            <span><b>Documentos</b> modelos e assinatura</span>
          </div>
        `;
        primaryTabList.parentElement?.insertBefore(governance, primaryTabList);
      }

      if (primaryTabList && !root.querySelector("[data-mobile-config-selector='true']")) {
        const wrapper = document.createElement("div");
        wrapper.dataset.mobileConfigSelector = "true";
        wrapper.className = "mobile-config-selector";

        const label = document.createElement("label");
        label.textContent = "Área de configuração";
        label.className = "mobile-config-selector__label";

        const select = document.createElement("select");
        select.className = "mobile-config-selector__select";
        select.setAttribute("aria-label", "Área de configuração");

        tabs.forEach((tab, index) => {
          if (tab.offsetParent === null && tab.getAttribute("aria-hidden") === "true") return;
          const option = document.createElement("option");
          option.value = String(index);
          option.textContent = tab.getAttribute("aria-label") || tab.textContent?.replace(/\s+/g, " ").trim() || `Seção ${index + 1}`;
          option.selected = tab.getAttribute("aria-selected") === "true";
          select.appendChild(option);
        });

        select.addEventListener("change", () => {
          const index = Number(select.value);
          const target = tabs[index];
          target?.click();
        });

        wrapper.append(label, select);
        primaryTabList.parentElement?.insertBefore(wrapper, primaryTabList);
      }

      const mobileSelect = root.querySelector<HTMLSelectElement>("[data-mobile-config-selector='true'] select");
      if (mobileSelect && tabs.length > 0) {
        const selectedIndex = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
        if (selectedIndex >= 0) mobileSelect.value = String(selectedIndex);
      }

      // Produtos e Serviços do contexto antigo deixam de parecer um segundo cadastro.
      root.querySelectorAll<HTMLElement>("h2, h3, h4, label").forEach((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        if (text !== "Produtos e Serviços" && text !== "Produtos e Serviços — referência legada") return;
        element.textContent = "Produtos e Serviços — referência legada";
        const block = element.closest<HTMLElement>(".space-y-2") ?? element.parentElement;
        if (!block) return;
        block.dataset.legacyProductsReadonly = "true";

        block.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((control) => {
          control.disabled = true;
          control.setAttribute("aria-disabled", "true");
        });
        block.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
          button.disabled = true;
          button.setAttribute("aria-disabled", "true");
        });

        if (block.querySelector("[data-catalog-source-note='true']")) return;
        const note = document.createElement("div");
        note.dataset.catalogSourceNote = "true";
        note.className = "catalog-source-note";
        note.innerHTML = '<strong>Fonte oficial: Catálogo.</strong><span> Esta lista antiga fica somente para consulta. Produtos, serviços, preços, estoque e imagens devem ser mantidos no Catálogo.</span><a href="/catalogo">Abrir Catálogo</a>';
        block.prepend(note);
      });

      root.querySelectorAll<HTMLElement>("label").forEach((label) => {
        const text = label.textContent?.replace(/\s+/g, " ").trim();
        if (text !== "URL da linha de produtos (opcional)" && text !== "Fonte externa de produtos (opcional)") return;
        label.textContent = "Fonte externa de produtos (opcional)";
        const block = label.parentElement;
        if (!block || block.querySelector("[data-external-product-source-note='true']")) return;
        const note = document.createElement("p");
        note.dataset.externalProductSourceNote = "true";
        note.className = "external-source-note";
        note.textContent = "Use somente como referência pública complementar. O Catálogo continua sendo a fonte oficial de produtos, serviços, preços e estoque.";
        block.appendChild(note);
      });

      const documentHeadings: Record<string, string> = {
        "Modelo de Contrato": "Contratos — modelo padrão",
        "Modelos de Proposta por Linha de Produto": "Propostas — modelos por linha de produto",
      };
      root.querySelectorAll<HTMLElement>("h2, h3, h4").forEach((heading) => {
        const text = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const next = documentHeadings[text];
        if (next) heading.textContent = next;

        if ((text === "Modelos de Proposta por Linha de Produto" || text === "Propostas — modelos por linha de produto") && !heading.parentElement?.querySelector("[data-proposal-catalog-note='true']")) {
          const note = document.createElement("p");
          note.dataset.proposalCatalogNote = "true";
          note.className = "external-source-note";
          note.innerHTML = 'A linha do produto deve corresponder ao Catálogo. Novos cadastros e alterações de produto devem ser feitos em <a href="/catalogo">Catálogo</a>; este vínculo permanece compatível com modelos existentes até a migração completa.';
          heading.insertAdjacentElement("afterend", note);
        }
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
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
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
        .mobile-config-selector { display: none; }
        .config-search { position: relative; display: grid; gap: .35rem; margin: .5rem 0 .75rem; }
        .config-search__label { font-size: .78rem; font-weight: 600; color: hsl(var(--muted-foreground)); }
        .config-search__input {
          width: 100%; min-height: 2.65rem; padding: 0 .8rem; border: 1px solid hsl(var(--border)); border-radius: .65rem;
          background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: .9rem;
        }
        .config-search__input:focus { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
        .config-search__results {
          position: absolute; top: calc(100% + .25rem); left: 0; right: 0; z-index: 30; display: grid; gap: .25rem;
          padding: .4rem; border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--popover));
          box-shadow: 0 12px 30px hsl(var(--foreground) / .08);
        }
        .config-search__result {
          width: 100%; text-align: left; border-radius: .45rem; padding: .55rem .65rem; font-size: .82rem; font-weight: 600;
        }
        .config-search__result:hover, .config-search__result:focus-visible { background: hsl(var(--muted)); }
        .config-search__empty { padding: .55rem .65rem; font-size: .78rem; color: hsl(var(--muted-foreground)); }
        .config-governance {
          display: grid; gap: .75rem; margin: .5rem 0 1rem; padding: .9rem 1rem; border: 1px solid hsl(var(--border));
          border-radius: .8rem; background: hsl(var(--muted) / .3);
        }
        .config-governance__copy { display: grid; gap: .2rem; }
        .config-governance__copy strong { font-size: .9rem; }
        .config-governance__copy span { font-size: .78rem; line-height: 1.4; color: hsl(var(--muted-foreground)); }
        .config-governance__sources { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .45rem; }
        .config-governance__sources span {
          display: grid; gap: .1rem; min-width: 0; padding: .55rem .65rem; border: 1px solid hsl(var(--border));
          border-radius: .6rem; background: hsl(var(--background)); font-size: .7rem; line-height: 1.25; color: hsl(var(--muted-foreground));
        }
        .config-governance__sources b { color: hsl(var(--foreground)); font-size: .73rem; }
        .vendor-config-without-site textarea {
          width: 100%; min-height: 6rem; max-height: 18rem; resize: vertical; transition: min-height 160ms ease;
        }
        .vendor-config-without-site textarea:focus { min-height: 10rem; }
        .vendor-config-without-site [data-legacy-products-readonly="true"] :disabled {
          opacity: .72; cursor: not-allowed;
        }
        .catalog-source-note {
          display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .55rem; margin-bottom: .65rem; padding: .75rem;
          border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--muted) / .45); font-size: .8rem;
        }
        .catalog-source-note a { margin-left: auto; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
        .external-source-note { margin-top: .4rem; font-size: .75rem; line-height: 1.35; color: hsl(var(--muted-foreground)); }
        .external-source-note a { font-weight: 600; text-decoration: underline; text-underline-offset: 3px; color: hsl(var(--foreground)); }
        @media (max-width: 900px) {
          .config-governance__sources { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .vendor-config-without-site { overflow-x: clip; padding-bottom: 9rem; }
          .vendor-config-without-site [role="tablist"] { display: none !important; }
          .mobile-config-selector { display: grid; gap: .35rem; margin: .5rem 0 1rem; }
          .mobile-config-selector__label { font-size: .78rem; font-weight: 600; color: hsl(var(--muted-foreground)); }
          .mobile-config-selector__select {
            width: 100% !important; min-height: 2.75rem; padding: 0 .8rem; border: 1px solid hsl(var(--border));
            border-radius: .65rem; background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: .95rem;
          }
          .config-governance { padding: .8rem; }
          .config-governance__sources { grid-template-columns: 1fr; }
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