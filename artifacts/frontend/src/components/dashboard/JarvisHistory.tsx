import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, ChevronRight, Clock3, Route, Sparkles, Target, X } from "lucide-react";
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

type JarvisCaseItem = {
  id: string;
  signalKey: string;
  source: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  metric?: string | null;
  confidence?: number | null;
  impact?: number | null;
  href?: string | null;
  status: string;
  evidence?: Record<string, unknown> | null;
  recommendedAction?: string | null;
  resultSummary?: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  createdAt: string;
  updatedAt: string;
};

type TimelineItem = {
  id: string;
  kind: "conversation" | "case";
  title: string;
  description: string;
  status: string;
  category: string;
  severity?: "opportunity" | "attention" | "risk";
  route?: string | null;
  response?: string | null;
  transcript?: string | null;
  metric?: string | null;
  confidence?: number | null;
  impact?: number | null;
  source?: string | null;
  evidence?: Record<string, unknown> | null;
  recommendedAction?: string | null;
  resultSummary?: string | null;
  updatedAt: string;
};

function caseTone(severity?: TimelineItem["severity"]) {
  if (severity === "risk") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "opportunity") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (severity === "attention") return "border-amber-200 bg-amber-50 text-amber-700";
  return "bg-muted text-muted-foreground";
}

function caseIcon(severity?: TimelineItem["severity"]) {
  if (severity === "risk") return <AlertTriangle className="h-4 w-4" />;
  if (severity === "opportunity") return <Sparkles className="h-4 w-4" />;
  if (severity === "attention") return <Target className="h-4 w-4" />;
  return <Bot className="h-4 w-4" />;
}

export default function JarvisHistory({ token, refreshKey }: { token?: string | null; refreshKey?: number }) {
  const [history, setHistory] = useState<JarvisHistoryItem[]>([]);
  const [cases, setCases] = useState<JarvisCaseItem[]>([]);
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setHistory([]);
      setCases([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    Promise.allSettled([
      fetch("/api/jarvis/history", { headers, cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar histórico do JARVIS");
        return response.json() as Promise<JarvisHistoryItem[]>;
      }),
      fetch("/api/jarvis/cases", { headers, cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar Casos Vendor");
        return response.json() as Promise<JarvisCaseItem[]>;
      }),
    ]).then(([historyResult, casesResult]) => {
      if (cancelled) return;
      setHistory(historyResult.status === "fulfilled" && Array.isArray(historyResult.value) ? historyResult.value : []);
      setCases(casesResult.status === "fulfilled" && Array.isArray(casesResult.value) ? casesResult.value : []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, refreshKey]);

  const items = useMemo<TimelineItem[]>(() => {
    const conversations: TimelineItem[] = history.map((item) => ({
      id: `conversation-${item.id}`,
      kind: "conversation",
      title: item.titulo,
      description: item.descricao,
      status: item.status,
      category: item.categoria,
      route: item.rotaAfetada,
      response: item.respostaJarvis,
      transcript: item.transcript,
      updatedAt: item.updatedAt,
    }));

    const vendorCases: TimelineItem[] = cases.map((item) => ({
      id: `case-${item.id}`,
      kind: "case",
      title: item.title,
      description: item.detail,
      status: item.status,
      category: item.category,
      severity: item.severity,
      route: item.href,
      metric: item.metric,
      confidence: item.confidence,
      impact: item.impact,
      source: item.source,
      evidence: item.evidence,
      recommendedAction: item.recommendedAction,
      resultSummary: item.resultSummary,
      updatedAt: item.updatedAt,
    }));

    return [...vendorCases, ...conversations]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 12);
  }, [cases, history]);

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
              <p className="text-xs text-muted-foreground">Conversas, diagnósticos, oportunidades e riscos registrados no contexto do negócio.</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{items.length} recentes</span>
        </div>

        <div className="divide-y divide-border">
          {loading && <div className="px-5 py-6 text-sm text-muted-foreground">Carregando histórico...</div>}
          {!loading && items.length === 0 && (
            <div className="px-5 py-6 text-sm text-muted-foreground">As próximas conversas e descobertas relevantes do JARVIS aparecerão aqui.</div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5"
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.kind === "case" ? caseTone(item.severity) : "border-border bg-muted text-muted-foreground"}`}>
                {item.kind === "case" ? caseIcon(item.severity) : <Bot className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${item.kind === "case" ? caseTone(item.severity) : "border-border bg-muted text-muted-foreground"}`}>
                    {item.kind === "case" ? item.category : item.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {item.route && <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" />{item.route}</span>}
                  {item.metric && <span>{item.metric}</span>}
                  {item.confidence != null && <span>confiança {item.confidence}%</span>}
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
                <p className="text-xs font-medium uppercase tracking-wide text-primary">{selected.kind === "case" ? "Caso Vendor" : "Registro JARVIS"}</p>
                <h3 className="mt-1 text-base font-semibold">{selected.title}</h3>
                {selected.route && <p className="mt-1 text-xs text-muted-foreground">{selected.route}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação registrada</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm">{selected.description}</p>
              </div>

              {selected.kind === "case" && (
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Categoria</p><p className="mt-1 font-medium">{selected.category}</p></div>
                  <div><p className="text-xs text-muted-foreground">Severidade</p><p className="mt-1 font-medium">{selected.severity ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Confiança</p><p className="mt-1 font-medium">{selected.confidence == null ? "—" : `${selected.confidence}%`}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fonte</p><p className="mt-1 font-medium">{selected.source ?? "—"}</p></div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Impacto / sinal</p><p className="mt-1 font-medium">{selected.metric ?? (selected.impact != null ? selected.impact.toLocaleString("pt-BR") : "—")}</p></div>
                </div>
              )}

              {selected.recommendedAction && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ação recomendada</h4>
                  <p className="mt-2 rounded-xl bg-muted/50 p-3 text-sm">{selected.recommendedAction}</p>
                </div>
              )}

              {selected.response && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resposta / justificativa do JARVIS</h4>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{selected.response}</p>
                </div>
              )}

              {selected.transcript && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversa</h4>
                  <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-border p-3 font-sans text-sm leading-6">{selected.transcript}</pre>
                </div>
              )}

              {selected.resultSummary && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado</h4>
                  <p className="mt-2 rounded-xl border border-border p-3 text-sm">{selected.resultSummary}</p>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: { question: `Continue a análise deste ${selected.kind === "case" ? "Caso Vendor" : "registro"}: ${selected.title}` } }));
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
