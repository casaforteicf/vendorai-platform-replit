import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  FileSearch,
  Globe2,
  HardHat,
  Linkedin,
  MapPin,
  Megaphone,
  Network,
  Radar,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Upload,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type NavigationTarget = {
  mode: "empresas" | "obras";
  tab?: "busca" | "cnpj" | "anunciantes" | "fila" | "aprovacoes";
};

type SourceAvailability = "active" | "manual" | "planned";

type SourceItem = {
  key: string;
  label: string;
  description: string;
  availability: SourceAvailability;
  leadSources: string[];
  enabled: boolean;
  recommended: boolean;
  visible: boolean;
  canToggle: boolean;
};

type SourcesResponse = {
  segment: string | null;
  enabledSources: string[];
  explicitlyConfigured: boolean;
  sources: SourceItem[];
};

type Props = {
  onNavigate: (target: NavigationTarget) => void;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const ICONS: Record<string, typeof MapPin> = {
  google_places: MapPin,
  cnpj_cnae: FileSearch,
  meta_ads: Megaphone,
  revenue_scout: Sparkles,
  construction_radar: HardHat,
  imported_lists: Upload,
  website_research: Globe2,
  referrals: UsersRound,
  events: CalendarDays,
  marketplaces: ShoppingBag,
  manual_research: Search,
  linkedin: Linkedin,
  social_discovery: Network,
};

const TARGETS: Record<string, NavigationTarget | undefined> = {
  google_places: { mode: "empresas", tab: "busca" },
  cnpj_cnae: { mode: "empresas", tab: "cnpj" },
  meta_ads: { mode: "empresas", tab: "anunciantes" },
  construction_radar: { mode: "obras" },
  revenue_scout: { mode: "empresas", tab: "fila" },
  imported_lists: { mode: "empresas", tab: "fila" },
};

function availabilityLabel(value: SourceAvailability) {
  if (value === "active") return "Integração ativa";
  if (value === "manual") return "Fonte manual";
  return "Em preparação";
}

function availabilityClass(value: SourceAvailability) {
  if (value === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "manual") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function ProspectorSourcesPanel({ onNavigate }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ["prospector-sources"],
    queryFn: async () => {
      const response = await fetch("/api/prospector/sources", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar fontes do Prospecctor");
      return response.json() as Promise<SourcesResponse>;
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (enabledSources: string[]) => {
      const response = await fetch("/api/prospector/sources", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ enabledSources }),
      });
      const data = await response.json() as SourcesResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar fontes");
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["prospector-sources"], data);
      toast({ title: "Fontes do Prospecctor atualizadas" });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível atualizar as fontes",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  const sources = query.data?.sources ?? [];
  const visibleSources = useMemo(
    () => sources.filter((source) => showAll || source.visible),
    [showAll, sources],
  );
  const hiddenCount = sources.filter((source) => !source.visible).length;

  function toggleSource(key: string, enabled: boolean) {
    if (!query.data) return;
    const next = new Set(query.data.enabledSources);
    if (enabled) next.add(key);
    else next.delete(key);
    mutation.mutate([...next]);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4 text-primary" />
              Fontes de prospecção
            </CardTitle>
            <CardDescription>
              Ative apenas as fontes que fazem sentido para este tenant. Desativar uma fonte impede novas buscas automáticas daquele provider.
            </CardDescription>
          </div>
          {query.data?.segment ? (
            <Badge variant="outline" className="w-fit">
              Segmento: {query.data.segment}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {query.isLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Spinner className="mr-2 h-4 w-4" />
            Carregando fontes...
          </div>
        ) : query.isError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Não foi possível verificar as fontes agora. Nenhuma configuração foi alterada.
          </div>
        ) : (
          <>
            {visibleSources.map((source) => {
              const Icon = ICONS[source.key] ?? Building2;
              const target = TARGETS[source.key];
              const busy = mutation.isPending;

              return (
                <div
                  key={source.key}
                  className={`rounded-lg border p-3 transition-colors ${source.enabled ? "bg-primary/[0.025]" : "bg-background"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{source.label}</p>
                        <Badge variant="outline" className={`text-[10px] ${availabilityClass(source.availability)}`}>
                          {availabilityLabel(source.availability)}
                        </Badge>
                        {source.recommended && source.key === "construction_radar" ? (
                          <Badge variant="secondary" className="text-[10px]">Recomendada para o segmento</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {source.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {target && source.availability !== "planned" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => onNavigate(target)}
                          >
                            Abrir fonte
                          </Button>
                        ) : null}
                        {source.availability === "planned" ? (
                          <span className="text-[11px] text-muted-foreground">
                            Ainda não participa da automação.
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {source.enabled ? "Habilitada para este tenant" : "Desabilitada para este tenant"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
                      <Switch
                        checked={source.enabled}
                        disabled={!source.canToggle || busy}
                        onCheckedChange={(checked) => toggleSource(source.key, checked)}
                        aria-label={`${source.enabled ? "Desativar" : "Ativar"} ${source.label}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {hiddenCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowAll((current) => !current)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {showAll ? "Ocultar fontes fora do segmento" : `Mostrar ${hiddenCount} fonte(s) adicional(is)`}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
