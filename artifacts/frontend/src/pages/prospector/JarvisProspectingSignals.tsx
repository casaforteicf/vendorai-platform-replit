import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, MapPin, Radar, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProspectorNavigationTarget } from "./ProspectorOverview";

type ExternalSignalType = "competitor" | "supplier" | "regional" | "sectoral" | "market";

type JarvisCase = {
  id: string;
  source: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  confidence?: number | null;
  updatedAt: string;
  evidence?: {
    signalType?: unknown;
    matchedCompetitors?: unknown;
    matchedSuppliers?: unknown;
    matchedRegions?: unknown;
    matchedTerms?: unknown;
    rationale?: unknown;
  } | null;
};

type Props = {
  onNavigate: (target: ProspectorNavigationTarget) => void;
  compact?: boolean;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function typeOfSignal(value: unknown): ExternalSignalType {
  return value === "competitor" || value === "supplier" || value === "regional" || value === "sectoral" || value === "market"
    ? value
    : "market";
}

function typeLabel(value: ExternalSignalType) {
  if (value === "competitor") return "Concorrente";
  if (value === "supplier") return "Fornecedor";
  if (value === "regional") return "Regional";
  if (value === "sectoral") return "Setorial";
  return "Mercado";
}

function isExternalCase(item: JarvisCase) {
  const source = String(item.source ?? "").toLowerCase();
  return source.startsWith("news") || source.includes("noticia") || source.includes("mercado_externo");
}

function severityLabel(value: JarvisCase["severity"]) {
  if (value === "opportunity") return "Oportunidade";
  if (value === "risk") return "Risco";
  return "Atenção";
}

function buildContext(item: JarvisCase) {
  const competitors = textArray(item.evidence?.matchedCompetitors);
  const suppliers = textArray(item.evidence?.matchedSuppliers);
  const regions = textArray(item.evidence?.matchedRegions);
  const terms = textArray(item.evidence?.matchedTerms);
  const rationale = textValue(item.evidence?.rationale);

  return {
    competitors,
    suppliers,
    regions,
    terms,
    rationale,
    primaryRegion: regions[0] ?? null,
    primaryTerm: terms[0] ?? null,
  };
}

export default function JarvisProspectingSignals({ onNavigate, compact = false }: Props) {
  const query = useQuery({
    queryKey: ["jarvis-prospector-signals"],
    queryFn: async () => {
      const response = await fetch("/api/jarvis/cases", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar sinais do JARVIS");
      return response.json() as Promise<JarvisCase[]>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = useMemo(() => {
    const rows = Array.isArray(query.data) ? query.data.filter(isExternalCase) : [];
    return [...rows]
      .sort((a, b) => {
        const severityWeight = (value: JarvisCase["severity"]) => value === "opportunity" ? 3 : value === "attention" ? 2 : 1;
        const severityDelta = severityWeight(b.severity) - severityWeight(a.severity);
        if (severityDelta !== 0) return severityDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, compact ? 1 : 4);
  }, [compact, query.data]);

  function prospect(item: JarvisCase) {
    const context = buildContext(item);
    const url = new URL(window.location.href);
    url.searchParams.set("jarvisCase", item.id);
    if (context.primaryRegion) url.searchParams.set("jarvisRegion", context.primaryRegion);
    else url.searchParams.delete("jarvisRegion");
    if (context.primaryTerm) url.searchParams.set("jarvisTerm", context.primaryTerm);
    else url.searchParams.delete("jarvisTerm");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    onNavigate({ mode: "empresas", tab: "busca" });
  }

  if (query.isLoading || items.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4 text-primary" /> Sinais JARVIS para prospecção
            </CardTitle>
            <Badge variant="outline">Caso Vendor → Prospector</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => {
            const context = buildContext(item);
            const signalType = typeOfSignal(item.evidence?.signalType);
            const entities = context.competitors.length
              ? context.competitors
              : context.suppliers.length
                ? context.suppliers
                : context.regions;

            return (
              <div key={item.id} className="rounded-xl border bg-background p-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{typeLabel(signalType)}</Badge>
                      <Badge variant={item.severity === "risk" ? "destructive" : "secondary"}>{severityLabel(item.severity)}</Badge>
                      {item.confidence != null && <span className="text-[11px] text-muted-foreground">confiança {item.confidence}%</span>}
                    </div>
                    <p className="mt-2 text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {context.regions.slice(0, 2).map((region) => (
                        <span key={region} className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{region}</span>
                      ))}
                      {entities.slice(0, 3).map((entity) => <Badge key={entity} variant="outline">{entity}</Badge>)}
                    </div>
                    {context.rationale && <p className="mt-2 text-xs text-muted-foreground"><strong className="text-foreground">Por que importa:</strong> {context.rationale}</p>}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" onClick={() => prospect(item)}>
                      <Building2 className="mr-1.5 h-3.5 w-3.5" /> Prospectar agora <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", {
                        detail: { question: `JARVIS, transforme o Caso Vendor ${item.id} em uma estratégia de prospecção e diga quais empresas devo priorizar.` },
                      }))}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Analisar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-start gap-2 rounded-lg bg-muted/35 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            O sinal orienta a busca, mas não vira lead automaticamente. A empresa só entra na fila depois de ser encontrada e enriquecida pelo Prospector, evitando dados falsos ou duplicados.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
