import { useEffect, useState } from "react";
import { BrainCircuit, ChevronUp, Code2, Megaphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const HIDDEN_MARKER = "vendoraiSecondaryLauncherHidden";

type LauncherAvailability = {
  jarvis: boolean;
  marketing: boolean;
  dev: boolean;
};

function normalizedLabel(element: HTMLElement) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function findJarvisLauncher() {
  return document.querySelector<HTMLButtonElement>('button[aria-label="Abrir JARVIS"]');
}

function findDevLauncher() {
  return document.querySelector<HTMLButtonElement>(
    'button[aria-label="Abrir Dev IA"], button[aria-label="Carregar Dev IA"], button[aria-label="Tentar Dev IA novamente"]',
  );
}

function findMarketingLauncher() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    if (button.closest("[data-vendorai-unified-assistant]")) return false;
    const label = normalizedLabel(button);
    if (!/^Marketing(?: AI)?$/i.test(label)) return false;
    const parentClasses = typeof button.parentElement?.className === "string" ? button.parentElement.className : "";
    return parentClasses.includes("fixed") && parentClasses.includes("right-");
  }) ?? null;
}

function jarvisPanelIsOpen() {
  return Boolean(document.querySelector<HTMLElement>('div[aria-label="JARVIS"]'));
}

function hideLauncher(button: HTMLButtonElement | null) {
  if (!button) return;
  if (button.dataset[HIDDEN_MARKER] === "true") return;
  button.dataset[HIDDEN_MARKER] = "true";
  button.style.setProperty("display", "none", "important");
}

function restoreLaunchers() {
  document.querySelectorAll<HTMLButtonElement>(`button[data-${HIDDEN_MARKER.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="true"]`).forEach((button) => {
    button.style.removeProperty("display");
    delete button.dataset[HIDDEN_MARKER];
  });
}

export function UnifiedAssistantLauncher() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [availability, setAvailability] = useState<LauncherAvailability>({
    jarvis: false,
    marketing: false,
    dev: false,
  });

  useEffect(() => {
    const sync = () => {
      const jarvis = findJarvisLauncher();
      const marketing = findMarketingLauncher();
      const dev = findDevLauncher();
      const nextPanelOpen = jarvisPanelIsOpen();

      hideLauncher(jarvis);
      hideLauncher(marketing);
      hideLauncher(dev);

      setPanelOpen((current) => current === nextPanelOpen ? current : nextPanelOpen);
      if (nextPanelOpen) setMenuOpen(false);

      const next = {
        jarvis: Boolean(jarvis),
        marketing: Boolean(marketing),
        dev: Boolean(dev),
      };
      setAvailability((current) =>
        current.jarvis === next.jarvis && current.marketing === next.marketing && current.dev === next.dev
          ? current
          : next,
      );
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      restoreLaunchers();
    };
  }, []);

  const launch = (kind: keyof LauncherAvailability) => {
    const button = kind === "jarvis"
      ? findJarvisLauncher()
      : kind === "marketing"
        ? findMarketingLauncher()
        : findDevLauncher();
    setMenuOpen(false);
    button?.click();
  };

  if (panelOpen || (!availability.jarvis && !availability.marketing && !availability.dev)) return null;

  return (
    <div
      data-vendorai-unified-assistant
      className="fixed bottom-4 right-4 z-[95] flex flex-col items-end gap-2"
    >
      {menuOpen && (
        <div className="w-56 overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-2xl">
          {availability.jarvis && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
              onClick={() => launch("jarvis")}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">JARVIS</span>
                <span className="block truncate text-[11px] text-muted-foreground">Agente mestre</span>
              </span>
            </button>
          )}

          {availability.marketing && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
              onClick={() => launch("marketing")}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">Marketing IA</span>
                <span className="block truncate text-[11px] text-muted-foreground">Especialista desta área</span>
              </span>
            </button>
          )}

          {availability.dev && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
              onClick={() => launch("dev")}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/10 text-slate-950 dark:bg-white/10 dark:text-white">
                <Code2 className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">Dev IA</span>
                <span className="block truncate text-[11px] text-muted-foreground">Engenharia · Super Admin</span>
              </span>
            </button>
          )}
        </div>
      )}

      <Button
        type="button"
        className="h-11 gap-2 rounded-full px-4 shadow-xl"
        onClick={() => setMenuOpen((value) => !value)}
        aria-label="Abrir central de assistentes de IA"
        aria-expanded={menuOpen}
      >
        <Sparkles className="h-4 w-4" />
        <span className="font-semibold">IA</span>
        <ChevronUp className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </Button>
    </div>
  );
}
