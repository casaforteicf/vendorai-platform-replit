import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";

const FLOATING_BUTTON_TITLE = "Gerenciar quais mídias a IA pode usar automaticamente";

function findWorkspaceHost(): HTMLElement | null {
  const titles = Array.from(document.querySelectorAll<HTMLElement>(".side-title"));
  const workspaceTitle = titles.find((element) => element.textContent?.trim().toLowerCase() === "workspace");
  if (!workspaceTitle) return null;

  const aside = workspaceTitle.closest("aside");
  if (!aside) return null;

  const buttons = Array.from(aside.querySelectorAll<HTMLButtonElement>("button.side-btn"));
  const libraryButton = buttons.find((button) => button.textContent?.toLowerCase().includes("biblioteca"));
  if (!libraryButton) return null;

  let mount = aside.querySelector<HTMLElement>("[data-media-ai-base-workspace-nav]");
  if (!mount) {
    mount = document.createElement("div");
    mount.dataset.mediaAiBaseWorkspaceNav = "true";
    libraryButton.insertAdjacentElement("afterend", mount);
  }
  return mount;
}

function floatingButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`button[title="${FLOATING_BUTTON_TITLE}"]`);
}

export function MediaAiBaseWorkspaceNav() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState("0");

  useEffect(() => {
    const syncLocation = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", syncLocation);
    const timer = window.setInterval(syncLocation, 350);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/midias") {
      setHost(null);
      return;
    }

    const sync = () => {
      const nextHost = findWorkspaceHost();
      if (nextHost && nextHost !== host) setHost(nextHost);

      const floating = floatingButton();
      if (floating) {
        const badge = floating.querySelector("span");
        if (badge?.textContent?.trim()) setCount(badge.textContent.trim());
        floating.style.display = window.innerWidth >= 1280 ? "none" : "inline-flex";
      }
    };

    sync();
    const timer = window.setInterval(sync, 500);
    window.addEventListener("resize", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", sync);
      const floating = floatingButton();
      if (floating) floating.style.display = "";
    };
  }, [host, pathname]);

  const content = useMemo(() => {
    if (!host || pathname !== "/midias") return null;
    return (
      <button
        type="button"
        onClick={() => floatingButton()?.click()}
        className="side-btn justify-between text-muted-foreground"
        title="Abrir Base IA da Empresa"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Base IA</span>
        </span>
        <span className="text-xs">{count}</span>
      </button>
    );
  }, [count, host, pathname]);

  return host && content ? createPortal(content, host) : null;
}
