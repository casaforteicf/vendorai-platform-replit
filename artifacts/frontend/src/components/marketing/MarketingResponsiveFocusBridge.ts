const NAV_HOST_ATTR = "data-vendorai-marketing-mobile-nav";
const HIDDEN_ATTR = "data-vendorai-marketing-focus-hidden";
const STYLE_ID = "vendorai-marketing-focus-style";
const HEADER_ATTR = "data-vendorai-marketing-mobile-header";

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

    [data-vendorai-campaign-workspace-v2="true"] > * {
      min-width:0;
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

function hideCardByHeading(workspace: HTMLElement, heading: string) {
  const target = Array.from(workspace.children).find((node) => {
    if (!(node instanceof HTMLElement)) return false;
    return normalize(node.textContent ?? "").startsWith(normalize(heading));
  }) as HTMLElement | undefined;
  if (!target) return;
  if (!target.hasAttribute(HIDDEN_ATTR)) target.setAttribute(HIDDEN_ATTR, target.style.display || "__empty__");
  target.style.display = "none";
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
    if (label.includes("atualizar") || label === "planejamento") {
      if (!button.hasAttribute(HIDDEN_ATTR)) button.setAttribute(HIDDEN_ATTR, button.style.display || "__empty__");
      button.style.display = "none";
    }
  });
}

function restoreFocusHidden() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((node) => {
    if (node.getAttribute("role") === "tablist") return;
    const previous = node.getAttribute(HIDDEN_ATTR);
    node.style.display = previous === "__empty__" ? "" : (previous ?? "");
    node.removeAttribute(HIDDEN_ATTR);
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
