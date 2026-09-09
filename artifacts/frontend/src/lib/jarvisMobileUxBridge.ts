const MOBILE_QUERY = "(max-width: 640px)";

function isMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function applyViewport(panel: HTMLElement) {
  if (!isMobile()) {
    panel.style.removeProperty("top");
    panel.style.removeProperty("right");
    panel.style.removeProperty("bottom");
    panel.style.removeProperty("left");
    panel.style.removeProperty("width");
    panel.style.removeProperty("max-width");
    panel.style.removeProperty("height");
    panel.style.removeProperty("max-height");
    panel.style.removeProperty("border-radius");
    return;
  }

  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;
  const height = viewport?.height ?? window.innerHeight;

  panel.style.setProperty("position", "fixed", "important");
  panel.style.setProperty("top", `${Math.max(0, top)}px`, "important");
  panel.style.setProperty("right", "0", "important");
  panel.style.setProperty("bottom", "auto", "important");
  panel.style.setProperty("left", "0", "important");
  panel.style.setProperty("width", "100vw", "important");
  panel.style.setProperty("max-width", "100vw", "important");
  panel.style.setProperty("height", `${Math.max(320, height)}px`, "important");
  panel.style.setProperty("max-height", `${Math.max(320, height)}px`, "important");
  panel.style.setProperty("border-radius", "0", "important");
}

function findSendButton(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.title === "Enviar") ?? null;
}

function findMicButton(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.title === "Falar com JARVIS" || button.title === "Parar de ouvir") ?? null;
}

function wirePanel(panel: HTMLElement) {
  if (panel.dataset.jarvisMobileUx === "ready") {
    applyViewport(panel);
    return;
  }
  panel.dataset.jarvisMobileUx = "ready";
  applyViewport(panel);

  const textarea = panel.querySelector<HTMLTextAreaElement>("textarea");
  if (textarea) {
    textarea.setAttribute("enterkeyhint", "send");
    textarea.setAttribute("inputmode", "text");
    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const send = findSendButton(panel);
      if (send && !send.disabled) send.click();
    }, true);
  }

  const mic = findMicButton(panel);
  if (mic) {
    let wasListening = mic.title === "Parar de ouvir";
    const micObserver = new MutationObserver(() => {
      const listeningNow = mic.title === "Parar de ouvir";
      if (wasListening && !listeningNow) {
        window.setTimeout(() => {
          const field = panel.querySelector<HTMLTextAreaElement>("textarea");
          const send = findSendButton(panel);
          if (field?.value.trim() && send && !send.disabled) send.click();
        }, 120);
      }
      wasListening = listeningNow;
    });
    micObserver.observe(mic, { attributes: true, attributeFilter: ["title", "disabled"] });
  }
}

function refreshPanels() {
  document.querySelectorAll<HTMLElement>('div[aria-label="JARVIS"]').forEach(wirePanel);
}

if (typeof window !== "undefined") {
  const observer = new MutationObserver(refreshPanels);
  const start = () => {
    refreshPanels();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  window.visualViewport?.addEventListener("resize", refreshPanels);
  window.visualViewport?.addEventListener("scroll", refreshPanels);
  window.addEventListener("resize", refreshPanels);
}

export {};
