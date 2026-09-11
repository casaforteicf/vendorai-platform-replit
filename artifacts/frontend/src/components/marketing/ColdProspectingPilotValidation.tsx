import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, ChevronDown, ExternalLink, FileSearch, Loader2, RefreshCw, ShieldCheck, Target } from "lucide-react";

type Evidence = {
  key?: string;
  label?: string;
  value?: unknown;
  source?: string;
  confidence?: string;
};

type ValidationStage = "ready_for_outreach" | "ready_for_validation" | "needs_enrichment" | "below_validation_score";

type PilotProspect = {
  id: string;
  name: string;
  contact: string | null;
  city: string | null;
  segment: string | null;
  source: string | null;
  enrichmentStatus: string | null;
  propensityScore: number;
  fitScore: number;
  painScore: number;
  intentScore: number;
  dossierStatus: string;
  validationStage: ValidationStage;
  validationCriteria: { minFit: number; minPropensity: number; minEvidence: number };
  evidenceCount: number;
  evidence: Evidence[];
  lpUrl: string | null;
  blockingReasons: string[];
  validationBlockingReasons: string[];
  priorityReason: string | null;
  nextAction: string | null;
  lastActivity: {
    type: string;
    title: string;
    description: string | null;
    status: string;
    at: string;
  } | null;
  createdAt: string;
};

type ValidationResponse = { prospects: PilotProspect[]; limit: number; error?: string };

function authHeaders(json = false) {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function stageLabel(stage: ValidationStage) {
  if (stage === "ready_for_outreach") return "Pronto para abordar";
  if (stage === "ready_for_validation") return "Pronto para validar";
  if (stage === "needs_enrichment") return "Falta informação";
  return "Abaixo do mínimo";
}

function stageVariant(stage: ValidationStage): "default" | "secondary" | "outline" | "destructive" {
  if (stage === "ready_for_outreach") return "default";
  if (stage === "ready_for_validation") return "secondary";
  if (stage === "needs_enrichment") return "outline";
  return "destructive";
}

function nextStepText(prospect: PilotProspect) {
  if (prospect.validationStage === "ready_for_outreach") {
    return prospect.lpUrl ? "LP pronta. Próximo passo: aprovar abordagem." : "Preparar LP para concluir a validação.";
  }
  if (prospect.validationStage === "ready_for_validation") {
    return prospect.lpUrl ? "LP pronta para revisão." : "Preparar LP para revisar antes do envio.";
  }
  if (prospect.validationStage === "needs_enrichment") {
    return prospect.validationBlockingReasons[0] ?? "Completar os dados deste prospect.";
  }
  return prospect.validationBlockingReasons[0] ?? "Prospect ainda abaixo dos critérios do piloto.";
}

export default function ColdProspectingPilotValidation() {
  const { user, tenantOverride } = useAuth();
  const isSuperAdmin = user?.platformRole === "super_admin";
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [prospects, setProspects] = useState<PilotProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparingLeadId, setPreparingLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = isSuperAdmin ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const response = await fetch(`/api/prospector/pilot-validation${params}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as ValidationResponse;
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar validação");
      setProspects(data.prospects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar validação");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, tenantId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => ({
    ready: prospects.filter((item) => item.validationStage === "ready_for_outreach").length,
    validate: prospects.filter((item) => item.validationStage === "ready_for_validation").length,
    enrich: prospects.filter((item) => item.validationStage === "needs_enrichment").length,
    below: prospects.filter((item) => item.validationStage === "below_validation_score").length,
  }), [prospects]);

  async function prepareLp(prospect: PilotProspect) {
    setPreparingLeadId(prospect.id);
    setError(null);
    try {
      const response = await fetch(`/api/prospector/pilot-validation/${encodeURIComponent(prospect.id)}/lp`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(isSuperAdmin ? { tenantId } : {}),
      });
      const data = await response.json().catch(() => ({})) as { lpUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao preparar LP");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preparar LP");
    } finally {
      setPreparingLeadId(null);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Próximo passo da prospecção</CardTitle>
            <CardDescription>Veja quem já pode avançar e o que falta em cada prospect. Os detalhes técnicos ficam recolhidos.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
          </Button>
        </div>

        {prospects.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Prontos para abordar</p><p className="text-2xl font-semibold">{summary.ready}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Prontos para validar</p><p className="text-2xl font-semibold">{summary.validate}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Faltam dados</p><p className="text-2xl font-semibold">{summary.enrich}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Abaixo do mínimo</p><p className="text-2xl font-semibold">{summary.below}</p></div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error}</div>
        )}

        {loading && prospects.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando prospects…</div>
        ) : prospects.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FileSearch className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Ainda não há prospects para validar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {prospects.map((prospect, index) => {
              const canPrepare = prospect.validationStage === "ready_for_validation" || prospect.validationStage === "ready_for_outreach";
              return (
                <div key={prospect.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">#{index + 1}</span>
                        <p className="font-semibold">{prospect.name}</p>
                        <Badge variant={stageVariant(prospect.validationStage)}>{stageLabel(prospect.validationStage)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{prospect.city ?? prospect.segment ?? "Localidade em enriquecimento"}{prospect.contact ? ` · ${prospect.contact}` : ""}</p>
                      <p className="mt-2 text-sm font-medium">{nextStepText(prospect)}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {prospect.lpUrl ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={prospect.lpUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Abrir LP</a>
                        </Button>
                      ) : canPrepare ? (
                        <Button size="sm" onClick={() => void prepareLp(prospect)} disabled={preparingLeadId === prospect.id}>
                          {preparingLeadId === prospect.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Target className="mr-1.5 h-4 w-4" />}Preparar LP
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <details className="mt-3 border-t pt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
                      <ChevronDown className="h-3.5 w-3.5" />Ver detalhes da análise
                    </summary>
                    <div className="mt-3 grid gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border p-2"><span className="text-muted-foreground">Fit</span><div className="font-semibold">{prospect.fitScore}/100</div></div>
                      <div className="rounded-md border p-2"><span className="text-muted-foreground">Pain</span><div className="font-semibold">{prospect.painScore}/100</div></div>
                      <div className="rounded-md border p-2"><span className="text-muted-foreground">Propensão</span><div className="font-semibold">{prospect.propensityScore}/100</div></div>
                      <div className="rounded-md border p-2"><span className="text-muted-foreground">Intent</span><div className="font-semibold">{Math.round(prospect.intentScore)}/100</div></div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border p-3 text-xs">
                        <p className="font-medium">Evidências ({prospect.evidenceCount})</p>
                        <div className="mt-2 space-y-1 text-muted-foreground">
                          {prospect.evidence.length > 0
                            ? prospect.evidence.slice(0, 4).map((evidence, evidenceIndex) => (
                                <p key={`${prospect.id}-${evidenceIndex}`}>{evidence.label ?? evidence.key ?? "Evidência pública"}{evidence.source ? ` · ${evidence.source}` : ""}</p>
                              ))
                            : <p>Nenhuma evidência registrada ainda.</p>}
                        </div>
                      </div>
                      <div className="rounded-md border p-3 text-xs">
                        <p className="font-medium">Histórico</p>
                        <p className="mt-2 text-muted-foreground">Última ação</p>
                        <p>{prospect.lastActivity?.title ?? "Nenhuma atividade registrada"}</p>
                        <p className="mt-2 text-muted-foreground">Próxima ação</p>
                        <p>{prospect.nextAction ?? nextStepText(prospect)}</p>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
