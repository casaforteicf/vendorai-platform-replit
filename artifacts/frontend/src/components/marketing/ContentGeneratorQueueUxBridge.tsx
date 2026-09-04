import { useEffect, useState } from "react";

const MEDIA_BUTTON_ATTR = "data-vendorai-add-media-button";
const PREVIEW_BUTTON_ATTR = "data-vendorai-preview-button";

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
      text.includes("Em revisão")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return element.closest<HTMLElement>("div.rounded-lg.border");
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
    button.className = "inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
    button.textContent = "Adicionar mídias";
    button.title = "Adicionar fotos, vídeos e outros arquivos à Central de Mídias";
    referenceBlock.appendChild(button);
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

    let previewButton = actions.querySelector<HTMLButtonElement>(`button[${PREVIEW_BUTTON_ATTR}]`);
    if (!previewButton) {
      previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.setAttribute(PREVIEW_BUTTON_ATTR, "true");
      previewButton.className = "inline-flex min-h-8 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
      actions.insertBefore(previewButton, nativeButton);
      previewButton.addEventListener("click", () => {
        nativeButton.click();
        focusExpandedPreview(closestProductionCard(nativeButton));
      });
    }

    const isOpen = normalizedText(nativeButton) === "Fechar";
    previewButton.textContent = isOpen ? "Ocultar conteúdo" : "Ver conteúdo gerado";
    previewButton.title = isOpen
      ? "Fechar a prévia desta versão"
      : "Abrir texto, imagens e demais dados gerados nesta versão";
    nativeButton.style.display = "none";
  }
}

function decorateContentGenerator() {
  if (window.location.pathname !== "/content") return;
  ensureProminentMediaButton();
  ensurePreviewButtons();
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
