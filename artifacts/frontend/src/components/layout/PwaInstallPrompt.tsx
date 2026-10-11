import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * MULTI-02 — Optional native browser install prompt.
 * No service worker registration, offline promise, account data or storage.
 * Render only behind the rollout flag and only after the browser fires beforeinstallprompt.
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!deferred || installed) return null;
  const install = async () => {
    const current = deferred;
    setDeferred(null); // one prompt per browser event; no repeated nagging
    try {
      await current.prompt();
      await current.userChoice;
    } catch {
      // Browser may dismiss or invalidate an old install event.
    }
  };
  return (
    <aside aria-label="Instalação opcional" className="mx-4 my-2 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
      <span className="min-w-0 flex-1">Instale o Vendor.ai neste dispositivo para acesso rápido. Recursos offline dependem do módulo.</span>
      <button type="button" onClick={() => void install()} className="rounded-md border px-3 py-2 font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        Instalar
      </button>
      <button type="button" onClick={() => setDeferred(null)} aria-label="Dispensar instalação" className="rounded-md px-2 py-2 hover:bg-muted">
        Agora não
      </button>
    </aside>
  );
}
