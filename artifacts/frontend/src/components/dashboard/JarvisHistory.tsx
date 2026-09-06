import { useEffect, useMemo, useState } from "react";
import { Bot, ChevronRight, Clock3, Route, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type JarvisHistoryItem = {
  id: string;
  conversationId?: string | null;
  titulo: string;
  descricao: string;
  categoria: "bug" | "duvida" | "sugestao";
  status: "aberto" | "em_analise" | "resolvido";
  prioridade: "baixa" | "media" | "alta" | "critica";
  rotaAfetada?: string | null;
  respostaJarvis?: string | null;
  transcript?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function JarvisHistory({ token, refreshKey }: { token?: string | null; refreshKey?: number }) {
  const [items, setItems] = useState<JarvisHistoryItem[]>([]);
  const [selected, setSelected] = useState<JarvisHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/jarvis/history", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar histórico do JARVIS");
        return response.json() as Promise<JarvisHistoryItem[]>;
      })
      .then((data) => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, refreshKey]);

  const visible = useMemo(() => items.slice(0, 8), [items]);

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-border bg-background shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Histórico do JARVIS</h2>
              <p className="text-xs text-muted-foreground">Conversas, diagnósticos e situações registradas no contexto do negócio.</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{items.length} registros</span>
        </div>

        <div className="divide-y divide-border">
          {loading && <div className="px-5 py-6 text-sm text-muted-foreground">Carregando histórico...</div>}
          {!loading && visible.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">As próximas conversas relevantes com o JARVIS aparecerão aqui.</div>
          )}
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.titulo}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{item.status.replace("_", " ")}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {item.rotaAfetada && <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" />{item.rotaAfetada}</span>}
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(item.updatedAt).toLocaleString("pt-BR")}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background px-5 py-4">
              <div className="pr-4">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Registro JARVIS</p>
                <h3 className="mt-1 text-base font-semibold">{selected.titulo}</h3>
                {selected.rotaAfetada && <p className="mt-1 text-xs text-muted-foreground">{selected.rotaAfetada}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação registrada</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm">{selected.descricao}</p>
              </div>
              {selected.respostaJarvis && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resposta / justificativa do JARVIS</h4>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{selected.respostaJarvis}</p>
                </div>
              )}
              {selected.transcript && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversa</h4>
                  <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-border p-3 font-sans text-sm leading-6">{selected.transcript}</pre>
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: { question: `Continue a análise do registro: ${selected.titulo}` } }));
                  setSelected(null);
                }}
              >
                Continuar com JARVIS
              </Button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
