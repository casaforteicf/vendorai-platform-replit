import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, X } from "lucide-react";

type Source = { id: string; type: "library" | "catalog"; kind: string; title: string };

function navigate(path: string) {
  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function ContentContextSourcesBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [sources, setSources] = useState<Source[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 400);
    return () => { window.removeEventListener("popstate", sync); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const contextAwareFetch: typeof window.fetch = async (input, init = {}) => {
      const response = await previousFetch(input, init);
      try {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (response.ok && method === "POST" && /^\/api\/tenants\/[^/]+\/content\/(?:generate|strategy)\/?$/.test(url.pathname)) {
          void response.clone().json().then((body: { contextSources?: Source[] }) => {
            const next = Array.isArray(body.contextSources) ? body.contextSources : [];
            setSources(next);
            setOpen(true);
          }).catch(() => undefined);
        }
      } catch {}
      return response;
    };
    window.fetch = contextAwareFetch;
    return () => { if (window.fetch === contextAwareFetch) window.fetch = previousFetch; };
  }, []);

  if (pathname !== "/content" || !open) return null;

  return (
    <aside className="fixed bottom-5 left-5 z-[75] w-[min(360px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><BookOpen className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Contexto consultado pela IA</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sources.length
              ? `${sources.length} fonte(s) da Biblioteca e do Catálogo usadas nesta geração.`
              : "Nenhuma informação aprovada relacionada foi encontrada. A IA foi orientada a não inventar dados."}
          </p>
          {sources.length > 0 && <p className="mt-2 line-clamp-2 text-xs">{sources.slice(0, 5).map((source) => source.title).join(" · ")}</p>}
          <button type="button" onClick={() => navigate("/midias/informacoes")} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            Abrir Biblioteca de Informações <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>
    </aside>
  );
}
