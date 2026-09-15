import { useEffect } from "react";

const HIDDEN_ATTR = "data-vendorai-campaign-clarity-hidden";
const INJECTED_ATTR = "data-vendorai-campaign-clarity";
const GUIDANCE_ATTR = "data-vendorai-campaign-guidance";

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isCampaignDetail() {
  if (window.location.pathname !== "/content") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") === "campanhas" && Boolean(params.get("campaignId"));
}

function findVisibleButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => normalizedText(button.textContent ?? "") === label && button.offsetParent !== null) ?? null;
}

function directChildContaining(workspace: HTMLElement, texts: string[]) {
  return Array.from(workspace.children)
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .find((node) => {
      const text = normalizedText(node.textContent ?? "");
      return texts.every((term) => text.includes(term));
    }) ?? null;
}

function hideNode(node: HTMLElement | null, reason: string) {
  if (!node || node.hasAttribute(HIDDEN_ATTR)) return;
  node.dataset.vendoraiCampaignClarityPreviousDisplay = node.style.display;
  node.setAttribute(HIDDEN_ATTR, reason);
  node.style.display = "none";
}

function restoreHidden() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((node) => {
    node.style.display = node.dataset.vendoraiCampaignClarityPreviousDisplay ?? "";
    delete node.dataset.vendoraiCampaignClarityPreviousDisplay;
    node.removeAttribute(HIDDEN_ATTR);
  });
}

function navigateToProduction() {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", "conteudos");
  params.set("source", "media-plan");
  params.delete("view");
  window.history.pushState(window.history.state, "", `/content?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function findBriefingGrid(headerCard: HTMLElement) {
  const candidates = Array.from(headerCard.querySelectorAll<HTMLElement>("div.grid"));
  return candidates.find((node) => {
    const text = normalizedText(node.textContent ?? "");
    return text.includes("Público") && text.includes("Produto") && text.includes("Oferta") && text.includes("Mensagem");
  }) ?? null;
}

function ensureBriefingToggle(headerCard: HTMLElement) {
  const grid = findBriefingGrid(headerCard);
  if (!grid) return;

  let toggle = headerCard.querySelector<HTMLButtonElement>(`button[${INJECTED_ATTR}="briefing-toggle"]`);
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute(INJECTED_ATTR, "briefing-toggle");
    toggle.className = "mt-3 inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground";
    toggle.textContent = "Ver briefing da campanha";
    toggle.addEventListener("click", () => {
      const expanded = grid.dataset.vendoraiCampaignClarityExpanded === "true";
      grid.dataset.vendoraiCampaignClarityExpanded = expanded ? "false" : "true";
      grid.style.display = expanded ? "none" : "grid";
      toggle!.textContent = expanded ? "Ver briefing da campanha" : "Ocultar briefing";
    });
    grid.insertAdjacentElement("beforebegin", toggle);
  }

  if (grid.dataset.vendoraiCampaignClarityExpanded !== "true") {
    grid.style.display = "none";
    toggle.textContent = "Ver briefing da campanha";
  }
}

function summaryValue(card: HTMLElement | null, label: string) {
  if (!card) return "0";
  const children = Array.from(card.querySelectorAll<HTMLElement>("p"));
  const labelNode = children.find((node) => normalizedText(node.textContent ?? "") === label);
  const parent = labelNode?.parentElement;
  if (!parent) return "0";
  const value = Array.from(parent.querySelectorAll<HTMLElement>("p"))
    .map((node) => normalizedText(node.textContent ?? ""))
    .find((text) => /^\d+$/.test(text));
  return value ?? "0";
}

function makeMetric(label: string, value: string) {
  const item = document.createElement("div");
  item.className = "rounded-lg border bg-muted/10 p-3";
  const title = document.createElement("p");
  title.className = "text-[11px] text-muted-foreground";
  title.textContent = label;
  const number = document.createElement("p");
  number.className = "mt-1 text-lg font-semibold";
  number.textContent = value;
  item.append(title, number);
  return item;
}

function ensureProductionDetails(workspace: HTMLElement, sequence: HTMLElement | null, summaryGrid: HTMLElement | null) {
  let card = workspace.querySelector<HTMLElement>(`[${INJECTED_ATTR}="production-details"]`);
  if (!card) {
    card = document.createElement("div");
    card.setAttribute(INJECTED_ATTR, "production-details");
    card.className = "rounded-xl border bg-background";
    card.innerHTML = `
      <button type="button" data-vendorai-campaign-production-toggle class="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/30">
        <span>
          <span class="block text-sm font-semibold">Detalhes da produção</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">Fila, limites, falhas e ações individuais ficam concentrados aqui.</span>
        </span>
        <span data-vendorai-campaign-production-toggle-label class="shrink-0 text-xs font-medium text-primary">Ver detalhes</span>
      </button>
      <div data-vendorai-campaign-production-body class="hidden border-t p-4">
        <div data-vendorai-campaign-production-metrics class="grid gap-2 sm:grid-cols-3"></div>
        <div data-vendorai-campaign-production-alert class="mt-3 hidden rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"></div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" data-vendorai-open-production class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Abrir produção completa</button>
          <div data-vendorai-campaign-secondary-actions class="flex flex-wrap items-center gap-2"></div>
        </div>
        <div data-vendorai-campaign-action-details class="mt-4"></div>
      </div>`;

    const toggle = card.querySelector<HTMLButtonElement>("[data-vendorai-campaign-production-toggle]");
    const body = card.querySelector<HTMLElement>("[data-vendorai-campaign-production-body]");
    const label = card.querySelector<HTMLElement>("[data-vendorai-campaign-production-toggle-label]");
    toggle?.addEventListener("click", () => {
      if (!body || !label) return;
      const open = !body.classList.contains("hidden");
      body.classList.toggle("hidden", open);
      label.textContent = open ? "Ver detalhes" : "Ocultar detalhes";
    });
    card.querySelector<HTMLButtonElement>("[data-vendorai-open-production]")?.addEventListener("click", navigateToProduction);

    if (sequence?.parentElement === workspace) sequence.insertAdjacentElement("afterend", card);
    else workspace.appendChild(card);
  }

  const metrics = card.querySelector<HTMLElement>("[data-vendorai-campaign-production-metrics]");
  if (metrics) {
    metrics.replaceChildren(
      makeMetric("A preparar", summaryValue(summaryGrid, "A preparar")),
      makeMetric("Em andamento", summaryValue(summaryGrid, "Em andamento")),
      makeMetric("Concluídas", summaryValue(summaryGrid, "Concluídas")),
    );
  }

  const runtimeHost = document.querySelector<HTMLElement>("[data-vendorai-plan-runtime-status]");
  const retryButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      const text = normalizedText(button.textContent ?? "");
      return text.startsWith("Reprocessar falhas") || text.startsWith("Refazendo ");
    }) ?? null;
  const runtimeText = normalizedText(runtimeHost?.textContent ?? "");
  const retryText = normalizedText(retryButton?.textContent ?? "");
  const alert = card.querySelector<HTMLElement>("[data-vendorai-campaign-production-alert]");
  if (alert) {
    const message = runtimeText || (retryText ? `${retryText}. Abra a produção completa para revisar e corrigir as falhas.` : "");
    alert.textContent = message;
    alert.classList.toggle("hidden", !message);
  }

  const deleteButton = workspace.querySelector<HTMLButtonElement>(`button[${GUIDANCE_ATTR}="delete"]`);
  const secondaryActions = card.querySelector<HTMLElement>("[data-vendorai-campaign-secondary-actions]");
  if (deleteButton && secondaryActions && deleteButton.parentElement !== secondaryActions) secondaryActions.appendChild(deleteButton);

  const actionDetailsCard = directChildContaining(workspace, ["Detalhes das ações", "Ver detalhes"]);
  const actionDetailsHost = card.querySelector<HTMLElement>("[data-vendorai-campaign-action-details]");
  if (actionDetailsCard && actionDetailsHost && actionDetailsCard !== card && actionDetailsCard.parentElement === workspace) {
    actionDetailsHost.appendChild(actionDetailsCard);
  }

  return card;
}

function ensureWorkspaceClarity() {
  if (!isCampaignDetail()) return false;

  const allCampaigns = findVisibleButton("Todas as campanhas");
  const toolbar = allCampaigns?.parentElement;
  const workspace = toolbar?.parentElement;
  if (!toolbar || !workspace) return false;

  const headerCard = directChildContaining(workspace, ["KPI:"]);
  const nextStepCard = directChildContaining(workspace, ["Próximo passo"]);
  const sequence = workspace.querySelector<HTMLElement>(`[${GUIDANCE_ATTR}="sequence"]`);
  const summaryGrid = directChildContaining(workspace, ["A preparar", "Em andamento", "Concluídas"]);

  if (headerCard && headerCard.parentElement === workspace) toolbar.insertAdjacentElement("afterend", headerCard);
  if (headerCard && nextStepCard && nextStepCard.parentElement === workspace) headerCard.insertAdjacentElement("afterend", nextStepCard);
  if (nextStepCard && sequence && sequence.parentElement === workspace) nextStepCard.insertAdjacentElement("afterend", sequence);

  if (headerCard) ensureBriefingToggle(headerCard);
  hideNode(summaryGrid, "summary");

  const productionDetails = ensureProductionDetails(workspace, sequence, summaryGrid);
  if (sequence && productionDetails.parentElement === workspace && productionDetails.previousElementSibling !== sequence) {
    sequence.insertAdjacentElement("afterend", productionDetails);
  }

  hideNode(document.querySelector<HTMLElement>("[data-vendorai-plan-production]"), "production-controls");
  hideNode(document.querySelector<HTMLElement>("[data-vendorai-plan-runtime-status]"), "production-runtime");

  const retryButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => {
      const text = normalizedText(button.textContent ?? "");
      return text.startsWith("Reprocessar falhas") || text.startsWith("Refazendo ");
    }) ?? null;
  hideNode(retryButton, "production-retry");

  const toolsCard = directChildContaining(workspace, ["Ferramentas desta campanha"]);
  hideNode(toolsCard, "campaign-tools");

  return true;
}

function cleanup() {
  restoreHidden();
  document.querySelectorAll<HTMLElement>(`[${INJECTED_ATTR}]`).forEach((node) => node.remove());
}

export function CampaignWorkspaceClarityBridge() {
  useEffect(() => {
    let active = false;
    const sync = () => {
      if (!isCampaignDetail()) {
        if (active) cleanup();
        active = false;
        return;
      }
      active = ensureWorkspaceClarity() || active;
    };

    sync();
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 250);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(timer);
      cleanup();
    };
  }, []);

  return null;
}
