import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Info, MapPin, Radar, Sparkles } from "lucide-react";
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
  recommendedAction?: string | null;
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

function priorityLabel(item: JarvisCase) {
  if (item.severity === "risk") return "Alerta";
  if (item.severity === "opportunity" && (item.confidence ?? 0) >= 80) return "Agir agora";
  if (item.severity === "opportunity") return "Oportunidade";
  return "Acompanhar";
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

function friendlyReason(item: JarvisCase) {
  const context = buildContext(item);
  if (context.competitors.length) return `Movimento de concorrente conhecido: ${context.competitors.slice(0, 2).join(", ")}.`;
  if (context.suppliers.length) return `Movimento de fornecedor relacionado ao seu negócio: ${context.suppliers.slice(0, 2).join(", ")}.`;
  if (context.regions.length) return `Sinal detectado em região acompanhada pelo seu negócio: ${context.regions.slice(0, 2).join(", ")}.`;

  const signalType = typeOfSignal(item.evidence?.signalType);
  if (signalType === "sectoral") return "Tema relacionado ao seu segmento, produtos ou perfil de cliente.";
  return "Sinal de mercado relacionado ao contexto comercial da empresa.";
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

  const externalCases = useMemo(
    () => Array.isArray(query.data) ? query.data.filter(isExternalCase) : [],
    [query.data],
  );

  const items = useMemo(() => {
    return [...externalCases]
      .sort((a, b) => {
        const severityWeight = (value: JarvisCase["severity"]) => value === "opportunity" ? 3 : value === "risk" ? 2 : 1;
        const severityDelta = severityWeight(b.severity) - severityWeight(a.severity);
        if (severityDelta !== 0) return severityDelta;
        const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
        if (confidenceDelta !== 0) return confidenceDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, compact ? 1 : 3);
  }, [compact, externalCases]);

  const summary = useMemo(() => {
    return externalCases.reduce(
      (acc, item) => {
        if (item.severity === "risk") acc.alerts += 1;
        else if (item.severity === "opportunity" && (item.confidence ?? 0) >= 80) acc.now += 1;
        else acc.follow += 1;
        return acc;
      },
      { now: 0, follow: 0, alerts: 0 },
    );
  }, [externalCases]);

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
      <Card className="border-primary/20 bg-primary/[0.02] shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radar className="h-4 w-4 text-primary" /> JARVIS — O que merece sua atenção
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Sinais priorizados pelo seu segmento, região, produtos e perfil de cliente.
              </p>
            </div>

            {!compact && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {summary.now > 0 && <Badge variant="secondary">Agir agora {summary.now}</Badge>}
                {summary.follow > 0 && <Badge variant="outline">Acompanhar {summary.follow}</Badge>}
                {summary.alerts > 0 && <Badge variant="destructive">Alertas {summary.alerts}</Badge>}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-2.5">
          {items.map((item) => {
            const context = buildContext(item);
            const signalType = typeOfSignal(item.evidence?.signalType);
            const primaryEntity = context.competitors[0] ?? context.suppliers[0] ?? null;

            return (
              <div key={item.id} className="rounded-xl border bg-background p-3.5 transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.severity === "risk" ? "destructive" : "secondary"}>{priorityLabel(item)}</Badge>
                      <Badge variant="outline">{typeLabel(signalType)}</Badge>
                      {item.confidence != null && (
                        <span className="text-[11px] font-medium text-muted-foreground">Compatibilidade {item.confidence}%</span>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-semibold leading-5">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>

                    {(context.regions.length > 0 || primaryEntity) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {context.regions.slice(0, 1).map((region) => (
                          <span key={region} className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{region}
                          </span>
                        ))}
                        {primaryEntity && <Badge variant="outline">{primaryEntity}</Badge>}
                      </div>
                    )}

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg bg-muted/35 px-3 py-2">
                        <p className="text-[11px] font-semibold text-foreground">Por que isso interessa</p>
                        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{friendlyReason(item)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/35 px-3 py-2">
                        <p className="text-[11px] font-semibold text-foreground">JARVIS recomenda</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                          {item.recommendedAction || "Validar o sinal e decidir se vale transformar em ação comercial."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                    <Button size="sm" onClick={() => prospect(item)}>
                      <Building2 className="mr-1.5 h-3.5 w-3.5" />
                      {item.severity === "risk" ? "Ver sinal" : "Ver oportunidade"}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => window.dispatchEvent(new CustomEvent("vendorai:open-support", {
                        detail: { question: `JARVIS, analise o sinal ${item.id}, explique por que ele importa e recomende a próxima ação comercial.` },
                      }))}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Perguntar ao JARVIS
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-start gap-2 px-1 pt-1 text-[11px] leading-4 text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>O JARVIS recomenda; você decide o que vira lead. O Prospector valida e enriquece os dados antes de enviar ao CRM.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
