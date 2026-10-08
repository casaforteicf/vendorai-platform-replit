import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateDeal, useGetLead, useListActivities, useListDeals, useListPipelineStages, useListTenantUsers, getGetLeadQueryKey, getListActivitiesQueryKey, getListDealsQueryKey, getListPipelineStagesQueryKey, getListTenantUsersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminDeleteLeadButton } from "@/components/AdminDeleteLeadButton";
import { PipelineStageFunctionAccess } from "@/components/PipelineStageFunctionAccess";
import { ArrowLeft, ArrowRight, AlertTriangle, BrainCircuit, Building2, Clock3, HandCoins, Headset, Loader2, Pencil, Sparkles, UserRound, WalletCards } from "lucide-react";

const LeadDetail = lazy(() => import("@/pages/LeadDetail"));
const DealParticipantsCard = lazy(() => import("@/components/DealParticipantsCard").then((m) => ({ default: m.DealParticipantsCard })));
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

type CommercialPartnershipSnap = {
  id: string;
  ownerTenantId: string;
  partnerTenantId: string;
  partnerName?: string | null;
  partnerTenantCode?: string | null;
  status: string;
  defaultCommissionPercent: string;
  defaultPermissions: string[];
  authorizedUserIds: string[];
  distributionMode: string;
};

type DealParticipationSnap = {
  id: string;
  dealId: string;
  ownerTenantId: string;
  partnerTenantId: string;
  partnershipId?: string | null;
  role: "responsible" | "participant";
  status: string;
  operationalUserId?: string | null;
  operationalUserName?: string | null;
  partnerName?: string | null;
  permissions: string[];
  commission?: {
    id: string;
    commissionType: "percent" | "fixed";
    percent: string;
    fixedAmount?: string | null;
    baseAmount: string;
    amount: string;
    paidAmount: string;
    status: string;
    dueAt?: string | null;
  } | null;
};

type PartnerUserSnap = {
  id: string;
  name?: string | null;
  email?: string | null;
  userFunction?: string | null;
};

type ResponsibilityUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  active?: boolean | null;
  platformRole?: string | null;
  userFunction?: string | null;
  customFunctionId?: string | null;
};

type ResponsibilityStage = {
  id?: string;
  key: string;
  label?: string | null;
  responsaveisFuncoes?: string[] | null;
};

function userCanOwnStage(user: ResponsibilityUser, stage?: ResponsibilityStage | null): boolean {
  if (user.active !== true) return false;
  if (user.platformRole === "super_admin" || user.platformRole === "tenant_admin" || user.userFunction === "administrador") return true;

  const configured = stage?.responsaveisFuncoes ?? [];
  if (configured.length === 0) return true;

  const refs = new Set<string>();
  if (user.userFunction) refs.add(`builtin:${user.userFunction}`);
  if (user.customFunctionId) refs.add(`custom:${user.customFunctionId}`);
  return configured.some((responsible) => refs.has(responsible));
}

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
  const { data: partnerships = [] } = useQuery<CommercialPartnershipSnap[]>({
    queryKey: ["commercial-partnerships", tenantId],
    enabled: Boolean(tenantId && token),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/commercial-partnerships`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Não foi possível carregar as empresas representantes.");
      return response.json();
    },
  });
  const { data: dealParticipations = [] } = useQuery<DealParticipationSnap[]>({
    queryKey: ["deal-participations", tenantId],
    enabled: Boolean(tenantId && token),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/deal-participations`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Não foi possível carregar a responsabilidade empresarial.");
      return response.json();
    },
  });
  const createDeal = useCreateDeal({ request });
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
  const activeParticipation = useMemo(
    () => deal ? dealParticipations.find((item) => item.dealId === deal.id && item.status === "active") ?? null : null,
    [deal, dealParticipations],
  );
  const ownerPartnerships = useMemo(
    () => partnerships.filter((item) => item.ownerTenantId === tenantId && item.status === "active"),
    [partnerships, tenantId],
  );

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
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [ownerEditorOpen, setOwnerEditorOpen] = useState(false);
  const [responsibilityEditorOpen, setResponsibilityEditorOpen] = useState(false);
  const [currentOwner, setCurrentOwner] = useState("");
  const [savingOwner, setSavingOwner] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [advancedHandoffOpen, setAdvancedHandoffOpen] = useState(false);
  const [selectedPartnershipId, setSelectedPartnershipId] = useState("");
  const [selectedPartnerUserId, setSelectedPartnerUserId] = useState("");
  const [partnerCommissionPercent, setPartnerCommissionPercent] = useState("15");
  const [commissionEditorOpen, setCommissionEditorOpen] = useState(false);
  const [savingRepresentation, setSavingRepresentation] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [payerAccount, setPayerAccount] = useState("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [payingCommission, setPayingCommission] = useState(false);
  const [pipelineTransferOpen, setPipelineTransferOpen] = useState(false);
  const [targetPipeline, setTargetPipeline] = useState("suporte");
  const [targetPipelineStage, setTargetPipelineStage] = useState("");
  const [transferOwner, setTransferOwner] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [movingPipeline, setMovingPipeline] = useState(false);

  const { data: partnerUsers = [] } = useQuery<PartnerUserSnap[]>({
    queryKey: ["commercial-partnership-users", selectedPartnershipId],
    enabled: Boolean(token && selectedPartnershipId),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/commercial-partnerships/${selectedPartnershipId}/users`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Não foi possível carregar os usuários da representante.");
      return response.json();
    },
  });

  const targetStage = stages.find((s) => s.key === nextStage);
  const targetStageAgent = (targetStage as { responsavelAgenteKey?: string | null } | undefined)?.responsavelAgenteKey ?? null;
  const targetStageAI = (targetStage as { aiConfig?: { mode?: string; allowedActions?: string[] } | null } | undefined)?.aiConfig ?? null;
  const targetAgentWillOperate = Boolean(
    targetStageAgent
    && targetStageAI?.mode === "autonoma"
    && ((targetStageAI.allowedActions ?? []).includes("create_activity") || (targetStageAI.allowedActions ?? []).includes("send_message"))
  );
  const eligibleUsers = useMemo(
    () => users.filter((candidate) => userCanOwnStage(candidate as ResponsibilityUser, targetStage as ResponsibilityStage | undefined)),
    [users, targetStage],
  );
  const { data: targetPipelineStages = [] } = useQuery<Array<{ id: string; key: string; label: string; ordem?: number; responsaveisFuncoes?: string[] | null }>>({
    queryKey: ["pipeline-stages", tenantId, targetPipeline],
    enabled: Boolean(tenantId && token && pipelineTransferOpen),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/pipeline-stages?pipeline=${encodeURIComponent(targetPipeline)}`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Não foi possível carregar as etapas da pipeline.");
      return response.json();
    },
  });
  const pipelineOptions = [
    { key: "comercial", label: "Comercial" },
    { key: "aquecimento", label: "Aquecimento" },
    { key: "parceiros", label: "Parceiros" },
    { key: "execucao", label: "Execução / Pedidos" },
    { key: "suporte", label: "Suporte" },
  ];
  useEffect(() => {
    if (!ownerEditorOpen) setCurrentOwner(deal?.assignedTo ?? lead?.assignedTo ?? "");
  }, [deal?.assignedTo, lead?.assignedTo, ownerEditorOpen]);
  const selectedTransferStage = targetPipelineStages.find((stage) => stage.key === targetPipelineStage) ?? null;
  const transferEligibleUsers = useMemo(
    () => users.filter((candidate) => userCanOwnStage(candidate as ResponsibilityUser, selectedTransferStage as ResponsibilityStage | null)),
    [users, selectedTransferStage],
  );

  useEffect(() => {
    const firstStage = [...targetPipelineStages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0];
    setTargetPipelineStage(firstStage?.key ?? "");
  }, [targetPipeline, targetPipelineStages]);

  useEffect(() => {
    if (!selectedTransferStage) return;
    const preferred = [deal?.assignedTo, user?.id].find((candidateId) =>
      Boolean(candidateId) && transferEligibleUsers.some((candidate) => candidate.id === candidateId)
    );
    setTransferOwner(preferred ?? transferEligibleUsers[0]?.id ?? "");
  }, [selectedTransferStage?.key, deal?.assignedTo, user?.id, transferEligibleUsers]);
  useEffect(() => {
    if (activeParticipation?.partnershipId) {
      setSelectedPartnershipId(activeParticipation.partnershipId);
      setSelectedPartnerUserId(activeParticipation.operationalUserId ?? "");
      setPartnerCommissionPercent(String(activeParticipation.commission?.percent ?? "15"));
      return;
    }
    const first = ownerPartnerships[0];
    setSelectedPartnershipId(first?.id ?? "");
    setSelectedPartnerUserId("");
    setPartnerCommissionPercent(String(first?.defaultCommissionPercent ?? "15"));
  }, [activeParticipation?.id, ownerPartnerships.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeParticipation) return;
    const partnership = ownerPartnerships.find((item) => item.id === selectedPartnershipId);
    if (partnership) setPartnerCommissionPercent(String(partnership.defaultCommissionPercent ?? "15"));
  }, [selectedPartnershipId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const nextStageConfig = stages.find((candidate) => candidate.key === stage) as ResponsibilityStage | undefined;
    const stageEligibleUsers = users.filter((candidate) => userCanOwnStage(candidate as ResponsibilityUser, nextStageConfig));
    const preferredOwner = [deal?.assignedTo, user?.id].find((candidateId) =>
      Boolean(candidateId) && stageEligibleUsers.some((candidate) => candidate.id === candidateId)
    );

    setNextStage(stage);
    setOwner(preferredOwner ?? stageEligibleUsers[0]?.id ?? "");
    setTitle(aiAction?.trim() || guidance[stage]?.[1] || "Dar continuidade ao atendimento");
    setDescription(aiReason?.trim() || "");
    setNote("");
    setDue(tomorrow());
    setAdvancedHandoffOpen(false);
    setOpen(true);
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

  async function saveRepresentationResponsibility() {
    if (!deal || !selectedPartnershipId) {
      toast({ title: "Selecione a empresa representante.", variant: "destructive" });
      return;
    }
    setSavingRepresentation(true);
    try {
      const response = await fetch(`/api/deals/${deal.id}/share-with-partner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          partnershipId: selectedPartnershipId,
          role: "responsible",
          operationalUserId: selectedPartnerUserId || null,
          commissionType: "percent",
          commissionPercent: Number(partnerCommissionPercent || 15),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atribuir a empresa representante.");
      await qc.invalidateQueries({ queryKey: ["deal-participations", tenantId] });
      setResponsibilityEditorOpen(false);
      toast({
        title: "Empresa definida como responsável",
        description: "O negócio foi compartilhado e a representante mantém acesso nas próximas etapas conforme as autonomias configuradas.",
      });
    } catch (error) {
      toast({ title: "Erro ao definir representante", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingRepresentation(false);
    }
  }

  async function saveIntercompanyCommission() {
    const commissionId = activeParticipation?.commission?.id;
    if (!commissionId) return;
    setSavingCommission(true);
    try {
      const response = await fetch(`/api/intercompany-commissions/${commissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          commissionType: "percent",
          percent: Number(partnerCommissionPercent || 15),
          reason: "Ajuste comercial no negócio",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível ajustar a comissão.");
      await qc.invalidateQueries({ queryKey: ["deal-participations", tenantId] });
      toast({ title: "Comissão atualizada", description: "A regra deste negócio foi atualizada sem alterar o padrão de 15% da parceria." });
    } catch (error) {
      toast({ title: "Erro ao ajustar comissão", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingCommission(false);
    }
  }

  async function payIntercompanyCommission() {
    const commission = activeParticipation?.commission;
    if (!commission?.id) return;
    const amount = Number(paymentAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !payerAccount.trim() || !beneficiaryAccount.trim()) {
      toast({ title: "Informe valor e as duas contas/caixas.", variant: "destructive" });
      return;
    }
    setPayingCommission(true);
    try {
      const response = await fetch(`/api/intercompany-commissions/${commission.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          amount,
          payerAccount: payerAccount.trim(),
          beneficiaryAccount: beneficiaryAccount.trim(),
          paymentMethod,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível registrar a baixa.");
      setPaymentAmount("");
      await qc.invalidateQueries({ queryKey: ["deal-participations", tenantId] });
      toast({ title: "Baixa registrada", description: "Saída e entrada foram lançadas nos financeiros dos dois tenants e o saldo da comissão foi atualizado." });
    } catch (error) {
      toast({ title: "Erro ao registrar pagamento", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setPayingCommission(false);
    }
  }

  async function transferPipeline() {
    if (!deal || !targetPipeline || !targetPipelineStage || !transferOwner || transferReason.trim().length < 5) {
      toast({ title: "Selecione a pipeline, a etapa, o responsável e informe a justificativa.", variant: "destructive" });
      return;
    }

    setMovingPipeline(true);
    try {
      const response = await fetch("/api/deals/" + deal.id + "/transfer-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          targetPipeline,
          targetStage: targetPipelineStage,
          responsavelId: transferOwner,
          justificativa: transferReason.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? result.message ?? "Não foi possível mover o lead.");

      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }),
        qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
        qc.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) }),
      ]);

      setOpen(false);
      setPipelineTransferOpen(false);
      setTransferReason("");
      toast({
        title: "Lead movido",
        description: `Destino: ${pipelineOptions.find((item) => item.key === targetPipeline)?.label ?? targetPipeline} / ${result?.destination?.stageLabel ?? targetPipelineStage}. A justificativa foi registrada no histórico.`,
      });

      const workCardId = result?.workCard?.id;
      if (workCardId && ["execucao", "suporte"].includes(targetPipeline)) {
        navigate(`/pipeline-operacional/${targetPipeline}?card=${encodeURIComponent(workCardId)}`);
      } else if (["aquecimento", "parceiros"].includes(targetPipeline)) {
        navigate(`/pipeline-relacionamento/${targetPipeline}`);
      }
    } catch (error) {
      toast({
        title: "Erro ao mover lead",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setMovingPipeline(false);
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
                    {activeParticipation?.role === "responsible" ? <Building2 className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    Responsável: {activeParticipation?.role === "responsible" ? (activeParticipation.partnerName || "Empresa representante") : displayUser(deal?.assignedTo ?? lead.assignedTo)}
                    {activeParticipation?.role === "responsible" && activeParticipation.operationalUserName ? <span className="text-muted-foreground">· Executor: {activeParticipation.operationalUserName}</span> : null}
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
          <div className="flex shrink-0 items-center gap-2">
            {deal
              ? <Button className="shrink-0" onClick={showAdvance}>Avançar atendimento <ArrowRight className="ml-2 h-4 w-4" /></Button>
              : <Button className="shrink-0" disabled={createDeal.isPending} onClick={startAttendance}>{createDeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar atendimento</Button>}
            <AdminDeleteLeadButton leadId={lead.id} leadName={lead.nome} redirectTo="/leads" compact={false} />
          </div>
        </div>
      </CardContent>
    </Card>

    {deal && (
      <Suspense fallback={<Card className="border-border/70 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando envolvidos...</div></CardContent></Card>}>
        <DealParticipantsCard tenantId={tenantId} dealId={deal.id} token={token} />
      </Suspense>
    )}

    {deal && canEditOwner && (
      activeParticipation && !responsibilityEditorOpen ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setResponsibilityEditorOpen(true)}>
            <Building2 className="mr-1.5 h-4 w-4" />
            Responsável / empresa
          </Button>
        </div>
      ) : (
        <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-cyan-700" />
                        <p className="text-sm font-semibold">Responsabilidade empresarial</p>
                        {activeParticipation?.role === "responsible" && <Badge variant="secondary">Empresa responsável</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Compartilhe este negócio com uma empresa representante sem duplicar usuários entre tenants.</p>
                    </div>
                  </div>
        
                  {ownerPartnerships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma empresa representante ativa foi vinculada a este tenant.</p>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_160px_auto] lg:items-end">
                      <div className="space-y-1.5">
                        <Label>Empresa representante</Label>
                        <Select value={selectedPartnershipId} onValueChange={setSelectedPartnershipId}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {ownerPartnerships.map((partnership) => (
                              <SelectItem key={partnership.id} value={partnership.id}>
                                {partnership.partnerName || partnership.partnerTenantCode || partnership.partnerTenantId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Executor na representante</Label>
                        <Select value={selectedPartnerUserId || "__queue__"} onValueChange={(value) => setSelectedPartnerUserId(value === "__queue__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Fila da empresa" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__queue__">Fila da empresa / definir depois</SelectItem>
                            {partnerUsers.map((partnerUser) => (
                              <SelectItem key={partnerUser.id} value={partnerUser.id}>
                                {partnerUser.name || partnerUser.email || partnerUser.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Button type="button" variant="ghost" className="h-9 px-2 text-muted-foreground" onClick={() => setCommissionEditorOpen((value) => !value)}>
                          <HandCoins className="mr-2 h-4 w-4" />
                          {commissionEditorOpen ? "Ocultar comissão" : activeParticipation ? "Editar comissão" : "Configurar comissão"}
                        </Button>
                        {commissionEditorOpen && (
                          <div className="space-y-1.5 rounded-md border bg-muted/20 p-2">
                            <Label>Comissão do negócio</Label>
                            <div className="relative">
                              <Input type="number" min="0" max="100" step="0.01" value={partnerCommissionPercent} onChange={(event) => setPartnerCommissionPercent(event.target.value)} className="pr-8" />
                              <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Informação restrita a usuários autorizados. O padrão da parceria pode ser ajustado por negócio.</p>
                          </div>
                        )}
                      </div>
                      <Button type="button" onClick={saveRepresentationResponsibility} disabled={savingRepresentation || !selectedPartnershipId}>
                        {savingRepresentation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {activeParticipation ? "Atualizar responsabilidade" : "Definir como responsável"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
      )
    )}

    {deal && activeParticipation?.commission && canEditOwner && (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Comissão da empresa representante</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCommissionEditorOpen((value) => !value)}>
              {commissionEditorOpen ? "Ocultar comissão" : "Editar comissão"}
            </Button>
          </div>

          {commissionEditorOpen && (
            <div className="mt-4 border-t pt-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{activeParticipation.partnerName || "Empresa representante"}</p>
                  <Badge variant="outline" className="mt-1">{activeParticipation.commission.status.replaceAll("_", " ")}</Badge>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold">{Number(activeParticipation.commission.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                  <p className="text-muted-foreground">
                    Pago {Number(activeParticipation.commission.paidAmount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ·
                    Saldo {Math.max(0, Number(activeParticipation.commission.amount || 0) - Number(activeParticipation.commission.paidAmount || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-[180px_auto] md:items-end">
                <div className="space-y-1.5">
                  <Label>Percentual acordado</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={partnerCommissionPercent} onChange={(event) => setPartnerCommissionPercent(event.target.value)} />
                </div>
                <Button type="button" variant="outline" className="w-fit" onClick={saveIntercompanyCommission} disabled={savingCommission}>
                  {savingCommission && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar comissão
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <WalletCards className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Registrar baixa parcial</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 lg:items-end">
                  <div className="space-y-1.5">
                    <Label>Valor pago</Label>
                    <Input inputMode="decimal" placeholder="0,00" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Conta/caixa pagador</Label>
                    <Input placeholder="Ex.: Sicredi" value={payerAccount} onChange={(event) => setPayerAccount(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Conta/caixa recebedor</Label>
                    <Input placeholder="Ex.: Banco do Brasil" value={beneficiaryAccount} onChange={(event) => setBeneficiaryAccount(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Forma</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">Pix</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" onClick={payIntercompanyCommission} disabled={payingCommission}>
                    {payingCommission && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Dar baixa
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Cada baixa gera saída no financeiro do pagador, entrada no financeiro da representante e mantém o saldo restante previsto.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )}

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

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => setAdvancedHandoffOpen((v) => !v)}>
              {advancedHandoffOpen ? "Ocultar ajustes" : "Editar antes de avançar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-cyan-200 text-cyan-800 hover:bg-cyan-50 hover:text-cyan-900"
              onClick={() => setPipelineTransferOpen((value) => !value)}
            >
              <Headset className="mr-2 h-4 w-4" />
              {pipelineTransferOpen ? "Ocultar movimentação" : "Mover para outra pipeline"}
            </Button>
          </div>

          {pipelineTransferOpen && (
            <div className="grid gap-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-900">
                  <Headset className="h-4 w-4" />
                  Mover lead para outra pipeline
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Escolha a pipeline de destino, a posição dentro dela e registre obrigatoriamente o motivo da movimentação. O histórico anterior é preservado.
                </p>
              </div>
              <Field label="Pipeline de destino">
                <Select value={targetPipeline} onValueChange={setTargetPipeline}>
                  <SelectTrigger><SelectValue placeholder="Selecione a pipeline" /></SelectTrigger>
                  <SelectContent>
                    {pipelineOptions.map((pipeline) => (
                      <SelectItem key={pipeline.key} value={pipeline.key}>{pipeline.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Posição / etapa de destino">
                <Select value={targetPipelineStage} onValueChange={setTargetPipelineStage}>
                  <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                  <SelectContent>
                    {[...targetPipelineStages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((stage) => (
                      <SelectItem key={stage.id} value={stage.key}>{stage.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Responsável após a movimentação">
                <Select value={transferOwner} onValueChange={setTransferOwner}>
                  <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                  <SelectContent>
                    {transferEligibleUsers.map((targetUser) => (
                      <SelectItem key={targetUser.id} value={targetUser.id}>
                        {targetUser.name || targetUser.email || targetUser.id}
                      </SelectItem>
                    ))}
                    {transferEligibleUsers.length === 0 && (
                      <SelectItem value="__none_available__" disabled>Nenhum responsável elegível para esta etapa</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Justificativa da movimentação *">
                <Textarea
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  placeholder="Explique por que este lead está sendo movido para outra pipeline/etapa."
                />
              </Field>
              <Button
                type="button"
                onClick={transferPipeline}
                disabled={movingPipeline || !targetPipelineStage || !transferOwner || transferReason.trim().length < 5}
              >
                {movingPipeline && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar movimentação
              </Button>
            </div>
          )}

          {advancedHandoffOpen && (
            <div className="grid gap-4 rounded-xl border p-4">
              <Field label="Nova etapa">
                <Select value={nextStage} onValueChange={(v) => {
                  setNextStage(v);
                  const selectedStage = stages.find((candidate) => candidate.key === v) as ResponsibilityStage | undefined;
                  const nextEligible = users.filter((candidate) => userCanOwnStage(candidate as ResponsibilityUser, selectedStage));
                  if (!nextEligible.some((candidate) => candidate.id === owner)) {
                    const preferred = [deal?.assignedTo, user?.id].find((candidateId) =>
                      Boolean(candidateId) && nextEligible.some((candidate) => candidate.id === candidateId)
                    );
                    setOwner(preferred ?? nextEligible[0]?.id ?? "");
                  }
                  if (!fullIntelligence?.health?.nextBestAction && !fullIntelligence?.profile?.nextBestAction) setTitle(guidance[v]?.[1] ?? "Dar continuidade ao atendimento");
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{stages.filter((s, index) => {
                    if (deal?.etapa === "em_aquecimento") return s.key === "novo";
                    if (s.key === "perdido") return s.key !== deal?.etapa;
                    return index > currentIndex && !["em_aquecimento", "parceiro"].includes(s.key);
                  }).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>

              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Responsável</Label>
                  {canEditOwner && targetStage ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Configurar responsáveis da etapa</span>
                      <PipelineStageFunctionAccess
                        tenantId={tenantId}
                        pipeline="comercial"
                        stageId={targetStage.id}
                        value={(targetStage as ResponsibilityStage).responsaveisFuncoes ?? []}
                        agentValue={(targetStage as { responsavelAgenteKey?: string | null }).responsavelAgenteKey ?? null}
                        className="w-40"
                      />
                    </div>
                  ) : null}
                </div>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {eligibleUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
                    {eligibleUsers.length === 0 && (
                      <SelectItem value="__none_available__" disabled>Nenhum responsável elegível para esta etapa</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  A lista usa a mesma regra oficial da etapa e do servidor. Administradores ativos podem assumir qualquer etapa; sem funções configuradas, a etapa fica sem restrição por função.
                </p>
                {activeParticipation?.role === "responsible" && (
                  <p className="rounded-md border border-cyan-200 bg-cyan-50/50 px-3 py-2 text-[11px] text-cyan-900">
                    Empresa responsável preservada: {activeParticipation.partnerName || "empresa representante"}
                    {activeParticipation.operationalUserName ? ` · executor ${activeParticipation.operationalUserName}` : ""}. O avanço não remove esse vínculo.
                  </p>
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
