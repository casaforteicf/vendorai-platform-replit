import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, MapPin, Radar, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import type { ProspectorNavigationTarget } from "./ProspectorOverview";

type JarvisCase = {
  id: string;
  source: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  confidence?: number | null;
  recommendedAction?: string | null;
  status?: string | null;
  lastDetectedAt?: string | null;
  updatedAt: string;
  evidence?: {
    matchedCompetitors?: unknown;
    matchedSuppliers?: unknown;
    matchedRegions?: unknown;
    matchedTerms?: unknown;
  } | null;
};

type ProspectorConfig = {
  setor?: string | null;
  cidade?: string | null;
  ritmoDiario?: number | null;
  ativo?: boolean | null;
};

type ProspectorConfigResponse = {
  config: ProspectorConfig | null;
};

type Props = {
  onNavigate: (target: ProspectorNavigationTarget) => void;
  compact?: boolean;
};

const GENERIC_TERMS = new Set([
  "sistema",
  "sistemas",
  "plataforma",
  "plataformas",
  "solucao",
  "solucoes",
  "tecnologia",
  "tecnologias",
  "digital",
  "digitais",
  "comercial",
  "empresa",
  "empresas",
]);

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function meaningfulTerms(value: unknown) {
  return textArray(value).filter((term) => !GENERIC_TERMS.has(normalized(term)));
}

function isFresh(item: JarvisCase, hours = 48) {
  const raw = item.lastDetectedAt ?? item.updatedAt;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function isProspectingSignal(item: JarvisCase) {
  if (item.status && item.status !== "open") return false;
  if (item.severity !== "opportunity") return false;
  if ((item.confidence ?? 0) < 75) return false;

  const source = normalized(item.source ?? "");
  const category = normalized(item.category ?? "");
  if (source === "strategic_observer") return category === "territorio" || category === "prospeccao";

  const isExternal = source.startsWith("news") || source.includes("noticia") || source.includes("mercado_externo");
  if (!isExternal || !isFresh(item)) return false;

  const competitors = textArray(item.evidence?.matchedCompetitors);
  const suppliers = textArray(item.evidence?.matchedSuppliers);
  const regions = textArray(item.evidence?.matchedRegions);
  const terms = meaningfulTerms(item.evidence?.matchedTerms);
  return competitors.length > 0 || suppliers.length > 0 || (regions.length > 0 && terms.length > 0) || terms.length >= 3;
}

function signalContext(item: JarvisCase) {
  const regions = textArray(item.evidence?.matchedRegions);
  const terms = meaningfulTerms(item.evidence?.matchedTerms);
  return { primaryRegion: regions[0] ?? null, primaryTerm: terms[0] ?? null };
}

export default function JarvisProspectingSignals({ onNavigate, compact = false }: Props) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const signalsQuery = useQuery({
    queryKey: ["jarvis-prospector-signals", tenantId],
    queryFn: async () => {
      const response = await fetch("/api/jarvis/cases", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar sinais do JARVIS");
      return response.json() as Promise<JarvisCase[]>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!tenantId,
  });

  const configQuery = useQuery({
    queryKey: ["jarvis-prospector-config", tenantId],
    queryFn: async () => {
      const response = await fetch("/api/prospector/config", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar configuração do Prospector");
      return response.json() as Promise<ProspectorConfigResponse>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!tenantId,
  });

  const config = configQuery.data?.config ?? null;
  const active = config?.ativo === true;
  const signals = useMemo(
    () => (Array.isArray(signalsQuery.data) ? signalsQuery.data.filter(isProspectingSignal) : []).sort((a, b) => {
      const scoreDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return new Date(b.lastDetectedAt ?? b.updatedAt).getTime() - new Date(a.lastDetectedAt ?? a.updatedAt).getTime();
    }),
    [signalsQuery.data],
  );

  const primary = signals[0] ?? null;
  const urgentCount = signals.filter((item) => (item.confidence ?? 0) >= 85).length;

  function openSignal(item: JarvisCase) {
    const context = signalContext(item);
    const url = new URL(window.location.href);
    url.searchParams.set("jarvisCase", item.id);

    const region = context.primaryRegion ?? config?.cidade ?? null;
    const term = context.primaryTerm ?? config?.setor ?? null;
    if (region) url.searchParams.set("jarvisRegion", region);
    else url.searchParams.delete("jarvisRegion");
    if (term) url.searchParams.set("jarvisTerm", term);
    else url.searchParams.delete("jarvisTerm");

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    onNavigate({ mode: "empresas", tab: "busca" });
  }

  if (signalsQuery.isLoading && configQuery.isLoading) return null;

  const statusText = active
    ? [
        config?.ritmoDiario ? `${config.ritmoDiario} empresas/dia` : null,
        config?.setor || null,
        config?.cidade || null,
      ].filter(Boolean).join(" • ") || "prospecção automática ativa"
    : "prospecção automática pausada";

  if (compact) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card className="border-primary/15 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="rounded-lg bg-primary/10 p-2">
                <Radar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">JARVIS</p>
                  <Badge variant={active ? "secondary" : "outline"}>{active ? "Ativo" : "Pausado"}</Badge>
                  {urgentCount > 0 && <Badge variant="outline">{urgentCount} prioridade(s)</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{statusText}</p>
              </div>
            </div>

            {primary ? (
              <Button size="sm" variant="outline" onClick={() => openSignal(primary)} className="shrink-0">
                Ver recomendação <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => onNavigate({ mode: "empresas", tab: "busca" })} className="shrink-0">
                <Building2 className="mr-1.5 h-3.5 w-3.5" /> Buscar empresas
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="border-primary/15 bg-primary/[0.015] shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="rounded-lg bg-primary/10 p-2">
                <Radar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">JARVIS monitorando a prospecção</p>
                  <Badge variant={active ? "secondary" : "outline"}>{active ? "Ativo" : "Pausado"}</Badge>
                  {signals.length > 0 && <Badge variant="outline">{signals.length} sinal(is)</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{statusText}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onNavigate({ mode: "empresas", tab: "busca" })}>
              Configurar busca
            </Button>
          </div>

          {primary && (
            <button
              type="button"
              onClick={() => openSignal(primary)}
              className="flex w-full flex-col gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
            >
              <div className="rounded-lg bg-primary/10 p-2">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{primary.title}</p>
                  {primary.confidence != null && <Badge variant="secondary">{primary.confidence}%</Badge>}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {primary.recommendedAction || primary.detail}
                </p>
                {signalContext(primary).primaryRegion && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {signalContext(primary).primaryRegion}
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
