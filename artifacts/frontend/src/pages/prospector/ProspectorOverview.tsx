import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Flame,
  MapPin,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import ProspectorChannelStatus from "./ProspectorChannelStatus";
import ProspectorSourcesPanel from "./ProspectorSourcesPanel";

export type ProspectorNavigationTarget = {
  mode: "empresas" | "obras";
  tab?: "busca" | "cnpj" | "anunciantes" | "fila" | "aprovacoes";
};

type QueueFilter = "todos" | "quentes" | "aquecendo" | "analisando";

type QueueLead = {
  id: string;
  nome: string;
  empresa?: string | null;
  source?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  mercadoSegmento?: string | null;
  enrichmentStatus: string;
  propensityScore?: number | null;
  priorityReason?: string | null;
  events?: Array<{ tipo: string; descricao: string }>;
  roiEstimate?: {
    perda_estimada_mes?: number;
    ganho_potencial_mes?: number;
  } | null;
};

type QueueResponse = {
  leads: QueueLead[];
  autoDispatchThreshold: number;
  total: number;
};

type Props = {
  onNavigate: (target: ProspectorNavigationTarget) => void;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function scoreClass(score: number) {
  if (score >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 50) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function money(value?: number) {
  if (!value || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function sourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    prospector: "Prospecctor",
    prospector_auto: "Prospecctor IA",
    cnpj: "CNPJ",
    recem_aberta: "Empresa recém-aberta",
    ad_library: "Meta Ads",
    revenue_scout: "Revenue Scout",
    business_directory: "Diretório",
    public_registry: "Registro público",
    google_maps_prospecting: "Google Maps",
    google_business_profile: "Google Business",
    linkedin_prospecting: "LinkedIn",
    instagram_prospecting: "Instagram",
    facebook_prospecting: "Facebook",
    marketplace_prospecting: "Marketplace",
    event_prospecting: "Evento",
    referral_prospecting: "Indicação",
    imported_prospect_list: "Lista importada",
    manual_prospecting: "Manual",
    website_prospecting: "Website",
    construction_radar: "Radar de Obras",
    obra_radar: "Radar de Obras",
  };
  if (!source) return null;
  return labels[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ProspectorOverview({ onNavigate }: Props) {
  const queueQuery = useQuery({
    queryKey: ["prospector-command-center"],
    queryFn: async () => {
      const res = await fetch("/api/prospector/fila?limit=100", { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar oportunidades do Prospector");
      return res.json() as Promise<QueueResponse>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    const leads = queueQuery.data?.leads ?? [];
    const scored = leads.filter((lead) => lead.enrichmentStatus !== "pending");
    const hot = scored.filter((lead) => (lead.propensityScore ?? 0) >= 80);
    const warm = scored.filter((lead) => {
      const score = lead.propensityScore ?? 0;
      return score >= 50 && score < 80;
    });
    const pending = leads.filter((lead) => lead.enrichmentStatus === "pending");
    const potential = leads.reduce((sum, lead) => sum + (lead.roiEstimate?.perda_estimada_mes ?? 0), 0);
    const top = [...scored]
      .sort((a, b) => (b.propensityScore ?? 0) - (a.propensityScore ?? 0))
      .slice(0, 5);
    return { leads, hot, warm, pending, potential, top };
  }, [queueQuery.data]);

  const recommendation = useMemo(() => {
    if (stats.hot.length > 0) {
      return {
        title: `Atacar ${stats.hot.length} oportunidade(s) quente(s) agora`,
        description: "Esses prospects já têm score alto e devem receber atenção antes de novas buscas.",
        label: "Abrir oportunidades quentes",
        target: { mode: "empresas", tab: "fila" } as ProspectorNavigationTarget,
      };
    }
    if (stats.warm.length > 0) {
      return {
        title: `Revisar ${stats.warm.length} oportunidade(s) em aquecimento`,
        description: "Há sinais suficientes para qualificar melhor antes do primeiro contato.",
        label: "Revisar fila",
        target: { mode: "empresas", tab: "fila" } as ProspectorNavigationTarget,
      };
    }
    return {
      title: "Gerar novas oportunidades",
      description: "A fila está leve. Busque empresas ou use o Radar de Obras para antecipar demanda.",
      label: "Buscar empresas",
      target: { mode: "empresas", tab: "busca" } as ProspectorNavigationTarget,
    };
  }, [stats.hot.length, stats.warm.length]);

  const openQueue = (filter: QueueFilter = "todos") => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (filter === "todos") url.searchParams.delete("queueFilter");
      else url.searchParams.set("queueFilter", filter);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    onNavigate({ mode: "empresas", tab: "fila" });
  };
  const metricButtonClass =
    "rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const metricCardClass =
    "h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {queueQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Spinner className="mr-2 h-5 w-5" /> Calculando prioridades...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <button type="button" onClick={() => openQueue("todos")} className={metricButtonClass} aria-label="Abrir oportunidades na fila">
            <Card className={metricCardClass}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Na fila</p>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold">{queueQuery.data?.total ?? stats.leads.length}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>oportunidades abertas</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </button>
          <button type="button" onClick={() => openQueue("quentes")} className={metricButtonClass} aria-label="Abrir oportunidades quentes">
            <Card className={`${metricCardClass} border-emerald-200`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-emerald-700">Quentes</p>
                  <Flame className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{stats.hot.length}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>score ≥ 80</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </button>
          <button type="button" onClick={() => openQueue("aquecendo")} className={metricButtonClass} aria-label="Abrir oportunidades em aquecimento">
            <Card className={`${metricCardClass} border-amber-200`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-amber-800">Em aquecimento</p>
                  <TrendingUp className="h-4 w-4 text-amber-700" />
                </div>
                <p className="mt-2 text-2xl font-bold text-amber-800">{stats.warm.length}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>score 50–79</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </button>
          <button type="button" onClick={() => openQueue("analisando")} className={metricButtonClass} aria-label="Abrir oportunidades em análise">
            <Card className={metricCardClass}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Analisando</p>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold">{stats.pending.length}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>enriquecimento em curso</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </button>
          <button type="button" onClick={() => openQueue("todos")} className={metricButtonClass} aria-label="Abrir detalhes do potencial da fila">
            <Card className={metricCardClass}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Potencial</p>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-xl font-bold">{money(stats.potential) ?? "—"}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>estimativa recuperável/mês</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      )}

      <ProspectorChannelStatus />

      <Card className="border-primary/25 bg-primary/[0.025]">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Próxima melhor ação</p>
              <h2 className="mt-0.5 text-lg font-bold">{recommendation.title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{recommendation.description}</p>
            </div>
          </div>
          <Button onClick={() => onNavigate(recommendation.target)} className="shrink-0">
            <Zap className="mr-2 h-4 w-4" /> {recommendation.label}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" /> Prioridades comerciais
                </CardTitle>
                <CardDescription>Os prospects com maior propensão no momento.</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queueQuery.refetch()}
                disabled={queueQuery.isFetching}
                className="h-8 shrink-0 px-2 text-xs"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${queueQuery.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {queueQuery.isError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                Não foi possível carregar a fila agora. As fontes de prospecção continuam disponíveis.
              </div>
            ) : stats.top.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-7 w-7 opacity-40" />
                Ainda não há prospects pontuados. Faça uma busca para alimentar a inteligência.
              </div>
            ) : (
              <div className="divide-y">
                {stats.top.map((lead, index) => {
                  const score = lead.propensityScore ?? 0;
                  return (
                    <div key={lead.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{lead.nome}</p>
                          <Badge variant="outline" className={scoreClass(score)}>Score {score}</Badge>
                          {sourceLabel(lead.source) && (
                            <Badge variant="secondary" className="text-[10px] font-medium">
                              {sourceLabel(lead.source)}
                            </Badge>
                          )}
                        </div>
                        {lead.priorityReason && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{lead.priorityReason}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {lead.mercadoSegmento && <span>{lead.mercadoSegmento}</span>}
                          {lead.endereco && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.endereco}</span>}
                          {money(lead.roiEstimate?.perda_estimada_mes) && (
                            <span className="font-medium text-emerald-700">Potencial {money(lead.roiEstimate?.perda_estimada_mes)}/mês</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button variant="outline" className="mt-4 w-full" onClick={() => openQueue("todos")}>
              Ver fila completa <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <ProspectorSourcesPanel onNavigate={onNavigate} />
      </div>
    </div>
  );
}
