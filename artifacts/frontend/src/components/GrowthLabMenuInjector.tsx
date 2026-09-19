import { useEffect } from "react";

const MENU_ATTR = "data-growth-lab-menu-entry";
const TARGET_HREF = "/growth-lab";

function isAdminSession() {
  try {
    const raw = window.localStorage.getItem("vendorai_user_cache");
    if (!raw) return false;
    const user = JSON.parse(raw) as { platformRole?: string | null; userFunction?: string | null };
    return user.platformRole === "super_admin"
      || user.platformRole === "tenant_admin"
      || user.userFunction === "administrador";
  } catch {
    return false;
  }
}

function replaceLabel(link: HTMLAnchorElement) {
  const label = Array.from(link.querySelectorAll<HTMLElement>("span"))
    .find((node) => (node.textContent ?? "").trim().length > 0);
  if (label) label.textContent = "Growth Lab";
  else link.append(document.createTextNode(" Growth Lab"));
}

function ensureGrowthLabEntry() {
  if (!isAdminSession()) {
    document.querySelectorAll<HTMLElement>(`[${MENU_ATTR}]`).forEach((node) => node.remove());
    return;
  }

  const sources = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/brain"]'));
  for (const source of sources) {
    const parent = source.parentElement;
    if (!parent) continue;

    const alreadyExists = Array.from(parent.children).some((child) =>
      child instanceof HTMLAnchorElement && child.getAttribute("href") === TARGET_HREF,
    );
    if (alreadyExists) continue;

    const link = source.cloneNode(true) as HTMLAnchorElement;
    link.href = TARGET_HREF;
    link.setAttribute(MENU_ATTR, "true");
    link.setAttribute("aria-label", "Growth Lab");
    link.setAttribute("title", "Growth Lab");
    replaceLabel(link);
    parent.insertBefore(link, source.nextSibling);
  }
}

export function GrowthLabMenuInjector() {
  useEffect(() => {
    // Mesmo risco de auto-loop dos observers do SidebarLayout: insertBefore
    // é uma mutação de childList que o próprio observer abaixo escuta. Sem
    // desconectar antes de mexer no DOM, um re-render do React que apagasse
    // o link injetado fazia o ciclo se repetir pra sempre — e esse aqui roda
    // pra QUALQUER conta admin/tenant_admin, sem depender do Arqdor.
    const observer = new MutationObserver(() => {
      observer.disconnect();
      ensureGrowthLabEntry();
      observer.observe(document.body, { childList: true, subtree: true });
    });
    ensureGrowthLabEntry();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("storage", ensureGrowthLabEntry);
    window.addEventListener("focus", ensureGrowthLabEntry);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", ensureGrowthLabEntry);
      window.removeEventListener("focus", ensureGrowthLabEntry);
      document.querySelectorAll<HTMLElement>(`[${MENU_ATTR}]`).forEach((node) => node.remove());
    };
  }, []);

  return null;
}
