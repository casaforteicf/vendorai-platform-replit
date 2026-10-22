export {};

const RESULTS_TRACKING_HOST = "data-vendorai-results-tracking-nav";
const TRACKING_HIDDEN = "data-vendorai-tracking-main-hidden";
const STYLE_ID = "vendorai-results-tracking-style";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isMarketingRoute() {
  return window.location.pathname === "/content";
}

function currentTab() {
  return new URLSearchParams(window.location.search).get("tab") ?? "visao-geral";
}

function navigate(tab: "resultados" | "rastreamento") {
  const url = new URL(window.location.href);
  url.pathname = "/content";
  url.searchParams.set("tab", tab);
  ["campaignId", "view", "mode"].forEach((key) => url.searchParams.delete(key));
  window.history.pushState(window.history.state, "", `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${RESULTS_TRACKING_HOST}] {
      display:flex;
      align-items:center;
      gap:4px;
      width:max-content;
      max-width:100%;
      margin:0 0 14px;
      padding:4px;
      border:1px solid hsl(var(--border));
      border-radius:12px;
      background:hsl(var(--muted) / .35);
    }
    [${RESULTS_TRACKING_HOST}] button {
      min-height:36px;
      padding:7px 12px;
      border:0;
      border-radius:9px;
      background:transparent;
      color:hsl(var(--muted-foreground));
      font-size:12px;
      font-weight:700;
      white-space:nowrap;
      cursor:pointer;
    }
    [${RESULTS_TRACKING_HOST}] button[data-active="true"] {
      background:hsl(var(--background));
      color:hsl(var(--foreground));
      box-shadow:0 1px 3px rgba(15,23,42,.08);
    }
    @media (max-width:767px) {
      [${RESULTS_TRACKING_HOST}] {
        width:100%;
        margin-bottom:10px;
      }
      [${RESULTS_TRACKING_HOST}] button {
        flex:1 1 0;
        min-width:0;
        padding-inline:8px;
        white-space:normal;
        line-height:1.15;
      }
    }
  `;
  document.head.appendChild(style);
}

function findMainTabList() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]')).find((node) => {
    const text = normalize(node.textContent ?? "");
    return text.includes("visao geral") && text.includes("planejamento") && text.includes("campanhas") && text.includes("conteudos");
  }) ?? null;
}

function hideTrackingFromPrimaryNav() {
  const tabList = findMainTabList();
  if (!tabList) return;

  const triggers = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'));
  const tracking = triggers.find((node) => normalize(node.textContent ?? "") === "rastreamento") ?? null;
  const results = triggers.find((node) => normalize(node.textContent ?? "").includes("resultados")) ?? null;

  if (tracking) {
    tracking.setAttribute(TRACKING_HIDDEN, "true");
    tracking.style.display = "none";
    if (currentTab() === "rastreamento") {
      tracking.setAttribute("data-state", "inactive");
      tracking.setAttribute("aria-selected", "false");
    }
  }

  if (results && currentTab() === "rastreamento") {
    results.setAttribute("data-state", "active");
    results.setAttribute("aria-selected", "true");
  }

  const mobileSelect = document.querySelector<HTMLSelectElement>('[data-vendorai-marketing-mobile-nav] select');
  if (mobileSelect) {
    Array.from(mobileSelect.options).forEach((option) => {
      if (option.value === "rastreamento") option.remove();
    });
    if (currentTab() === "rastreamento") mobileSelect.value = "resultados";
  }
}

function visibleMarketingPanel() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]')).find((panel) => {
    if (panel.hidden) return false;
    const style = window.getComputedStyle(panel);
    return style.display !== "none";
  }) ?? null;
}

function ensureSecondaryNavigation() {
  const tab = currentTab();
  if (!isMarketingRoute() || (tab !== "resultados" && tab !== "rastreamento")) {
    document.querySelector<HTMLElement>(`[${RESULTS_TRACKING_HOST}]`)?.remove();
    return;
  }

  const panel = visibleMarketingPanel();
  if (!panel) return;

  let host = document.querySelector<HTMLElement>(`[${RESULTS_TRACKING_HOST}]`);
  if (!host) {
    host = document.createElement("div");
    host.setAttribute(RESULTS_TRACKING_HOST, "true");
    host.setAttribute("aria-label", "Seções de resultados");
    host.innerHTML = `
      <button type="button" data-section="resultados">Performance</button>
      <button type="button" data-section="rastreamento">Rastreamento & atribuição</button>
    `;
    host.querySelector<HTMLButtonElement>('[data-section="resultados"]')?.addEventListener("click", () => navigate("resultados"));
    host.querySelector<HTMLButtonElement>('[data-section="rastreamento"]')?.addEventListener("click", () => navigate("rastreamento"));
  }

  if (host.parentElement !== panel || panel.firstElementChild !== host) panel.insertAdjacentElement("afterbegin", host);

  host.querySelectorAll<HTMLButtonElement>("button[data-section]").forEach((button) => {
    button.dataset.active = button.dataset.section === tab ? "true" : "false";
  });
}

let scheduled = false;
function sync() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    ensureStyle();
    if (!isMarketingRoute()) {
      document.querySelector<HTMLElement>(`[${RESULTS_TRACKING_HOST}]`)?.remove();
      return;
    }
    hideTrackingFromPrimaryNav();
    ensureSecondaryNavigation();
  });
}

if (typeof window !== "undefined") {
  sync();
  window.addEventListener("popstate", sync);
  window.addEventListener("resize", sync);
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:["data-state", "hidden"] });
}
