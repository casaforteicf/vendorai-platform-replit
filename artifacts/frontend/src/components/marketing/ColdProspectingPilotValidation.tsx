import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, Loader2, RefreshCw, ShieldCheck, Target } from "lucide-react";

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
  if (stage === "ready_for_outreach") return "Pronto para abordagem";
  if (stage === "ready_for_validation") return "Pronto para validar";
  if (stage === "needs_enrichment") return "Precisa enriquecer";
  return "Abaixo do mínimo";
}

function dossierLabel(status: string) {
  if (status === "ready_for_outreach") return "Gate automático aprovado";
  if (status === "needs_more_data") return "Dados incompletos";
  if (status === "below_score") return "Aguardando score automático";
  return "Montando dossiê";
}

function scoreTone(value: number) {
  if (value >= 70) return "font-semibold";
  if (value >= 40) return "font-medium";
  return "text-muted-foreground";
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Validação do piloto</CardTitle>
            <CardDescription>50+ de propensão pode preparar LP para revisão; 80 continua sendo o corte do disparo automático.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error}</div>
        )}
        {loading && prospects.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando os primeiros prospects…</div>
        ) : prospects.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FileSearch className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Ainda não há prospects do novo piloto.</p>
            <p className="mt-1 text-xs text-muted-foreground">Assim que o Prospector importar o primeiro lote, os cards aparecem aqui automaticamente.</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-5">
            {prospects.map((prospect, index) => {
              const canPrepare = prospect.validationStage === "ready_for_validation" || prospect.validationStage === "ready_for_outreach";
              const needsEnrichment = prospect.validationStage === "needs_enrichment";
              const outreachReady = prospect.validationStage === "ready_for_outreach";
              const reviewing = prospect.validationStage === "ready_for_validation";
              return (
                <div key={prospect.id} className="rounded-xl border bg-background p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Prospect {index + 1}</p>
                      <p className="truncate font-semibold" title={prospect.name}>{prospect.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{prospect.city ?? prospect.segment ?? "Localidade em enriquecimento"}</p>
                    </div>
                    <Badge variant={outreachReady ? "default" : reviewing ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                      {stageLabel(prospect.validationStage)}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border p-2"><span className="text-muted-foreground">Fit</span><div className={scoreTone(prospect.fitScore)}>{prospect.fitScore}/100</div></div>
                    <div className="rounded-md border p-2"><span className="text-muted-foreground">Pain</span><div className={scoreTone(prospect.painScore)}>{prospect.painScore}/100</div></div>
                    <div className="rounded-md border p-2"><span className="text-muted-foreground">Propensão</span><div className={scoreTone(prospect.propensityScore)}>{prospect.propensityScore}/100</div></div>
                    <div className="rounded-md border p-2"><span className="text-muted-foreground">Intent</span><div className={scoreTone(prospect.intentScore)}>{Math.round(prospect.intentScore)}/100</div></div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Dossiê</span><span className="text-right font-medium">{dossierLabel(prospect.dossierStatus)}</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Evidências</span><span className="font-medium">{prospect.evidenceCount}</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Contato</span><span className="truncate font-medium">{prospect.contact ?? "não disponível"}</span></div>
                  </div>

                  {prospect.evidence.length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-3">
                      {prospect.evidence.slice(0, 3).map((evidence, evidenceIndex) => (
                        <div key={`${prospect.id}-${evidenceIndex}`} className="flex items-start gap-1.5 text-[11px]">
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="line-clamp-2">{evidence.label ?? evidence.key ?? "Evidência pública"}{evidence.source ? ` · ${evidence.source}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {needsEnrichment && prospect.validationBlockingReasons.length > 0 && (
                    <div className="mt-3 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
                      {prospect.validationBlockingReasons[0]}
                    </div>
                  )}

                  {reviewing && (
                    <div className="mt-3 rounded-md bg-primary/5 p-2 text-[11px] text-primary">
                      Critérios do piloto atingidos. Pode preparar a LP para revisão sem disparar mensagem.
                    </div>
                  )}

                  <div className="mt-3 border-t pt-3 text-[11px]">
                    <p className="text-muted-foreground">Última ação</p>
                    <p className="line-clamp-2 font-medium">{prospect.lastActivity?.title ?? "Nenhuma atividade registrada"}</p>
                    <p className="mt-2 text-muted-foreground">Próxima ação</p>
                    <p className="line-clamp-2 font-medium">{prospect.nextAction ?? (reviewing ? "Preparar LP para revisão" : outreachReady ? "Aguardar execução do SDR" : "Completar qualificação")}</p>
                  </div>

                  <div className="mt-3 flex gap-2">
                    {prospect.lpUrl ? (
                      <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" asChild>
                        <a href={prospect.lpUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3 w-3" />Abrir LP</a>
                      </Button>
                    ) : canPrepare ? (
                      <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" disabled={preparingLeadId === prospect.id} onClick={() => void prepareLp(prospect)}>
                        {preparingLeadId === prospect.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Target className="mr-1.5 h-3 w-3" />}Preparar LP
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" disabled><Target className="mr-1.5 h-3 w-3" />LP pendente</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
