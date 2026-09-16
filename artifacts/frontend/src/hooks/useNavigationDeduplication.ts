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
  { href: "/base-conhecimento", label: "Conhecimento da Empresa" },
  { href: "/configuracoes", label: "Configurações Gerais" },
  { href: "/faq", label: "Central de Ajuda" },
  { href: "/onboarding/integracoes", label: "Integrações da Implantação" },
  { href: "/erp", label: "Financeiro & ERP" },
  { href: "/solicitacao-compra", label: "Compras & Fornecedores" },
  { href: "/entregas", label: "Entregas" },
  { href: "/analytics", label: "Analytics & Relatórios" },
  { href: "/midias", label: "Biblioteca de Mídias" },
  { href: "/midias/informacoes", label: "Biblioteca Empresarial" },
  { href: "/ads", label: "Anúncios & Mídia Paga" },
  { href: "/content-autopilot", label: "Automação de Conteúdo" },
  { href: "/supermercado/config", label: "Config. do Supermercado" },
  { href: "/varejo/produtos", label: "Produtos do Varejo" },
  { href: "/varejo/fornecedores", label: "Fornecedores do Varejo" },
  { href: "/varejo/compras", label: "Compras do Varejo" },
  { href: "/supermercado/produtos", label: "Produtos do Supermercado" },
  { href: "/supermercado/pedidos", label: "Pedidos do Supermercado" },
  { href: "/farmacia/produtos", label: "Produtos da Farmácia" },
  { href: "/farmacia/pedidos", label: "Pedidos da Farmácia" },
  { href: "/supermercado/campanhas", label: "Campanhas do Supermercado" },
  { href: "/entregas-praca", label: "Entregas PraçaAI" },
  { href: "/logistica-praca", label: "Logística PraçaAI" },
  { href: "/praca-conciliacao", label: "Conciliação PraçaAI" },
  { href: "/praca-executivo", label: "Operação PraçaAI" },
  { href: "/beauty/profissionais", label: "Profissionais do Salão" },
  { href: "/clinic/medicos", label: "Médicos da Clínica" },
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
    const observer = new MutationObserver(applyPolicy);
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
      restoreScopedLabels();
    };
  }, []);
}
