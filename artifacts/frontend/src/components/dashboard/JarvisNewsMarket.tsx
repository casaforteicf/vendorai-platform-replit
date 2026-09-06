import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Globe2, Newspaper, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type NewsEvidence = {
  sourceId?: unknown;
  sourceCode?: unknown;
  sourceName?: unknown;
  sourceReliability?: unknown;
  publishedAt?: unknown;
  relevanceScore?: unknown;
};

type NewsCase = {
  id: string;
  source: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  metric?: string | null;
  confidence?: number | null;
  href?: string | null;
  evidence?: NewsEvidence | null;
  updatedAt: string;
};

function isNewsSource(source: string) {
  const value = source.toLowerCase();
  return value.startsWith("news") || value.includes("noticia") || value.includes("mercado_externo");
}

function severityLabel(severity: NewsCase["severity"]) {
  if (severity === "risk") return "Risco";
  if (severity === "opportunity") return "Oportunidade";
  return "Atenção";
}

function severityTone(severity: NewsCase["severity"]) {
  if (severity === "risk") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "opportunity") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function evidenceText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function evidenceNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default function JarvisNewsMarket({ token }: { token?: string | null }) {
  const [items, setItems] = useState<NewsCase[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/jarvis/cases", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar inteligência de notícias");
        return response.json() as Promise<NewsCase[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data) ? data.filter((item) => isNewsSource(String(item.source ?? ""))) : []);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [token]);

  const summary = useMemo(() => {
    const sourceKeys = new Set<string>();
    const sourceNames = new Set<string>();
    const reliability: number[] = [];
    const confidences: number[] = [];

    for (const item of items) {
      const sourceId = evidenceText(item.evidence?.sourceId);
      const sourceCode = evidenceText(item.evidence?.sourceCode);
      const sourceName = evidenceText(item.evidence?.sourceName);
      const sourceKey = sourceId ?? sourceCode ?? sourceName;
      if (sourceKey) sourceKeys.add(sourceKey);
      if (sourceName) sourceNames.add(sourceName);

      const sourceReliability = evidenceNumber(item.evidence?.sourceReliability);
      if (sourceReliability != null) reliability.push(sourceReliability);
      if (typeof item.confidence === "number" && Number.isFinite(item.confidence)) confidences.push(item.confidence);
    }

    const latestTimestamp = items.reduce((latest, item) => {
      const timestamp = new Date(item.updatedAt).getTime();
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);

    return {
      opportunities: items.filter((item) => item.severity === "opportunity").length,
      risks: items.filter((item) => item.severity === "risk").length,
      attention: items.filter((item) => item.severity === "attention").length,
      sources: sourceKeys.size,
      sourceNames: [...sourceNames].sort(),
      averageReliability: reliability.length ? Math.round(reliability.reduce((sum, value) => sum + value, 0) / reliability.length) : null,
      averageConfidence: confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : null,
      latestAnalysisAt: latestTimestamp ? new Date(latestTimestamp) : null,
    };
  }, [items]);

  const visible = useMemo(
    () => [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 30),
    [items],
  );

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.035]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5"><Newspaper className="h-3.5 w-3.5" /> Notícias & Mercado</Badge>
                <Badge variant="secondary">Inteligência JARVIS</Badge>
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-tight md:text-2xl">O que mudou fora da empresa e pode afetar o negócio</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Esta visão mostra somente notícias e sinais externos já classificados como relevantes para o tenant. Manchetes sem impacto provável não entram aqui.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: { question: "JARVIS, analise as notícias e movimentos de mercado mais relevantes para meu negócio agora." } }))}
            >
              <Sparkles className="mr-2 h-4 w-4" /> Analisar com JARVIS
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Oportunidades</p><p className="mt-1 text-xl font-bold">{summary.opportunities}</p></div>
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Riscos</p><p className="mt-1 text-xl font-bold">{summary.risks}</p></div>
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Em atenção</p><p className="mt-1 text-xl font-bold">{summary.attention}</p></div>
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Fontes com sinais</p><p className="mt-1 text-xl font-bold">{summary.sources}</p></div>
          </div>
        </CardContent>
      </Card>

      {!loading && items.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Cobertura observada do JARVIS</h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Métricas calculadas somente a partir dos sinais externos realmente persistidos para este tenant.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.sourceNames.slice(0, 6).map((name) => <Badge key={name} variant="outline">{name}</Badge>)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <p className="text-xs text-muted-foreground">Sinais relevantes</p>
                <p className="mt-1 text-lg font-semibold">{items.length}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <p className="text-xs text-muted-foreground">Confiança média</p>
                <p className="mt-1 text-lg font-semibold">{summary.averageConfidence != null ? `${summary.averageConfidence}%` : "—"}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <p className="text-xs text-muted-foreground">Confiabilidade das fontes</p>
                <p className="mt-1 text-lg font-semibold">{summary.averageReliability != null ? `${summary.averageReliability}%` : "—"}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <p className="text-xs text-muted-foreground">Última análise</p>
                <p className="mt-1 text-sm font-semibold">{summary.latestAnalysisAt ? summary.latestAnalysisAt.toLocaleString("pt-BR") : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando sinais de notícias e mercado...</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
            <Radio className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-4 text-base font-semibold">Radar de notícias ainda sem sinais relevantes para este tenant</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              O VIE monitora fontes reais e só cria cards quando encontra relação suficiente com o negócio. A ausência de cards significa que nenhum sinal externo ultrapassou o limiar de relevância disponível para este tenant.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Badge variant="outline">Nacional</Badge><Badge variant="outline">Regional</Badge><Badge variant="outline">Internacional</Badge><Badge variant="outline">Setorial</Badge><Badge variant="outline">Regulatório</Badge><Badge variant="outline">Economia</Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((item) => {
            const sourceName = evidenceText(item.evidence?.sourceName) ?? "Fonte monitorada";
            return (
              <Card key={item.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={severityTone(item.severity)}>{severityLabel(item.severity)}</Badge>
                        <Badge variant="outline">{item.category}</Badge>
                        {item.confidence != null && <span className="text-[11px] text-muted-foreground">confiança {item.confidence}%</span>}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold leading-5">{item.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                    {item.severity === "risk" ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> : <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
                    <div className="text-muted-foreground"><span className="font-medium text-foreground">{sourceName}</span> · {new Date(item.updatedAt).toLocaleString("pt-BR")}</div>
                    {item.href && <a href={item.href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir contexto <ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
