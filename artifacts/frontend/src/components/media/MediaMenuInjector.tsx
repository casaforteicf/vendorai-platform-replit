import { useEffect } from "react";

const CUSTOM_MENU_ATTR = "data-marketing-flow-menu";
const CAMPAIGNS_HREF = "/content?source=media-plan&tab=campanhas";
const CLEANUP_ATTR = "data-vendorai-campaign-cleanup";

const MAIN_ITEMS = [
  { label: "Visão Geral", href: "/content?tab=visao-geral" },
  { label: "1. Planejamento", href: "/content?tab=planejamento" },
  { label: "2. Campanhas", href: CAMPAIGNS_HREF },
  { label: "3. Conteúdos & Criativos", href: "/content?tab=conteudos" },
  { label: "4. Resultados", href: "/content?tab=resultados" },
  { label: "Rastreamento", href: "/content?tab=rastreamento" },
];

const TOOL_ITEMS = [
  { label: "Mídias", href: "/midias" },
  { label: "Vídeos com IA", href: "/content-studio/video" },
  { label: "Sites & LPs", href: "/content?tab=campanhas&view=lp" },
  { label: "Anúncios", href: "/ads" },
];

function isActiveHref(href: string) {
  const target = new URL(href, window.location.origin);
  if (target.pathname !== window.location.pathname) return false;

  if (target.pathname === "/content") {
    const targetTab = target.searchParams.get("tab") ?? "visao-geral";
    const current = new URLSearchParams(window.location.search);
    const legacyTracking = current.get("tab") === "campanhas" && current.get("view") === "visitantes";
    const currentTab = legacyTracking ? "rastreamento" : (current.get("tab") ?? "visao-geral");
    if (targetTab !== currentTab) return false;

    const targetView = target.searchParams.get("view");
    if (targetView && current.get("view") !== targetView) return false;
  }

  return true;
}

function buildLink(item: { label: string; href: string }, iconSource: SVGElement | null) {
  const link = document.createElement("a");
  link.href = item.href;
  link.setAttribute("aria-label", item.label);
  link.setAttribute("title", item.label);
  link.className = [
    "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
    isActiveHref(item.href)
      ? "bg-primary/10 text-primary font-medium"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  ].join(" ");

  if (iconSource) {
    const icon = iconSource.cloneNode(true) as SVGElement;
    icon.classList.add("h-3.5", "w-3.5");
    link.appendChild(icon);
  }

  const label = document.createElement("span");
  label.textContent = item.label;
  link.appendChild(label);
  return link;
}

function restoreCampaignCleanup() {
  document.querySelectorAll<HTMLElement>(`[${CLEANUP_ATTR}]`).forEach((node) => {
    node.style.display = node.dataset.vendoraiPreviousDisplay ?? "";
    delete node.dataset.vendoraiPreviousDisplay;
    node.removeAttribute(CLEANUP_ATTR);
  });
}

function hideForCampaign(node: HTMLElement, kind: string) {
  if (node.hasAttribute(CLEANUP_ATTR)) return;
  node.dataset.vendoraiPreviousDisplay = node.style.display;
  node.setAttribute(CLEANUP_ATTR, kind);
  node.style.display = "none";
}

function cleanupCampaignWorkspace() {
  restoreCampaignCleanup();

  if (window.location.pathname !== "/content") return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") !== "campanhas") return;

  // Ferramentas gerais já existem no menu lateral. Na aba Campanhas elas
  // duplicam navegação e desviam o foco da campanha atual.
  document.querySelectorAll<HTMLElement>("span").forEach((label) => {
    if (label.textContent?.replace(/\s+/g, " ").trim() === "Ferramentas:") {
      const row = label.parentElement;
      if (row) hideForCampaign(row, "tools");
    }
  });

  // Quando uma campanha está aberta, o ContentHub ainda monta um resumo legado
  // acima do workspace novo. O bloco possui "Executar em:" e o fundo
  // bg-primary/[0.03]. Ocultamos apenas esse card duplicado, preservando a
  // lista de campanhas e o workspace novo abaixo.
  if (!params.get("campaignId")) return;

  document.querySelectorAll<HTMLElement>("span").forEach((label) => {
    if (label.textContent?.replace(/\s+/g, " ").trim() !== "Executar em:") return;
    let current: HTMLElement | null = label.parentElement;
    while (current && current !== document.body) {
      const className = typeof current.className === "string" ? current.className : "";
      if (className.includes("bg-primary/[0.03]") && className.includes("border-primary/25")) {
        hideForCampaign(current, "legacy-summary");
        break;
      }
      current = current.parentElement;
    }
  });
}

/**
 * Mantém o submenu lateral de Marketing alinhado ao fluxo oficial do módulo.
 *
 * O SidebarLayoutLegacy ainda conserva links antigos por compatibilidade de
 * rota. Aqui eles ficam ocultos visualmente e apresentamos uma única navegação
 * simples, sem remover as telas ou quebrar links antigos.
 */
export function MediaMenuInjector() {
  useEffect(() => {
    const ensureMarketingMenu = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;

        // Confirma que estamos no submenu de Marketing, e não em outro link /content.
        const hasCampaigns = !!container.querySelector(':scope > a[href="/content?tab=campanhas"]');
        const hasAds = !!container.querySelector(':scope > a[href="/ads"]');
        if (!hasCampaigns || !hasAds) return;

        // Os links declarativos antigos continuam no DOM para compatibilidade,
        // mas não devem competir visualmente com o novo fluxo.
        container.querySelectorAll<HTMLElement>(":scope > a").forEach((link) => {
          link.style.display = "none";
        });

        // Remove a antiga entrada de Mídias criada pela versão anterior do bridge.
        container.querySelectorAll<HTMLElement>('[data-media-center-menu-entry="true"]').forEach((node) => node.remove());

        let menu = container.querySelector<HTMLElement>(`:scope > [${CUSTOM_MENU_ATTR}]`);
        if (!menu) {
          menu = document.createElement("div");
          menu.setAttribute(CUSTOM_MENU_ATTR, "true");
          menu.className = "space-y-1";
          container.prepend(menu);
        }

        // Reconstrói somente quando a rota muda ou o React remonta o submenu.
        const routeKey = `${window.location.pathname}${window.location.search}`;
        if (menu.dataset.routeKey !== routeKey || menu.childElementCount === 0) {
          menu.dataset.routeKey = routeKey;
          menu.replaceChildren();

          const iconSource = contentLink.querySelector("svg");
          MAIN_ITEMS.forEach((item) => menu!.appendChild(buildLink(item, iconSource)));

          const divider = document.createElement("div");
          divider.className = "mx-3 my-2 border-t";
          menu.appendChild(divider);

          const toolsLabel = document.createElement("p");
          toolsLabel.className = "px-3 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60";
          toolsLabel.textContent = "Ferramentas";
          menu.appendChild(toolsLabel);

          TOOL_ITEMS.forEach((item) => menu!.appendChild(buildLink(item, iconSource)));
        }
      });

      cleanupCampaignWorkspace();
    };

    // A aba superior também deve entrar primeiro na lista de campanhas.
    // Isso evita cair novamente no antigo Command Center sem escolher uma campanha.
    const handleCampaignTabClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const tab = target?.closest<HTMLElement>('[role="tab"]');
      const label = tab?.textContent?.replace(/\s+/g, " ").trim();
      if (window.location.pathname !== "/content" || label !== "2. Campanhas") return;

      event.preventDefault();
      event.stopPropagation();
      window.history.pushState({}, "", CAMPAIGNS_HREF);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };

    ensureMarketingMenu();
    const observer = new MutationObserver(ensureMarketingMenu);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", ensureMarketingMenu);
    document.addEventListener("click", handleCampaignTabClick, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", ensureMarketingMenu);
      document.removeEventListener("click", handleCampaignTabClick, true);
      restoreCampaignCleanup();
      document.querySelectorAll<HTMLElement>(`[${CUSTOM_MENU_ATTR}]`).forEach((menu) => menu.remove());
      document.querySelectorAll<HTMLElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;
        container.querySelectorAll<HTMLElement>(":scope > a").forEach((link) => {
          link.style.display = "";
        });
      });
    };
  }, []);

  return null;
}
