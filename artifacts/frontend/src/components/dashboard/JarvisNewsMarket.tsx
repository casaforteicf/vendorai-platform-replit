import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ExternalLink, Newspaper, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { primaryJarvisNewsSection, type JarvisNewsSection } from "@/lib/jarvis-news-classifier";

type ExternalSignalType = "competitor" | "supplier" | "regional" | "sectoral" | "market";

type NewsEvidence = {
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

type VieNewsItem = {
  id: string;
  title: string;
  url: string;
  excerpt: string | null;
  publishedAt: string | null;
  collectedAt: string;
  categories?: string[] | null;
  sourceScope?: string | null;
  sourceCode?: string | null;
  sourceName?: string | null;
  sourceReliability?: number | null;
};

type VieNewsFeed = {
  generatedAt: string;
  windowHours: number;
  targetPerDay: number;
  available: number;
  displayed: number;
  items: VieNewsItem[];
};

const GENERIC_TERMS = new Set([
  "sistema", "sistemas", "plataforma", "plataformas", "solucao", "solucoes",
  "tecnologia", "tecnologias", "digital", "digitais", "comercial", "empresa", "empresas",
]);

const NEWS_SECTIONS: Array<"Todos" | JarvisNewsSection> = [
  "Todos",
  "Notícias Locais",
  "Política",
  "Bolsa de Valores",
  "Criptomoedas",
  "Economia",
  "Negócios",
  "Governo & Regulação",
  "Saúde",
  "Tecnologia",
  "Infraestrutura",
  "Agro & Ambiente",
  "Internacional",
  "Geral",
];

type NewsFilter = (typeof NEWS_SECTIONS)[number];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function evidenceText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function evidenceTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function meaningfulTerms(value: unknown) {
  return evidenceTextArray(value).filter((term) => !GENERIC_TERMS.has(normalize(term)));
}

function isNewsSource(source: string) {
  const value = source.toLowerCase();
  return value.startsWith("news") || value.includes("noticia") || value.includes("mercado_externo");
}

function isFresh(item: NewsCase, hours = 48) {
  const timestamp = new Date(item.lastDetectedAt ?? item.updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
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

  if (competitors.length) return `Movimento relevante envolvendo ${competitors.join(", ")}.`;
  if (suppliers.length) return `Movimento relevante envolvendo ${suppliers.join(", ")}.`;
  if (regions.length) return `Mudança relevante em ${regions.join(", ")}.`;
  return rationale;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatUpdated(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isValidRegionLabel(value: string) {
  const text = normalize(value);
  if (!text || /\d/.test(text)) return false;
  if (/\b(rua|avenida|av\.?|rodovia|estrada|travessa|alameda|br-)\b/.test(text)) return false;
  return text.length >= 3;
}

function regionalCaseToNewsItem(item: NewsCase): VieNewsItem | null {
  const regions = evidenceTextArray(item.evidence?.matchedRegions).filter(isValidRegionLabel);
  if (signalType(item.evidence?.signalType) !== "regional" || regions.length === 0 || !isFresh(item, 48)) return null;

  return {
    id: `local-${item.id}`,
    title: item.title,
    url: item.href ?? "",
    excerpt: item.detail,
    publishedAt: item.lastDetectedAt ?? item.updatedAt,
    collectedAt: item.updatedAt,
    categories: ["noticias-locais", ...regions],
    sourceScope: "regional",
    sourceCode: "jarvis-local",
    sourceName: "Radar local JARVIS",
  };
}

function dedupeItems(items: VieNewsItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalizedUrl = normalize(item.url || "").replace(/[?#].*$/, "");
    const normalizedTitle = normalize(item.title).replace(/\s+/g, " ");
    const key = normalizedUrl || normalizedTitle;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyMessage(filter: NewsFilter) {
  if (filter === "Notícias Locais") {
    return "O JARVIS ainda não recebeu notícias locais para este tenant. Se a empresa não tiver cidade e UF configuradas, complete a localização em Configurações para ativar o radar local.";
  }
  if (filter === "Bolsa de Valores" || filter === "Criptomoedas") {
    return "A fonte financeira ainda não entregou notícias recentes para esta categoria. O radar tentará novamente na próxima coleta.";
  }
  return "Nenhuma informação recente nesta categoria agora.";
}

export default function JarvisNewsMarket({ token }: { token?: string | null }) {
  const [allCases, setAllCases] = useState<NewsCase[]>([]);
  const [newsFeed, setNewsFeed] = useState<VieNewsFeed | null>(null);
  const [newsFilter, setNewsFilter] = useState<NewsFilter>("Todos");
  const [visibleCount, setVisibleCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) {
      setAllCases([]);
      setNewsFeed(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFeedError(false);
    const headers = { Authorization: `Bearer ${token}` };

    Promise.allSettled([
      fetch("/api/jarvis/cases", { headers, cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("cases");
        return response.json() as Promise<NewsCase[]>;
      }),
      fetch("/api/jarvis/vie/news-feed?limit=50", { headers, cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("feed");
        return response.json() as Promise<VieNewsFeed>;
      }),
    ]).then(([casesResult, feedResult]) => {
      if (cancelled) return;

      setAllCases(casesResult.status === "fulfilled" && Array.isArray(casesResult.value) ? casesResult.value : []);

      if (feedResult.status === "fulfilled") {
        setNewsFeed(feedResult.value);
      } else {
        setNewsFeed(null);
        setFeedError(true);
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, refreshKey]);

  useEffect(() => {
    setVisibleCount(20);
  }, [newsFilter]);

  const strongItems = useMemo(
    () => allCases
      .filter(isStrongMarketSignal)
      .sort((a, b) => new Date(b.lastDetectedAt ?? b.updatedAt).getTime() - new Date(a.lastDetectedAt ?? a.updatedAt).getTime())
      .slice(0, 4),
    [allCases],
  );

  const allNewsItems = useMemo(() => {
    const feedItems = newsFeed?.items ?? [];
    const regionalItems = allCases
      .map(regionalCaseToNewsItem)
      .filter((item): item is VieNewsItem => item !== null);

    return dedupeItems([...feedItems, ...regionalItems]).sort(
      (a, b) => new Date(b.publishedAt ?? b.collectedAt).getTime() - new Date(a.publishedAt ?? a.collectedAt).getTime(),
    );
  }, [newsFeed, allCases]);

  const filteredFeed = useMemo(() => {
    if (newsFilter === "Todos") return allNewsItems;
    return allNewsItems.filter((item) => primaryJarvisNewsSection(item) === newsFilter);
  }, [allNewsItems, newsFilter]);

  const visibleFeed = filteredFeed.slice(0, visibleCount);

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">Notícias & Mercado</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Informação recente organizada pelo JARVIS. O que realmente exigir ação aparece em destaque.
          </p>
          {newsFeed && (
            <p className="mt-2 text-xs text-muted-foreground">
              {allNewsItems.length} informações recentes{newsFeed.generatedAt ? ` · atualizado ${formatUpdated(newsFeed.generatedAt)}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", {
              detail: { question: "JARVIS, resuma as informações mais importantes de hoje, incluindo política, bolsa, criptomoedas e acontecimentos locais relevantes para o meu negócio." },
            }))}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Resumir com JARVIS
          </Button>
          <Button asChild>
            <a href="/prospector"><Building2 className="mr-2 h-4 w-4" /> Prospecção</a>
          </Button>
        </div>
      </div>

      {strongItems.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="p-5 md:p-6">
            <div className="mb-4">
              <h3 className="text-base font-semibold">O que merece sua atenção</h3>
              <p className="mt-1 text-xs text-muted-foreground">O JARVIS separou estes fatos porque podem exigir decisão, acompanhamento ou ação.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {strongItems.map((item) => {
                const kind = signalType(item.evidence?.signalType);
                const why = signalWhy(item);
                return (
                  <article key={item.id} className="rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={severityTone(item.severity)}>{severityLabel(item.severity)}</Badge>
                      <Badge variant="outline">{signalTypeLabel(kind)}</Badge>
                      {item.confidence != null && <span className="text-[11px] text-muted-foreground">{item.confidence}% compatível</span>}
                    </div>
                    <h4 className="mt-3 text-sm font-semibold leading-5">{item.title}</h4>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    {why && <p className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-xs leading-5"><strong>Por que importa:</strong> {why}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", {
                          detail: { question: `JARVIS, analise este destaque para o meu negócio e recomende a próxima ação: ${item.title}` },
                        }))}
                      >
                        Analisar com JARVIS
                      </button>
                      {item.href && (
                        <a href={item.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Abrir informação <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-base font-semibold">Radar do dia</h3>
              <p className="mt-1 text-xs text-muted-foreground">Informações das últimas horas organizadas por assunto, com uma categoria principal por notícia.</p>
            </div>
            {newsFeed && <span className="text-xs text-muted-foreground">Mostrando {Math.min(visibleCount, filteredFeed.length)} de {filteredFeed.length}</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {NEWS_SECTIONS.map((section) => (
              <Button
                key={section}
                type="button"
                size="sm"
                variant={newsFilter === section ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setNewsFilter(section)}
              >
                {section}
              </Button>
            ))}
          </div>

          {loading && !newsFeed ? (
            <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando informações...</div>
          ) : feedError ? (
            <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
              <AlertTriangle className="h-7 w-7 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">As informações não carregaram.</p>
              <p className="mt-1 text-xs text-muted-foreground">A coleta continua ativa. Tente atualizar o radar.</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setRefreshKey((value) => value + 1)}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
              </Button>
            </div>
          ) : visibleFeed.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {emptyMessage(newsFilter)}
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {visibleFeed.map((item) => (
                  <article key={item.id} className="rounded-xl border bg-background p-4 transition-shadow hover:shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="outline">{primaryJarvisNewsSection(item)}</Badge>
                      <span>{formatTime(item.publishedAt ?? item.collectedAt)}</span>
                      {item.sourceName && <span className="truncate" title={item.sourceName}>· {item.sourceName}</span>}
                    </div>
                    <h4 className="mt-2 text-sm font-semibold leading-5">{item.title}</h4>
                    {item.excerpt && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.excerpt}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", {
                          detail: { question: `JARVIS, analise esta informação para o meu negócio e diga se existe risco, oportunidade ou alguma ação recomendada: ${item.title}` },
                        }))}
                      >
                        Analisar com JARVIS
                      </button>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Abrir notícia <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              {visibleCount < filteredFeed.length && (
                <div className="mt-5 flex justify-center">
                  <Button type="button" variant="outline" onClick={() => setVisibleCount((value) => value + 10)}>
                    Ver mais informações
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
