export {};

const NAV_HOST_ATTR = "data-vendorai-marketing-mobile-nav";
const HIDDEN_ATTR = "data-vendorai-marketing-focus-hidden";
const STYLE_ID = "vendorai-marketing-focus-style";
const HEADER_ATTR = "data-vendorai-marketing-mobile-header";
const PLANNING_ATTR = "data-vendorai-planning-focus";
const PLANNING_TOGGLE_ATTR = "data-vendorai-planning-briefing-toggle";

const TAB_OPTIONS = [
  ["visao-geral", "Visão Geral"],
  ["planejamento", "1. Planejamento"],
  ["campanhas", "2. Campanhas"],
  ["conteudos", "3. Conteúdos & Criativos"],
  ["resultados", "4. Resultados"],
  ["rastreamento", "Rastreamento"],
] as const;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isMarketingRoute() {
  return window.location.pathname === "/content";
}

function isMobile() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function activeTab() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") ?? "visao-geral";
  if (tab === "gerador") return "conteudos";
  if (tab === "variedades") return "campanhas";
  return TAB_OPTIONS.some(([value]) => value === tab) ? tab : "visao-geral";
}

function isPlanningTab() {
  return isMarketingRoute() && activeTab() === "planejamento";
}

function isOverviewTab() {
  return isMarketingRoute() && activeTab() === "visao-geral";
}

function findMarketingTabList() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]')).find((node) => {
    const text = normalize(node.textContent ?? "");
    return text.includes("visao geral") && text.includes("planejamento") && text.includes("campanhas") && text.includes("conteudos");
  }) ?? null;
}

function navigateToTab(tab: string) {
  const url = new URL(window.location.href);
  url.pathname = "/content";
  url.searchParams.set("tab", tab);

  if (tab === "visao-geral") {
    ["source", "from", "mediaPlanId", "campaignId", "view", "mode"].forEach((key) => url.searchParams.delete(key));
  } else if (tab === "planejamento") {
    ["campaignId", "view", "mode"].forEach((key) => url.searchParams.delete(key));
  } else if (tab === "campanhas") {
    ["campaignId", "view", "mode"].forEach((key) => url.searchParams.delete(key));
  } else if (tab === "resultados" || tab === "rastreamento") {
    ["campaignId", "view", "mode"].forEach((key) => url.searchParams.delete(key));
  }

  window.history.pushState(window.history.state, "", `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${NAV_HOST_ATTR}] { display:none; }

    [data-vendorai-campaign-workspace-v2="true"] {
      max-width:1180px;
      margin-inline:auto;
    }

    [data-vendorai-campaign-workspace-v2="true"] > *,
    [${PLANNING_ATTR}="true"] * {
      min-width:0;
    }

    [${PLANNING_ATTR}="true"] {
      max-width:1180px;
      margin-inline:auto;
    }

    [${PLANNING_ATTR}="true"] > .space-y-5,
    [${PLANNING_ATTR}="true"] .space-y-5 {
      gap:14px;
    }

    [${PLANNING_ATTR}="true"] [data-vendorai-planning-previous] {
      border-style:solid !important;
      background:hsl(var(--muted) / .18);
    }

    [${PLANNING_TOGGLE_ATTR}] {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      width:100%;
      min-height:46px;
      margin-bottom:10px;
      padding:10px 12px;
      border:1px solid hsl(var(--border));
      border-radius:12px;
      background:hsl(var(--background));
      color:hsl(var(--foreground));
      font-size:13px;
      font-weight:700;
      text-align:left;
    }

    [${PLANNING_TOGGLE_ATTR}] span:last-child {
      color:hsl(var(--muted-foreground));
      font-size:11px;
      font-weight:500;
    }

    body[data-vendorai-marketing-shell="true"] .vendor-marketing-bottom-links {
      display:none !important;
    }

    @media (max-width: 767px) {
      [${HEADER_ATTR}] { display:none !important; }

      [${NAV_HOST_ATTR}] {
        display:block;
        margin:2px 0 10px;
      }

      [${NAV_HOST_ATTR}] .vendorai-marketing-mobile-select-wrap {
        position:relative;
        display:flex;
        align-items:center;
        width:100%;
        min-height:46px;
        border:1px solid hsl(var(--border));
        border-radius:12px;
        background:hsl(var(--background));
        box-shadow:0 1px 2px rgba(15,23,42,.04);
      }

      [${NAV_HOST_ATTR}] .vendorai-marketing-mobile-select-label {
        padding-left:12px;
        padding-right:7px;
        color:hsl(var(--muted-foreground));
        font-size:11px;
        font-weight:600;
        white-space:nowrap;
      }

      [${NAV_HOST_ATTR}] select {
        flex:1;
        min-width:0;
        height:44px;
        border:0;
        outline:0;
        background:transparent;
        color:hsl(var(--foreground));
        font-size:13px;
        font-weight:700;
        padding:0 34px 0 4px;
        appearance:auto;
      }

      body[data-vendorai-marketing-shell="true"] [role="tabpanel"] {
        padding-top:0 !important;
      }

      body[data-vendorai-marketing-shell="true"] .vendor-marketing-overview-hero-mobile-hidden {
        display:none !important;
      }

      [${PLANNING_ATTR}="true"] .grid.md\\:grid-cols-2,
      [${PLANNING_ATTR}="true"] .grid.lg\\:grid-cols-2 {
        grid-template-columns:minmax(0,1fr) !important;
      }

      [${PLANNING_ATTR}="true"] .mt-2.flex.flex-wrap {
        flex-wrap:nowrap !important;
        overflow-x:auto;
        overflow-y:hidden;
        padding-bottom:3px;
        scrollbar-width:none;
      }

      [${PLANNING_ATTR}="true"] .mt-2.flex.flex-wrap::-webkit-scrollbar {
        display:none;
      }

      [${PLANNING_ATTR}="true"] .mt-2.flex.flex-wrap > * {
        flex:0 0 auto;
      }

      [${PLANNING_ATTR}="true"] textarea {
        min-height:72px !important;
      }

      [${PLANNING_ATTR}="true"] [data-vendorai-planning-info-card] [class*="CardContent"],
      [${PLANNING_ATTR}="true"] [data-vendorai-planning-proposal-card] [class*="CardContent"] {
        padding-left:12px !important;
        padding-right:12px !important;
      }

      [${PLANNING_ATTR}="true"] [data-vendorai-planning-proposal-card] .rounded-xl.border.bg-background {
        padding:12px !important;
      }

      [data-vendorai-campaign-workspace-v2="true"] {
        gap:10px !important;
      }

      [data-vendorai-campaign-workspace-v2="true"] > div:first-child {
        min-height:34px;
        margin:0 0 2px;
      }

      [data-vendorai-campaign-workspace-v2="true"] > div:first-child > div {
        display:none !important;
      }

      [data-vendorai-campaign-workspace-v2="true"] > div:first-child > button {
        min-height:34px;
        padding-inline:4px 8px;
        color:hsl(var(--muted-foreground));
      }

      [data-vendorai-campaign-workspace-v2="true"] > div:nth-child(2) {
        margin-top:0 !important;
      }

      [data-vendorai-campaign-workspace-v2="true"] h2 {
        font-size:22px !important;
        line-height:1.12 !important;
      }

      [data-vendorai-campaign-workspace-v2="true"] button {
        touch-action:manipulation;
      }

      [data-vendorai-campaign-workspace-v2="true"] .grid.grid-cols-3 {
        gap:7px !important;
      }

      [data-vendorai-campaign-workspace-v2="true"] .grid.grid-cols-3 > * {
        min-width:0;
      }
    }
  `;
  document.head.appendChild(style);
}

function markMarketingHeader() {
  const h1 = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((node) => normalize(node.textContent ?? "") === "marketing");
  if (!h1) return;
  const header = h1.parentElement;
  if (header) header.setAttribute(HEADER_ATTR, "true");
}

function ensureMobileNavigation() {
  const tabList = findMarketingTabList();
  if (!tabList) return;

  if (!isMarketingRoute() || !isMobile()) {
    const previous = tabList.getAttribute(HIDDEN_ATTR);
    if (previous !== null) {
      tabList.style.display = previous === "__empty__" ? "" : previous;
      tabList.removeAttribute(HIDDEN_ATTR);
    }
    document.querySelector<HTMLElement>(`[${NAV_HOST_ATTR}]`)?.remove();
    return;
  }

  if (!tabList.hasAttribute(HIDDEN_ATTR)) tabList.setAttribute(HIDDEN_ATTR, tabList.style.display || "__empty__");
  tabList.style.display = "none";

  let host = document.querySelector<HTMLElement>(`[${NAV_HOST_ATTR}]`);
  if (!host) {
    host = document.createElement("div");
    host.setAttribute(NAV_HOST_ATTR, "true");
    host.innerHTML = `
      <div class="vendorai-marketing-mobile-select-wrap">
        <span class="vendorai-marketing-mobile-select-label">Marketing</span>
        <select aria-label="Navegar no Marketing"></select>
      </div>`;
    tabList.insertAdjacentElement("beforebegin", host);

    const select = host.querySelector<HTMLSelectElement>("select");
    if (select) {
      TAB_OPTIONS.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
      select.addEventListener("change", () => navigateToTab(select.value));
    }
  }

  const select = host.querySelector<HTMLSelectElement>("select");
  if (select && select.value !== activeTab()) select.value = activeTab();
}

function closestCard(node: HTMLElement | null) {
  let current = node;
  while (current && current !== document.body) {
    const className = typeof current.className === "string" ? current.className : "";
    if (className.includes("border") && (className.includes("rounded") || className.includes("shadow"))) return current;
    current = current.parentElement;
  }
  return null;
}

function hideNode(node: HTMLElement | null) {
  if (!node) return;
  if (!node.hasAttribute(HIDDEN_ATTR)) node.setAttribute(HIDDEN_ATTR, node.style.display || "__empty__");
  node.style.display = "none";
}

function showNode(node: HTMLElement | null) {
  if (!node) return;
  const previous = node.getAttribute(HIDDEN_ATTR);
  if (previous === null) return;
  node.style.display = previous === "__empty__" ? "" : previous;
  node.removeAttribute(HIDDEN_ATTR);
}

function hideCardByHeading(workspace: HTMLElement, heading: string) {
  const target = Array.from(workspace.children).find((node) => {
    if (!(node instanceof HTMLElement)) return false;
    return normalize(node.textContent ?? "").startsWith(normalize(heading));
  }) as HTMLElement | undefined;
  hideNode(target ?? null);
}

function simplifyCampaignWorkspace() {
  const workspace = document.querySelector<HTMLElement>('[data-vendorai-campaign-workspace-v2="true"]');
  if (!workspace) return;

  hideCardByHeading(workspace, "Ferramentas da campanha");
  hideCardByHeading(workspace, "Detalhes das ações");

  if (!isMobile()) return;
  const toolbar = workspace.firstElementChild as HTMLElement | null;
  if (!toolbar) return;

  const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
  buttons.forEach((button, index) => {
    if (index === 0) return;
    const label = normalize(button.textContent ?? "");
    if (label.includes("atualizar") || label === "planejamento") hideNode(button);
  });
}

function markOverview() {
  if (!isOverviewTab()) return;
  const heroText = Array.from(document.querySelectorAll<HTMLElement>("h2,p")).find((node) =>
    normalize(node.textContent ?? "").includes("planeje, execute e acompanhe suas campanhas"),
  );
  const heroCard = closestCard(heroText ?? null);
  heroCard?.classList.add("vendor-marketing-overview-hero-mobile-hidden");
}

function planningRoot() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("div,p,h2,h3")).find((node) =>
    normalize(node.textContent ?? "") === "1. informacoes do planejamento",
  );
  const infoCard = closestCard(heading ?? null);
  if (!infoCard) return null;
  const root = infoCard.parentElement;
  if (root) root.setAttribute(PLANNING_ATTR, "true");
  infoCard.setAttribute("data-vendorai-planning-info-card", "true");
  return { root, infoCard };
}

function simplifyPlanning() {
  if (!isPlanningTab()) return;
  const context = planningRoot();
  if (!context?.root) return;
  const { root, infoCard } = context;

  const explainer = Array.from(root.querySelectorAll<HTMLElement>("p,div")).find((node) =>
    normalize(node.textContent ?? "") === "planejamento = decisao, nao execucao",
  );
  hideNode(closestCard(explainer ?? null));

  const previousLabel = Array.from(root.querySelectorAll<HTMLElement>("p,div")).find((node) =>
    normalize(node.textContent ?? "") === "existe um planejamento anterior",
  );
  closestCard(previousLabel ?? null)?.setAttribute("data-vendorai-planning-previous", "true");

  const proposalTitle = Array.from(root.querySelectorAll<HTMLElement>("div,p,h2,h3")).find((node) =>
    normalize(node.textContent ?? "") === "2. proposta da ia",
  );
  const proposalCard = closestCard(proposalTitle ?? null);
  proposalCard?.setAttribute("data-vendorai-planning-proposal-card", "true");

  let toggle = root.querySelector<HTMLButtonElement>(`[${PLANNING_TOGGLE_ATTR}]`);
  if (!proposalCard) {
    toggle?.remove();
    showNode(infoCard);
    return;
  }

  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute(PLANNING_TOGGLE_ATTR, "true");
    toggle.dataset.expanded = "false";
    toggle.innerHTML = `<span>Briefing do planejamento</span><span>Editar informações</span>`;
    toggle.addEventListener("click", () => {
      const expanded = toggle?.dataset.expanded === "true";
      if (!toggle) return;
      toggle.dataset.expanded = expanded ? "false" : "true";
      toggle.innerHTML = expanded
        ? `<span>Briefing do planejamento</span><span>Editar informações</span>`
        : `<span>Briefing do planejamento</span><span>Ocultar edição</span>`;
      if (expanded) hideNode(infoCard); else showNode(infoCard);
    });
    proposalCard.insertAdjacentElement("beforebegin", toggle);
  }

  if (toggle.dataset.expanded !== "true") hideNode(infoCard);
}

function restoreFocusHidden() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((node) => {
    if (node.getAttribute("role") === "tablist") return;
    showNode(node);
  });
}

let scheduled = false;
function sync() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    ensureStyle();
    markMarketingHeader();
    if (!isMarketingRoute()) {
      ensureMobileNavigation();
      restoreFocusHidden();
      return;
    }
    ensureMobileNavigation();
    markOverview();
    simplifyPlanning();
    simplifyCampaignWorkspace();
  });
}

if (typeof window !== "undefined") {
  sync();
  window.addEventListener("popstate", sync);
  window.addEventListener("resize", sync);
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
