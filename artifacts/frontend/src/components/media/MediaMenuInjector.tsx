import { useEffect } from "react";

const CUSTOM_MENU_ATTR = "data-marketing-flow-menu";
const CAMPAIGNS_HREF = "/content?source=media-plan&tab=campanhas";
const CLEANUP_ATTR = "data-vendorai-campaign-cleanup";
const GUIDANCE_ATTR = "data-vendorai-campaign-guidance";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";
const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

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

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

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

function removeCampaignGuidance() {
  document.querySelectorAll<HTMLElement>(`[${GUIDANCE_ATTR}]`).forEach((node) => node.remove());
}

function hideForCampaign(node: HTMLElement, kind: string) {
  if (node.hasAttribute(CLEANUP_ATTR)) return;
  node.dataset.vendoraiPreviousDisplay = node.style.display;
  node.setAttribute(CLEANUP_ATTR, kind);
  node.style.display = "none";
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => normalizedText(button.textContent ?? "") === label && button.offsetParent !== null) ?? null;
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

function getExecutionContext() {
  const candidates = [MEDIA_PLAN_EXECUTION_KEY, ACTIVE_BRIEFING_KEY];
  for (const key of candidates) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw) as { tenantId?: string; mediaPlanId?: string; campaignId?: string; campaign?: { id?: string; nome?: string } };
      if (value.tenantId) return value;
    } catch {
      // Ignora contexto antigo inválido.
    }
  }
  return null;
}

async function deleteCurrentCampaign(button: HTMLButtonElement) {
  const params = new URLSearchParams(window.location.search);
  const campaignId = params.get("campaignId")?.trim();
  const mediaPlanId = params.get("mediaPlanId")?.trim();
  if (!campaignId) return;

  const context = getExecutionContext();
  const tenantId = context?.tenantId;
  if (!tenantId) {
    window.alert("Não foi possível identificar o tenant desta campanha. Atualize a página e tente novamente.");
    return;
  }

  const token = localStorage.getItem("vendorai_token") ?? "";
  const headers = { Authorization: `Bearer ${token}` };
  button.disabled = true;
  const previousText = button.textContent ?? "Excluir campanha";
  button.textContent = "Carregando…";

  try {
    const planResponse = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers });
    if (!planResponse.ok) throw new Error("Não foi possível carregar a campanha.");
    const plan = await planResponse.json() as { id: string; conteudo?: { campanhas?: Array<{ id: string; nome: string }> } } | null;
    if (!plan) throw new Error("Planejamento não encontrado.");
    if (mediaPlanId && plan.id !== mediaPlanId) throw new Error("Esta campanha pertence a uma versão anterior do planejamento.");

    const campaigns = plan.conteudo?.campanhas ?? [];
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) throw new Error("Campanha não encontrada.");

    const confirmed = window.confirm(`Excluir a campanha “${campaign.nome}”?\n\nAs ações de calendário ligadas a ela também serão removidas. Leads e contatos do CRM não serão excluídos.`);
    if (!confirmed) return;

    button.textContent = "Excluindo…";
    const patchResponse = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { campanhas: campaigns.filter((item) => item.id !== campaignId) } }),
    });
    if (!patchResponse.ok) {
      const payload = await patchResponse.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? "Não foi possível excluir a campanha.");
    }

    const calendarResponse = await fetch(`/api/tenants/${tenantId}/content-calendar`, { headers });
    if (calendarResponse.ok) {
      const calendar = await calendarResponse.json() as Array<{ id: string; mediaPlanId?: string | null; pilar?: string | null }>;
      const ids = calendar
        .filter((item) => item.mediaPlanId === plan.id && normalize((item.pilar ?? "").split(" · ")[0] ?? "") === normalize(campaign.nome))
        .map((item) => item.id);

      for (let index = 0; index < ids.length; index += 20) {
        const batch = ids.slice(index, index + 20);
        await Promise.allSettled(batch.map((id) => fetch(`/api/content-calendar/${encodeURIComponent(id)}`, { method: "DELETE", headers })));
      }
    }

    sessionStorage.removeItem(MEDIA_PLAN_EXECUTION_KEY);
    sessionStorage.removeItem(ACTIVE_BRIEFING_KEY);
    window.history.pushState({}, "", `/content?source=media-plan&tab=campanhas&mediaPlanId=${encodeURIComponent(plan.id)}&view=lista`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Não foi possível excluir a campanha.");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function inferSequenceStage(workspace: HTMLElement) {
  const text = normalizedText(workspace.textContent ?? "");
  if (text.includes("Finalizada")) return 5;
  if (text.includes("Acompanhar resultados")) return 4;
  if (text.includes("Pronta para iniciar") || text.includes("Iniciar campanha")) return 3;
  if (text.includes("Revisar campanha") || text.includes("Acompanhar produção")) return 2;
  return 1;
}

function createSequence(stage: number) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute(GUIDANCE_ATTR, "sequence");
  wrapper.className = "rounded-xl border bg-background p-3 md:p-4";

  const title = document.createElement("div");
  title.className = "mb-3 flex items-center justify-between gap-3";
  title.innerHTML = '<div><p class="text-sm font-semibold">Sequência da campanha</p><p class="text-xs text-muted-foreground">Siga uma etapa por vez. O sistema libera o próximo passo conforme a campanha avança.</p></div>';
  wrapper.appendChild(title);

  const steps = ["Preparar", "Revisar", "Iniciar", "Acompanhar", "Finalizar"];
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-2 gap-2 sm:grid-cols-5";

  steps.forEach((label, index) => {
    const number = index + 1;
    const item = document.createElement("div");
    const active = number === stage;
    const done = number < stage;
    item.className = [
      "rounded-lg border px-3 py-2 text-xs",
      active ? "border-primary bg-primary/10 text-primary font-semibold" : done ? "bg-muted/50 text-foreground" : "text-muted-foreground",
    ].join(" ");
    item.innerHTML = `<span class="mr-1.5 font-semibold">${done ? "✓" : number}</span>${label}`;
    grid.appendChild(item);
  });

  wrapper.appendChild(grid);
  return wrapper;
}

function hideCampaignTechnicalControls(workspace: HTMLElement) {
  const technicalPrefixes = [
    "Produzir agora",
    "Produzindo",
    "Produção real",
    "Reprocessar falhas",
    "Refazendo",
    "Atualizar",
    "Planejamento",
    "Excluir campanha",
  ];

  workspace.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const label = normalizedText(button.textContent ?? "");
    if (technicalPrefixes.some((prefix) => label.startsWith(prefix))) {
      hideForCampaign(button, "campaign-technical-control");
    }
  });

  workspace.querySelectorAll<HTMLElement>("div,span").forEach((node) => {
    const label = normalizedText(node.textContent ?? "");
    if (!label.startsWith("Produção protegida:")) return;
    const card = closestCard(node);
    if (card) hideForCampaign(card, "campaign-technical-warning");
  });
}

function ensureCampaignGuidance() {
  const params = new URLSearchParams(window.location.search);
  const isOpenCampaign = window.location.pathname === "/content"
    && params.get("tab") === "campanhas"
    && Boolean(params.get("campaignId"));

  if (!isOpenCampaign) {
    removeCampaignGuidance();
    return;
  }

  document.querySelectorAll<HTMLElement>("p,div").forEach((node) => {
    if (normalizedText(node.textContent ?? "") !== "Ferramentas desta campanha") return;
    const card = closestCard(node);
    if (card) hideForCampaign(card, "campaign-tools");
  });

  const hideDetailsButton = findButton("Ocultar detalhes");
  if (hideDetailsButton) hideDetailsButton.click();

  const allCampaignsButton = findButton("Todas as campanhas");
  if (!allCampaignsButton) return;
  const toolbar = allCampaignsButton.parentElement;
  const workspace = toolbar?.parentElement;
  if (!toolbar || !workspace) return;

  hideCampaignTechnicalControls(workspace);

  const stage = inferSequenceStage(workspace);
  let sequence = workspace.querySelector<HTMLElement>(`:scope > [${GUIDANCE_ATTR}="sequence"]`);
  if (!sequence) {
    sequence = createSequence(stage);
    toolbar.insertAdjacentElement("afterend", sequence);
  } else if (sequence.dataset.stage !== String(stage)) {
    sequence.replaceWith(createSequence(stage));
    sequence = workspace.querySelector<HTMLElement>(`:scope > [${GUIDANCE_ATTR}="sequence"]`);
  }
  if (sequence) sequence.dataset.stage = String(stage);

}

function ensureContentApprovalGate() {
  const reviewLabel = Array.from(document.querySelectorAll<HTMLElement>("span,div"))
    .find((node) => normalizedText(node.textContent ?? "") === "Plano em revisão");
  const existingGate = document.querySelector<HTMLElement>(`[${GUIDANCE_ATTR}="content-approval"]`);

  if (!reviewLabel) {
    existingGate?.remove();
    return;
  }

  const productionHeading = Array.from(document.querySelectorAll<HTMLElement>("p,div"))
    .find((node) => normalizedText(node.textContent ?? "") === "Produção automática do planejamento");
  const productionCard = closestCard(productionHeading ?? null);
  const queueRoot = productionCard?.parentElement as HTMLElement | null;
  if (!queueRoot) return;

  hideForCampaign(queueRoot, "content-awaiting-approval");
  if (existingGate) return;

  const gate = document.createElement("div");
  gate.setAttribute(GUIDANCE_ATTR, "content-approval");
  gate.className = "mx-4 mt-5 rounded-xl border border-primary/20 bg-primary/[0.02] p-5 md:mx-6";
  gate.innerHTML = `
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">Ação necessária</p>
        <p class="mt-1 text-base font-semibold">Planejamento ainda não aprovado</p>
        <p class="mt-1 text-sm text-muted-foreground">Esta etapa depende da aprovação da Etapa 1 — Planejamento. Depois da aprovação, a IA inicia automaticamente a produção dos conteúdos e criativos do plano.</p>
      </div>
      <button type="button" class="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">Revisar Planejamento</button>
    </div>`;
  gate.querySelector("button")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/content?tab=planejamento");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  queueRoot.insertAdjacentElement("beforebegin", gate);
}

function cleanupCampaignWorkspace() {
  restoreCampaignCleanup();

  if (window.location.pathname !== "/content") {
    removeCampaignGuidance();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  const shouldHideGlobalTools = tab !== "planejamento";
  if (!shouldHideGlobalTools) {
    removeCampaignGuidance();
    return;
  }

  document.querySelectorAll<HTMLElement>("span").forEach((label) => {
    if (normalizedText(label.textContent ?? "") === "Ferramentas:") {
      const row = label.parentElement;
      if (row) hideForCampaign(row, "tools");
    }
  });

  if (tab === "conteudos") {
    document.querySelectorAll<HTMLElement>(`[${GUIDANCE_ATTR}="sequence"], [${GUIDANCE_ATTR}="delete"]`).forEach((node) => node.remove());
    ensureContentApprovalGate();
    return;
  }

  document.querySelector<HTMLElement>(`[${GUIDANCE_ATTR}="content-approval"]`)?.remove();

  if (!params.get("campaignId")) {
    removeCampaignGuidance();
    return;
  }

  document.querySelectorAll<HTMLElement>("span").forEach((label) => {
    if (normalizedText(label.textContent ?? "") !== "Executar em:") return;
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

  ensureCampaignGuidance();
}

/**
 * Mantém o submenu lateral de Marketing alinhado ao fluxo oficial do módulo.
 * O SidebarLayoutLegacy conserva links antigos por compatibilidade, mas a
 * navegação visível segue um fluxo único e simples.
 */
export function MediaMenuInjector() {
  useEffect(() => {
    const ensureMarketingMenu = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;

        const hasCampaigns = !!container.querySelector(':scope > a[href="/content?tab=campanhas"]');
        const hasAds = !!container.querySelector(':scope > a[href="/ads"]');
        if (!hasCampaigns || !hasAds) return;

        container.querySelectorAll<HTMLElement>(":scope > a").forEach((link) => {
          link.style.display = "none";
        });

        container.querySelectorAll<HTMLElement>('[data-media-center-menu-entry="true"]').forEach((node) => node.remove());

        let menu = container.querySelector<HTMLElement>(`:scope > [${CUSTOM_MENU_ATTR}]`);
        if (!menu) {
          menu = document.createElement("div");
          menu.setAttribute(CUSTOM_MENU_ATTR, "true");
          menu.className = "space-y-1";
          container.prepend(menu);
        }

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
      removeCampaignGuidance();
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