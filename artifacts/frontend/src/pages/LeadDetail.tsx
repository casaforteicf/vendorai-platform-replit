import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useGetLead,
  getGetLeadQueryKey,
  useGetOrCreateLeadIntelligence,
  getGetOrCreateLeadIntelligenceQueryKey,
  useUpdateCustomerIntelligence,
  useAnalyzeLeadIntelligence,
  useListActivities,
  getListActivitiesQueryKey,
  useCreateActivity,
  useUpdateActivity,
  useListTenantConversations,
  getListTenantConversationsQueryKey,
  useListConversationMessages,
  getListConversationMessagesQueryKey,
  useUpdateLead,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useCreateConversation,
  useCreateDeal,
  useCreateMessage,
  getListDealsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Target,
  Brain,
  MapPin,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Check,
  TrendingUp,
  Sparkles,
  Loader2,
  Plus,
  Heart,
  Baby,
  CalendarDays,
  UserRound,
  Trash2,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 border-blue-200",
  qualificado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nao_qualificado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
  perdido: "bg-red-100 text-red-600 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  nao_qualificado: "Não qualificado",
  convertido: "Convertido",
  perdido: "Perdido",
};

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao_estavel: "União Estável",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
};

function calcularIdade(dataNascimento: string): string {
  const hoje = new Date();
  const nasc = new Date(dataNascimento + "T00:00:00");
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return `${idade} anos`;
}

function formatBirthday(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

const ACTIVITY_TIPO_LABELS: Record<string, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "Email",
  visita: "Visita",
  tarefa: "Tarefa",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  sms: "SMS",
  web_chat: "Web Chat",
};

function churnColor(risk: number | null | undefined): string {
  if (risk === null || risk === undefined) return "text-muted-foreground";
  if (risk > 70) return "text-red-600";
  if (risk >= 30) return "text-amber-600";
  return "text-emerald-600";
}

function churnProgressColor(risk: number | null | undefined): string {
  if (risk === null || risk === undefined) return "bg-muted";
  if (risk > 70) return "bg-red-500";
  if (risk >= 30) return "bg-amber-500";
  return "bg-emerald-500";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  // Date-only strings (YYYY-MM-DD) must be parsed as local time, not UTC.
  // new Date("1987-02-06") → UTC midnight → displays as 05/02 in UTC-3.
  // Adding "T00:00:00" forces local-time interpretation.
  const date = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConversationMessages({
  tenantId,
  conversationId,
}: {
  tenantId: string;
  conversationId: string;
}) {
  const { data: messages, isLoading } = useListConversationMessages(
    tenantId,
    conversationId,
    {
      query: {
        enabled: !!(tenantId && conversationId),
        queryKey: getListConversationMessagesQueryKey(tenantId, conversationId),
      },
    }
  );

  if (isLoading)
    return (
      <div className="space-y-2 pt-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );

  if (!messages?.length)
    return (
      <p className="text-xs text-muted-foreground pt-3">Nenhuma mensagem ainda.</p>
    );

  return (
    <div className="space-y-2 pt-3 max-h-64 overflow-y-auto">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.direcao === "saida" ? "justify-end" : "justify-start"}`}
          data-testid={`msg-${msg.id}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              msg.direcao === "saida"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            <p className="leading-snug">{msg.conteudo}</p>
            <p
              className={`text-[10px] mt-1 ${
                msg.direcao === "saida" ? "text-primary-foreground/70" : "text-muted-foreground"
              }`}
            >
              {formatDateTime(msg.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, setLocation] = useLocation();
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [editingChurnRisk, setEditingChurnRisk] = useState(false);
  const [churnRiskDraft, setChurnRiskDraft] = useState<string>("");

  const [editingNextBestAction, setEditingNextBestAction] = useState(false);
  const [nextBestActionDraft, setNextBestActionDraft] = useState<string>("");

  const [editingChurnReasons, setEditingChurnReasons] = useState(false);
  const [churnReasonsDraft, setChurnReasonsDraft] = useState<string[]>([]);

  // AI suggestions prompt — shown when AI returns new churn reasons but the rep
  // had manually edited them (server preserves rep edits, returns suggestions here)
  const [aiSuggestedReasons, setAiSuggestedReasons] = useState<string[] | null>(null);

  // Tracks whether a server-side analysis is already running (received a 409).
  // The button stays disabled and shows a spinner until the analysis completes.
  const [serverAnalysisRunning, setServerAnalysisRunning] = useState(false);
  // Snapshot of lastAnalyzedAt taken when the 409 was received, used to detect
  // when the in-flight analysis finishes (value changes → analysis done).
  const analysisSnapshotRef = useRef<string | null | undefined>(undefined);
  // Guards against double-firing auto-analysis (StrictMode + fast re-renders)
  const autoAnalyzeAttemptedRef = useRef(false);

  const { data: lead, isLoading: leadLoading } = useGetLead(id, {
    query: {
      enabled: !!id,
      queryKey: getGetLeadQueryKey(id),
    },
  });

  const { data: intelligence, isLoading: ciLoading, isFetching: ciRefetching } = useGetOrCreateLeadIntelligence(
    tenantId,
    id,
    {
      query: {
        enabled: !!(tenantId && id),
        queryKey: getGetOrCreateLeadIntelligenceQueryKey(tenantId, id),
        // Poll faster while waiting for a server-side analysis to finish
        refetchInterval: serverAnalysisRunning ? 5_000 : 30_000,
        refetchIntervalInBackground: false,
      },
    }
  );

  // Relative-time labels — re-computed every 60 s by the hook
  const churnReasonsEditedRelative = useRelativeTime(
    intelligence?.churnReasonsEditedAt,
    { addSuffix: true }
  );
  const lastAnalyzedRelative = useRelativeTime(intelligence?.lastAnalyzedAt);

  // Reset auto-analyze guard whenever the lead changes
  useEffect(() => {
    autoAnalyzeAttemptedRef.current = false;
  }, [id]);

  // Detect when the in-flight server-side analysis finishes by watching lastAnalyzedAt
  useEffect(() => {
    if (!serverAnalysisRunning) return;
    if (intelligence?.lastAnalyzedAt !== analysisSnapshotRef.current) {
      setServerAnalysisRunning(false);
    }
  }, [intelligence?.lastAnalyzedAt, serverAnalysisRunning]);

  const { toast } = useToast();

  const [editingLeadDados, setEditingLeadDados] = useState(false);
  const [leadDadosDraft, setLeadDadosDraft] = useState({
    nome: "",
    telefone: "",
    email: "",
    empresa: "",
    objetivo: "",
    urgencia: "",
  });

  function openLeadDadosEdit() {
    if (!lead) return;
    setLeadDadosDraft({
      nome: lead.nome ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      empresa: lead.empresa ?? "",
      objetivo: lead.objetivo ?? "",
      urgencia: lead.urgencia ?? "",
    });
    setEditingLeadDados(true);
  }

  const { mutate: updateLeadDados, isPending: isUpdatingLeadDados } = useUpdateLead({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
        setEditingLeadDados(false);
        toast({ title: "Informações do lead atualizadas." });
      },
      onError: () => {
        toast({ title: "Erro ao salvar informações", variant: "destructive" });
      },
    },
  });

  function saveLeadDados() {
    if (!id) return;
    updateLeadDados({
      id,
      data: {
        nome: leadDadosDraft.nome || undefined,
        telefone: leadDadosDraft.telefone || null,
        email: leadDadosDraft.email || null,
        empresa: leadDadosDraft.empresa || null,
        objetivo: leadDadosDraft.objetivo || null,
        urgencia: leadDadosDraft.urgencia || null,
      },
    });
  }

  // ── WhatsApp conversation starter ─────────────────────────────────────────
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappEtapa, setWhatsappEtapa] = useState<string>("novo");
  const [isStartingConversation, setIsStartingConversation] = useState(false);

  const { mutateAsync: createConversation } = useCreateConversation();
  const { mutateAsync: createDeal } = useCreateDeal();
  const { mutateAsync: createMessage } = useCreateMessage();

  function openWhatsappDialog() {
    setWhatsappMessage(`Olá, ${lead?.nome ?? ""}! Tudo bem?`);
    setWhatsappEtapa("novo");
    setWhatsappDialogOpen(true);
  }

  async function handleStartWhatsappConversation() {
    if (!lead || !id) return;
    setIsStartingConversation(true);
    try {
      const conv = await createConversation({
        data: { tenantId: lead.tenantId, leadId: id, channel: "whatsapp" },
      });
      await Promise.all([
        createDeal({
          data: {
            tenantId: lead.tenantId,
            titulo: lead.nome,
            leadId: id,
            etapa: whatsappEtapa as "em_aquecimento" | "novo" | "qualificado" | "proposta" | "negociacao",
          },
        }),
        createMessage({
          data: {
            tenantId: lead.tenantId,
            conversationId: conv.id,
            leadId: id,
            canal: "whatsapp",
            direcao: "saida",
            conteudo: whatsappMessage,
            enviadoPor: "humano",
          },
        }),
      ]);
      void queryClient.invalidateQueries({ queryKey: getListTenantConversationsQueryKey(lead.tenantId) });
      void queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(lead.tenantId) });
      setWhatsappDialogOpen(false);
      toast({ title: "Conversa iniciada e card criado no pipeline!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar conversa";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsStartingConversation(false);
    }
  }

  const [editingPessoal, setEditingPessoal] = useState(false);
  const [pessoalDraft, setPessoalDraft] = useState({
    dataNascimento: "",
    estadoCivil: "",
    conjugeNome: "",
    conjugeTelefone: "",
    conjugeEmail: "",
    conjugeDataNascimento: "",
    filhos: [] as Array<{ nome: string; dataNascimento: string }>,
  });

  const { mutate: updateLead, isPending: isUpdatingLead } = useUpdateLead({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
        setEditingPessoal(false);
        toast({ title: "Dados pessoais salvos." });
      },
      onError: () => {
        toast({ title: "Erro ao salvar dados pessoais", variant: "destructive" });
      },
    },
  });

  function openPessoalEdit() {
    if (!lead) return;
    setPessoalDraft({
      dataNascimento: lead.dataNascimento ?? "",
      estadoCivil: lead.estadoCivil ?? "",
      conjugeNome: lead.conjugeNome ?? "",
      conjugeTelefone: lead.conjugeTelefone ?? "",
      conjugeEmail: lead.conjugeEmail ?? "",
      conjugeDataNascimento: lead.conjugeDataNascimento ?? "",
      filhos: (lead.filhos ?? []).map((f) => ({
        nome: f.nome ?? "",
        dataNascimento: f.dataNascimento ?? "",
      })),
    });
    setEditingPessoal(true);
  }

  function savePessoal() {
    if (!id) return;
    updateLead({
      id,
      data: {
        dataNascimento: pessoalDraft.dataNascimento || null,
        estadoCivil: pessoalDraft.estadoCivil || null,
        conjugeNome: pessoalDraft.conjugeNome || null,
        conjugeTelefone: pessoalDraft.conjugeTelefone || null,
        conjugeEmail: pessoalDraft.conjugeEmail || null,
        conjugeDataNascimento: pessoalDraft.conjugeDataNascimento || null,
        filhos: pessoalDraft.filhos.filter((f) => f.nome.trim()).length > 0
          ? pessoalDraft.filhos.filter((f) => f.nome.trim())
          : null,
      },
    });
  }

  const { mutate: updateIntelligence, isPending: isUpdating } =
    useUpdateCustomerIntelligence({
      mutation: {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getGetOrCreateLeadIntelligenceQueryKey(tenantId, id),
          });
        },
      },
    });

  const { mutate: analyzeIntelligence, isPending: isAnalyzing } =
    useAnalyzeLeadIntelligence({
      mutation: {
        onSuccess: (data) => {
          void queryClient.invalidateQueries({
            queryKey: getGetOrCreateLeadIntelligenceQueryKey(tenantId, id),
          });
          const risk = data.intelligence?.churnRisk;
          // If the server preserved rep-edited reasons, surface the AI suggestions
          // so the rep can decide whether to accept them
          if (data.aiSuggestedChurnReasons && data.aiSuggestedChurnReasons.length > 0) {
            setAiSuggestedReasons(data.aiSuggestedChurnReasons);
            toast({
              title: "Análise concluída",
              description:
                risk !== null && risk !== undefined
                  ? `Risco de churn: ${risk}% · A IA sugeriu novas razões de churn.`
                  : "A IA sugeriu novas razões de churn.",
            });
          } else {
            toast({
              title: "Análise concluída",
              description:
                risk !== null && risk !== undefined
                  ? `Risco de churn: ${risk}% · ${data.tokensUsed ?? 0} tokens usados`
                  : "Inteligência do lead atualizada com sucesso.",
            });
          }
        },
        onError: (error) => {
          const status =
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            typeof (error as { status: unknown }).status === "number"
              ? (error as { status: number }).status
              : null;

          if (status === 409) {
            // Another analysis is already running server-side — track it and wait
            analysisSnapshotRef.current = intelligence?.lastAnalyzedAt;
            setServerAnalysisRunning(true);
            toast({
              title: "Análise em andamento",
              description: "Uma análise já está em execução. Aguarde o resultado.",
            });
          } else if (status === 429) {
            toast({
              title: "Limite atingido",
              description: "Limite de análises por hora atingido. Tente novamente em alguns minutos.",
              variant: "destructive",
            });
          } else if (status === 502) {
            toast({
              title: "Serviço de IA indisponível",
              description: "A OpenAI está com instabilidade. Tente novamente em instantes.",
              variant: "destructive",
            });
          } else {
            const msg =
              typeof error === "object" && error !== null && "message" in error
                ? String((error as { message: unknown }).message)
                : null;
            toast({
              title: "Falha na análise",
              description: msg ?? "Não foi possível conectar ao serviço de IA. Tente novamente.",
              variant: "destructive",
            });
          }
        },
      },
    });

  // ── Auto-analyze on first open ───────────────────────────────────────────
  // Fires once per lead when: (a) never analyzed, or (b) last analysis >24 h ago.
  // Uses a ref to prevent double-firing in React StrictMode.
  useEffect(() => {
    if (autoAnalyzeAttemptedRef.current) return;
    if (!intelligence || !tenantId || !id || isAnalyzing || serverAnalysisRunning) return;

    const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
    const isNeverAnalyzed = !intelligence.lastAnalyzedAt;
    const isStale =
      !isNeverAnalyzed &&
      Date.now() - new Date(intelligence.lastAnalyzedAt!).getTime() > STALE_MS;

    if (isNeverAnalyzed || isStale) {
      autoAnalyzeAttemptedRef.current = true;
      analyzeIntelligence({ tenantId, leadId: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelligence?.id, intelligence?.lastAnalyzedAt]);

  function handleAnalyze() {
    if (!tenantId || !id) return;
    analyzeIntelligence({ tenantId, leadId: id });
  }

  const churnRiskParsed = parseInt(churnRiskDraft, 10);
  const churnRiskIsValid =
    !isNaN(churnRiskParsed) && churnRiskParsed >= 0 && churnRiskParsed <= 100;

  function saveChurnRisk() {
    if (!intelligence?.id || !churnRiskIsValid) return;
    updateIntelligence({ id: intelligence.id, data: { churnRisk: churnRiskParsed } });
    setEditingChurnRisk(false);
  }

  const NBA_MIN_LENGTH = 10;
  const NBA_MAX_LENGTH = 300;
  const nextBestActionTrimmed = nextBestActionDraft.trim();
  const nextBestActionIsValid =
    nextBestActionTrimmed.length >= NBA_MIN_LENGTH &&
    nextBestActionDraft.length <= NBA_MAX_LENGTH;

  function saveNextBestAction() {
    if (!intelligence?.id || !nextBestActionIsValid) return;
    updateIntelligence({
      id: intelligence.id,
      data: { nextBestAction: nextBestActionDraft },
    });
    setEditingNextBestAction(false);
  }

  function saveChurnReasons() {
    if (!intelligence?.id) return;
    const cleaned = churnReasonsDraft.map((r) => r.trim()).filter((r) => r !== "");
    updateIntelligence({
      id: intelligence.id,
      data: {
        churnReasons: cleaned,
        churnReasonsEditedBy: "rep",
        churnReasonsEditedAt: new Date().toISOString(),
      },
    });
    setEditingChurnReasons(false);
  }

  const { data: activities, isLoading: activitiesLoading } = useListActivities(
    tenantId,
    { leadId: id },
    {
      query: {
        enabled: !!(tenantId && id),
        queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }),
      },
    }
  );

  // ── Edição de status de atividade ─────────────────────────────────────────
  const [activityStatusEditId, setActivityStatusEditId] = useState<string | null>(null);
  const [activityStatusDraft, setActivityStatusDraft] = useState<string>("");
  const [activityResultadoDraft, setActivityResultadoDraft] = useState("");

  const { mutate: updateActivity, isPending: isUpdatingActivity } = useUpdateActivity({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });
        setActivityStatusEditId(null);
        setActivityResultadoDraft("");
        toast({ title: "Status da atividade atualizado." });
      },
      onError: () => {
        toast({ title: "Erro ao atualizar atividade", variant: "destructive" });
      },
    },
  });

  function handleActivityStatusClick(activityId: string, newStatus: string) {
    if (newStatus === "concluida") {
      setActivityStatusEditId(activityId);
      setActivityStatusDraft("concluida");
      setActivityResultadoDraft("");
    } else {
      updateActivity({ id: activityId, data: { status: newStatus as "pendente" | "planejado" | "cancelada" } });
    }
  }

  function confirmActivityStatusSave(activityId: string) {
    updateActivity({
      id: activityId,
      data: {
        status: "concluida",
        resultadoExecucao: activityResultadoDraft.trim() || undefined,
      },
    });
  }

  // ── Nova Atividade ────────────────────────────────────────────────────────
  const [isNewActivityOpen, setIsNewActivityOpen] = useState(false);
  const [newActivityTipo, setNewActivityTipo] = useState<"ligacao" | "whatsapp" | "email" | "visita" | "tarefa">("tarefa");
  const [newActivityTitulo, setNewActivityTitulo] = useState("");
  const [newActivityDescricao, setNewActivityDescricao] = useState("");
  const [newActivityData, setNewActivityData] = useState("");
  const [newActivityResponsavelId, setNewActivityResponsavelId] = useState<string>("__ia__");

  const { data: tenantUsers } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) },
  });

  const { mutate: createActivity, isPending: isCreatingActivity } = useCreateActivity({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });
        setIsNewActivityOpen(false);
        setNewActivityTitulo("");
        setNewActivityDescricao("");
        setNewActivityData("");
        setNewActivityTipo("tarefa");
        setNewActivityResponsavelId("__ia__");
        toast({ title: "Atividade criada." });
      },
      onError: () => {
        toast({ title: "Erro ao criar atividade", variant: "destructive" });
      },
    },
  });

  function openNewActivityDialog(prefillTitulo?: string) {
    setNewActivityTitulo(prefillTitulo ?? "");
    setNewActivityDescricao("");
    setNewActivityData("");
    setNewActivityTipo("tarefa");
    setNewActivityResponsavelId("__ia__");
    setIsNewActivityOpen(true);
  }

  function handleCreateActivity() {
    if (!tenantId || !id || !newActivityTitulo.trim()) return;
    const responsavelId = newActivityResponsavelId === "__ia__" ? undefined : newActivityResponsavelId;
    createActivity({
      data: {
        tenantId,
        leadId: id,
        tipo: newActivityTipo,
        titulo: newActivityTitulo.trim(),
        descricao: newActivityDescricao.trim() || undefined,
        dataVencimento: newActivityData || undefined,
        status: "pendente",
        responsavelId,
      },
    });
  }

  const { data: conversations, isLoading: convsLoading } = useListTenantConversations(
    tenantId,
    {
      query: {
        enabled: !!tenantId,
        queryKey: getListTenantConversationsQueryKey(tenantId),
      },
    }
  );

  const leadConversations = (conversations ?? []).filter((c) => c.leadId === id);

  if (leadLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-6 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-24" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Lead não encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/leads")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Leads
        </Button>
      </div>
    );
  }

  const pendingActivities = activities?.filter((a) => a.status === "pendente" || a.status === "planejado") ?? [];
  const doneActivities = activities?.filter((a) => a.status !== "pendente" && a.status !== "planejado") ?? [];
  const opportunities = Array.isArray(intelligence?.opportunities)
    ? (intelligence.opportunities as string[])
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/leads")}
          data-testid="button-back-leads"
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Leads
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {lead.nome || lead.empresa || lead.email || (
              <span className="text-muted-foreground italic font-normal">Sem nome</span>
            )}
          </h1>
          {lead.empresa && (
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {lead.empresa}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lead.telefone && (
            <Button
              size="sm"
              className="bg-[#25D366] hover:bg-[#1ebe5d] text-white gap-1.5"
              onClick={openWhatsappDialog}
              data-testid="btn-start-whatsapp"
            >
              <MessageSquare className="h-4 w-4" />
              Iniciar no WhatsApp
            </Button>
          )}
          <Badge
            variant="outline"
            className={STATUS_STYLES[lead.status] ?? ""}
            data-testid="badge-lead-status"
          >
            {STATUS_LABELS[lead.status] ?? lead.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — Lead data + CI */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact data */}
          <Card data-testid="card-lead-dados">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Dados do Lead</span>
                <button
                  onClick={openLeadDadosEdit}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="btn-edit-lead-dados"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <dl className="space-y-2.5">
                {lead.telefone && (
                  <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                    <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">Telefone</span>
                    </dt>
                    <dd className="font-mono text-foreground break-all">{lead.telefone}</dd>
                  </div>
                )}
                {lead.email && (
                  <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                    <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">E-mail</span>
                    </dt>
                    <dd className="text-foreground break-all">{lead.email}</dd>
                  </div>
                )}
                {lead.empresa && (
                  <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                    <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">Empresa</span>
                    </dt>
                    <dd className="text-foreground">{lead.empresa}</dd>
                  </div>
                )}
                {lead.urgencia && (
                  <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                    <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">Urgência</span>
                    </dt>
                    <dd className="text-foreground capitalize">{lead.urgencia}</dd>
                  </div>
                )}
                {lead.objetivo && (
                  <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                    <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                      <Target className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">Objetivo</span>
                    </dt>
                    <dd className="text-foreground leading-snug">{lead.objetivo}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 pt-2.5 border-t">
                <p className="text-xs text-muted-foreground">
                  Criado em {formatDate(lead.createdAt)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Dados Pessoais */}
          <Card data-testid="card-dados-pessoais">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Dados Pessoais
                </span>
                <button
                  onClick={openPessoalEdit}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="btn-edit-dados-pessoais"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!lead.dataNascimento && !lead.estadoCivil && !lead.conjugeNome && !lead.filhos?.length ? (
                <p className="text-xs text-muted-foreground italic">
                  Clique em editar para adicionar dados pessoais.
                </p>
              ) : (
                <>
                  {lead.dataNascimento && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(lead.dataNascimento)} · {calcularIdade(lead.dataNascimento)}</span>
                    </div>
                  )}
                  {lead.estadoCivil && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Heart className="h-3.5 w-3.5 shrink-0" />
                      <span>{ESTADO_CIVIL_LABELS[lead.estadoCivil] ?? lead.estadoCivil}</span>
                    </div>
                  )}
                  {lead.conjugeNome && (
                    <div className="space-y-1 border-l-2 border-muted pl-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cônjuge</p>
                      <p className="font-medium">{lead.conjugeNome}</p>
                      {lead.conjugeTelefone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Phone className="h-3 w-3" />
                          <span className="font-mono">{lead.conjugeTelefone}</span>
                        </div>
                      )}
                      {lead.conjugeEmail && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="h-3 w-3" />
                          <span>{lead.conjugeEmail}</span>
                        </div>
                      )}
                      {lead.conjugeDataNascimento && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <CalendarDays className="h-3 w-3" />
                          <span>{formatDate(lead.conjugeDataNascimento)} · {calcularIdade(lead.conjugeDataNascimento)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {lead.filhos && lead.filhos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filhos</p>
                      {lead.filhos.map((filho, i) => (
                        <div key={i} className="flex items-center gap-2 text-muted-foreground">
                          <Baby className="h-3.5 w-3.5 shrink-0" />
                          <span>{filho.nome}</span>
                          {filho.dataNascimento && (
                            <span className="text-xs ml-auto">🎂 {formatBirthday(filho.dataNascimento)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Customer Intelligence */}
          <Card data-testid="card-customer-intelligence">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  Inteligência do Cliente
                  {ciRefetching && !ciLoading && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
                      data-testid="ci-updating-indicator"
                    >
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Atualizando…
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1.5"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || serverAnalysisRunning || !tenantId || !id}
                  data-testid="btn-analyze-intelligence"
                >
                  {isAnalyzing || serverAnalysisRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 text-primary" />
                  )}
                  {serverAnalysisRunning
                    ? "Análise em andamento…"
                    : isAnalyzing
                      ? "Analisando…"
                      : "Analisar com IA"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {ciLoading ? (
                <div className="space-y-2" data-testid="ci-loading-skeleton">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-3 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Churn Risk */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Risco de Churn
                      </span>
                      {!editingChurnRisk && (
                        <div className="flex items-center gap-1">
                          <span
                            className={`font-bold text-sm ${churnColor(intelligence?.churnRisk)}`}
                            data-testid="text-churn-risk"
                          >
                            {intelligence?.churnRisk !== null &&
                            intelligence?.churnRisk !== undefined
                              ? `${intelligence.churnRisk}%`
                              : "—"}
                          </span>
                          {intelligence?.id && (
                            <button
                              onClick={() => {
                                setChurnRiskDraft(
                                  intelligence.churnRisk?.toString() ?? ""
                                );
                                setEditingChurnRisk(true);
                              }}
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              data-testid="btn-edit-churn-risk"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {editingChurnRisk ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={churnRiskIsValid ? churnRiskParsed : 0}
                            onChange={(e) => setChurnRiskDraft(e.target.value)}
                            className="flex-1 h-2 accent-primary cursor-pointer"
                            data-testid="slider-churn-risk"
                          />
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={churnRiskDraft}
                            onChange={(e) => setChurnRiskDraft(e.target.value)}
                            className={`h-6 w-16 text-xs px-1.5 py-0 ${!churnRiskIsValid && churnRiskDraft !== "" ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                            data-testid="input-churn-risk"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveChurnRisk();
                              if (e.key === "Escape") setEditingChurnRisk(false);
                            }}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        {!churnRiskIsValid && churnRiskDraft !== "" && (
                          <p
                            className="text-xs text-red-500 flex items-center gap-1"
                            data-testid="error-churn-risk"
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Digite um valor entre 0 e 100
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveChurnRisk}
                            disabled={isUpdating || !churnRiskIsValid}
                            className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid="btn-save-churn-risk"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingChurnRisk(false)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full transition-all ${churnProgressColor(intelligence?.churnRisk)}`}
                          style={{
                            width: `${intelligence?.churnRisk ?? 0}%`,
                          }}
                          data-testid="progress-churn-risk"
                        />
                      </div>
                    )}
                    {/* Churn Reasons */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Razões do Churn
                        </span>
                        {intelligence?.id && !editingChurnReasons && (
                          <button
                            onClick={() => {
                              const current = Array.isArray(intelligence.churnReasons)
                                ? (intelligence.churnReasons as unknown[])
                                    .filter((r): r is string => typeof r === "string")
                                : [];
                              setChurnReasonsDraft(current.length > 0 ? current : [""]);
                              setEditingChurnReasons(true);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid="btn-edit-churn-reasons"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {editingChurnReasons ? (
                        <div className="space-y-2" data-testid="editor-churn-reasons">
                          {churnReasonsDraft.map((reason, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Input
                                value={reason}
                                onChange={(e) => {
                                  const next = [...churnReasonsDraft];
                                  next[i] = e.target.value;
                                  setChurnReasonsDraft(next);
                                }}
                                className="h-6 text-xs flex-1"
                                placeholder="Descreva uma razão..."
                                data-testid={`input-churn-reason-${i}`}
                                autoFocus={i === 0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveChurnReasons();
                                  if (e.key === "Escape") setEditingChurnReasons(false);
                                }}
                              />
                              <button
                                onClick={() =>
                                  setChurnReasonsDraft(churnReasonsDraft.filter((_, j) => j !== i))
                                }
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                data-testid={`btn-remove-churn-reason-${i}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setChurnReasonsDraft([...churnReasonsDraft, ""])}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            data-testid="btn-add-churn-reason"
                          >
                            <Plus className="h-3 w-3" />
                            Adicionar razão
                          </button>
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={saveChurnReasons}
                              disabled={isUpdating}
                              data-testid="btn-save-churn-reasons"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs px-2"
                              onClick={() => setEditingChurnReasons(false)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : Array.isArray(intelligence?.churnReasons) &&
                        (intelligence.churnReasons as unknown[]).filter(
                          (r) => typeof r === "string" && r.trim() !== ""
                        ).length > 0 ? (
                        <ul className="space-y-1" data-testid="list-churn-reasons">
                          {(intelligence.churnReasons as unknown[])
                            .filter(
                              (r): r is string => typeof r === "string" && r.trim() !== ""
                            )
                            .map((reason, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-muted-foreground"
                                data-testid={`churn-reason-${i}`}
                              >
                                <span className="mt-1.5 h-1 w-1 rounded-full bg-red-400 shrink-0" />
                                <span className="leading-snug">{reason}</span>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        intelligence?.id && (
                          <p className="text-xs text-muted-foreground">
                            Nenhuma razão registrada. Clique para editar.
                          </p>
                        )
                      )}
                      {!editingChurnReasons && intelligence?.churnReasonsEditedBy && (
                        <p
                          className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5"
                          data-testid="churn-reasons-edited-by"
                        >
                          {intelligence.churnReasonsEditedBy === "ai" ? (
                            <Sparkles className="h-2.5 w-2.5 shrink-0" />
                          ) : (
                            <Pencil className="h-2.5 w-2.5 shrink-0" />
                          )}
                          {intelligence.churnReasonsEditedBy === "ai"
                            ? "Atualizado pela IA"
                            : "Editado manualmente"}
                          {intelligence.churnReasonsEditedAt && churnReasonsEditedRelative && (
                            <>
                              {" · "}
                              {churnReasonsEditedRelative}
                            </>
                          )}
                        </p>
                      )}

                      {/* AI suggestions prompt — shown only when server preserved rep edits */}
                      {aiSuggestedReasons && aiSuggestedReasons.length > 0 && !editingChurnReasons && (
                        <div
                          className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 space-y-2"
                          data-testid="ai-churn-reasons-prompt"
                        >
                          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                            <Sparkles className="h-3 w-3 shrink-0 text-amber-600" />
                            A IA sugeriu novas razões de churn
                          </p>
                          <ul className="space-y-1" data-testid="list-ai-suggested-reasons">
                            {aiSuggestedReasons.map((reason, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-amber-700"
                                data-testid={`ai-suggested-reason-${i}`}
                              >
                                <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-400 shrink-0" />
                                <span className="leading-snug">{reason}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center gap-2 pt-0.5">
                            <Button
                              size="sm"
                              className="h-6 text-xs px-2 bg-amber-700 hover:bg-amber-800 text-white"
                              disabled={isUpdating}
                              data-testid="btn-accept-ai-reasons"
                              onClick={() => {
                                if (!intelligence?.id) return;
                                updateIntelligence({
                                  id: intelligence.id,
                                  data: {
                                    churnReasons: aiSuggestedReasons,
                                    churnReasonsEditedBy: "ai",
                                    churnReasonsEditedAt: new Date().toISOString(),
                                  },
                                });
                                setAiSuggestedReasons(null);
                              }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Aceitar sugestões
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs px-2 text-amber-700 hover:text-amber-900"
                              data-testid="btn-dismiss-ai-reasons"
                              onClick={() => setAiSuggestedReasons(null)}
                            >
                              Manter minhas edições
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Journey Stage */}
                  {intelligence?.journeyStage && (
                    <div className="space-y-1" data-testid="section-journey-stage">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">
                          Etapa da Jornada
                        </span>
                      </div>
                      <p className="text-foreground">{intelligence.journeyStage}</p>
                    </div>
                  )}

                  {/* Intent Analysis */}
                  {intelligence?.intentAnalysis && (
                    <div className="space-y-1" data-testid="section-intent-analysis">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Target className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">
                          Intenção de Compra
                        </span>
                      </div>
                      <p className="text-foreground leading-snug">
                        {intelligence.intentAnalysis}
                      </p>
                    </div>
                  )}

                  {/* Next Best Action */}
                  <div className="space-y-1.5 p-3 rounded-md bg-primary/5 border border-primary/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-primary">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Próxima Melhor Ação
                        </span>
                      </div>
                      {intelligence?.id && !editingNextBestAction && (
                        <button
                          onClick={() => {
                            setNextBestActionDraft(
                              intelligence.nextBestAction ?? ""
                            );
                            setEditingNextBestAction(true);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          data-testid="btn-edit-next-best-action"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {editingNextBestAction ? (
                      <div className="space-y-2">
                        <Input
                          value={nextBestActionDraft}
                          onChange={(e) => setNextBestActionDraft(e.target.value)}
                          className="h-7 text-xs"
                          placeholder="Descreva a próxima ação..."
                          maxLength={NBA_MAX_LENGTH}
                          data-testid="input-next-best-action"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && nextBestActionIsValid) saveNextBestAction();
                            if (e.key === "Escape") setEditingNextBestAction(false);
                          }}
                        />
                        {nextBestActionTrimmed.length > 0 &&
                          nextBestActionTrimmed.length < NBA_MIN_LENGTH && (
                            <p
                              className="text-xs text-muted-foreground"
                              data-testid="next-best-action-min-hint"
                            >
                              Mínimo de {NBA_MIN_LENGTH} caracteres
                            </p>
                          )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={saveNextBestAction}
                              disabled={isUpdating || !nextBestActionIsValid}
                              data-testid="btn-save-next-best-action"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs px-2"
                              onClick={() => setEditingNextBestAction(false)}
                            >
                              Cancelar
                            </Button>
                          </div>
                          <span
                            className={`text-xs tabular-nums ${
                              nextBestActionDraft.length >= NBA_MAX_LENGTH
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                            data-testid="next-best-action-char-count"
                          >
                            {nextBestActionDraft.length}/{NBA_MAX_LENGTH}
                          </span>
                        </div>
                      </div>
                    ) : intelligence?.nextBestAction ? (
                      <>
                        <p className="text-foreground leading-snug font-medium text-sm">
                          {intelligence.nextBestAction}
                        </p>
                        {intelligence.nextBestActionReason && (
                          <p className="text-xs text-muted-foreground leading-snug">
                            {intelligence.nextBestActionReason}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma ação definida. Clique para editar.
                      </p>
                    )}
                  </div>

                  {/* Opportunities */}
                  {opportunities.length > 0 && (
                    <div className="space-y-2" data-testid="section-opportunities">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">
                          Oportunidades
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {opportunities.map((opp, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm"
                            data-testid={`opportunity-${i}`}
                          >
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span className="text-foreground leading-snug">
                              {typeof opp === "string" ? opp : JSON.stringify(opp)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!intelligence?.journeyStage &&
                    !intelligence?.intentAnalysis &&
                    !intelligence?.nextBestAction &&
                    intelligence?.churnRisk === null &&
                    opportunities.length === 0 && (
                      <p className="text-muted-foreground text-xs py-2 flex items-center gap-1.5">
                        {isAnalyzing || serverAnalysisRunning ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                            Analisando lead automaticamente…
                          </>
                        ) : (
                          "Análise ainda não disponível. Use o botão acima para gerar insights."
                        )}
                      </p>
                    )}

                  {/* Last analyzed timestamp */}
                  <p
                    className="text-xs text-muted-foreground/60 pt-1 border-t border-border/40"
                    data-testid="text-last-analyzed"
                  >
                    {intelligence?.lastAnalyzedAt && lastAnalyzedRelative
                      ? `Última análise: há ${lastAnalyzedRelative}`
                      : "Nunca analisado"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — AI Suggestion + Activities + Conversations */}
        <div className="lg:col-span-2 space-y-4">

          {/* ── Sugestão da IA ─────────────────────────────────────── */}
          <Card data-testid="card-ai-suggestion" className="border-primary/20 bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span>Sugestão da IA</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || serverAnalysisRunning || ciRefetching}
                  data-testid="btn-analyze-ia-suggestion"
                >
                  {(isAnalyzing || serverAnalysisRunning) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Brain className="h-3 w-3" />
                  )}
                  {(isAnalyzing || serverAnalysisRunning) ? "Analisando…" : "Analisar com IA"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ciLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                </div>
              ) : intelligence?.nextBestAction ? (
                <>
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm font-medium leading-snug">{intelligence.nextBestAction}</p>
                    </div>
                    {intelligence.nextBestActionReason && (
                      <p className="text-xs text-muted-foreground leading-snug pl-6">
                        {intelligence.nextBestActionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => openNewActivityDialog(intelligence.nextBestAction ?? "")}
                      data-testid="btn-criar-atividade-nba"
                    >
                      <Plus className="h-3 w-3" />
                      Criar como Atividade
                    </Button>
                    {intelligence.lastAnalyzedAt && (
                      <span className="text-xs text-muted-foreground">
                        Atualizado {lastAnalyzedRelative}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 py-1">
                  {isAnalyzing || serverAnalysisRunning ? (
                    <Loader2 className="h-8 w-8 text-muted-foreground/30 shrink-0 animate-spin" />
                  ) : (
                    <Brain className="h-8 w-8 text-muted-foreground/30 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isAnalyzing || serverAnalysisRunning
                        ? "Analisando lead automaticamente…"
                        : "Nenhuma sugestão disponível ainda."}
                    </p>
                    {!isAnalyzing && !serverAnalysisRunning && (
                      <p className="text-xs text-muted-foreground/70">
                        Use o botão "Analisar com IA" para gerar uma recomendação de próxima ação.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activities */}
          <Card data-testid="card-activities">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Atividades</span>
                <div className="flex items-center gap-2">
                  {pendingActivities.length > 0 && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                      {pendingActivities.length} pendente{pendingActivities.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => openNewActivityDialog()}
                    data-testid="btn-nova-atividade"
                  >
                    <Plus className="h-3 w-3" />
                    Nova
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : !activities?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma atividade registrada.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {[...pendingActivities, ...doneActivities].map((activity) => {
                    const isActivityOpen = openActivityId === activity.id;
                    return (
                      <div key={activity.id} data-testid={`activity-${activity.id}`}>
                        <button
                          className="w-full flex items-start gap-3 py-3 text-left hover:bg-muted/30 rounded transition-colors px-1"
                          onClick={() => setOpenActivityId(isActivityOpen ? null : activity.id)}
                        >
                          <div className="mt-0.5 shrink-0">
                            {activity.status === "concluida" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : activity.status === "planejado" ? (
                              <Clock className="h-4 w-4 text-blue-500" />
                            ) : activity.status === "cancelada" ? (
                              <X className="h-4 w-4 text-zinc-400" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{activity.titulo}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {ACTIVITY_TIPO_LABELS[activity.tipo] ?? activity.tipo}
                              </span>
                              {activity.dataVencimento && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-xs text-muted-foreground">
                                    Vence {formatDate(activity.dataVencimento)}
                                  </span>
                                </>
                              )}
                            </div>
                            {!isActivityOpen && activity.descricao && (
                              <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-1">
                                {activity.descricao}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={
                                activity.status === "pendente"
                                  ? "bg-amber-100 text-amber-700 border-amber-200 text-xs"
                                  : activity.status === "planejado"
                                  ? "bg-blue-100 text-blue-700 border-blue-200 text-xs"
                                  : activity.status === "concluida"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"
                                  : "bg-zinc-100 text-zinc-600 border-zinc-200 text-xs"
                              }
                            >
                              {activity.status === "concluida"
                                ? "Executada"
                                : activity.status === "pendente"
                                ? "Pendente"
                                : activity.status === "planejado"
                                ? "Planejada"
                                : "Cancelada"}
                            </Badge>
                            {isActivityOpen ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>

                        {isActivityOpen && (
                          <div className="pb-4 px-1 space-y-3">
                            <div className="rounded-md bg-muted/40 border border-border/60 p-3 space-y-2.5 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</span>
                                <span className="text-foreground">{ACTIVITY_TIPO_LABELS[activity.tipo] ?? activity.tipo}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Criado em</span>
                                <span className="text-foreground">{formatDateTime(activity.createdAt)}</span>
                              </div>
                              {activity.dataVencimento && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vencimento</span>
                                  <span className="text-foreground">{formatDate(activity.dataVencimento)}</span>
                                </div>
                              )}
                              {activity.descricao && (
                                <div className="space-y-1 pt-1 border-t border-border/40">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</span>
                                  <p className="text-foreground leading-snug">{activity.descricao}</p>
                                </div>
                              )}
                              {activity.resultadoExecucao && activityStatusEditId !== activity.id && (
                                <div className="space-y-1 pt-1 border-t border-border/40">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado</span>
                                  <p className="text-foreground leading-snug">{activity.resultadoExecucao}</p>
                                </div>
                              )}
                            </div>

                            {/* Status change section */}
                            <div className="space-y-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Alterar status
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {(
                                  [
                                    { value: "planejado", label: "Planejado", cls: "bg-blue-100 text-blue-700 border-blue-200" },
                                    { value: "pendente", label: "Pendente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
                                    { value: "concluida", label: "Executada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                                    { value: "cancelada", label: "Cancelada", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
                                  ] as const
                                ).map(({ value, label, cls }) => (
                                  <button
                                    key={value}
                                    disabled={activity.status === value || isUpdatingActivity}
                                    onClick={(e) => { e.stopPropagation(); handleActivityStatusClick(activity.id, value); }}
                                    className={`px-2.5 py-1 text-xs rounded border font-medium transition-colors ${
                                      activity.status === value
                                        ? `${cls} cursor-default`
                                        : "border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                                    }`}
                                  >
                                    {activity.status === value && <span className="mr-1">✓</span>}
                                    {label}
                                  </button>
                                ))}
                              </div>

                              {activityStatusEditId === activity.id && activityStatusDraft === "concluida" && (
                                <div className="space-y-2 pt-1">
                                  <Textarea
                                    placeholder="Descreva o resultado desta execução... (opcional)"
                                    value={activityResultadoDraft}
                                    onChange={(e) => setActivityResultadoDraft(e.target.value)}
                                    rows={2}
                                    className="text-sm resize-none"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={isUpdatingActivity}
                                      onClick={(e) => { e.stopPropagation(); confirmActivityStatusSave(activity.id); }}
                                    >
                                      {isUpdatingActivity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                      Salvar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={(e) => { e.stopPropagation(); setActivityStatusEditId(null); setActivityResultadoDraft(""); }}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversations */}
          <Card data-testid="card-conversations">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {convsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : leadConversations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma conversa encontrada para este lead.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {leadConversations.map((conv) => {
                    const isOpen = openConvId === conv.id;
                    return (
                      <div key={conv.id} data-testid={`conv-${conv.id}`}>
                        <button
                          className="w-full flex items-center justify-between py-3 text-left hover:bg-muted/30 rounded transition-colors px-1"
                          onClick={() =>
                            setOpenConvId(isOpen ? null : conv.id)
                          }
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 rounded bg-primary/10">
                              <MessageSquare className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {CHANNEL_LABELS[conv.channel ?? ""] ?? conv.channel ?? "Canal desconhecido"}
                                </span>
                                {conv.naoLidas > 0 && (
                                  <Badge className="bg-primary text-primary-foreground text-xs h-4 px-1.5 rounded-full">
                                    {conv.naoLidas}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {conv.ultimaMensagemEm
                                  ? formatDateTime(conv.ultimaMensagemEm)
                                  : formatDate(conv.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className="text-xs"
                            >
                              {conv.status}
                            </Badge>
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="pb-3 px-1 space-y-2">
                            <ConversationMessages
                              tenantId={tenantId}
                              conversationId={conv.id}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-2 mt-2"
                              onClick={() => setLocation(`/conversations?conv=${conv.id}`)}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Abrir conversa completa
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dados do Lead — edit dialog */}
      <Dialog open={editingLeadDados} onOpenChange={setEditingLeadDados}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Dados do Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                placeholder="Nome completo"
                value={leadDadosDraft.nome}
                onChange={(e) => setLeadDadosDraft((d) => ({ ...d, nome: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Telefone</label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={leadDadosDraft.telefone}
                  onChange={(e) => setLeadDadosDraft((d) => ({ ...d, telefone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">E-mail</label>
                <Input
                  placeholder="email@..."
                  value={leadDadosDraft.email}
                  onChange={(e) => setLeadDadosDraft((d) => ({ ...d, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Empresa</label>
              <Input
                placeholder="Nome da empresa"
                value={leadDadosDraft.empresa}
                onChange={(e) => setLeadDadosDraft((d) => ({ ...d, empresa: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Urgência</label>
              <Select
                value={leadDadosDraft.urgencia || "__none__"}
                onValueChange={(v) =>
                  setLeadDadosDraft((d) => ({ ...d, urgencia: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não informado</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Objetivo</label>
              <Textarea
                placeholder="Objetivo ou necessidade do lead..."
                value={leadDadosDraft.objetivo}
                onChange={(e) => setLeadDadosDraft((d) => ({ ...d, objetivo: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLeadDados(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveLeadDados}
              disabled={!leadDadosDraft.nome.trim() || isUpdatingLeadDados}
            >
              {isUpdatingLeadDados && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dados Pessoais — edit dialog */}
      <Dialog open={editingPessoal} onOpenChange={setEditingPessoal}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dados Pessoais</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data de Nascimento</label>
              <Input
                type="date"
                value={pessoalDraft.dataNascimento}
                onChange={(e) => setPessoalDraft((d) => ({ ...d, dataNascimento: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Estado Civil</label>
              <Select
                value={pessoalDraft.estadoCivil || "__none__"}
                onValueChange={(v) =>
                  setPessoalDraft((d) => ({ ...d, estadoCivil: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não informado</SelectItem>
                  <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                  <SelectItem value="casado">Casado(a)</SelectItem>
                  <SelectItem value="uniao_estavel">União Estável</SelectItem>
                  <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                  <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(pessoalDraft.estadoCivil === "casado" || pessoalDraft.estadoCivil === "uniao_estavel") && (
              <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cônjuge
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome</label>
                  <Input
                    placeholder="Nome do cônjuge"
                    value={pessoalDraft.conjugeNome}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, conjugeNome: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Telefone</label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={pessoalDraft.conjugeTelefone}
                      onChange={(e) =>
                        setPessoalDraft((d) => ({ ...d, conjugeTelefone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      placeholder="email@..."
                      value={pessoalDraft.conjugeEmail}
                      onChange={(e) =>
                        setPessoalDraft((d) => ({ ...d, conjugeEmail: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Data de Nascimento</label>
                  <Input
                    type="date"
                    value={pessoalDraft.conjugeDataNascimento}
                    onChange={(e) =>
                      setPessoalDraft((d) => ({ ...d, conjugeDataNascimento: e.target.value }))
                    }
                  />
                  {pessoalDraft.conjugeDataNascimento && (
                    <p className="text-xs text-muted-foreground">
                      {calcularIdade(pessoalDraft.conjugeDataNascimento)}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Filhos</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() =>
                    setPessoalDraft((d) => ({
                      ...d,
                      filhos: [...d.filhos, { nome: "", dataNascimento: "" }],
                    }))
                  }
                >
                  <Plus className="h-3 w-3" />
                  Adicionar
                </Button>
              </div>
              {pessoalDraft.filhos.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum filho cadastrado.</p>
              )}
              {pessoalDraft.filhos.map((filho, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Nome"
                      value={filho.nome}
                      onChange={(e) => {
                        const filhos = [...pessoalDraft.filhos];
                        filhos[i] = { ...filhos[i]!, nome: e.target.value };
                        setPessoalDraft((d) => ({ ...d, filhos }));
                      }}
                    />
                    <Input
                      type="date"
                      title="Data de nascimento"
                      value={filho.dataNascimento}
                      onChange={(e) => {
                        const filhos = [...pessoalDraft.filhos];
                        filhos[i] = { ...filhos[i]!, dataNascimento: e.target.value };
                        setPessoalDraft((d) => ({ ...d, filhos }));
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setPessoalDraft((d) => ({
                        ...d,
                        filhos: d.filhos.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPessoal(false)}>
              Cancelar
            </Button>
            <Button onClick={savePessoal} disabled={isUpdatingLead}>
              {isUpdatingLead && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Nova Atividade Dialog ────────────────────────────────────── */}
      <Dialog open={isNewActivityOpen} onOpenChange={setIsNewActivityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Atividade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tipo</label>
              <Select
                value={newActivityTipo}
                onValueChange={(v) => setNewActivityTipo(v as typeof newActivityTipo)}
              >
                <SelectTrigger data-testid="select-activity-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TIPO_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Responsável */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Responsável</label>
              <Select
                value={newActivityResponsavelId}
                onValueChange={setNewActivityResponsavelId}
              >
                <SelectTrigger data-testid="select-activity-responsavel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ia__">🤖 IA</SelectItem>
                  {(tenantUsers ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Título */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Título <span className="text-destructive">*</span></label>
              <Input
                placeholder="Ex: Ligar para o cliente amanhã às 10h"
                value={newActivityTitulo}
                onChange={(e) => setNewActivityTitulo(e.target.value)}
                maxLength={200}
                data-testid="input-activity-titulo"
                autoFocus
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição <span className="text-xs text-muted-foreground">(opcional)</span></label>
              <Textarea
                placeholder="Detalhes da atividade…"
                value={newActivityDescricao}
                onChange={(e) => setNewActivityDescricao(e.target.value)}
                rows={3}
                data-testid="input-activity-descricao"
              />
            </div>

            {/* Data de vencimento */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vencimento <span className="text-xs text-muted-foreground">(opcional)</span></label>
              <Input
                type="date"
                value={newActivityData}
                onChange={(e) => setNewActivityData(e.target.value)}
                data-testid="input-activity-data"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewActivityOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateActivity}
              disabled={isCreatingActivity || !newActivityTitulo.trim()}
              data-testid="btn-salvar-atividade"
            >
              {isCreatingActivity && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Atividade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp conversation starter dialog */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#25D366]" />
              Iniciar conversa no WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Primeira mensagem</label>
              <Textarea
                rows={3}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Digite a mensagem inicial..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Etapa no pipeline</label>
              <Select value={whatsappEtapa} onValueChange={setWhatsappEtapa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_aquecimento">Em aquecimento</SelectItem>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="qualificado">Qualificado</SelectItem>
                  <SelectItem value="proposta">Proposta</SelectItem>
                  <SelectItem value="negociacao">Negociação</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Um card será criado automaticamente no pipeline com esta etapa.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWhatsappDialogOpen(false)}
              disabled={isStartingConversation}
            >
              Cancelar
            </Button>
            <Button
              className="bg-[#25D366] hover:bg-[#1ebe5d] text-white"
              onClick={() => void handleStartWhatsappConversation()}
              disabled={isStartingConversation || !whatsappMessage.trim()}
            >
              {isStartingConversation
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Iniciando…</>
                : <><MessageSquare className="h-4 w-4 mr-2" />Enviar e criar card</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
