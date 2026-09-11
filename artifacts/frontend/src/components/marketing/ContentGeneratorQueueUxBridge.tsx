import { useEffect, useState } from "react";

const MEDIA_BUTTON_ATTR = "data-vendorai-add-media-button";
const PREVIEW_BUTTON_ATTR = "data-vendorai-preview-button";
const STYLE_ID = "vendorai-content-generator-ux-style";
const CARD_ATTR = "data-vendorai-production-card";
const FLOW_ATTR = "data-vendorai-content-flow-help";
const MEDIA_HELP_ATTR = "data-vendorai-media-library-help";

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function findTextElement(selector: string, text: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (element) => normalizedText(element) === text,
  ) ?? null;
}

function closestProductionCard(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    const text = normalizedText(current);
    if (
      current.classList.contains("rounded-lg") &&
      current.classList.contains("border") &&
      (
        text.includes("Em revisão") ||
        text.includes("Pronto para produzir") ||
        text.includes("Conteúdo aprovado") ||
        text.includes("Publicado")
      )
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return element.closest<HTMLElement>("div.rounded-lg.border");
}

function findProductionOverview(): HTMLElement | null {
  const title = findTextElement("p", "Produção automática do planejamento")
    ?? findTextElement("p", "Produção do Plano de Mídia");
  if (!title) return null;

  let current: HTMLElement | null = title.parentElement;
  while (current && current !== document.body) {
    const text = normalizedText(current);
    if (text.includes("Referências reais do negócio") && text.includes("Publicados")) return current;
    current = current.parentElement;
  }
  return null;
}

function ensureUxStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${CARD_ATTR}] {
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    [${CARD_ATTR}] * {
      min-width: 0;
    }

    [${CARD_ATTR}] p,
    [${CARD_ATTR}] h1,
    [${CARD_ATTR}] h2,
    [${CARD_ATTR}] h3,
    [${CARD_ATTR}] h4,
    [${CARD_ATTR}] span:not(.sr-only) {
      overflow-wrap: break-word;
      word-break: normal !important;
      hyphens: none;
    }

    [${CARD_ATTR}] [data-vendorai-card-actions] {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: .5rem !important;
      width: 100% !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }

    [${CARD_ATTR}] [data-vendorai-card-actions] > * {
      flex: 0 1 auto;
      max-width: 100%;
    }

    [${FLOW_ATTR}] {
      display: flex;
      flex-wrap: wrap;
      gap: .4rem .65rem;
      margin-top: .65rem;
      font-size: .7rem;
      color: hsl(var(--muted-foreground));
    }

    [${FLOW_ATTR}] span {
      display: inline-flex;
      align-items: center;
      min-height: 1.7rem;
      padding: 0 .55rem;
      border: 1px solid hsl(var(--border));
      border-radius: 9999px;
      background: hsl(var(--background));
      white-space: nowrap;
    }

    [${MEDIA_HELP_ATTR}] {
      margin-top: .3rem !important;
      font-size: .7rem !important;
      color: hsl(var(--muted-foreground));
    }

    @media (max-width: 767px) {
      [${CARD_ATTR}] {
        display: block !important;
        padding: 1rem !important;
      }

      [${CARD_ATTR}] > * {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      [${CARD_ATTR}] > div:first-child {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        gap: .75rem !important;
        width: 100% !important;
      }

      [${CARD_ATTR}] > div:first-child > div:first-child {
        width: 100% !important;
        max-width: 100% !important;
        flex: 0 0 100% !important;
      }

      [${CARD_ATTR}] > div:first-child > div:last-child {
        width: 100% !important;
        max-width: 100% !important;
        flex: 0 0 100% !important;
      }

      [${CARD_ATTR}] p {
        width: 100% !important;
        max-width: 100% !important;
      }

      [${CARD_ATTR}] [data-vendorai-card-actions] {
        margin-top: 0 !important;
        padding-top: .25rem !important;
      }

      [${CARD_ATTR}] [data-vendorai-card-actions] button,
      [${CARD_ATTR}] [data-vendorai-card-actions] a {
        min-height: 2.5rem !important;
        flex: 1 1 auto !important;
      }

      [${CARD_ATTR}] [data-vendorai-executor-button] {
        order: 20;
      }

      [${CARD_ATTR}] [data-vendorai-preview-button] {
        order: 10;
      }

      [${FLOW_ATTR}] span {
        flex: 1 1 auto;
        justify-content: center;
      }

      button[aria-label="Carregar Dev IA"] {
        width: 3.25rem !important;
        height: 3.25rem !important;
        min-width: 3.25rem !important;
        padding: 0 !important;
        right: 1rem !important;
        bottom: 5rem !important;
        font-size: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      button[aria-label="Carregar Dev IA"]::after {
        content: "IA";
        font-size: .75rem;
        font-weight: 700;
      }

      button[aria-label="Abrir seleção de mídias"] {
        width: 3.25rem !important;
        height: 3.25rem !important;
        min-width: 3.25rem !important;
        padding: 0 !important;
        left: 1rem !important;
        bottom: 1rem !important;
        gap: 0 !important;
        font-size: 0 !important;
        justify-content: center !important;
      }

      button[aria-label="Abrir seleção de mídias"] > svg {
        width: 1.1rem !important;
        height: 1.1rem !important;
      }

      button[aria-label="Abrir seleção de mídias"] > span {
        position: absolute !important;
        top: -.2rem !important;
        right: -.2rem !important;
        font-size: .625rem !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function focusExpandedPreview(card: HTMLElement | null) {
  if (!card) return;
  window.setTimeout(() => {
    const previewTitle = Array.from(card.querySelectorAll<HTMLElement>("p")).find(
      (element) => normalizedText(element) === "Prévia da versão atual",
    );
    if (!previewTitle) return;

    const previewPanel = previewTitle.closest<HTMLElement>("div.mt-3.border-t");
    if (previewPanel) {
      previewPanel.classList.add("rounded-xl", "border", "bg-muted/20", "p-4");
      previewPanel.style.scrollMarginTop = "96px";
      previewPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      previewTitle.style.scrollMarginTop = "96px";
      previewTitle.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 120);
}

function improveProductionIntro() {
  const title = findTextElement("p", "Produção automática do planejamento")
    ?? findTextElement("p", "Produção do Plano de Mídia");
  if (!title) return;

  title.textContent = "Produção do Plano de Mídia";
  const intro = title.parentElement?.querySelectorAll<HTMLParagraphElement>("p")[1];
  if (intro) {
    intro.textContent = "O plano já traz briefing, canal, data e KPI. A IA procura primeiro fotos e vídeos da Biblioteca de Mídias; depois você revisa e aprova.";
  }

  if (!title.parentElement?.querySelector(`[${FLOW_ATTR}]`)) {
    const flow = document.createElement("div");
    flow.setAttribute(FLOW_ATTR, "true");
    flow.innerHTML = "<span>1. Biblioteca de Mídias</span><span>2. IA cria e organiza</span><span>3. Revisar e aprovar</span>";
    title.parentElement?.appendChild(flow);
  }
}

function improveSummaryLabels() {
  const overview = findProductionOverview();
  if (!overview) return;

  const labels = Array.from(overview.querySelectorAll<HTMLElement>("p"));
  for (const label of labels) {
    const text = normalizedText(label);
    if (text === "Prontos") {
      label.textContent = "Prontos para gerar";
      label.title = "Peças aprovadas no plano que ainda precisam ser geradas";
    } else if (text === "Outros") {
      label.textContent = "Pendentes";
      label.title = "Itens do plano que ainda não chegaram à etapa de produção ou revisão";
    }
  }
}

function ensureProminentMediaButton() {
  const referenceTitle = findTextElement("p", "Referências reais do negócio");
  const referenceBlock = referenceTitle?.parentElement?.parentElement;
  if (!referenceTitle || !referenceBlock) return;

  const existingNative = Array.from(referenceBlock.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => normalizedText(button).includes("Adicionar/organizar mídias"),
  );

  let button = referenceBlock.querySelector<HTMLAnchorElement>(`a[${MEDIA_BUTTON_ATTR}]`);
  if (!button) {
    button = document.createElement("a");
    button.setAttribute(MEDIA_BUTTON_ATTR, "true");
    button.href = "/midias";
    button.className = "inline-flex min-h-10 w-full sm:w-auto items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
    referenceBlock.appendChild(button);
  }

  button.textContent = "Biblioteca de Mídias";
  button.title = "Abrir a Biblioteca para selecionar, organizar ou enviar fotos e vídeos do negócio";

  const textContainer = referenceTitle.parentElement;
  if (textContainer && !textContainer.querySelector(`[${MEDIA_HELP_ATTR}]`)) {
    const help = document.createElement("p");
    help.setAttribute(MEDIA_HELP_ATTR, "true");
    help.textContent = "A IA usa automaticamente as mídias compatíveis. Abra a Biblioteca apenas para conferir, selecionar ou adicionar referências.";
    textContainer.appendChild(help);
  }

  if (existingNative) existingNative.style.display = "none";
}

function ensurePreviewButtons() {
  const reviewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => ["Revisar", "Fechar"].includes(normalizedText(button)),
  );

  for (const nativeButton of reviewButtons) {
    const actions = nativeButton.parentElement;
    if (!actions) continue;

    actions.setAttribute("data-vendorai-card-actions", "true");
    const card = closestProductionCard(nativeButton);
    card?.setAttribute(CARD_ATTR, "true");

    let previewButton = actions.querySelector<HTMLButtonElement>(`button[${PREVIEW_BUTTON_ATTR}]`);
    if (!previewButton) {
      previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.setAttribute(PREVIEW_BUTTON_ATTR, "true");
      previewButton.className = "inline-flex min-h-9 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
      actions.insertBefore(previewButton, nativeButton);
      previewButton.addEventListener("click", () => {
        nativeButton.click();
        focusExpandedPreview(closestProductionCard(nativeButton));
      });
    }

    const isOpen = normalizedText(nativeButton) === "Fechar";
    previewButton.textContent = isOpen ? "Ocultar conteúdo" : "Visualizar";
    previewButton.title = isOpen
      ? "Fechar a prévia desta versão"
      : "Abrir texto, imagens e demais dados gerados nesta versão";
    nativeButton.style.display = "none";
  }
}

function decorateProductionCards() {
  const statusLabels = new Set([
    "Em revisão",
    "Pronto para produzir",
    "Conteúdo aprovado",
    "Publicado",
    "Em produção",
    "Recusado",
    "Ignorado",
  ]);

  const statusElements = Array.from(document.querySelectorAll<HTMLElement>("span,div,p")).filter(
    (element) => statusLabels.has(normalizedText(element)),
  );

  for (const statusElement of statusElements) {
    const card = closestProductionCard(statusElement);
    if (!card) continue;
    card.setAttribute(CARD_ATTR, "true");

    const actionButtons = Array.from(card.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button,a")).filter((element) => {
      const label = normalizedText(element);
      return [
        "Aprovar",
        "Nova versão",
        "Abrir executor",
        "Visualizar",
        "Ocultar conteúdo",
        "Revisar",
        "Fechar",
      ].some((action) => label.includes(action));
    });

    if (actionButtons.length > 0) {
      const actionParent = actionButtons[0].parentElement;
      actionParent?.setAttribute("data-vendorai-card-actions", "true");
    }

    for (const element of actionButtons) {
      if (normalizedText(element).includes("Abrir executor")) {
        element.setAttribute("data-vendorai-executor-button", "true");
      }
    }
  }
}

function improveReferenceCopy() {
  const createOutsidePlan = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => normalizedText(button) === "Criação avulsa" || normalizedText(button) === "Criar fora do plano",
  );
  if (createOutsidePlan) {
    createOutsidePlan.textContent = "Criar fora do plano";
    createOutsidePlan.title = "Criar um conteúdo que não faz parte deste Plano de Mídia";
  }

  const completeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => normalizedText(button).startsWith("Completar criativos")
      || normalizedText(button).startsWith("Gerar imagens faltantes"),
  );
  for (const button of completeButtons) {
    const match = normalizedText(button).match(/\((\d+)\)/);
    button.textContent = `Gerar imagens faltantes${match ? ` (${match[1]})` : ""}`;
    button.title = "Gerar somente as imagens que ainda faltam nas peças já criadas, preservando os textos existentes";
  }
}

function decorateContentGenerator() {
  if (window.location.pathname !== "/content") return;
  ensureUxStyle();
  improveProductionIntro();
  improveSummaryLabels();
  ensureProminentMediaButton();
  ensurePreviewButtons();
  decorateProductionCards();
  improveReferenceCopy();
}

export function ContentGeneratorQueueUxBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", syncPath);
    const timer = window.setInterval(syncPath, 400);
    return () => {
      window.removeEventListener("popstate", syncPath);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/content") return;

    let animationFrame = 0;
    const scheduleDecorate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(decorateContentGenerator);
    };

    scheduleDecorate();
    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const timer = window.setInterval(scheduleDecorate, 800);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [pathname]);

  return null;
}