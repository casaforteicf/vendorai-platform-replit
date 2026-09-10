import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Building2, ExternalLink, Globe2, Newspaper, Radio, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ExternalSignalType = "competitor" | "supplier" | "regional" | "sectoral" | "market";

type NewsEvidence = {
  sourceId?: unknown;
  sourceCode?: unknown;
  sourceName?: unknown;
  sourceReliability?: unknown;
  publishedAt?: unknown;
  relevanceScore?: unknown;
  signalType?: unknown;
  matchedCompetitors?: unknown;
  matchedSuppliers?: unknown;
  matchedRegions?: unknown;
  matchedTerms?: unknown;
  rationale?: unknown;
};

type NewsCase = {
  id: string;
  source: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  confidence?: number | null;
  href?: string | null;
  status?: string | null;
  lastDetectedAt?: string | null;
  updatedAt: string;
  evidence?: NewsEvidence | null;
};

type VieCoverage = {
  generatedAt: string;
  cadenceHours: number;
  staleAfterHours: number;
  summary: {
    activeSources: number;
    healthySources: number;
    failingSources: number;
    staleSources: number;
    neverCheckedSources: number;
    collected24h: number;
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
  };
  sources: Array<{
    id: string;
    code: string;
    name: string;
    scope: string;
    sourceType: string;
    reliabilityScore: number | null;
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    collected24h: number;
    status: "healthy" | "failing" | "stale" | "never_checked";
  }>;
};

const GENERIC_TERMS = new Set([
  "sistema", "sistemas", "plataforma", "plataformas", "solucao", "solucoes",
  "tecnologia", "tecnologias", "digital", "digitais", "comercial", "empresa", "empresas",
]);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isNewsSource(source: string) {
  const value = source.toLowerCase();
  return value.startsWith("news") || value.includes("noticia") || value.includes("mercado_externo");
}

function evidenceText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function evidenceNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evidenceTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function meaningfulTerms(value: unknown) {
  return evidenceTextArray(value).filter((term) => !GENERIC_TERMS.has(normalize(term)));
}

function signalType(value: unknown): ExternalSignalType {
  return value === "competitor" || value === "supplier" || value === "regional" || value === "sectoral" || value === "market"
    ? value
    : "market";
}

function signalTypeLabel(value: ExternalSignalType) {
  if (value === "competitor") return "Concorrente";
  if (value === "supplier") return "Fornecedor";
  if (value === "regional") return "Regional";
  if (value === "sectoral") return "Setorial";
  return "Mercado";
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

function sourceStatusLabel(status: VieCoverage["sources"][number]["status"]) {
  if (status === "healthy") return "Saudável";
  if (status === "failing") return "Falhando";
  if (status === "stale") return "Atrasada";
  return "Nunca verificada";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function isFresh(item: NewsCase, hours = 48) {
  const timestamp = new Date(item.lastDetectedAt ?? item.updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function isStrongMarketSignal(item: NewsCase) {
  if (item.status && item.status !== "open") return false;
  if (!isNewsSource(String(item.source ?? ""))) return false;
  if (!isFresh(item)) return false;
  if ((item.confidence ?? 0) < 75) return false;

  const competitors = evidenceTextArray(item.evidence?.matchedCompetitors);
  const suppliers = evidenceTextArray(item.evidence?.matchedSuppliers);
  const regions = evidenceTextArray(item.evidence?.matchedRegions);
  const terms = meaningfulTerms(item.evidence?.matchedTerms);
  const kind = signalType(item.evidence?.signalType);

  if (competitors.length || suppliers.length) return true;
  if (kind === "regional" && regions.length > 0 && terms.length >= 1) return true;
  if (kind === "sectoral" && terms.length >= 3) return true;
  return false;
}

function signalWhy(item: NewsCase): string | null {
  const competitors = evidenceTextArray(item.evidence?.matchedCompetitors);
  const suppliers = evidenceTextArray(item.evidence?.matchedSuppliers);
  const regions = evidenceTextArray(item.evidence?.matchedRegions);
  const rationale = evidenceText(item.evidence?.rationale);

  if (competitors.length) return `Movimento relacionado a concorrente monitorado: ${competitors.join(", ")}.`;
  if (suppliers.length) return `Movimento relacionado a fornecedor monitorado: ${suppliers.join(", ")}.`;
  if (regions.length) return `Sinal ligado a uma região realmente acompanhada: ${regions.join(", ")}.`;
  return rationale;
}

export default function JarvisNewsMarket({ token }: { token?: string | null }) {
  const [allCases, setAllCases] = useState<NewsCase[]>([]);
  const [coverage, setCoverage] = useState<VieCoverage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setAllCases([]);
      setCoverage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch("/api/jarvis/cases", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar inteligência do JARVIS");
        return response.json() as Promise<NewsCase[]>;
      }),
      fetch("/api/jarvis/vie/coverage", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar cobertura operacional");
        return response.json() as Promise<VieCoverage>;
      }),
    ])
      .then(([casesData, coverageData]) => {
        if (cancelled) return;
        setAllCases(Array.isArray(casesData) ? casesData : []);
        setCoverage(coverageData);
      })
      .catch(() => {
        if (!cancelled) {
          setAllCases([]);
          setCoverage(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [token]);

  const items = useMemo(
    () => allCases
      .filter(isStrongMarketSignal)
      .sort((a, b) => new Date(b.lastDetectedAt ?? b.updatedAt).getTime() - new Date(a.lastDetectedAt ?? a.updatedAt).getTime())
      .slice(0, 8),
    [allCases],
  );

  const summary = useMemo(() => {
    const sourceKeys = new Set<string>();
    const reliabilities: number[] = [];
    const confidences: number[] = [];

    for (const item of items) {
      const sourceId = evidenceText(item.evidence?.sourceId) ?? evidenceText(item.evidence?.sourceCode) ?? evidenceText(item.evidence?.sourceName);
      if (sourceId) sourceKeys.add(sourceId);
      const reliability = evidenceNumber(item.evidence?.sourceReliability);
      if (reliability != null) reliabilities.push(reliability);
      if (item.confidence != null) confidences.push(item.confidence);
    }

    return {
      opportunities: items.filter((item) => item.severity === "opportunity").length,
      risks: items.filter((item) => item.severity === "risk").length,
      sources: sourceKeys.size,
      confidence: confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : null,
      reliability: reliabilities.length ? Math.round(reliabilities.reduce((sum, value) => sum + value, 0) / reliabilities.length) : null,
    };
  }, [items]);

  const coverageHealthy = !!coverage && coverage.summary.activeSources > 0 && coverage.summary.healthySources === coverage.summary.activeSources;

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.035]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5"><Newspaper className="h-3.5 w-3.5" /> Inteligência de mercado</Badge>
                <Badge variant="secondary">JARVIS</Badge>
                <Badge variant="outline">Não é prospecção</Badge>
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-tight md:text-2xl">O que mudou fora da empresa</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Aqui entram apenas sinais externos recentes e fortes. A busca automática de empresas fica separada no Prospector para não confundir notícia com oportunidade comercial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", { detail: { question: "JARVIS, analise os sinais externos fortes e recentes que podem afetar meu negócio agora." } }))}>
                <Sparkles className="mr-2 h-4 w-4" /> Analisar com JARVIS
              </Button>
              <Button asChild>
                <a href="/prospector"><Building2 className="mr-2 h-4 w-4" /> Abrir Prospecção JARVIS</a>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Sinais fortes agora</p><p className="mt-1 text-xl font-bold">{items.length}</p></div>
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Oportunidades</p><p className="mt-1 text-xl font-bold">{summary.opportunities}</p></div>
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Riscos</p><p className="mt-1 text-xl font-bold">{summary.risks}</p></div>
            <div className="rounded-xl border bg-background/80 p-3.5"><p className="text-xs text-muted-foreground">Confiança média</p><p className="mt-1 text-xl font-bold">{summary.confidence != null ? `${summary.confidence}%` : "—"}</p></div>
          </div>
        </CardContent>
      </Card>

      {!loading && coverage && (
        <Card className={coverageHealthy ? "border-primary/20" : "border-amber-300/60"}>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Cobertura operacional do JARVIS</h3>
                  <Badge variant={coverageHealthy ? "secondary" : "outline"}>{coverageHealthy ? "Operação saudável" : "Requer atenção"}</Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Coleta de inteligência externa a cada {coverage.cadenceHours}h. Esta métrica mede as fontes de mercado, não o Prospector automático.
                </p>
              </div>
              <div className="text-xs text-muted-foreground">Último sucesso: <span className="font-medium text-foreground">{formatDate(coverage.summary.lastSuccessAt)}</span></div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
              <div className="rounded-xl border bg-muted/20 p-3.5"><p className="text-xs text-muted-foreground">Fontes ativas</p><p className="mt-1 text-lg font-semibold">{coverage.summary.activeSources}</p></div>
              <div className="rounded-xl border bg-muted/20 p-3.5"><p className="text-xs text-muted-foreground">Saudáveis</p><p className="mt-1 text-lg font-semibold">{coverage.summary.healthySources}</p></div>
              <div className="rounded-xl border bg-muted/20 p-3.5"><p className="text-xs text-muted-foreground">Com falha</p><p className="mt-1 text-lg font-semibold">{coverage.summary.failingSources}</p></div>
              <div className="rounded-xl border bg-muted/20 p-3.5"><p className="text-xs text-muted-foreground">Atrasadas</p><p className="mt-1 text-lg font-semibold">{coverage.summary.staleSources}</p></div>
              <div className="rounded-xl border bg-muted/20 p-3.5"><p className="text-xs text-muted-foreground">Coletados 24h</p><p className="mt-1 text-lg font-semibold">{coverage.summary.collected24h}</p></div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {coverage.sources.map((source) => (
                <div key={source.id} className="rounded-xl border p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{source.name}</p>
                    <Badge variant="outline">{sourceStatusLabel(source.status)}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>24h: <strong className="text-foreground">{source.collected24h}</strong></span>
                    <span>Confiab.: <strong className="text-foreground">{source.reliabilityScore != null ? `${source.reliabilityScore}%` : "—"}</strong></span>
                    <span className="col-span-2">Verificada: <strong className="text-foreground">{formatDate(source.lastCheckedAt)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Atualizando inteligência de mercado...</CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
            <Radio className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="mt-4 text-base font-semibold">Nenhum sinal externo forte agora</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Isso é normal. Notícias antigas, genéricas ou com baixa compatibilidade deixam de aparecer. Para buscar clientes, use a Prospecção JARVIS no Prospector.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const sourceName = evidenceText(item.evidence?.sourceName) ?? "Fonte monitorada";
            const kind = signalType(item.evidence?.signalType);
            const why = signalWhy(item);
            return (
              <Card key={item.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={severityTone(item.severity)}>{severityLabel(item.severity)}</Badge>
                        <Badge variant="outline">{signalTypeLabel(kind)}</Badge>
                        {item.confidence != null && <span className="text-[11px] text-muted-foreground">confiança {item.confidence}%</span>}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold leading-5">{item.title}</h3>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                      {why && (
                        <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-xs leading-5">
                          <span className="font-medium text-foreground">Por que importa: </span>
                          <span className="text-muted-foreground">{why}</span>
                        </div>
                      )}
                    </div>
                    {item.severity === "risk" ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> : <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
                    <div className="text-muted-foreground"><span className="font-medium text-foreground">{sourceName}</span> · {formatDate(item.lastDetectedAt ?? item.updatedAt)}</div>
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
