import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, AlertTriangle, BrainCircuit, Clock3, Loader2, Pencil, Settings2, Sparkles, UserRound } from "lucide-react";

const LeadDetail = lazy(() => import("@/pages/LeadDetail"));
const StageQuestionsPanel = lazy(() => import("@/components/StageQuestionsPanel").then((m) => ({ default: m.StageQuestionsPanel })));

const fallbackStages = [
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

type FullIntelligenceResponse = {
  profile: null | {
    journeyStage?: string | null;
    intentAnalysis?: string | null;
    goalAnalysis?: string | null;
    opportunities?: string[] | null;
    nextBestAction?: string | null;
    nextBestActionReason?: string | null;
    lastAnalyzedAt?: string | null;
  };
  health: null | {
    score: number | null;
    status: "saudavel" | "atencao" | "alto_risco" | "critico" | null;
    riskType: string | null;
    riskLevel: string | null;
    trend: "melhorando" | "estavel" | "piorando" | null;
    confidence: number | null;
    dimensions: Record<string, number>;
    positiveSignals: Array<Record<string, unknown>>;
    negativeSignals: Array<Record<string, unknown>>;
    riskFactors: Array<Record<string, unknown>>;
    riskEvents: Array<Record<string, unknown>>;
    nextBestAction: string | null;
    nextBestActionReason: string | null;
  };
  dynamicQuestions: Array<{
    id: string;
    stageKey: string;
    questionText: string;
    objective: string | null;
    status: string;
    confidence: number | null;
  }>;
  events: Array<{ id: string; eventType?: string | null; title?: string | null; summary?: string | null; sourceModule?: string | null; occurredAt?: string | null; createdAt?: string | null }>;
  facts: Array<{ id: string; kind?: string | null; factKey?: string | null; value?: unknown; confidence?: number | null; createdAt?: string | null }>;
  snapshots: Array<{ id: string; healthScore?: number | null; riskType?: string | null; riskLevel?: string | null; riskTrend?: string | null; analysisConfidence?: number | null; createdAt?: string | null }>;
  sources: Array<{ id: string; sourceType?: string | null; sourceModule?: string | null; title?: string | null; sourceUrl?: string | null; capturedAt?: string | null }>;
};

function formatIntelligenceDate(value?: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function displayFactValue(value: unknown) {
  if (value == null) return "Sem valor";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return "Informação estruturada"; }
}

function tomorrow() {
  const d = new Date(Date.now() + 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
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
  const { data: fullIntelligence } = useQuery<FullIntelligenceResponse>({
    queryKey: ["customer-intelligence-v2", tenantId, id],
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/leads/${id}/intelligence/full`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Não foi possível carregar a inteligência do cliente.");
      return response.json();
    },
  });
  const createDeal = useCreateDeal({ request });
  const updateStage = useUpdatePipelineStage();
  const deal = useMemo(() => {
    const requested = deals.find((d) => d.id === requestedDealId);
    if (requested) return requested;

    const newestFirst = [...deals].reverse();
    const terminal = new Set(["ganho", "perdido", "entregue", "concluido", "cancelado"]);
    return newestFirst.find((d) => !terminal.has(d.etapa) && !["em_aquecimento", "parceiro"].includes(d.etapa))
      ?? newestFirst.find((d) => d.etapa === "em_aquecimento" && d.relationshipStage !== "aquecimento_retomado")
      ?? newestFirst.find((d) => !terminal.has(d.etapa))
      ?? newestFirst[0]
      ?? null;
  }, [deals, requestedDealId]);
  const stages = useMemo(() => [...(configuredStages.length ? configuredStages : fallbackStages)].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)), [configuredStages]);
  const currentIndex = stages.findIndex((s) => s.key === deal?.etapa);
  const currentStage = stages[currentIndex];
  const visualStages = useMemo(() => {
    const commercial = stages.filter((stage) => !hiddenFromCommercialFlow.has(stage.key));
    if (currentStage && !commercial.some((stage) => stage.key === currentStage.key)) return [currentStage, ...commercial];
    return commercial;
  }, [currentStage, stages]);
  const initialNext = requestedStage ?? stages[currentIndex + 1]?.key ?? "";
  const pending = useMemo(() => activities
    .filter((a) => ["pendente", "planejado"].includes(a.status) && (!deal || !a.dealId || a.dealId === deal.id))
    .sort((a, b) => new Date(a.dataVencimento ?? "9999").getTime() - new Date(b.dataVencimento ?? "9999").getTime()), [activities, deal]);
  const nextPending = pending[0];
  const overduePendingCount = pending.filter((activity) => activity.dataVencimento && new Date(activity.dataVencimento).getTime() < Date.now()).length;
  const nextPendingOverdue = Boolean(nextPending?.dataVencimento && new Date(nextPending.dataVencimento).getTime() < Date.now());
  const displayUser = (uid?: string | null) => users.find((u) => u.id === uid)?.name ?? users.find((u) => u.id === uid)?.email ?? "Não definido";
  const [open, setOpen] = useState(Boolean(requestedStage));
  const [nextStage, setNextStage] = useState(initialNext);
  const [owner, setOwner] = useState(deal?.assignedTo ?? "");
  const [title, setTitle] = useState(guidance[initialNext]?.[1] ?? "Dar continuidade ao atendimento");
  const [due, setDue] = useState(tomorrow());
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editEligible, setEditEligible] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [ownerEditorOpen, setOwnerEditorOpen] = useState(false);
  const [currentOwner, setCurrentOwner] = useState("");
  const [savingOwner, setSavingOwner] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [advancedHandoffOpen, setAdvancedHandoffOpen] = useState(false);

  const targetStage = stages.find((s) => s.key === nextStage);
  const targetStageAgent = (targetStage as { responsavelAgenteKey?: string | null } | undefined)?.responsavelAgenteKey ?? null;
  const targetStageAI = (targetStage as { aiConfig?: { mode?: string; allowedActions?: string[] } | null } | undefined)?.aiConfig ?? null;
  const targetAgentWillOperate = Boolean(
    targetStageAgent
    && targetStageAI?.mode === "autonoma"
    && ((targetStageAI.allowedActions ?? []).includes("create_activity") || (targetStageAI.allowedActions ?? []).includes("send_message"))
  );
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
      await qc.invalidateQueries({ queryKey: ["customer-intelligence-v2", tenantId, id] });
    } catch (error) {
      toast({ title: "Erro ao salvar respostas", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingAnswers(false);
    }
  }

  function showAdvance() {
    const stage = deal?.etapa === "em_aquecimento"
      ? "novo"
      : (requestedStage ?? stages[currentIndex + 1]?.key ?? "");
    const aiAction = fullIntelligence?.health?.nextBestAction ?? fullIntelligence?.profile?.nextBestAction;
    const aiReason = fullIntelligence?.health?.nextBestActionReason ?? fullIntelligence?.profile?.nextBestActionReason;

    setNextStage(stage);
    setOwner(deal?.assignedTo ?? user?.id ?? "");
    setTitle(aiAction?.trim() || guidance[stage]?.[1] || "Dar continuidade ao atendimento");
    setDescription(aiReason?.trim() || "");
    setNote("");
    setDue(tomorrow());
    setEditEligible(false);
    setAdvancedHandoffOpen(false);
    setOpen(true);
  }

  function saveEligible() {
    if (!targetStage) return;
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
        setOpen(false);
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

    {fullIntelligence?.health && (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Inteligência do Cliente</span>
                {fullIntelligence.health.score != null && (
                  <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                    Saúde {fullIntelligence.health.score}/100
                  </Badge>
                )}
                {fullIntelligence.health.trend && (
                  <Badge variant="outline" className="h-5 px-2 text-[11px]">
                    {fullIntelligence.health.trend === "melhorando" ? "↑ Melhorando" : fullIntelligence.health.trend === "piorando" ? "↓ Piorando" : "→ Estável"}
                  </Badge>
                )}
                {fullIntelligence.health.confidence != null && (
                  <span className="text-[11px] text-muted-foreground">Confiança {fullIntelligence.health.confidence}%</span>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Risco principal</p>
                  <p className="mt-1 text-sm font-medium">{fullIntelligence.health.riskType?.replace(/_/g, " ") ?? "Sem risco relevante"}</p>
                  {fullIntelligence.health.riskLevel && <p className="text-xs text-muted-foreground">Nível: {fullIntelligence.health.riskLevel}</p>}
                </div>
                <div className="sm:col-span-1 lg:col-span-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Próxima melhor ação</p>
                  <p className="mt-1 text-sm font-medium">{fullIntelligence.health.nextBestAction ?? "Aguardando dados suficientes para recomendar uma ação."}</p>
                  {fullIntelligence.health.nextBestActionReason && <p className="mt-0.5 text-xs text-muted-foreground">{fullIntelligence.health.nextBestActionReason}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
                <span>{fullIntelligence.events.length} evento(s) no histórico inteligente</span>
                <span>{fullIntelligence.facts.length} conhecimento(s) estruturado(s)</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary" onClick={() => setIntelligenceOpen(true)}>
                  Ver inteligência completa
                </Button>
              </div>
            </div>
            {deal && fullIntelligence.dynamicQuestions.some((question) => question.stageKey === deal.etapa && question.status === "pendente") && (
              <div className="w-full rounded-lg border border-primary/15 bg-primary/[0.025] p-3 lg:w-[330px]">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Vendi identificou lacunas nesta etapa
                </div>
                <div className="space-y-2">
                  {fullIntelligence.dynamicQuestions
                    .filter((question) => question.stageKey === deal.etapa && question.status === "pendente")
                    .slice(0, 3)
                    .map((question) => (
                      <div key={question.id}>
                        <p className="text-xs font-medium leading-snug">{question.questionText}</p>
                        {question.objective && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{question.objective}</p>}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )}

    <Suspense fallback={null}>
      <StageQuestionsPanel
        tenantId={tenantId}
        stage={currentStage}
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

    <Dialog open={intelligenceOpen} onOpenChange={setIntelligenceOpen}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />Inteligência completa do cliente</DialogTitle>
          <DialogDescription>Histórico, perfil, saúde, oportunidades e fontes que sustentam as análises do Vendi.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[74vh] overflow-y-auto px-6 pb-6">
          <Tabs defaultValue="resumo" className="pt-4">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="saude">Saúde</TabsTrigger>
              <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
              <TabsTrigger value="fontes">Fontes</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saúde</p><p className="mt-1 text-2xl font-semibold">{fullIntelligence?.health?.score ?? "—"}{fullIntelligence?.health?.score != null ? "/100" : ""}</p><p className="text-xs text-muted-foreground">{fullIntelligence?.health?.status?.replace(/_/g, " ") ?? "Sem análise"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Risco principal</p><p className="mt-1 text-sm font-semibold">{fullIntelligence?.health?.riskType?.replace(/_/g, " ") ?? "Nenhum identificado"}</p><p className="text-xs text-muted-foreground">{fullIntelligence?.health?.riskLevel ? "Nível " + fullIntelligence.health.riskLevel : "Sem nível calculado"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confiança</p><p className="mt-1 text-2xl font-semibold">{fullIntelligence?.health?.confidence ?? "—"}{fullIntelligence?.health?.confidence != null ? "%" : ""}</p><p className="text-xs text-muted-foreground">{fullIntelligence?.health?.trend ? "Tendência: " + fullIntelligence.health.trend : "Tendência não calculada"}</p></CardContent></Card>
              </div>
              <Card><CardContent className="p-4"><p className="text-xs font-semibold">Próxima melhor ação</p><p className="mt-2 text-sm">{fullIntelligence?.health?.nextBestAction ?? "Ainda não há uma ação recomendada."}</p>{fullIntelligence?.health?.nextBestActionReason && <p className="mt-1 text-xs text-muted-foreground">{fullIntelligence.health.nextBestActionReason}</p>}</CardContent></Card>
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Intenção atual</p><p className="mt-2 text-sm text-muted-foreground">{fullIntelligence?.profile?.intentAnalysis ?? "Ainda não identificada."}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Objetivo identificado</p><p className="mt-2 text-sm text-muted-foreground">{fullIntelligence?.profile?.goalAnalysis ?? "Ainda não identificado."}</p></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <div className="space-y-2">
                {(fullIntelligence?.events ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há eventos no Histórico Inteligente.</p>}
                {(fullIntelligence?.events ?? []).map((event) => (
                  <div key={event.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-sm font-medium">{event.title ?? event.eventType ?? "Evento"}</p>{event.summary && <p className="mt-1 text-xs text-muted-foreground">{event.summary}</p>}</div>
                      <span className="text-[11px] text-muted-foreground">{formatIntelligenceDate(event.occurredAt ?? event.createdAt)}</span>
                    </div>
                    {event.sourceModule && <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Fonte: {event.sourceModule}</p>}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="perfil" className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Jornada</p><p className="mt-2 text-sm text-muted-foreground">{fullIntelligence?.profile?.journeyStage ?? currentStage?.label ?? "Não identificada"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Última análise</p><p className="mt-2 text-sm text-muted-foreground">{formatIntelligenceDate(fullIntelligence?.profile?.lastAnalyzedAt)}</p></CardContent></Card>
              </div>
              <div className="space-y-2">
                {(fullIntelligence?.facts ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há conhecimentos estruturados.</p>}
                {(fullIntelligence?.facts ?? []).map((fact) => (
                  <div key={fact.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-[10px]">{fact.kind?.replace(/_/g, " ") ?? "informação"}</Badge><p className="text-xs font-semibold">{fact.factKey?.replace(/[._]/g, " ") ?? "Conhecimento"}</p>{fact.confidence != null && <span className="text-[10px] text-muted-foreground">Confiança {fact.confidence}%</span>}</div>
                    <p className="mt-2 break-words text-sm text-muted-foreground">{displayFactValue(fact.value)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="saude" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(fullIntelligence?.health?.dimensions ?? {}).map(([key, value]) => (
                  <Card key={key}><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</p><p className="mt-1 text-xl font-semibold">{value}/100</p></CardContent></Card>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Sinais positivos</p><div className="mt-2 space-y-2">{(fullIntelligence?.health?.positiveSignals ?? []).map((item, index) => <p key={index} className="text-sm text-muted-foreground">• {String(item.sinal ?? item.evidencia ?? "Sinal positivo")}</p>)}</div></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs font-semibold">Fatores de risco</p><div className="mt-2 space-y-2">{(fullIntelligence?.health?.riskFactors ?? []).map((item, index) => <p key={index} className="text-sm text-muted-foreground">• {String(item.fator ?? item.motivo ?? "Fator de risco")}</p>)}</div></CardContent></Card>
              </div>
              <Card><CardContent className="p-4"><p className="text-xs font-semibold">Evolução das análises</p><div className="mt-3 space-y-2">{(fullIntelligence?.snapshots ?? []).slice(0, 12).map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"><span className="text-xs">{formatIntelligenceDate(snapshot.createdAt)}</span><span className="text-xs text-muted-foreground">Saúde {snapshot.healthScore ?? "—"} · {snapshot.riskType?.replace(/_/g, " ") ?? "sem risco"} · {snapshot.riskTrend ?? "estável"}</span></div>)}</div></CardContent></Card>
            </TabsContent>

            <TabsContent value="oportunidades" className="mt-4">
              <div className="space-y-2">
                {(fullIntelligence?.profile?.opportunities ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma oportunidade adicional identificada até agora.</p>}
                {(fullIntelligence?.profile?.opportunities ?? []).map((opportunity, index) => <div key={index} className="flex items-start gap-2 rounded-lg border p-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-sm">{opportunity}</p></div>)}
              </div>
            </TabsContent>

            <TabsContent value="fontes" className="mt-4">
              <div className="space-y-2">
                {(fullIntelligence?.sources ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há fontes registradas.</p>}
                {(fullIntelligence?.sources ?? []).map((source) => (
                  <div key={source.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{source.title ?? source.sourceType ?? "Fonte"}</p><p className="mt-1 text-xs text-muted-foreground">{source.sourceModule ?? "origem não informada"} · {source.sourceType ?? "tipo não informado"}</p></div><span className="text-[11px] text-muted-foreground">{formatIntelligenceDate(source.capturedAt)}</span></div>
                    {source.sourceUrl && <p className="mt-2 break-all text-xs text-primary">{source.sourceUrl}</p>}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirmar próxima etapa</DialogTitle>
          <DialogDescription>
            O Vendor.ai preparou a sequência usando a etapa atual, o responsável e a inteligência disponível do lead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BrainCircuit className="h-4 w-4 text-primary" />
              Sugestão da IA
            </div>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Etapa</span>
                <strong className="text-right">{currentStage?.label ?? deal?.etapa} → {targetStage?.label ?? nextStage}</strong>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Responsável</span>
                <strong className="text-right">{displayUser(owner)}</strong>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Próxima ação</span>
                <strong className="max-w-[65%] text-right">{title}</strong>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Prazo</span>
                <strong className="text-right">{formatDeadline(due ? new Date(due).toISOString() : null)}</strong>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Execução</span>
                <strong className="text-right">
                  {targetAgentWillOperate ? `Agente IA · ${targetStageAgent}` : "Responsável humano"}
                </strong>
              </div>
            </div>
            {description && <p className="mt-3 rounded-lg bg-background/70 p-3 text-xs text-muted-foreground">{description}</p>}
          </div>

          {pending.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Há {pending.length} atividade(s) pendente(s){overduePendingCount > 0 ? `, sendo ${overduePendingCount} vencida(s)` : ""}. Elas serão preservadas no histórico.</span>
            </div>
          )}

          <Button type="button" variant="outline" onClick={() => setAdvancedHandoffOpen((v) => !v)}>
            {advancedHandoffOpen ? "Ocultar ajustes" : "Editar antes de avançar"}
          </Button>

          {advancedHandoffOpen && (
            <div className="grid gap-4 rounded-xl border p-4">
              <Field label="Nova etapa">
                <Select value={nextStage} onValueChange={(v) => { setNextStage(v); if (!fullIntelligence?.health?.nextBestAction && !fullIntelligence?.profile?.nextBestAction) setTitle(guidance[v]?.[1] ?? "Dar continuidade ao atendimento"); setEditEligible(false); }}>
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
                  <Label>Responsável</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setEditEligible((v) => !v)}>
                    <Settings2 className="h-3.5 w-3.5" /> Habilitados
                  </Button>
                </div>
                {editEligible && targetStage ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="grid max-h-40 gap-1.5 overflow-y-auto">
                      {users.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={draftEligible.includes(u.id)} onCheckedChange={(checked) => setDraftEligible((prev) => checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))} />
                          {u.name || u.email || u.id}
                        </label>
                      ))}
                    </div>
                    <Button type="button" size="sm" disabled={updateStage.isPending} onClick={saveEligible}>Salvar habilitados</Button>
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={advance}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar e avançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}
