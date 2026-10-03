import { useEffect } from "react";

/**
 * Canonical navigation policy for tenant menus.
 *
 * Vertical modules may keep specialized pages/routes for compatibility, but
 * duplicated top-level functions should not appear twice in the sidebar.
 * A duplicate is only hidden when the canonical destination is also present,
 * so tenants never lose access if a canonical module is disabled.
 */
const CANONICAL_NAVIGATION_ALIASES = [
  {
    canonicalHref: "/agenda",
    duplicateHrefs: ["/beauty/agenda", "/clinic/agenda"],
    canonicalLabel: "Agenda",
  },
  {
    canonicalHref: "/content",
    duplicateHrefs: ["/campanhas", "/campanhas-nova"],
    canonicalLabel: "Marketing",
  },
] as const;

/**
 * Context-specific features remain available, but their labels must make it
 * obvious that they are scoped views rather than a second global module.
 */
const CONTEXTUAL_LINK_LABELS = [
  { href: "/trabalho", label: "Central Operacional" },
  { href: "/leads", label: "Clientes & Leads" },
  { href: "/contacts-nonleads", label: "Contatos (não-leads)" },
  { href: "/deals", label: "Vendas & Negócios" },
  { href: "/pipeline-operacional", label: "Operação & Relacionamento" },
  { href: "/propostas", label: "Propostas & Orçamentos" },
  { href: "/usuarios", label: "Equipe & Usuários" },
  { href: "/agents/config", label: "Agentes de IA" },
  { href: "/base-conhecimento", label: "Conhecimento da Empresa" },
  { href: "/vkg", label: "Grafo de Conhecimento" },
  { href: "/brain", label: "Inteligência Central" },
  { href: "/scout", label: "Revenue Scout" },
  { href: "/scout/regras", label: "Regras do Scout" },
  { href: "/scout/oportunidades", label: "Oportunidades do Scout" },
  { href: "/scout/pipeline", label: "Pipeline do Scout" },
  { href: "/scout/seguros/renovacoes", label: "Renovações do Scout" },
  { href: "/configuracoes", label: "Configurações Gerais" },
  { href: "/faq", label: "Central de Ajuda" },
  { href: "/onboarding/integracoes", label: "Integrações da Implantação" },
  { href: "/erp", label: "Financeiro & ERP" },
  { href: "/solicitacao-compra", label: "Compras & Fornecedores" },
  { href: "/estoque", label: "Estoque Geral" },
  { href: "/entregas", label: "Entregas" },
  { href: "/diagnostico-planejamento", label: "Diagnóstico & Planejamento" },
  { href: "/analytics", label: "Analytics & Relatórios" },
  { href: "/midias", label: "Biblioteca de Mídias" },
  { href: "/midias/informacoes", label: "Biblioteca Empresarial" },
  { href: "/ads", label: "Anúncios & Mídia Paga" },
  { href: "/content-autopilot", label: "Automação de Conteúdo" },

  // Construção: extensões operacionais do núcleo geral.
  { href: "/obras", label: "Obras & Projetos" },
  { href: "/insumos", label: "Insumos da Construção" },
  { href: "/composicoes", label: "Composições de Obra" },

  // Varejo e supermercado: deixam explícito que são recortes do segmento.
  { href: "/varejo/produtos", label: "Produtos do Varejo" },
  { href: "/varejo/colecoes", label: "Coleções do Varejo" },
  { href: "/varejo/fornecedores", label: "Fornecedores do Varejo" },
  { href: "/varejo/compras", label: "Compras do Varejo" },
  { href: "/varejo/fidelidade", label: "Fidelidade do Varejo" },
  { href: "/varejo/combos", label: "Combos do Varejo" },
  { href: "/supermercado", label: "Operação do Supermercado" },
  { href: "/supermercado/produtos", label: "Produtos do Supermercado" },
  { href: "/supermercado/pedidos", label: "Pedidos do Supermercado" },
  { href: "/supermercado/campanhas", label: "Campanhas do Supermercado" },
  { href: "/supermercado/config", label: "Config. do Supermercado" },

  // Salão e clínica: Agenda global permanece canônica; o restante é extensão.
  { href: "/beauty", label: "Visão do Salão" },
  { href: "/beauty/servicos", label: "Serviços do Salão" },
  { href: "/beauty/profissionais", label: "Profissionais do Salão" },
  { href: "/clinic", label: "Visão da Clínica" },
  { href: "/clinic/medicos", label: "Médicos da Clínica" },

  // Farmácia: operação própria sem competir com catálogo e pedidos gerais.
  { href: "/farmacia", label: "Operação da Farmácia" },
  { href: "/farmacia/produtos", label: "Produtos da Farmácia" },
  { href: "/farmacia/bulas", label: "Bulas da Farmácia" },
  { href: "/farmacia/pedidos", label: "Pedidos da Farmácia" },
  { href: "/farmacia/receitas", label: "Receitas da Farmácia" },

  // Imobiliário e veículos: nomes específicos evitam colisão com agenda/estoque globais.
  { href: "/imoveis/propriedades", label: "Propriedades Imobiliárias" },
  { href: "/imoveis/visitas", label: "Visitas a Imóveis" },
  { href: "/veiculos/estoque", label: "Estoque de Veículos" },
  { href: "/veiculos/test-drives", label: "Test-drives de Veículos" },

  // Serviços e PraçaAI.
  { href: "/servicos", label: "Operação de Serviços" },
  { href: "/servicos/cadastros", label: "Cadastros de Serviços" },
  { href: "/entregas-praca", label: "Entregas PraçaAI" },
  { href: "/logistica-praca", label: "Logística PraçaAI" },
  { href: "/praca-conciliacao", label: "Conciliação PraçaAI" },
  { href: "/praca-executivo", label: "Operação PraçaAI" },

  // Fretes: recursos próprios do transporte, sem competir com Entregas gerais.
  { href: "/fretes/cargas", label: "Cargas & Fretes" },
  { href: "/fretes/veiculos", label: "Veículos de Frete" },
  { href: "/fretes/motorista", label: "Entregas do Motorista" },

  // Arqdor: módulo especializado de arquitetura e projeto.
  { href: "/arch", label: "Arqdor.ai" },
  { href: "/arch/projetos", label: "Projetos no Arqdor" },
  { href: "/arch/render", label: "Render no Arqdor" },
  { href: "/arch/catalogo", label: "Catálogo do Arqdor" },
  { href: "/arch/marketplace", label: "Marketplace do Arqdor" },

  // Distribuidora/ecossistema: capacidades adicionais, não duplicações do CRM.
  { href: "/vendor-certified-network", label: "Rede Certificada VendorAI" },
  { href: "/poe", label: "Motor de Oportunidades" },
] as const;

const COLLAPSIBLE_SECTION_LABELS = [
  "Construção Civil",
  "Varejo de Moda",
  "Supermercado",
  "Arch — Design",
  "Salão de Beleza",
  "Clínica",
  "Farmácia",
  "Inteligência",
  "Partner Network",
] as const;

const CORE_NAVIGATION_GROUPS = [
  {
    key: "crm-atendimento",
    label: "CRM & Atendimento",
    hrefs: [
      "/leads",
      "/contacts-nonleads",
      "/app/prospector",
      "/deals",
      "/pipeline-operacional",
      "/conversations",
      "/agenda",
    ],
  },
  {
    key: "comercial-gestao",
    label: "Comercial & Gestão",
    hrefs: ["/propostas", "/catalogo", "/pacotes", "/erp"],
  },
  {
    key: "ia-administracao",
    label: "IA, Equipe & Configurações",
    hrefs: [
      "/agents/config",
      "/base-conhecimento",
      "/diagnostico-planejamento",
      "/analytics",
      "/organizacao",
      "/usuarios",
      "/configuracoes",
    ],
  },
] as const;

const OBRA_CONTEXT_LABELS: Record<string, string> = {
  Financeiro: "Custos da Obra",
  Estoque: "Estoque da Obra",
  Compras: "Compras da Obra",
  Orçamento: "Orçamento da Obra",
};

function visibleTextElement(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("span, p"))
    .filter((element) => element.children.length === 0 && Boolean(element.textContent?.trim()));
  return candidates.at(-1) ?? null;
}

function setScopedLabel(element: HTMLElement, label: string) {
  if (element.dataset.vendoraiCanonicalText === label) return;

  const target = visibleTextElement(element);
  if (target) {
    if (target.dataset.vendoraiOriginalText === undefined) {
      target.dataset.vendoraiOriginalText = target.textContent ?? "";
    }
    target.textContent = label;
    element.dataset.vendoraiCanonicalText = label;
    return;
  }

  const textNode = Array.from(element.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
  if (!textNode) return;

  if (element.dataset.vendoraiOriginalDirectText === undefined) {
    element.dataset.vendoraiOriginalDirectText = textNode.textContent ?? "";
  }
  textNode.textContent = ` ${label}`;
  element.dataset.vendoraiCanonicalText = label;
}

function restoreScopedLabels() {
  document.querySelectorAll<HTMLElement>("[data-vendorai-canonical-text]").forEach((element) => {
    const target = element.querySelector<HTMLElement>("[data-vendorai-original-text]");
    if (target) {
      target.textContent = target.dataset.vendoraiOriginalText ?? target.textContent;
      delete target.dataset.vendoraiOriginalText;
    } else if (element.dataset.vendoraiOriginalDirectText !== undefined) {
      const textNode = Array.from(element.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      if (textNode) textNode.textContent = element.dataset.vendoraiOriginalDirectText;
      delete element.dataset.vendoraiOriginalDirectText;
    }
    delete element.dataset.vendoraiCanonicalText;
  });
}

function isCollapsibleSectionHeading(text: string) {
  return (
    COLLAPSIBLE_SECTION_LABELS.some((label) => text === label) ||
    text.startsWith("Revenue Scout ·")
  );
}

function setSectionExpanded(container: HTMLElement, heading: HTMLElement, expanded: boolean) {
  container.dataset.vendoraiSectionExpanded = expanded ? "true" : "false";
  heading.setAttribute("aria-expanded", expanded ? "true" : "false");

  Array.from(container.children).forEach((child) => {
    if (!(child instanceof HTMLAnchorElement)) return;
    child.style.display = expanded ? "" : "none";
    child.dataset.vendoraiSectionChild = "true";
  });

  const indicator = heading.querySelector<HTMLElement>("[data-vendorai-section-indicator]");
  if (indicator) indicator.textContent = expanded ? "⌄" : "›";
}

function applyCollapsibleSections() {
  document.querySelectorAll<HTMLElement>("p").forEach((heading) => {
    const text = heading.textContent?.replace(/[⌄›]/g, "").replace(/\s+/g, " ").trim() ?? "";
    if (!isCollapsibleSectionHeading(text)) return;

    const container = heading.parentElement;
    if (!container) return;

    const sectionLinks = Array.from(container.children).filter(
      (child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement,
    );
    if (sectionLinks.length === 0) return;

    heading.classList.add("select-none");
    heading.dataset.vendoraiCollapsibleSection = "true";

    let indicator = heading.querySelector<HTMLElement>("[data-vendorai-section-indicator]");
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.dataset.vendoraiSectionIndicator = "true";
      indicator.setAttribute("aria-hidden", "true");
      indicator.className = "ml-auto text-sm leading-none";
      heading.appendChild(indicator);
    }

    // Igual aos grupos com botão: sempre expandido, sem depender de clique
    // (o toggle dependia de um estado que outro observer da sidebar podia
    // sobrescrever quase ao mesmo tempo, fazendo o clique parecer não
    // fazer nada).
    setSectionExpanded(container, heading, true);
  });
}

function setCoreGroupExpanded(button: HTMLButtonElement, links: HTMLAnchorElement[], expanded: boolean) {
  button.dataset.vendoraiCoreExpanded = expanded ? "true" : "false";
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  const indicator = button.querySelector<HTMLElement>("[data-vendorai-core-indicator]");
  if (indicator) indicator.textContent = expanded ? "⌄" : "›";

  links.forEach((link) => {
    if (link.dataset.vendoraiCoreOriginalDisplay === undefined) {
      link.dataset.vendoraiCoreOriginalDisplay = link.style.display;
    }
    link.style.display = expanded ? link.dataset.vendoraiCoreOriginalDisplay : "none";
    link.dataset.vendoraiCoreGroupChild = "true";
  });
}

function applyCoreNavigationGroups() {
  CORE_NAVIGATION_GROUPS.forEach((group) => {
    document.querySelectorAll<HTMLAnchorElement>(`a[href="${group.hrefs[0]}"]`).forEach((firstLink) => {
      const container = firstLink.parentElement;
      if (!container) return;

      const directLinks = Array.from(container.children).filter(
        (child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement,
      );
      const links = group.hrefs
        .map((href) => directLinks.find((link) => link.getAttribute("href") === href))
        .filter((link): link is HTMLAnchorElement => Boolean(link));
      if (links.length < 2) return;

      let button = Array.from(container.children).find(
        (child): child is HTMLButtonElement =>
          child instanceof HTMLButtonElement && child.dataset.vendoraiCoreGroup === group.key,
      );

      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.vendoraiCoreGroup = group.key;
        button.className = "w-full flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground";

        const label = document.createElement("span");
        label.textContent = group.label;
        label.className = "truncate";

        const indicator = document.createElement("span");
        indicator.dataset.vendoraiCoreIndicator = "true";
        indicator.setAttribute("aria-hidden", "true");
        indicator.className = "ml-2 shrink-0";

        button.append(label, indicator);
        firstLink.insertAdjacentElement("beforebegin", button);
      }

      // Os grupos ficam sempre abertos agora — o toggle por clique dependia
      // de um estado (persisted) que podia ser sobrescrito por outro dos
      // vários observers de DOM desta sidebar rodando quase ao mesmo tempo,
      // fazendo o clique parecer não fazer nada. Mais simples e confiável
      // deixar tudo visível sem precisar clicar.
      setCoreGroupExpanded(button, links, true);
    });
  });
}

export function useNavigationDeduplication() {
  useEffect(() => {
    const applyPolicy = () => {
      CANONICAL_NAVIGATION_ALIASES.forEach((policy) => {
        const canonicalSelector = `a[href="${policy.canonicalHref}"], a[href^="${policy.canonicalHref}?"]`;
        const canonicalLinks = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(canonicalSelector),
        ).filter((link) => link.offsetParent !== null || link.style.display !== "none");

        const canonicalAvailable = canonicalLinks.length > 0;

        policy.duplicateHrefs.forEach((href) => {
          document.querySelectorAll<HTMLAnchorElement>(`a[href="${href}"]`).forEach((link) => {
            if (!canonicalAvailable) {
              if (link.dataset.vendoraiDuplicateNavHidden === "true") {
                link.style.display = "";
                link.removeAttribute("aria-hidden");
                link.removeAttribute("tabindex");
                delete link.dataset.vendoraiDuplicateNavHidden;
              }
              return;
            }

            link.style.display = "none";
            link.setAttribute("aria-hidden", "true");
            link.setAttribute("tabindex", "-1");
            link.dataset.vendoraiDuplicateNavHidden = "true";
            link.dataset.vendoraiCanonicalHref = policy.canonicalHref;
            link.dataset.vendoraiCanonicalLabel = policy.canonicalLabel;
          });
        });
      });

      document.querySelectorAll<HTMLAnchorElement>('a[href="/"]').forEach((link) => {
        const text = link.textContent?.replace(/\s+/g, " ").trim();
        if (text === "Dashboard") setScopedLabel(link, "Início & Visão Geral");
      });

      CONTEXTUAL_LINK_LABELS.forEach(({ href, label }) => {
        document.querySelectorAll<HTMLAnchorElement>(`a[href="${href}"]`).forEach((link) => {
          setScopedLabel(link, label);
        });
      });

      // Desativado: o agrupamento sintético (criar botões/expandir seções
      // via DOM direto) estava deixando os links reais de navegação
      // inconsistentes/inclicáveis para alguns usuários. Os links originais,
      // sem agrupamento visual, continuam funcionando normalmente.
      // applyCoreNavigationGroups();
      // applyCollapsibleSections();

      if (window.location.pathname === "/trabalho") {
        document.querySelectorAll<HTMLElement>("h1").forEach((heading) => {
          if (heading.textContent?.trim() === "Central de Trabalho") {
            setScopedLabel(heading, "Central Operacional");
          }
        });
      }

      if (/^\/obras\//.test(window.location.pathname)) {
        document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
          const current = button.textContent?.trim() ?? "";
          const contextual = OBRA_CONTEXT_LABELS[current];
          if (contextual) setScopedLabel(button, contextual);
        });
      }
    };

    applyPolicy();
    const observer = new MutationObserver(() => {
      // Mesmo padrão dos outros observers corrigidos hoje: applyPolicy pode
      // inserir/mover elementos (childList), o que sem desconectar antes
      // retrigger a si mesmo — e se o React re-renderizar esse trecho do
      // menu no meio do caminho, isso podia entrar em loop e travar a aba.
      observer.disconnect();
      applyPolicy();
      observer.observe(document.body, { childList: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll<HTMLAnchorElement>('a[data-vendorai-duplicate-nav-hidden="true"]')
        .forEach((link) => {
          link.style.display = "";
          link.removeAttribute("aria-hidden");
          link.removeAttribute("tabindex");
          delete link.dataset.vendoraiDuplicateNavHidden;
          delete link.dataset.vendoraiCanonicalHref;
          delete link.dataset.vendoraiCanonicalLabel;
        });
      document.querySelectorAll<HTMLAnchorElement>('a[data-vendorai-core-group-child="true"]').forEach((link) => {
        link.style.display = link.dataset.vendoraiCoreOriginalDisplay ?? "";
        delete link.dataset.vendoraiCoreOriginalDisplay;
        delete link.dataset.vendoraiCoreGroupChild;
      });
      document.querySelectorAll<HTMLButtonElement>('button[data-vendorai-core-group]').forEach((button) => button.remove());
      document.querySelectorAll<HTMLAnchorElement>('a[data-vendorai-section-child="true"]').forEach((link) => {
        link.style.display = "";
        delete link.dataset.vendoraiSectionChild;
      });
      document.querySelectorAll<HTMLElement>('[data-vendorai-collapsible-section="true"]').forEach((heading) => {
        heading.querySelector<HTMLElement>("[data-vendorai-section-indicator]")?.remove();
        heading.classList.remove("cursor-pointer", "select-none");
        heading.removeAttribute("role");
        heading.removeAttribute("tabindex");
        heading.removeAttribute("aria-expanded");
        delete heading.dataset.vendoraiCollapsibleSection;
        delete heading.dataset.vendoraiCollapsibleSectionBound;
      });
      document.querySelectorAll<HTMLElement>("[data-vendorai-section-expanded]").forEach((container) => {
        delete container.dataset.vendoraiSectionExpanded;
      });
      restoreScopedLabels();
    };
  }, []);
}
