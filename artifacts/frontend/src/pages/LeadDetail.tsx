import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PropostaModal } from "./Propostas";
import { VendidoModal } from "@/components/VendidoModal";
import { AgendarReuniaoModal } from "@/components/AgendarReuniaoModal";
import LeadServiceJourney from "./LeadServiceJourney";
import LeadPropostaTab from "./LeadPropostaTab";
import LeadProductPresentationTab from "./LeadProductPresentationTab";
import { useListProdutosCatalogo, getListProdutosCatalogoQueryKey } from "@workspace/api-client-react";
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
  useRequestUploadUrl,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useListAgendas,
  getListAgendasQueryKey,
  useCreateConversation,
  useCreateDeal,
  useListDeals,
  useCreateMessage,
  getListDealsQueryKey,
  useListPropostas,
  getListPropostasQueryKey,
  useGetLeadSpouseConsent,
  useCreateLeadSpouseConsent,
  useUpdateLeadSpouseConsent,
  getGetLeadSpouseConsentQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  UserCog,
  FileText,
  Video,
  Paperclip,
  FileUp,
  Image,
  Gift,
  Package,
  Upload,
  Globe,
  Maximize2,
  Download,
  Briefcase,
  Users,
  DollarSign,
  Wand2,
  Send,
  Tag,
  Wrench,
} from "lucide-react";

function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function getToken() { return localStorage.getItem("vendorai_token") ?? ""; }

type CompanyContextContact = {
  relationId: string;
  personId: string;
  nome: string;
  cargo?: string | null;
  qualificacao?: string | null;
  telefones?: string[] | null;
  emails?: string[] | null;
  roles?: string[] | null;
  isPrimary?: boolean;
  preferredChannel?: string | null;
  roleEvidence?: Array<{ source: string; detail?: string; observedAt?: string }> | null;
  roleConfidence?: string | null;
  verifiedAt?: string | null;
  validUntil?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CompanyContext = {
  company: {
    id: string;
    cnpj: string;
    razaoSocial?: string | null;
    nomeFantasia?: string | null;
    situacaoCadastral?: string | null;
    porte?: string | null;
    cnaePrincipal?: string | null;
    endereco?: Record<string, string | null> | null;
    telefone?: string | null;
    email?: string | null;
  };
  tenantCompany: {
    id: string;
    relationshipType: string;
  };
  contacts: CompanyContextContact[];
  relationships?: {
    parents?: Array<{ id: string; parentCompanyId: string; childCompanyId: string; relationshipType: string; source: string }>;
    children?: Array<{ id: string; parentCompanyId: string; childCompanyId: string; relationshipType: string; source: string }>;
  };
};

function normalizeWhatsAppNumber(value?: string | null): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Telefones nacionais salvos com DDD (10/11 dígitos) recebem o DDI Brasil.
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

function normalizeInstagramHandle(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      if (host === "instagram.com") return (url.pathname.split("/").filter(Boolean)[0] ?? "").replace(/^@/, "");
    }
  } catch {
    // Continua abaixo e tenta interpretar como @handle puro.
  }
  return raw.replace(/^@/, "").split(/[/?#]/)[0]?.trim() ?? "";
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

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
  reuniao: "Reunião Online",
  feedback_entrega: "Feedback pós-entrega",
  assistencia: "Assistência",
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

  const [propostaModalOpen, setPropostaModalOpen] = useState(false);
  const [leadWorkspaceTab, setLeadWorkspaceTab] = useState<"atendimento" | "proposta">("atendimento");
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [vendidoOpen, setVendidoOpen] = useState(false);
  const [naoLeadOpen, setNaoLeadOpen] = useState(false);
  const [naoLeadTipoSel, setNaoLeadTipoSel] = useState<string>("fornecedor");
  const [naoLeadNotasInput, setNaoLeadNotasInput] = useState("");
  const [naoLeadSalvando, setNaoLeadSalvando] = useState(false);
  const { data: nonLeadClassifications = [] } = useQuery<Array<{ id: string; label: string; active?: boolean }>>({
    queryKey: ["non-lead-classifications", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/non-lead-classifications`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error("Falha ao carregar classificações de Não Lead");
      return r.json();
    },
  });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>("");
  const [companyContext, setCompanyContext] = useState<CompanyContext | null>(null);
  const [companyContextLoading, setCompanyContextLoading] = useState(false);
  const [companyContextError, setCompanyContextError] = useState<string | null>(null);
  const [contactRoleDialog, setContactRoleDialog] = useState<CompanyContextContact | null>(null);
  const [contactRoleDraft, setContactRoleDraft] = useState<string>("comercial");
  const [contactRoleSaving, setContactRoleSaving] = useState(false);

  const { data: catalog = [] } = useListProdutosCatalogo(tenantId, {
    query: { queryKey: getListProdutosCatalogoQueryKey(tenantId), enabled: !!tenantId },
  });

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
  const [isReenrichingLead, setIsReenrichingLead] = useState(false);
  const [leadDadosDraft, setLeadDadosDraft] = useState({
    nome: "",
    telefone: "",
    email: "",
    empresa: "",
    objetivo: "",
    urgencia: "",
    logoUrl: "",
    websiteUrl: "",
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const requestUploadUrl = useRequestUploadUrl();

  function openLeadDadosEdit() {
    if (!lead) return;
    setLeadDadosDraft({
      nome: lead.nome ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      empresa: lead.empresa ?? "",
      objetivo: lead.objetivo ?? "",
      urgencia: lead.urgencia ?? "",
      logoUrl: (lead as any).logoUrl ?? "",
      websiteUrl: (lead as any).websiteUrl ?? "",
    });
    setEditingLeadDados(true);
  }

  async function handleLeadLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem (PNG, JPG, SVG...)", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload falhou");
      setLeadDadosDraft((d) => ({ ...d, logoUrl: result.objectPath }));
      toast({ title: "Logo carregada com sucesso!" });
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
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

  async function reenrichLead() {
    if (!id || isReenrichingLead) return;
    setIsReenrichingLead(true);
    try {
      const r = await fetch(`/api/leads/${id}/enrich`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao iniciar enriquecimento");
      void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
      toast({
        title: "Enriquecimento iniciado",
        description: "O Vendi está atualizando dados e sinais públicos sem iniciar abordagem automática.",
      });
    } catch (err) {
      toast({ title: "Erro ao enriquecer lead", description: String(err), variant: "destructive" });
    } finally {
      setIsReenrichingLead(false);
    }
  }

  async function classificarComoNaoLead() {
    if (!id) return;
    setNaoLeadSalvando(true);
    try {
      const r = await fetch(`/api/leads/${id}/classificar-nao-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ tipo: naoLeadTipoSel, notas: naoLeadNotasInput.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao classificar");
      void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
      setNaoLeadOpen(false);
      setNaoLeadNotasInput("");
      toast({ title: "Classificado como não-lead", description: "Sai da pipeline e da análise de churn." });
    } catch (err) {
      toast({ title: "Erro ao classificar", description: String(err), variant: "destructive" });
    } finally {
      setNaoLeadSalvando(false);
    }
  }

  async function reclassificarComoLead() {
    if (!id) return;
    setNaoLeadSalvando(true);
    try {
      const r = await fetch(`/api/leads/${id}/reclassificar-como-lead`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Falha ao reclassificar");
      void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
      toast({ title: "Voltou a ser lead", description: "Reaparece na pipeline normal agora." });
    } catch (err) {
      toast({ title: "Erro ao reclassificar", description: String(err), variant: "destructive" });
    } finally {
      setNaoLeadSalvando(false);
    }
  }

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
        logoUrl: leadDadosDraft.logoUrl || null,
        websiteUrl: leadDadosDraft.websiteUrl || null,
      },
    });
  }

  // ── WhatsApp conversation starter ─────────────────────────────────────────
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappEtapa, setWhatsappEtapa] = useState<string>("novo");
  const [isStartingConversation, setIsStartingConversation] = useState(false);

  // ── Novo dialog unificado (WhatsApp + Instagram) ──────────────────────────
  const [iniciarDialogOpen, setIniciarDialogOpen] = useState(false);
  const [iniciarCanal, setIniciarCanal] = useState<"whatsapp" | "instagram">("whatsapp");
  const [iniciarMensagem, setIniciarMensagem] = useState("");
  const [iniciarEtapa, setIniciarEtapa] = useState<string>("novo");
  const [gerandoSugestao, setGerandoSugestao] = useState(false);

  const { mutateAsync: createConversation } = useCreateConversation();
  const { mutateAsync: createDeal } = useCreateDeal();
  const { mutateAsync: createMessage } = useCreateMessage();

  const { data: leadDeals } = useListDeals(tenantId, { leadId: id }, {
    query: { enabled: !!tenantId && !!id, queryKey: getListDealsQueryKey(tenantId, { leadId: id }) },
  });
  const leadJaNoPipeline = (leadDeals?.length ?? 0) > 0;
  const requestedDealId = new URLSearchParams(window.location.search).get("dealId");
  const newestLeadDeals = [...(leadDeals ?? [])].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const activeLeadDeal =
    newestLeadDeals.find((deal) => deal.id === requestedDealId)
    ?? newestLeadDeals.find((deal) => !["ganho", "perdido", "entregue", "concluido", "cancelado"].includes(deal.etapa))
    ?? newestLeadDeals[0]
    ?? null;

  async function fetchAiStarter() {
    if (!id) return;
    setGerandoSugestao(true);
    try {
      const res = await fetch(`/api/leads/${id}/conversation-starter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const { message } = await res.json() as { message: string };
        setIniciarMensagem(message);
      }
    } catch {
      // keep current message
    } finally {
      setGerandoSugestao(false);
    }
  }

  async function openIniciarConversa(canal: "whatsapp" | "instagram" = "whatsapp") {
    setIniciarCanal(canal);
    setIniciarEtapa("novo");
    setIniciarMensagem(`Olá, ${lead?.nome ?? ""}! Tudo bem?`);
    setIniciarDialogOpen(true);
    void fetchAiStarter();
  }

  async function handleIniciarConversa() {
    if (!lead || !id) return;
    setIsStartingConversation(true);
    try {
      const conv = await createConversation({
        data: { tenantId: lead.tenantId, leadId: id, channel: iniciarCanal },
      });
      const tasks: Promise<unknown>[] = [
        createMessage({
          data: {
            tenantId: lead.tenantId,
            conversationId: conv.id,
            leadId: id,
            canal: iniciarCanal,
            direcao: "saida",
            conteudo: iniciarMensagem,
            enviadoPor: "humano",
          },
        }),
      ];
      if (!leadJaNoPipeline) {
        tasks.push(
          createDeal({
            data: {
              tenantId: lead.tenantId,
              titulo: lead.nome,
              leadId: id,
              etapa: iniciarEtapa as "em_aquecimento" | "novo" | "qualificado" | "proposta" | "negociacao",
            },
          }),
        );
      }
      await Promise.all(tasks);
      void queryClient.invalidateQueries({ queryKey: getListTenantConversationsQueryKey(lead.tenantId) });
      void queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(lead.tenantId) });
      setIniciarDialogOpen(false);
      toast({ title: "Conversa iniciada!" });
      setLocation("/conversations");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar conversa";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsStartingConversation(false);
    }
  }

  function openDirectWhatsApp() {
    const number = normalizeWhatsAppNumber(lead?.telefone);
    if (!number) {
      toast({
        title: "WhatsApp não cadastrado",
        description: "Cadastre o telefone do lead para iniciar a conversa.",
        variant: "destructive",
      });
      return;
    }
    window.open(`https://wa.me/${number}`, "_blank", "noopener,noreferrer");
  }

  function openDirectInstagram() {
    const handle = normalizeInstagramHandle((lead as { instagramHandle?: string | null } | undefined)?.instagramHandle);
    if (!handle) {
      toast({
        title: "Instagram não cadastrado",
        description: "Cadastre o @ do Instagram deste lead para iniciar a conversa.",
        variant: "destructive",
      });
      return;
    }
    window.open(`https://ig.me/m/${encodeURIComponent(handle)}`, "_blank", "noopener,noreferrer");
  }

  function openWhatsappDialog() {
    void openIniciarConversa("whatsapp");
  }

  async function loadOrEnrichCompanyContext(forceEnrich = false) {
    if (!id || !lead || !tenantId) return;
    const tipoPessoa = (lead as any).tipoPessoa;
    const rawCnpj = String((lead as any).dadosPj?.cnpj ?? lead.documento ?? "").replace(/\D/g, "");
    if (tipoPessoa !== "juridica" || rawCnpj.length !== 14) {
      setCompanyContext(null);
      return;
    }

    setCompanyContextLoading(true);
    setCompanyContextError(null);
    try {
      if (!forceEnrich) {
        const existing = await fetch(`${getBase()}/api/crm/leads/${id}/company-context`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (existing.ok) {
          setCompanyContext(await existing.json() as CompanyContext);
          return;
        }
      }

      const enriched = await fetch(`${getBase()}/api/crm/companies/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ cnpj: rawCnpj, leadId: id, tenantId }),
      });
      const payload = await enriched.json().catch(() => ({}));
      if (!enriched.ok) {
        throw new Error((payload as any)?.error ?? "Não foi possível enriquecer a empresa.");
      }
      setCompanyContext(payload as CompanyContext);
      void queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
    } catch (err) {
      setCompanyContextError(err instanceof Error ? err.message : "Falha ao carregar empresa.");
    } finally {
      setCompanyContextLoading(false);
    }
  }

  async function confirmCompanyContactRole() {
    if (!companyContext || !contactRoleDialog) return;
    setContactRoleSaving(true);
    try {
      const response = await fetch(
        `${getBase()}/api/crm/companies/${companyContext.company.id}/contacts/${contactRoleDialog.relationId}/roles`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            tenantId,
            roles: [contactRoleDraft],
            isPrimary: contactRoleDraft === "decisor" ? contactRoleDialog.isPrimary ?? false : contactRoleDialog.isPrimary ?? false,
            evidence: {
              source: "tenant_user_confirmation",
              detail: `Papel ${contactRoleDraft} confirmado na ficha do lead`,
            },
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((payload as any)?.error ?? "Não foi possível confirmar o papel.");
      setCompanyContext(payload as CompanyContext);
      setContactRoleDialog(null);
      toast({ title: "Papel do contato confirmado" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Falha ao confirmar o papel do contato.",
        variant: "destructive",
      });
    } finally {
      setContactRoleSaving(false);
    }
  }

  async function handleStartWhatsappConversation() {
    await handleIniciarConversa();
  }

  const [editingPessoal, setEditingPessoal] = useState(false);
  const [pessoalDraft, setPessoalDraft] = useState({
    tipoPessoa: "fisica" as "fisica" | "juridica",
    // PF fields
    pfNome: "",
    pfCpf: "",
    pfDonome: "",
    dataNascimento: "",
    profissao: "",
    estadoCivil: "",
    genero: "",
    conjugeNome: "",
    conjugeTelefone: "",
    conjugeEmail: "",
    conjugeDataNascimento: "",
    filhos: [] as Array<{ nome: string; dataNascimento: string; genero: string }>,
    specialDates: [] as Array<{ id?: string; name: string; date: string; recurring: boolean; category: string; notes: string; active: boolean }>,
    // PJ fields
    pjCnpj: "",
    pjRazaoSocial: "",
    pjSegmento: "",
    pjNumFuncionarios: "",
    pjFaturamentoEstimado: "",
    socios: [] as Array<{ nome: string; dataNascimento: string; telefone: string; email: string }>,
    // Dados para Contrato
    endereco: "",
    representanteCargo: "",
    representanteNacionalidade: "",
    representanteEstadoCivil: "",
    representanteProfissao: "",
    representanteRg: "",
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
    const tp = ((lead as any).tipoPessoa ?? ((lead as any).source === "prospector" ? "juridica" : "fisica")) as "fisica" | "juridica";
    const dadosPj = (lead as any).dadosPj ?? {};
    // Socios: prefer dadosPj.socios, fallback to metadata.socios for backward compat
    const metaSocios = (dadosPj.socios ?? (lead as any).metadata?.socios ?? []) as Array<{ nome?: string; dataNascimento?: string; telefone?: string; email?: string }>;
    setPessoalDraft({
      tipoPessoa: tp,
      pfNome: lead.nome ?? "",
      pfCpf: lead.documento ?? "",
      pfDonome: (lead as any).metadata?.donome ?? "",
      dataNascimento: lead.dataNascimento ?? "",
      profissao: (lead as any).profissao ?? "",
      estadoCivil: lead.estadoCivil ?? "",
      genero: lead.genero ?? "",
      conjugeNome: lead.conjugeNome ?? "",
      conjugeTelefone: lead.conjugeTelefone ?? "",
      conjugeEmail: lead.conjugeEmail ?? "",
      conjugeDataNascimento: lead.conjugeDataNascimento ?? "",
      filhos: (lead.filhos ?? []).map((f) => ({
        nome: f.nome ?? "",
        dataNascimento: f.dataNascimento ?? "",
        genero: f.genero ?? "",
      })),
      specialDates: (((lead as any).specialDates ?? []) as Array<any>).map((item) => ({
        id: item.id ?? crypto.randomUUID(),
        name: item.name ?? "",
        date: item.date ?? "",
        recurring: item.recurring !== false,
        category: item.category ?? "custom",
        notes: item.notes ?? "",
        active: item.active !== false,
      })),
      pjCnpj: dadosPj.cnpj ?? lead.documento ?? "",
      pjRazaoSocial: dadosPj.razaoSocial ?? lead.empresa ?? "",
      pjSegmento: dadosPj.segmento ?? lead.mercadoSegmento ?? "",
      pjNumFuncionarios: dadosPj.numFuncionarios ?? "",
      pjFaturamentoEstimado: dadosPj.faturamentoEstimado ?? "",
      socios: metaSocios.map((s) => ({
        nome: s.nome ?? "",
        dataNascimento: s.dataNascimento ?? "",
        telefone: s.telefone ?? "",
        email: s.email ?? "",
      })),
      endereco: (lead as any).endereco ?? "",
      representanteCargo: (lead as any).representanteCargo ?? "",
      representanteNacionalidade: (lead as any).representanteNacionalidade ?? "",
      representanteEstadoCivil: (lead as any).representanteEstadoCivil ?? "",
      representanteProfissao: (lead as any).representanteProfissao ?? "",
      representanteRg: (lead as any).representanteRg ?? "",
    });
    setEditingPessoal(true);
  }

  function savePessoal() {
    if (!id) return;
    const sociosFiltrados = pessoalDraft.socios.filter((s) => s.nome.trim());
    const metadataAtual = (lead as any)?.metadata ?? {};
    const isPj = pessoalDraft.tipoPessoa === "juridica";

    updateLead({
      id,
      data: {
        tipoPessoa: pessoalDraft.tipoPessoa,
        // PF fields (clear when PJ)
        nome: isPj ? (lead?.nome ?? "") : (pessoalDraft.pfNome || lead?.nome || ""),
        documento: isPj ? (pessoalDraft.pjCnpj.replace(/\D/g, "") || null) : (pessoalDraft.pfCpf.replace(/\D/g, "") || null),
        dataNascimento: isPj ? null : (pessoalDraft.dataNascimento || null),
        profissao: isPj ? null : (pessoalDraft.profissao.trim() || null),
        ...((!isPj && pessoalDraft.pfDonome.trim()) ? {
          metadata: { ...((lead as any)?.metadata ?? {}), donome: pessoalDraft.pfDonome.trim() },
        } : (!isPj && !(pessoalDraft.pfDonome.trim()) && (lead as any)?.metadata?.donome) ? {
          metadata: { ...((lead as any)?.metadata ?? {}), donome: null },
        } : {}),
        estadoCivil: isPj ? null : (pessoalDraft.estadoCivil || null),
        genero: isPj ? null : (pessoalDraft.genero || null),
        conjugeNome: isPj ? null : (pessoalDraft.conjugeNome || null),
        conjugeTelefone: isPj ? null : (pessoalDraft.conjugeTelefone || null),
        conjugeEmail: isPj ? null : (pessoalDraft.conjugeEmail || null),
        conjugeDataNascimento: isPj ? null : (pessoalDraft.conjugeDataNascimento || null),
        filhos: isPj ? null : (pessoalDraft.filhos.filter((f) => f.nome.trim()).length > 0
          ? pessoalDraft.filhos.filter((f) => f.nome.trim()).map((f) => ({
              nome: f.nome,
              dataNascimento: f.dataNascimento,
              genero: f.genero || null,
            }))
          : null),
        specialDates: pessoalDraft.specialDates
          .filter((item) => item.name.trim() && item.date)
          .map((item) => ({
            id: item.id || crypto.randomUUID(),
            name: item.name.trim(),
            date: item.date,
            recurring: item.recurring,
            category: item.category || "custom",
            notes: item.notes.trim() || undefined,
            active: item.active,
          })),
        // PJ: sync top-level fields + store in dadosPj
        ...(isPj ? {
          empresa: pessoalDraft.pjRazaoSocial || null,
          mercadoSegmento: pessoalDraft.pjSegmento || null,
          dadosPj: {
            cnpj: pessoalDraft.pjCnpj || null,
            razaoSocial: pessoalDraft.pjRazaoSocial || null,
            segmento: pessoalDraft.pjSegmento || null,
            numFuncionarios: pessoalDraft.pjNumFuncionarios || null,
            faturamentoEstimado: pessoalDraft.pjFaturamentoEstimado || null,
            socios: sociosFiltrados.length > 0 ? sociosFiltrados : [],
          },
        } : {
          metadata: {
            ...metadataAtual,
            socios: sociosFiltrados.length > 0 ? sociosFiltrados : [],
          } as any,
        }),
        // Dados para Contrato (aplicável a PF e PJ)
        endereco: pessoalDraft.endereco || null,
        representanteCargo: pessoalDraft.representanteCargo || null,
        representanteNacionalidade: pessoalDraft.representanteNacionalidade || null,
        representanteEstadoCivil: pessoalDraft.representanteEstadoCivil || null,
        representanteProfissao: pessoalDraft.representanteProfissao || null,
        representanteRg: pessoalDraft.representanteRg || null,