import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateDeal, useGetLead, useListActivities, useListDeals, useListPipelineStages, useListTenantUsers, useUpdatePipelineStage, getGetLeadQueryKey, getListActivitiesQueryKey, getListDealsQueryKey, getListPipelineStagesQueryKey, getListTenantUsersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, AlertTriangle, Clock3, Loader2, Pencil, Settings2, UserRound } from "lucide-react";

const LeadDetail = lazy(() => import("@/pages/LeadDetail"));
const StageQuestionsPanel = lazy(() => import("@/components/StageQuestionsPanel").then((m) => ({ default: m.StageQuestionsPanel })));

type WorkspaceStage = {
  id?: string;
  key: string;
  label: string;
  ordem: number;
  perguntas?: Array<{ id: string; texto: string }> | null;
  elegiveisUserIds?: string[] | null;
  atividadePadraoTitulo?: string | null;
  atividadePadraoDescricao?: string | null;
  atividadePadraoPrazoMinutos?: number | null;
};

const fallbackStages: WorkspaceStage[] = [
  { key: "em_aquecimento", label: "Em aquecimento", ordem: 0 },
  { key: "novo", label: "Novo", ordem: 10 },
  { key: "qualificado", label: "Qualificado", ordem: 30 },
  { key: "proposta", label: "Proposta", ordem: 40 },
  { key: "negociacao", label: "Negociação", ordem: 50 },
  { key: "conferencia_estoque", label: "Conferência de estoque", ordem: 60 },
  { key: "contrato", label: "Contrato", ordem: 65 },
  { key: "ganho", label: "Ganho", ordem: 70 },
  { key: "em_execucao", label: "Em execução", ordem: 80 },
  { key: "entregue", label: "Entregue", ordem: 90 },
  { key: "perdido", label: "Perdido", ordem: 100 },
];

const guidance: Record<string, [string, string]> = {
  novo: ["Primeiro contato", "Realizar primeiro contato"],
  em_aquecimento: ["Nutrição e relacionamento", "Fazer acompanhamento do lead"],
  qualificado: ["Diagnóstico · SPIN", "Preparar solução e proposta"],
  proposta: ["Solução e orçamento", "Apresentar proposta ao cliente"],
  negociacao: ["Negociação", "Retomar negociação"],
  conferencia_estoque: ["Conferência e fechamento", "Confirmar estoque e prazo"],
  contrato: ["Formalização", "Formalizar contrato"],
  ganho: ["Pedido confirmado", "Iniciar onboarding ou entrega"],
  em_execucao: ["Execução do combinado", "Atualizar andamento da execução"],
  entregue: ["Pós-venda", "Realizar contato de pós-venda"],
  perdido: ["Encerrado", "Programar tentativa de reativação"],
};

const pipelineDisplayLabel: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  proposta: "Orçamento",
  negociacao: "Negociação",
  conferencia_estoque: "Fechamento",
  contrato: "Contrato",
  ganho: "Pedido",
  perdido: "Perdido",
};

const pipelineDotClass: Record<string, string> = {
  novo: "bg-slate-600",
  qualificado: "bg-blue-600",
  proposta: "bg-violet-600",
  negociacao: "bg-amber-500",
  conferencia_estoque: "bg-indigo-600",
  contrato: "bg-sky-600",
  ganho: "bg-emerald-600",
  perdido: "bg-red-600",
};

const hiddenFromCommercialFlow = new Set(["em_aquecimento", "em_execucao", "entregue", "parceiro"]);

function deadlineFromNow(minutes = 24 * 60) {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function tomorrow() {
  return deadlineFromNow();
}

function formatDeadline(value?: string | null) {
  if (!value) return "Sem prazo definido";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Prazo inválido";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function LeadWorkspace() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  const canEditOwner = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin";
  const search = new URLSearchParams(window.location.search);
  const requestedDealId = search.get("dealId");
  const requestedStage = search.get("targetStage");
  const request = { headers: { Authorization: "Bearer " + token } };
  const enabled = Boolean(tenantId && token && id);
  const { data: lead, isLoading: leadLoading } = useGetLead(id, { query: { enabled: Boolean(id), queryKey: getGetLeadQueryKey(id), staleTime: 20_000, refetchOnWindowFocus: false } });
  const { data: deals = [], isLoading: dealsLoading } = useListDeals(tenantId, { leadId: id }, { request, query: { enabled, queryKey: getListDealsQueryKey(tenantId, { leadId: id }), staleTime: 20_000, refetchOnWindowFocus: false } });
  const { data: activities = [] } = useListActivities(tenantId, { leadId: id }, { request, query: { enabled, queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }), staleTime: 15_000, refetchOnWindowFocus: false } });
  const { data: users = [] } = useListTenantUsers(tenantId, { request, query: { enabled, queryKey: getListTenantUsersQueryKey(tenantId), staleTime: 60_000, refetchOnWindowFocus: false } });
  const { data: configuredStages = [] } = useListPipelineStages(tenantId, { request, query: { enabled, queryKey: getListPipelineStagesQueryKey(tenantId), staleTime: 60_000, refetchOnWindowFocus: false } });
  const createDeal = useCreateDeal({ request });
  const updateStage = useUpdatePipelineStage();
  const deal = useMemo(() => {
    const requested = deals.find((d) => d.id === requestedDealId);
    if (requested) return requested;

    const newestFirst = [...deals].reverse();
    const terminal = new Set(["ganho", "perdido", "entregue", "concluido", "cancelado"]);
    return newestFirst.find((d) => !terminal.has(d.etapa) && !["em_aquecimento", "parceiro"].includes(d.etapa))
      ?? newestFirst.find((d) => d.etapa === "em_aquecimento" && (d as typeof d & { relationshipStage?: string | null }).relationshipStage !== "aquecimento_retomado")
      ?? newestFirst.find((d) => !terminal.has(d.etapa))
      ?? newestFirst[0]
      ?? null;
  }, [deals, requestedDealId]);
  const stages = useMemo<WorkspaceStage[]>(() => [...(configuredStages.length ? (configuredStages as WorkspaceStage[]) : fallbackStages)].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)), [configuredStages]);
  const currentIndex = stages.findIndex((s) => s.key === deal?.etapa);
  const currentStage = stages[currentIndex];
  const visualStages = useMemo(() => {
    const commercial = stages.filter((stage) => !hiddenFromCommercialFlow.has(stage.key));
    if (currentStage && !commercial.some((stage) => stage.key === currentStage.key)) return [currentStage, ...commercial];
    return commercial;
  }, [currentStage, stages]);
  const initialNext = requestedStage ?? stages[currentIndex + 1]?.key ?? "";
  const pending = useMemo(() => activities
    .filter((a) => ["pendente", "planejado", "em_andamento"].includes(a.status))
    .sort((a, b) => new Date(a.dataVencimento ?? "9999").getTime() - new Date(b.dataVencimento ?? "9999").getTime()), [activities]);
  const nextPending = pending[0];
  const overduePendingCount = pending.filter((activity) => activity.dataVencimento && new Date(activity.dataVencimento).getTime() < Date.now()).length;
  const nextPendingOverdue = Boolean(nextPending?.dataVencimento && new Date(nextPending.dataVencimento).getTime() < Date.now());
  const displayUser = (uid?: string | null) => users.find((u) => u.id === uid)?.name ?? users.find((u) => u.id === uid)?.email ?? "Não definido";
  const initialActivityConfig = stages.find((stage) => stage.key === initialNext) as (typeof stages[number] & {
    atividadePadraoTitulo?: string | null;
    atividadePadraoDescricao?: string | null;
    atividadePadraoPrazoMinutos?: number | null;
  }) | undefined;
  const [open, setOpen] = useState(Boolean(requestedStage));
  const [nextStage, setNextStage] = useState(initialNext);
  const [owner, setOwner] = useState(deal?.assignedTo ?? "");
  const [title, setTitle] = useState(initialActivityConfig?.atividadePadraoTitulo?.trim() || guidance[initialNext]?.[1] || "Dar continuidade ao atendimento");
  const [due, setDue] = useState(deadlineFromNow(initialActivityConfig?.atividadePadraoPrazoMinutos ?? undefined));
  const [description, setDescription] = useState(initialActivityConfig?.atividadePadraoDescricao ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editEligible, setEditEligible] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [ownerEditorOpen, setOwnerEditorOpen] = useState(false);
  const [currentOwner, setCurrentOwner] = useState("");
  const [savingOwner, setSavingOwner] = useState(false);

  const targetStage = stages.find((s) => s.key === nextStage);
  const eligibleIds = (targetStage as { elegiveisUserIds?: string[] | null } | undefined)?.elegiveisUserIds ?? null;
  const eligibleUsers = eligibleIds && eligibleIds.length > 0 ? users.filter((u) => eligibleIds.includes(u.id)) : users;
  const [draftEligible, setDraftEligible] = useState<string[]>([]);
  useEffect(() => { setDraftEligible(eligibleIds ?? []); }, [nextStage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ownerEditorOpen) setCurrentOwner(deal?.assignedTo ?? lead?.assignedTo ?? "");
  }, [deal?.assignedTo, lead?.assignedTo, ownerEditorOpen]);

  function startAttendance() {
    if (!lead) return;
    createDeal.mutate(
      { data: { tenantId, leadId: id, titulo: "Atendimento - " + lead.nome, etapa: "novo" } },
      {
        onSuccess: async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }),
            qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
          ]);
          toast({ title: "Atendimento iniciado", description: "Defina agora o responsável e a próxima atividade." });
        },
        onError: () => toast({ title: "Erro ao iniciar atendimento", variant: "destructive" }),
      },
    );
  }

  async function saveStageAnswers(next: Record<string, string>) {
    if (!deal || !currentStage) return;
    setSavingAnswers(true);
    try {
      const merged = { ...(deal.respostasEtapas as Record<string, Record<string, string>> | undefined), [currentStage.key]: next };
      const response = await fetch("/api/deals/" + deal.id, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ respostasEtapas: merged }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? result.message ?? "Não foi possível salvar as respostas da etapa.");
      await qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) });
    } catch (error) {
      toast({ title: "Erro ao salvar respostas", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingAnswers(false);
    }
  }

  function applyStageActivityDefaults(stageKey: string) {
    const stage = stages.find((item) => item.key === stageKey) as (typeof stages[number] & {
      atividadePadraoTitulo?: string | null;
      atividadePadraoDescricao?: string | null;
      atividadePadraoPrazoMinutos?: number | null;
    }) | undefined;
    setTitle(stage?.atividadePadraoTitulo?.trim() || guidance[stageKey]?.[1] || "Dar continuidade ao atendimento");
    setDescription(stage?.atividadePadraoDescricao ?? "");
    setDue(deadlineFromNow(stage?.atividadePadraoPrazoMinutos ?? undefined));
  }

  function showAdvance() {
    const stage = deal?.etapa === "em_aquecimento"
      ? "novo"
      : (requestedStage ?? stages[currentIndex + 1]?.key ?? "");
    setNextStage(stage);
    setOwner(deal?.assignedTo ?? user?.id ?? "");
    applyStageActivityDefaults(stage);
    setEditEligible(false);
    setOpen(true);
  }

  function saveEligible() {
    if (!targetStage?.id) return;
    updateStage.mutate(
      { tenantId, id: targetStage.id, data: { elegiveisUserIds: draftEligible } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) });
          toast({ title: "Usuários habilitados atualizados para " + targetStage.label + "." });
          setEditEligible(false);
          if (draftEligible.length > 0 && !draftEligible.includes(owner)) setOwner(draftEligible[0]);
        },
        onError: () => toast({ title: "Erro ao salvar usuários habilitados", variant: "destructive" }),
      },
    );
  }

  async function saveCurrentOwner() {
    if (!currentOwner) {
      toast({ title: "Selecione um responsável.", variant: "destructive" });
      return;
    }
    setSavingOwner(true);
    try {
      const leadResponse = await fetch("/api/leads/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ assignedTo: currentOwner }),
      });
      const leadResult = await leadResponse.json().catch(() => ({}));
      if (!leadResponse.ok) throw new Error(leadResult.error ?? "Não foi possível atualizar o responsável do lead.");

      if (deal && deal.assignedTo !== currentOwner) {
        const dealResponse = await fetch("/api/deals/" + deal.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ assignedTo: currentOwner }),
        });
        const dealResult = await dealResponse.json().catch(() => ({}));
        if (!dealResponse.ok) throw new Error(dealResult.error ?? "Não foi possível atualizar o responsável do atendimento.");
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetLeadQueryKey(id) }),
        qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }),
        qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
      ]);
      setOwner(currentOwner);
      setOwnerEditorOpen(false);
      toast({ title: "Responsável atualizado", description: displayUser(currentOwner) + " agora é o responsável pelo atendimento." });
    } catch (e) {
      toast({ title: "Erro ao atualizar responsável", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingOwner(false);
    }
  }

  async function advance() {
    if (!deal || !nextStage || !owner || title.trim().length < 3) {
      toast({ title: "Preencha etapa, responsável e próxima atividade.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (deal.etapa === "em_aquecimento") {
        const response = await fetch("/api/deals/" + deal.id + "/resume-commercial", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({
            responsavelId: owner,
            atividadeTitulo: title.trim(),
            atividadeDescricao: description.trim() || undefined,
            dataVencimento: due ? new Date(due).toISOString() : undefined,
            observacaoPassagem: note.trim() || undefined,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message ?? result.error ?? "Não foi possível retomar o atendimento.");

        await Promise.all([
          qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }),
          qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
          qc.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) }),
        ]);
        await qc.refetchQueries({ queryKey: getListDealsQueryKey(tenantId) });
        setOpen(false);

        const activeDealId = result?.deal?.id as string | undefined;
        if (activeDealId && activeDealId !== deal.id) {
          const params = new URLSearchParams(window.location.search);
          params.set("dealId", activeDealId);
          params.delete("targetStage");
          navigate(window.location.pathname + "?" + params.toString());
        }

        toast({
          title: result.alreadyResumed ? "Atendimento já retomado" : "Novo ciclo comercial iniciado",
          description: "O Aquecimento ficou no histórico e a próxima atividade foi atribuída a " + displayUser(owner) + ".",
        });
        return;
      }

      const response = await fetch("/api/deals/" + deal.id, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ etapa: nextStage, handoff: { responsavelId: owner, atividadeTitulo: title.trim(), atividadeDescricao: description.trim() || undefined, dataVencimento: due ? new Date(due).toISOString() : undefined, observacaoPassagem: note.trim() || undefined } }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 202 && result.pendingApproval) {
        toast({ title: "Movimentação enviada para aprovação." });
        return;
      }
      if (!response.ok) throw new Error(result.message ?? result.error ?? "Não foi possível avançar.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }),
        qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
        qc.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) }),
      ]);
      await qc.refetchQueries({ queryKey: getListDealsQueryKey(tenantId) });
      setOpen(false);
      toast({ title: "Etapa avançada", description: "Próxima atividade atribuída a " + displayUser(owner) + "." });
    } catch (e) {
      toast({ title: "Erro ao avançar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (leadLoading || dealsLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Carregando" /></div>;
  if (!lead) return <Card><CardContent className="p-8 text-center">Lead não encontrado.</CardContent></Card>;

  return <div className="space-y-4">
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Voltar à Central de Trabalho" onClick={() => navigate("/trabalho")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Central de Trabalho</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{lead.nome}</h1>
                <Badge variant="secondary" className="h-5 px-2 text-[11px]">{currentStage?.label ?? deal?.etapa ?? "Sem negócio"}</Badge>
                {nextPendingOverdue && <Badge variant="destructive" className="h-5 px-2 text-[11px]">Atividade vencida</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                {ownerEditorOpen && canEditOwner ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />Responsável:</span>
                    <Select value={currentOwner} onValueChange={setCurrentOwner}>
                      <SelectTrigger className="h-8 min-w-[190px] bg-background text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" size="sm" className="h-8" disabled={savingOwner || !currentOwner} onClick={saveCurrentOwner}>
                      {savingOwner && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8" disabled={savingOwner} onClick={() => setOwnerEditorOpen(false)}>Cancelar</Button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5" />Responsável: {displayUser(deal?.assignedTo ?? lead.assignedTo)}
                    {canEditOwner && (
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                        title="Editar responsável"
                        aria-label="Editar responsável"
                        onClick={() => {
                          setCurrentOwner(deal?.assignedTo ?? lead.assignedTo ?? "");
                          setOwnerEditorOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )}
                {nextPending ? <>
                  <span>· Próxima atividade: {nextPending.titulo}</span>
                  <span className={`inline-flex items-center gap-1 ${nextPendingOverdue ? "font-medium text-destructive" : ""}`}><Clock3 className="h-3.5 w-3.5" />{formatDeadline(nextPending.dataVencimento)}</span>
                </> : <span className="font-medium text-amber-700">· Próxima atividade não definida</span>}
              </div>
            </div>
          </div>
          {deal
            ? <Button className="shrink-0" onClick={showAdvance}>Avançar atendimento <ArrowRight className="ml-2 h-4 w-4" /></Button>
            : <Button className="shrink-0" disabled={createDeal.isPending} onClick={startAttendance}>{createDeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar atendimento</Button>}
        </div>
      </CardContent>
    </Card>

    {deal && visualStages.length > 0 && (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-2.5">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
              {visualStages.map((stage) => {
                const active = stage.key === deal.etapa;
                const displayLabel = pipelineDisplayLabel[stage.key] ?? stage.label;
                return (
                  <div
                    key={stage.key}
                    data-testid={`pipeline-stage-${stage.key}`}
                    className={`w-[174px] rounded-lg border px-3 py-2.5 transition-colors ${active ? "border-primary/50 bg-primary/[0.035] ring-1 ring-primary/10" : "border-border/70 bg-card"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${pipelineDotClass[stage.key] ?? "bg-muted-foreground"}`} />
                      <span className={`truncate text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{displayLabel}</span>
                    </div>
                    <p className="mt-1 truncate pl-4 text-[11px] text-muted-foreground">{guidance[stage.key]?.[0] ?? "Etapa comercial"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    )}

    <Suspense fallback={null}>
      <StageQuestionsPanel
        tenantId={tenantId}
        stage={currentStage?.id ? currentStage as { id: string; key: string; label: string; perguntas?: Array<{ id: string; texto: string }> | null } : undefined}
        answers={(deal?.respostasEtapas as Record<string, Record<string, string>> | undefined)?.[currentStage?.key ?? ""] ?? {}}
        onSaveAnswers={saveStageAnswers}
        saving={savingAnswers}
      />
    </Suspense>

    <div className="[&>div>div:first-child]:hidden [&_[data-testid=section-journey-stage]]:hidden">
      <Suspense fallback={<div className="min-h-[220px]" aria-hidden="true" />}>
        <LeadDetail />
      </Suspense>
    </div>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Avançar e definir a sequência</DialogTitle>
          <DialogDescription>
            Confirme a próxima etapa, o responsável e a atividade que ficará pendente após esta passagem.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">Atual: <strong>{currentStage?.label ?? deal?.etapa}</strong> — responsável: <strong>{displayUser(deal?.assignedTo)}</strong></div>
          {pending.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Há {pending.length} atividade(s) pendente(s) neste lead{overduePendingCount > 0 ? `, sendo ${overduePendingCount} vencida(s)` : ""}. Ao avançar, elas continuam registradas; conclua ou cancele o que não fizer mais sentido para evitar uma fila duplicada.</span>
            </div>
          )}
          {(() => {
            const perguntas = currentStage?.perguntas ?? [];
            if (!perguntas.length) return null;
            const respostas = (deal?.respostasEtapas as Record<string, Record<string, string>> | undefined)?.[currentStage?.key ?? ""] ?? {};
            const faltando = perguntas.filter((p) => !respostas[p.id]?.trim()).length;
            if (faltando === 0) return null;
            return (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{faltando} pergunta(s) da etapa atual ({currentStage?.label}) ainda não foram respondidas. Você pode avançar mesmo assim, mas vale registrar antes se possível.</span>
              </div>
            );
          })()}
          <Field label="Nova etapa">
            <Select value={nextStage} onValueChange={(v) => { setNextStage(v); applyStageActivityDefaults(v); setEditEligible(false); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{stages.filter((s, index) => {
                if (deal?.etapa === "em_aquecimento") return s.key === "novo";
                if (s.key === "perdido") return s.key !== deal?.etapa;
                return index > currentIndex && !["em_aquecimento", "parceiro"].includes(s.key);
              }).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Responsável pela próxima atividade</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setEditEligible((v) => !v)}>
                <Settings2 className="h-3.5 w-3.5" /> Quem pode ser responsável nesta etapa
              </Button>
            </div>
            {editEligible && targetStage ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Marque quem pode ser escolhido como responsável quando um negócio chega em <strong>{targetStage.label}</strong>. Deixe tudo desmarcado para permitir qualquer usuário.</p>
                <div className="grid max-h-40 gap-1.5 overflow-y-auto">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={draftEligible.includes(u.id)} onCheckedChange={(checked) => setDraftEligible((prev) => checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))} />
                      {u.name || u.email || u.id}
                    </label>
                  ))}
                </div>
                <Button type="button" size="sm" disabled={updateStage.isPending} onClick={saveEligible}>{updateStage.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Salvar habilitados</Button>
              </div>
            ) : (
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{eligibleUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          <Field label="Próxima atividade"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Prazo"><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Orientações"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Observação da passagem"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={advance}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar passagem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}