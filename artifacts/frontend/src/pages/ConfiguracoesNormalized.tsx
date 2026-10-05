import { useEffect } from "react";
import ConfiguracoesLegacy from "./ConfiguracoesLegacy";

const SECTION_LABELS: Record<string, { label: string; title: string }> = {
  Perfil: { label: "Empresa", title: "Dados da empresa, marca, posicionamento e contexto institucional" },
  Marketing: { label: "Kit da Marca", title: "Logo, cores, linguagem visual e padrões de comunicação; estratégia e PN ficam em Diagnóstico & Planejamento" },
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
  { section: "Marca e Negócio", terms: "marketing kit da marca plano de negócios pn swot segmentos públicos riscos oportunidades ferramentas agentes campanhas branding identidade logo cores posicionamento" },
  { section: "Comercial", terms: "comercial fechamento venda preço desconto margem comissão estoque aprovação inteligência análise regras abordagem" },
  { section: "Agenda e Automações", terms: "agenda calendário disponibilidade horário agendamento automação avaliação google pós-venda gatilho lembrete" },
  { section: "Integrações", terms: "integrações whatsapp instagram facebook meta ads google gmail smtp zapsign pagamento erp estoque ecommerce api webhook token conexão" },
  { section: "IA e Agentes", terms: "ia agentes sdr closer follow-up suporte cobrança financeiro comportamento prompt limites autonomia contexto inteligência" },
  { section: "Documentos", terms: "documentos contrato proposta modelo assinatura zapsign html variáveis linha produto" },
  { section: "Equipe e Acessos", terms: "equipe usuários acessos permissões papéis roles segurança governança" },
  { section: "Faturamento", terms: "faturamento plano cobrança consumo créditos assinatura mensalidade pagamento" },
] as const;

const INTEGRATION_FOCUS_ALIASES: Record<string, string[]> = {
  whatsapp: ["whatsapp via qr code", "conectar via qr code", "qr code"],
  instagram: ["instagram"],
  "google-calendar": ["google calendar", "calendar"],
  "google-ads": ["google ads"],
  asaas: ["asaas"],
  zapsign: ["zapsign"],
  "search-console": ["search console"],
  linkedin: ["linkedin"],
  tiktok: ["tiktok"],
};

type IntegrationHealthPayload = {
  whatsapp?: { connected?: boolean; phone?: string | null };
  googleCalendar?: { connected?: boolean };
  instagram?: { connected?: boolean; username?: string | null };
  googleAds?: { connected?: boolean; pendingAccountSelection?: boolean; descriptiveName?: string | null };
  asaas?: { connected?: boolean };
  zapsign?: { connected?: boolean };
  domain?: { configured?: boolean; active?: boolean; name?: string | null; status?: string | null };
  searchConsole?: { connected?: boolean; verified?: boolean };
  tracking?: { googleAds?: boolean; metaPixel?: boolean; linkedinInsightTag?: boolean; tiktokPixel?: boolean };
  social?: { linkedin?: boolean; tiktok?: boolean };
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

    const normalizeText = (value: string) => value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("pt-BR");

    const focusIntegration = (key: string) => {
      if (key === "domain") {
        window.location.assign("/content-autopilot?view=settings");
        return;
      }

      const integrationTab = Array.from(root.querySelectorAll<HTMLElement>("[role='tab']")).find((tab) => {
        const ariaLabel = normalizeText(tab.getAttribute("aria-label") ?? "");
        const text = normalizeText(tab.textContent ?? "");
        return ariaLabel === "integracoes" || text.includes("integracoes");
      });
      integrationTab?.click();

      const url = new URL(window.location.href);
      url.searchParams.set("tab", "integracoes");
      url.searchParams.set("integration", key);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

      window.setTimeout(() => {
        const panel = root.querySelector<HTMLElement>("[role='tabpanel']:not([hidden])");
        if (!panel) return;

        const aliases = INTEGRATION_FOCUS_ALIASES[key] ?? [key];
        const normalizedAliases = aliases.map(normalizeText);
        const candidates = Array.from(panel.querySelectorAll<HTMLElement>("h2, h3, h4, strong, label, p, button"));
        const match = candidates.find((element) => {
          const text = normalizeText(element.textContent ?? "");
          return normalizedAliases.some((alias) => text.includes(alias));
        });
        const target = match?.closest<HTMLElement>("section, article, .rounded-xl, .rounded-lg, .rounded-md, .border") ?? match;

        if (!target) {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        target.dataset.integrationFocusTarget = "true";
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
          delete target.dataset.integrationFocusTarget;
        }, 2200);
      }, 140);
    };

    const loadIntegrationHealth = async (panel: HTMLElement) => {
      const summary = panel.querySelector<HTMLElement>("[data-integration-health-summary]");
      const grid = panel.querySelector<HTMLElement>("[data-integration-health-grid]");
      if (!summary || !grid) return;

      summary.textContent = "Verificando conexões...";
      grid.innerHTML = '<span class="integration-health__loading">Consultando o status real das integrações do tenant.</span>';

      try {
        const response = await fetch("/api/onboarding/integracoes", { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as IntegrationHealthPayload;

        const integrations = [
          { key: "whatsapp", label: "WhatsApp", connected: data.whatsapp?.connected === true, detail: data.whatsapp?.phone || "Conexão padrão via QR Code" },
          { key: "instagram", label: "Instagram", connected: data.instagram?.connected === true, detail: data.instagram?.username ? `@${data.instagram.username.replace(/^@/, "")}` : "Mensagens e perfil" },
          { key: "google-calendar", label: "Google Calendar", connected: data.googleCalendar?.connected === true, detail: "Agenda e compromissos" },
          {
            key: "google-ads",
            label: "Google Ads",
            connected: data.googleAds?.connected === true,
            attention: data.googleAds?.pendingAccountSelection === true,
            detail: data.googleAds?.pendingAccountSelection ? "Selecionar conta" : (data.googleAds?.descriptiveName || "Mídia paga"),
          },
          { key: "asaas", label: "Asaas", connected: data.asaas?.connected === true, detail: "Cobranças e pagamentos" },
          { key: "zapsign", label: "ZapSign", connected: data.zapsign?.connected === true, detail: "Assinatura eletrônica" },
          {
            key: "search-console",
            label: "Search Console",
            connected: data.searchConsole?.connected === true && data.searchConsole?.verified === true,
            attention: data.searchConsole?.connected === true && data.searchConsole?.verified !== true,
            detail: data.searchConsole?.connected && !data.searchConsole?.verified ? "Aguardando verificação" : "SEO e indexação",
          },
          { key: "linkedin", label: "LinkedIn", connected: data.social?.linkedin === true, detail: "Canal social" },
          { key: "tiktok", label: "TikTok", connected: data.social?.tiktok === true, detail: "Canal social" },
          {
            key: "domain",
            label: "Domínio",
            connected: data.domain?.active === true,
            attention: data.domain?.configured === true && data.domain?.active !== true,
            detail: data.domain?.name || "Domínio personalizado",
          },
        ];

        const connectedCount = integrations.filter((item) => item.connected).length;
        const attentionCount = integrations.filter((item) => item.attention).length;
        summary.textContent = `${connectedCount} de ${integrations.length} conexões ativas${attentionCount ? ` · ${attentionCount} requer${attentionCount > 1 ? "em" : ""} atenção` : ""}`;
        grid.replaceChildren();

        integrations.forEach((item) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className = `integration-health__item ${item.connected ? "is-connected" : item.attention ? "is-attention" : "is-off"}`;
          card.dataset.integrationKey = item.key;
          card.setAttribute("aria-label", `${item.connected ? "Gerenciar" : item.attention ? "Revisar" : "Conectar"} ${item.label}`);

          const header = document.createElement("div");
          header.className = "integration-health__item-header";
          const name = document.createElement("strong");
          name.textContent = item.label;
          const badge = document.createElement("span");
          badge.className = "integration-health__badge";
          badge.textContent = item.connected ? "Conectado" : item.attention ? "Atenção" : "Desconectado";
          header.append(name, badge);

          const detail = document.createElement("span");
          detail.className = "integration-health__detail";
          detail.textContent = item.detail;

          const action = document.createElement("span");
          action.className = "integration-health__action";
          action.textContent = item.connected ? "Gerenciar integração →" : item.attention ? "Revisar integração →" : item.key === "whatsapp" ? "Ler QR Code →" : "Conectar agora →";

          card.addEventListener("click", () => focusIntegration(item.key));
          card.append(header, detail, action);
          grid.appendChild(card);
        });
      } catch {
        summary.textContent = "Não foi possível consultar as integrações agora.";
        grid.innerHTML = '<span class="integration-health__loading">O restante das Configurações continua disponível. Tente atualizar o status em alguns instantes.</span>';
      }
    };

    const normalizeLegacyUi = () => {
      const pageTitle = Array.from(root.querySelectorAll<HTMLHeadingElement>("h1")).find((heading) => normalizeText(heading.textContent ?? "") === "configuracoes");
      const pageSubtitle = pageTitle?.nextElementSibling as HTMLElement | null;
      if (pageSubtitle && normalizeText(pageSubtitle.textContent ?? "").includes("gerencie")) {
        pageSubtitle.textContent = "Gerencie sua empresa, equipe, integrações e preferências.";
      }

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
        if (current === "Site") {
          tab.hidden = true;
          tab.setAttribute("aria-hidden", "true");
          tab.dataset.legacySiteTabHidden = "true";
          return;
        }
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

      const requestedIntegration = new URLSearchParams(window.location.search).get("integration");
      if (requestedIntegration && !root.dataset.integrationDeepLinkHandled) {
        root.dataset.integrationDeepLinkHandled = "true";
        window.setTimeout(() => focusIntegration(requestedIntegration), 40);
      }

      if (primaryTabList && !root.querySelector("[data-config-search='true']")) {
        const search = document.createElement("section");
        search.dataset.configSearch = "true";
        search.className = "config-search";
        search.setAttribute("aria-label", "Buscar configurações");

        const label = document.createElement("label");
        label.className = "config-search__label";
        label.textContent = "Buscar nas configurações";

        const input = document.createElement("input");
        input.type = "search";
        input.className = "config-search__input";
        input.placeholder = "Ex.: desconto, WhatsApp, contrato, logo, comissão...";
        input.autocomplete = "off";
        input.setAttribute("aria-label", "Buscar nas configurações");

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
        if (text !== "Produtos e Serviços — referência legada") {
          element.textContent = "Produtos e Serviços — referência legada";
        }
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
        if (text !== "Fonte externa de produtos (opcional)") {
          label.textContent = "Fonte externa de produtos (opcional)";
        }
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
        .vendor-config-without-site [data-integration-focus-target="true"] {
          outline: 2px solid hsl(var(--ring)); outline-offset: 4px; border-radius: .75rem;
          scroll-margin-block: 7rem;
        }
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
        @media (max-width: 640px) {
          .vendor-config-without-site { overflow-x: clip; padding-bottom: 9rem; }
          .vendor-config-without-site [role="tablist"] { display: none !important; }
          .mobile-config-selector { display: grid; gap: .35rem; margin: .5rem 0 1rem; }
          .mobile-config-selector__label { font-size: .78rem; font-weight: 600; color: hsl(var(--muted-foreground)); }
          .mobile-config-selector__select {
            width: 100% !important; min-height: 2.75rem; padding: 0 .8rem; border: 1px solid hsl(var(--border));
            border-radius: .65rem; background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: .95rem;
          }
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
