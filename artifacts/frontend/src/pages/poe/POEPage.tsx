import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, Lightbulb, RefreshCw, XCircle } from "lucide-react";
import type { PoeOpportunity, PoeRecommendation } from "./poe-types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Falha na requisição: ${response.status}`);
  }
  return response.json();
}

function RecommendationList({ opportunityId }: { opportunityId: string }) {
  const queryClient = useQueryClient();
  const recommendations = useQuery<PoeRecommendation[]>({
    queryKey: ["poe-recommendations", opportunityId],
    queryFn: () => fetchJson(`/api/poe/opportunities/${encodeURIComponent(opportunityId)}/recommendations`),
  });

  const selectRecommendation = useMutation({
    mutationFn: (recommendationId: string) =>
      fetchJson(`/api/poe/recommendations/${encodeURIComponent(recommendationId)}/select`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["poe-recommendations", opportunityId] });
      queryClient.invalidateQueries({ queryKey: ["poe-opportunities"] });
    },
  });

  if (recommendations.isLoading) {
    return <div className="py-4 text-sm text-muted-foreground">Carregando recomendações reais…</div>;
  }

  if (recommendations.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Não foi possível carregar as recomendações desta oportunidade.
      </div>
    );
  }

  const items = recommendations.data ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Nenhuma recomendação real cadastrada para esta oportunidade.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((rec) => (
        <div key={rec.id} className="rounded-xl border bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-medium">{rec.productName || rec.companyName || "Recomendação"}</h4>
                {rec.companyName && rec.productName && <span className="text-xs text-muted-foreground">{rec.companyName}</span>}
                {rec.selected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Selecionada
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{rec.justification}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {rec.scoreOverall != null && <span className="rounded-md border px-2 py-1">Score {rec.scoreOverall}</span>}
                {rec.estimatedPrice && <span className="rounded-md border px-2 py-1">R$ {rec.estimatedPrice}{rec.priceUnit ? ` / ${rec.priceUnit}` : ""}</span>}
                {rec.leadTimeDays != null && <span className="rounded-md border px-2 py-1">Prazo {rec.leadTimeDays} dias</span>}
                {rec.region && <span className="rounded-md border px-2 py-1">{rec.region}</span>}
              </div>
              {rec.advantages?.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground">Vantagens: {rec.advantages.join(" · ")}</div>
              )}
              {rec.caveats?.length > 0 && (
                <div className="mt-2 text-xs text-amber-600">Atenções: {rec.caveats.join(" · ")}</div>
              )}
            </div>
            {!rec.selected && (
              <button
                type="button"
                disabled={selectRecommendation.isPending}
                onClick={() => selectRecommendation.mutate(rec.id)}
                className="min-h-10 shrink-0 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Selecionar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function POEPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const opportunities = useQuery<PoeOpportunity[]>({
    queryKey: ["poe-opportunities"],
    queryFn: () => fetchJson("/api/poe/opportunities"),
  });

  const dismissOpportunity = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/poe/opportunities/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["poe-opportunities"] }),
  });

  const filtered = useMemo(() => {
    const rows = opportunities.data ?? [];
    return statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter);
  }, [opportunities.data, statusFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Motor de Oportunidades</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Oportunidades e recomendações carregadas exclusivamente do backend real.</p>
        </div>
        <button
          type="button"
          onClick={() => opportunities.refetch()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${opportunities.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "detected", "analyzing", "ready", "quoted", "closed"].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${statusFilter === status ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {status === "all" ? "Todas" : status}
          </button>
        ))}
      </div>

      {opportunities.isLoading ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">Carregando oportunidades reais…</div>
      ) : opportunities.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Não foi possível carregar as oportunidades.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma oportunidade real encontrada para este filtro.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((opp) => {
            const expanded = expandedId === opp.id;
            return (
              <article key={opp.id} className="overflow-hidden rounded-2xl border bg-card">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : opp.id)}
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{opp.priority}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{opp.title}</h3>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{opp.status}</span>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{opp.type}</span>
                    </div>
                    {opp.description && <p className="mt-1 text-sm text-muted-foreground">{opp.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {opp.projectName && <span>{opp.projectName}</span>}
                      {opp.environment && <span>{opp.environment}</span>}
                      {opp.category && <span>{opp.category}</span>}
                    </div>
                  </div>
                  {expanded ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}
                </button>

                {expanded && (
                  <div className="space-y-4 border-t p-4">
                    {opp.justification && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Justificativa</div>
                        <p className="mt-1 text-sm leading-6">{opp.justification}</p>
                      </div>
                    )}
                    {opp.technicalBasis?.length > 0 && <div className="text-xs text-muted-foreground">Base técnica: {opp.technicalBasis.join(" · ")}</div>}
                    <RecommendationList opportunityId={opp.id} />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={dismissOpportunity.isPending}
                        onClick={() => dismissOpportunity.mutate(opp.id)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" /> Dispensar oportunidade
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default POEPage;
