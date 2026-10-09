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
  useGetTenantCalendarSettings,
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
  ExternalLink,
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

type CompanyListItem = {
  companyId: string;
  leadId?: string | null;
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: Record<string, string | null> | null;
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

const INTERNAL_PROSPECTOR_METADATA_KEYS = new Set([
  "place_id",
  "prospector_tags",
  "prospector_tags_atualizadas_em",
  "prospector_fontes",
  "prospector_nichos",
  "prospector_localidades",
  "coldProspectDossier",
]);

function formatLeadMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "object" && item !== null
        ? String((item as Record<string, unknown>)["valor"] ?? (item as Record<string, unknown>)["label"] ?? "")
        : String(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>)
      .filter((item) => ["string", "number", "boolean"].includes(typeof item))
      .map(String)
      .join(" · ");
  }
  return String(value ?? "");
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
  const [handoffSending, setHandoffSending] = useState(false);
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
  const [executingApprovedApproach, setExecutingApprovedApproach] = useState(false);

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
    cnpj: "",
    companyId: "",
    endereco: "",
    assignedTo: "",
    objetivo: "",
    urgencia: "",
    logoUrl: "",
    websiteUrl: "",
    extraFields: [] as Array<{ key: string; value: string }>,
  });
  const { data: crmCompaniesData } = useQuery<{ items: CompanyListItem[] }>({
    queryKey: ["crm-companies", tenantId],
    enabled: Boolean(tenantId && editingLeadDados),
    queryFn: async () => {
      const response = await fetch(`${getBase()}/api/crm/companies?tenantId=${encodeURIComponent(tenantId)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("Falha ao carregar empresas");
      return response.json();
    },
  });
  const crmCompanies = crmCompaniesData?.items ?? [];
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const requestUploadUrl = useRequestUploadUrl();

  function openLeadDadosEdit() {
    if (!lead) return;
    const metadata = ((lead as any).metadata ?? {}) as Record<string, unknown>;
    const extraFields = Object.entries(metadata)
      .filter(([key, value]) =>
        !INTERNAL_PROSPECTOR_METADATA_KEYS.has(key) &&
        !["donome", "socios"].includes(key) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
      )
      .map(([key, value]) => ({ key, value: String(value) }));
    setLeadDadosDraft({
      nome: lead.nome ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      empresa: lead.empresa ?? "",
      cnpj: String((lead as any).dadosPj?.cnpj ?? ((lead as any).tipoPessoa === "juridica" ? lead.documento ?? "" : "")).replace(/\D/g, ""),
      companyId: companyContext?.company.id ?? "",
      endereco: (lead as any).endereco ?? "",
      assignedTo: lead.assignedTo ?? "",
      objetivo: lead.objetivo ?? "",
      urgencia: lead.urgencia ?? "",
      logoUrl: (lead as any).logoUrl ?? "",
      websiteUrl: (lead as any).websiteUrl ?? "",
      extraFields,
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

  const [isUpdatingLeadDados, setIsUpdatingLeadDados] = useState(false);

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

  async function saveLeadDados() {
    if (!id) return;
    const metadataAtual = (((lead as any)?.metadata ?? {}) as Record<string, unknown>);
    const metadataEditavel = Object.fromEntries(
      leadDadosDraft.extraFields
        .map((item) => [item.key.trim(), item.value.trim()] as const)
        .filter(([key, value]) => key && value && !INTERNAL_PROSPECTOR_METADATA_KEYS.has(key)),
    );

    setIsUpdatingLeadDados(true);
    try {
      const leadResponse = await fetch(`${getBase()}/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          nome: leadDadosDraft.nome || undefined,
          telefone: leadDadosDraft.telefone || null,
          email: leadDadosDraft.email || null,
          empresa: leadDadosDraft.empresa || null,
          endereco: leadDadosDraft.endereco || null,
          assignedTo: leadDadosDraft.assignedTo || null,
          objetivo: leadDadosDraft.objetivo || null,
          urgencia: leadDadosDraft.urgencia || null,
          logoUrl: leadDadosDraft.logoUrl || null,
          websiteUrl: leadDadosDraft.websiteUrl || null,
          metadata: { ...metadataAtual, ...metadataEditavel },
        }),
      });
      const leadPayload = await leadResponse.json().catch(() => ({}));
      if (!leadResponse.ok) throw new Error((leadPayload as any)?.error ?? "Falha ao atualizar o lead");

      if (leadDadosDraft.companyId) {
        const response = await fetch(`${getBase()}/api/crm/companies/${leadDadosDraft.companyId}/link-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ tenantId, leadId: id, relationshipType: "lead" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as any)?.error ?? "Falha ao vincular empresa");
        setCompanyContext(payload as CompanyContext);
      } else if (leadDadosDraft.cnpj.trim()) {
        const cnpj = leadDadosDraft.cnpj.replace(/\D/g, "");
        if (cnpj.length !== 14) throw new Error("Informe um CNPJ com 14 dígitos.");
        const response = await fetch(`${getBase()}/api/crm/companies/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ tenantId, leadId: id, cnpj, relationshipType: "lead" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as any)?.error ?? "Falha ao cadastrar/vincular empresa");
        setCompanyContext(payload as CompanyContext);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: ["crm-companies", tenantId] }),
      ]);
      setEditingLeadDados(false);
      toast({ title: "Cadastro do lead atualizado." });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Revise os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingLeadDados(false);
    }
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

  useEffect(() => {
    if (!lead || !id || !tenantId) return;
    const cnpj = String((lead as any).dadosPj?.cnpj ?? lead.documento ?? "").replace(/\D/g, "");
    if ((lead as any).tipoPessoa === "juridica" && cnpj.length === 14) {
      void loadOrEnrichCompanyContext(false);
    } else {
      setCompanyContext(null);
      setCompanyContextError(null);
    }
  }, [id, tenantId, lead?.documento, (lead as any)?.tipoPessoa]);

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
      } as any,
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

  async function approveAndExecuteSuggestedApproach() {
    if (!tenantId || !id || executingApprovedApproach) return;
    setExecutingApprovedApproach(true);
    try {
      let res = await fetch(`/api/sdr-templates/send-approach?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id }),
      });
      const prepared = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(prepared?.error ?? "Não foi possível preparar a abordagem");

      if (prepared.sent) {
        toast({ title: "Abordagem executada", description: "A mensagem aprovada foi enviada e registrada no histórico." });
      } else if (prepared.taskId) {
        res = await fetch(`/api/tenants/${tenantId}/agent-tasks/${prepared.taskId}/approve`, { method: "POST" });
        const approved = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(approved?.error ?? "Não foi possível aprovar a abordagem");

        let finished = approved;
        if (approved.status === "aprovado") {
          res = await fetch(`/api/tenants/${tenantId}/agent-tasks/${prepared.taskId}/execute`, { method: "POST" });
          finished = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(finished?.error ?? "A abordagem foi aprovada, mas não pôde ser executada");
        }

        if (finished.status === "concluido") {
          toast({ title: "Aprovado e executado", description: "O agente enviou a abordagem aprovada pelo WhatsApp." });
        } else {
          toast({ title: "Abordagem aprovada", description: "A ação ficou registrada para execução conforme o nível de autonomia configurado." });
        }
      } else {
        throw new Error("Não há uma abordagem executável para este lead neste momento.");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) }),
        queryClient.invalidateQueries({ queryKey: getListTenantConversationsQueryKey(tenantId) }),
        queryClient.invalidateQueries({ queryKey: getGetOrCreateLeadIntelligenceQueryKey(tenantId, id) }),
      ]);
    } catch (error) {
      toast({
        title: "Não foi possível executar a abordagem",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setExecutingApprovedApproach(false);
    }
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

  const { data: leadPropostas, isLoading: propostasLoading } = useListPropostas(
    tenantId,
    { leadId: id },
    {
      query: {
        enabled: !!(tenantId && id),
        queryKey: getListPropostasQueryKey(tenantId, { leadId: id }),
      },
    }
  );

  const activeDealId = activeLeadDeal?.id ?? "";
  const { data: dealPropostas = [], isLoading: dealPropostasLoading } = useListPropostas(
    tenantId,
    { dealId: activeDealId },
    {
      query: {
        enabled: !!(tenantId && activeDealId),
        queryKey: getListPropostasQueryKey(tenantId, { dealId: activeDealId }),
      },
    }
  );

  const orcamentosDoAtendimento = Array.from(
    new Map(
      [...(leadPropostas ?? []), ...(dealPropostas ?? [])].map((orcamento) => [orcamento.id, orcamento] as const),
    ).values(),
  );
  const orcamentoExistente = [...orcamentosDoAtendimento].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  )[0] ?? null;

  // Reconcilia apenas vínculos de orçamentos já existentes.
  // Nunca cria um novo orçamento automaticamente nesta tela.
  const budgetReconcileAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeLeadDeal || activeLeadDeal.etapa !== "proposta" || !id || !tenantId) return;
    if (propostasLoading || dealPropostasLoading || orcamentoExistente) return;

    const reconcileKey = `${id}:${activeLeadDeal.id}`;
    if (budgetReconcileAttemptedRef.current === reconcileKey) return;
    budgetReconcileAttemptedRef.current = reconcileKey;

    void fetch(`/api/tenants/${tenantId}/leads/${id}/propostas/reconcile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ dealId: activeLeadDeal.id }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.error ?? "Não foi possível sincronizar o orçamento existente.");
        }
        if (!body?.proposal) return;

        await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
        await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: id }) });
        await queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { dealId: activeLeadDeal.id }) });
      })
      .catch((error) => {
        console.error("Falha ao reconciliar orçamento existente", error);
      });
  }, [
    activeLeadDeal?.id,
    activeLeadDeal?.etapa,
    dealPropostasLoading,
    id,
    orcamentoExistente?.id,
    propostasLoading,
    queryClient,
    tenantId,
  ]);

  // ── Edição de status de atividade ─────────────────────────────────────────
  const [activityStatusEditId, setActivityStatusEditId] = useState<string | null>(null);
  const [activityStatusDraft, setActivityStatusDraft] = useState<string>("");
  const [activityResultadoDraft, setActivityResultadoDraft] = useState("");
  const [activityNextActionDraft, setActivityNextActionDraft] = useState("");
  const [activityDueEditId, setActivityDueEditId] = useState<string | null>(null);
  const [activityDueDateDraft, setActivityDueDateDraft] = useState("");

  const { mutate: updateActivity, isPending: isUpdatingActivity } = useUpdateActivity({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });
        setActivityStatusEditId(null);
        setActivityResultadoDraft("");
        setActivityNextActionDraft("");
        setActivityDueEditId(null);
        setActivityDueDateDraft("");
        toast({ title: "Atividade atualizada." });
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
      setActivityNextActionDraft("");
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
        proximaAcaoTexto: activityNextActionDraft.trim() || undefined,
        estadoExecucao: "concluida",
      } as any,
    });
  }

  function openActivityDueDateEdit(activityId: string, currentValue?: string | null) {
    let nextValue = "";
    if (currentValue) {
      if (currentValue.length === 10) nextValue = currentValue;
      else {
        const date = new Date(currentValue);
        if (!Number.isNaN(date.getTime())) {
          date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
          nextValue = date.toISOString().slice(0, 10);
        }
      }
    }
    setActivityDueDateDraft(nextValue);
    setActivityDueEditId(activityId);
  }

  function saveActivityDueDate(activityId: string) {
    if (!activityDueDateDraft) {
      toast({ title: "Selecione a nova data da tarefa.", variant: "destructive" });
      return;
    }
    updateActivity({
      id: activityId,
      data: { dataVencimento: new Date(activityDueDateDraft + "T12:00:00") },
    });
  }

  // ── Nova Atividade ────────────────────────────────────────────────────────
  const [isNewActivityOpen, setIsNewActivityOpen] = useState(false);
  const [newActivityTipo, setNewActivityTipo] = useState<"ligacao" | "whatsapp" | "email" | "visita" | "tarefa" | "reuniao" | "assistencia">("tarefa");
  const [newActivityTitulo, setNewActivityTitulo] = useState("");
  const [newActivityDescricao, setNewActivityDescricao] = useState("");
  const [newActivityObjetivo, setNewActivityObjetivo] = useState("");
  const [newActivityResultadoEsperado, setNewActivityResultadoEsperado] = useState("");
  const [newActivityPrioridade, setNewActivityPrioridade] = useState<"baixa" | "normal" | "alta" | "urgente">("normal");
  const [newActivityData, setNewActivityData] = useState("");
  const [newActivityResponsavelId, setNewActivityResponsavelId] = useState<string>("__ia__");
  // Reunião online
  const [newActivityDataHoraInicio, setNewActivityDataHoraInicio] = useState("");
  const [newActivityDataHoraFim, setNewActivityDataHoraFim] = useState("");
  const [newActivityAgendaId, setNewActivityAgendaId] = useState<string>("");
  const [newActivityGerarMeet, setNewActivityGerarMeet] = useState(false);
  // Anexo
  const [newActivityAnexoFile, setNewActivityAnexoFile] = useState<File | null>(null);
  const [newActivityAnexoCategoria, setNewActivityAnexoCategoria] = useState<"projeto" | "imagem" | "documento" | "outras_informacoes">("documento");
  const [newActivityFalouComDecisor, setNewActivityFalouComDecisor] = useState(true);
  const [newActivityNomeGatekeeper, setNewActivityNomeGatekeeper] = useState("");
  const [isUploadingAnexo, setIsUploadingAnexo] = useState(false);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  // Assistência — coleta estruturada antes de enviar ao suporte.
  const [newAssistenciaCategoria, setNewAssistenciaCategoria] = useState("defeito");
  const [newAssistenciaRelato, setNewAssistenciaRelato] = useState("");
  const [newAssistenciaDealId, setNewAssistenciaDealId] = useState("");
  const [newAssistenciaProdutos, setNewAssistenciaProdutos] = useState("");
  const [newAssistenciaPrioridade, setNewAssistenciaPrioridade] = useState("normal");
  const [newAssistenciaFiles, setNewAssistenciaFiles] = useState<File[]>([]);
  const [newAssistenciaAgendar, setNewAssistenciaAgendar] = useState(false);

  const { data: tenantUsers } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) },
  });
  const { data: agendas } = useListAgendas(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListAgendasQueryKey(tenantId) },
  });
  const agendasOrdenadasParaSuporte = [...(agendas ?? [])].sort((a, b) => {
    const score = (name: string) => /suporte|assist[eê]ncia|p[oó]s[- ]?venda|t[eé]cnica/i.test(name) ? 0 : 1;
    return score(a.nome) - score(b.nome) || a.nome.localeCompare(b.nome, "pt-BR");
  });
  const { data: calendarSettings } = useGetTenantCalendarSettings(tenantId, {
    query: { enabled: !!tenantId },
  });
  const assistenciaScheduleDefault = (((calendarSettings as any)?.activityScheduleDefaults ?? []) as Array<{
    activityType: string;
    enabled: boolean;
    weekday: number;
    agendaId?: string | null;
  }>).find((item) => item.activityType === "assistencia");

  const { mutate: createActivity, isPending: isCreatingActivity } = useCreateActivity({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });
        setIsNewActivityOpen(false);
        setNewActivityTitulo("");
        setNewActivityDescricao("");
        setNewActivityObjetivo("");
        setNewActivityResultadoEsperado("");
        setNewActivityPrioridade("normal");
        setNewActivityData("");
        setNewActivityTipo("tarefa");
        setNewActivityResponsavelId("__ia__");
        setNewActivityDataHoraInicio("");
        setNewActivityDataHoraFim("");
        setNewActivityAgendaId("");
        setNewActivityGerarMeet(false);
        setNewActivityAnexoFile(null);
        setNewActivityAnexoCategoria("documento");
        setNewActivityFalouComDecisor(true);
        setNewActivityNomeGatekeeper("");
        toast({ title: "Atividade criada." });
      },
      onError: () => {
        toast({ title: "Erro ao criar atividade", variant: "destructive" });
      },
    },
  });

  function nextWeekdayDate(weekday: number) {
    const now = new Date();
    const date = new Date(now);
    let delta = (weekday - now.getDay() + 7) % 7;
    if (delta === 0 && now.getHours() >= 18) delta = 7;
    date.setDate(now.getDate() + delta);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function applyAssistenciaPreAgendaDefault() {
    if (!assistenciaScheduleDefault?.enabled) return;
    const suggestedDate = nextWeekdayDate(assistenciaScheduleDefault.weekday);
    setNewActivityData(suggestedDate);
    if (assistenciaScheduleDefault.agendaId && (agendas ?? []).some((agenda) => agenda.id === assistenciaScheduleDefault.agendaId)) {
      setNewActivityAgendaId(assistenciaScheduleDefault.agendaId);
    } else if (!newActivityAgendaId && agendasOrdenadasParaSuporte[0]?.id) {
      setNewActivityAgendaId(agendasOrdenadasParaSuporte[0].id);
    }
  }

  function prefillAssistenciaTimeFromDate() {
    const date = newActivityData || (assistenciaScheduleDefault?.enabled
      ? nextWeekdayDate(assistenciaScheduleDefault.weekday)
      : "");
    if (!date) return;
    setNewActivityData(date);
    if (!newActivityDataHoraInicio) setNewActivityDataHoraInicio(`${date}T08:00`);
    if (!newActivityDataHoraFim) setNewActivityDataHoraFim(`${date}T09:00`);
  }

  useEffect(() => {
    if (!isNewActivityOpen || newActivityTipo !== "assistencia" || !assistenciaScheduleDefault?.enabled || newActivityData) return;
    applyAssistenciaPreAgendaDefault();
  }, [
    isNewActivityOpen,
    newActivityTipo,
    newActivityData,
    assistenciaScheduleDefault?.enabled,
    assistenciaScheduleDefault?.weekday,
    assistenciaScheduleDefault?.agendaId,
  ]);

  function openNewActivityDialog(prefillTitulo?: string) {
    setNewActivityTitulo(prefillTitulo ?? "");
    setNewActivityDescricao("");
    setNewActivityObjetivo("");
        setNewActivityResultadoEsperado("");
        setNewActivityPrioridade("normal");
        setNewActivityData("");
    setNewActivityTipo("tarefa");
    setNewActivityResponsavelId("__ia__");
    setNewActivityDataHoraInicio("");
    setNewActivityDataHoraFim("");
    setNewActivityAgendaId("");
    setNewActivityGerarMeet(false);
    setNewActivityAnexoFile(null);
    setNewActivityAnexoCategoria("documento");
    setNewActivityFalouComDecisor(true);
    setNewActivityNomeGatekeeper("");
    setNewAssistenciaCategoria("defeito");
    setNewAssistenciaRelato("");
    setNewAssistenciaDealId("");
    setNewAssistenciaProdutos("");
    setNewAssistenciaPrioridade("normal");
    setNewAssistenciaFiles([]);
    setIsNewActivityOpen(true);
  }

  async function handleCreateActivity() {
    if (!tenantId || !id || !newActivityTitulo.trim()) return;

    if (newActivityTipo === "assistencia") {
      const responsavelId = newActivityResponsavelId === "__ia__" ? "" : newActivityResponsavelId;
      if (!responsavelId) {
        toast({ title: "Assistência precisa de um responsável", variant: "destructive" });
        return;
      }
      if (newAssistenciaRelato.trim().length < 10) {
        toast({ title: "Descreva claramente o problema antes de abrir o chamado", variant: "destructive" });
        return;
      }
      if (newAssistenciaAgendar && (!newActivityAgendaId || !newActivityDataHoraInicio || !newActivityDataHoraFim)) {
        toast({ title: "Selecione a agenda de suporte e informe início e fim do atendimento", variant: "destructive" });
        return;
      }
      if (newAssistenciaAgendar && new Date(newActivityDataHoraFim) <= new Date(newActivityDataHoraInicio)) {
        toast({ title: "O horário final deve ser posterior ao início", variant: "destructive" });
        return;
      }

      setIsUploadingAnexo(true);
      try {
        const proposal = newAssistenciaDealId
          ? (leadPropostas ?? []).find((p) => p.dealId === newAssistenciaDealId)
          : undefined;
        const supportRes = await fetch(`/api/tenants/${tenantId}/support-cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({
            leadId: id,
            dealId: newAssistenciaDealId || null,
            propostaId: proposal?.id ?? null,
            titulo: newActivityTitulo.trim(),
            relato: newAssistenciaRelato.trim(),
            categoria: newAssistenciaCategoria,
            produtos: newAssistenciaProdutos.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean),
            responsavelId,
            prioridade: newAssistenciaPrioridade,
            dataVencimento: newActivityData || undefined,
            agendaId: newAssistenciaAgendar ? newActivityAgendaId : undefined,
            dataHoraInicio: newAssistenciaAgendar && newActivityDataHoraInicio ? new Date(newActivityDataHoraInicio).toISOString() : undefined,
            dataHoraFim: newAssistenciaAgendar && newActivityDataHoraFim ? new Date(newActivityDataHoraFim).toISOString() : undefined,
            origem: "humano",
          }),
        });
        const supportBody = await supportRes.json().catch(() => ({}));
        if (!supportRes.ok) throw new Error(supportBody.error || "Falha ao abrir assistência");

        const files = [
          ...newAssistenciaFiles,
          ...(newActivityAnexoFile ? [newActivityAnexoFile] : []),
        ];
        for (const file of files) {
          const metaRes = await fetch("/api/storage/uploads/request-url", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
          });
          if (!metaRes.ok) throw new Error(`Falha ao preparar o anexo ${file.name}`);
          const { uploadURL, objectPath } = await metaRes.json();
          const putRes = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (!putRes.ok) throw new Error(`Falha ao enviar ${file.name}`);
          const attachmentRes = await fetch(`/api/work-cards/${supportBody.card.id}/attachments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({
              nome: file.name,
              url: `/api/storage${objectPath}`,
              mimeType: file.type || "application/octet-stream",
              tamanho: file.size,
              origem: "abertura_chamado",
            }),
          });
          if (!attachmentRes.ok) throw new Error(`Falha ao registrar ${file.name}`);
        }

        await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });
        setIsNewActivityOpen(false);
        setNewActivityTitulo("");
        setNewActivityDescricao("");
        setNewActivityData("");
        setNewActivityTipo("tarefa");
        setNewActivityResponsavelId("__ia__");
        setNewActivityAnexoFile(null);
        setNewAssistenciaRelato("");
        setNewAssistenciaDealId("");
        setNewAssistenciaProdutos("");
        setNewAssistenciaFiles([]);
        toast({
          title: `Assistência ${supportBody.card.codigo} aberta`,
          description: "O card já está na Pipeline de Suporte e foi atribuído ao responsável.",
        });
      } catch (error) {
        toast({ title: "Erro ao abrir assistência", description: String(error), variant: "destructive" });
      } finally {
        setIsUploadingAnexo(false);
      }
      return;
    }

    const responsavelId = newActivityResponsavelId === "__ia__" ? undefined : newActivityResponsavelId;
    const isReuniao = newActivityTipo === "reuniao";

    let anexoNome: string | undefined;
    let anexoUrl: string | undefined;
    let anexoMimeType: string | undefined;
    let anexoTamanho: number | undefined;
    let anexoCategoria: "projeto" | "imagem" | "documento" | "outras_informacoes" | undefined;

    if (newActivityAnexoFile) {
      setIsUploadingAnexo(true);
      try {
        const metaRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newActivityAnexoFile.name,
            size: newActivityAnexoFile.size,
            contentType: newActivityAnexoFile.type || "application/octet-stream",
          }),
        });
        if (!metaRes.ok) throw new Error("Falha ao obter URL de upload");
        const { uploadURL, objectPath } = (await metaRes.json()) as { uploadURL: string; objectPath: string };

        const putRes = await fetch(uploadURL, {
          method: "PUT",
          body: newActivityAnexoFile,
          headers: { "Content-Type": newActivityAnexoFile.type || "application/octet-stream" },
        });
        if (!putRes.ok) throw new Error("Falha ao enviar anexo");

        anexoNome = newActivityAnexoFile.name;
        anexoUrl = `/api/storage${objectPath}`;
        anexoMimeType = newActivityAnexoFile.type;
        anexoTamanho = newActivityAnexoFile.size;
        anexoCategoria = newActivityAnexoCategoria;
      } catch (err) {
        toast({ title: "Erro ao enviar anexo", variant: "destructive" });
        setIsUploadingAnexo(false);
        return;
      }
      setIsUploadingAnexo(false);
    }

    const data: Parameters<typeof createActivity>[0]["data"] = {
      tenantId,
      leadId: id,
      tipo: newActivityTipo,
      titulo: newActivityTitulo.trim(),
      descricao: (() => {
        if (newActivityTipo === "visita") {
          const parts: string[] = [];
          if (!newActivityFalouComDecisor) {
            parts.push("falou_com_decisor:false");
            if (newActivityNomeGatekeeper.trim()) parts.push(`falou com: ${newActivityNomeGatekeeper.trim()}`);
          } else {
            parts.push("falou_com_decisor:true");
          }
          if (newActivityDescricao.trim()) parts.push(newActivityDescricao.trim());
          return parts.join("\n") || undefined;
        }
        return newActivityDescricao.trim() || undefined;
      })(),
      dataVencimento: isReuniao ? undefined : (newActivityData || undefined),
      status: "planejado",
      estadoExecucao: "planejada",
      prioridade: newActivityPrioridade,
      objetivo: newActivityObjetivo.trim() || undefined,
      resultadoEsperado: newActivityResultadoEsperado.trim() || undefined,
      categoriaExecucao: newActivityResponsavelId === "__ia__" ? "automatica" : "sugerida",
      origem: "manual",
      dealId: activeLeadDeal?.id || undefined,
      responsavelId,
      anexoNome,
      anexoUrl,
      anexoMimeType,
      anexoTamanho,
      anexoCategoria,
    };
    if (isReuniao) {
      data.agendaId = newActivityAgendaId || undefined;
      data.dataHoraInicio = newActivityDataHoraInicio ? new Date(newActivityDataHoraInicio).toISOString() : undefined;
      data.dataHoraFim = newActivityDataHoraFim ? new Date(newActivityDataHoraFim).toISOString() : undefined;
      data.gerarMeet = newActivityGerarMeet;
    }
    createActivity({ data });
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

  async function transferActivityToCompany(activity: any) {
    if (!activity?.id || handoffSending) return;
    const toTenantId = window.prompt("ID da empresa destino (tenant):", "");
    if (!toTenantId?.trim()) return;
    const reason = window.prompt("Motivo da transferência:", "Continuidade da execução entre empresas");
    if (!reason?.trim()) return;
    const modeInput = window.prompt("Tipo: responsabilidade ou etapa", "responsabilidade");
    const mode = modeInput?.trim().toLowerCase() === "etapa" ? "stage" : "responsibility";
    const slaInput = window.prompt("SLA (data/hora opcional, ex.: 2026-10-10T18:00):", "");
    setHandoffSending(true);
    try {
      const response = await fetch(`/api/activities/${activity.id}/handoff`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ toTenantId: toTenantId.trim(), reason: reason.trim(), mode, slaDueAt: slaInput?.trim() ? new Date(slaInput.trim()).toISOString() : undefined }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || body?.error || "Não foi possível transferir.");
      await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });
      toast({ title: "Transferência enviada", description: "A empresa destino agora precisa aceitar a atividade." });
    } catch (error) {
      toast({ title: "Transferência não realizada", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setHandoffSending(false); }
  }
  function getActivityOpenLabel(activity: any): string {
    const text = `${activity?.tipo ?? ""} ${activity?.origem ?? ""} ${activity?.titulo ?? ""}`.toLowerCase();
    if (text.includes("assistencia") || text.includes("assistência")) return "Abrir assistência";
    if (text.includes("orcamento") || text.includes("orçamento")) return "Abrir orçamento";
    if (text.includes("proposta")) return "Abrir proposta";
    if (activity?.tipo === "reuniao" || text.includes("reunião") || text.includes("reuniao")) return "Abrir agendamento";
    if (text.includes("instalacao") || text.includes("instalação")) return "Abrir instalação";
    if (text.includes("entrega")) return "Abrir entrega";
    return "Abrir tarefa";
  }

  async function openActivityObject(activity: any) {
    const text = `${activity?.tipo ?? ""} ${activity?.origem ?? ""} ${activity?.titulo ?? ""}`.toLowerCase();

    if (text.includes("assistencia") || text.includes("assistência") || activity?.tipo === "assistencia") {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/work-cards?pipeline=suporte`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (response.ok) {
          const cards = await response.json() as Array<{ id: string; codigo?: string | null; leadId?: string | null; dealId?: string | null }>;
          const codeMatch = String(activity?.titulo ?? "").match(/\bAST-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase();
          const exact = codeMatch
            ? cards.find((card) => String(card.codigo ?? "").toUpperCase() === codeMatch)
            : undefined;
          const related = exact ?? cards.find((card) =>
            card.leadId === id && (!activity?.dealId || card.dealId === activity.dealId)
          );
          if (related?.id) {
            setLocation(`/pipeline-operacional/suporte?card=${encodeURIComponent(related.id)}`);
            return;
          }
        }
      } catch {
        // Fallback abaixo mantém a navegação disponível mesmo se a busca do card falhar.
      }
      setLocation("/pipeline-operacional/suporte");
      return;
    }

    if (text.includes("orcamento") || text.includes("orçamento")) {
      if (orcamentoExistente?.id) {
        const returnTo = `/leads/${id}`;
        setLocation(`/propostas?edit=${encodeURIComponent(orcamentoExistente.id)}&returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      setPropostaModalOpen(true);
      return;
    }

    if (text.includes("proposta")) {
      setLeadWorkspaceTab("proposta");
      requestAnimationFrame(() => {
        document.getElementById("lead-workspace-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (activity?.tipo === "reuniao" || text.includes("reunião") || text.includes("reuniao")) {
      setLocation(`/agenda?activity=${encodeURIComponent(activity.id)}`);
      return;
    }

    if (text.includes("instalacao") || text.includes("instalação") || text.includes("entrega")) {
      setLocation(activity?.dealId
        ? `/pipeline-operacional?dealId=${encodeURIComponent(activity.dealId)}`
        : "/pipeline-operacional");
      return;
    }

    if (activity?.dealId) {
      setLocation(`/negocios?dealId=${encodeURIComponent(activity.dealId)}`);
      return;
    }

    setOpenActivityId(activity.id);
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              if (orcamentoExistente) {
                const returnTo = `/leads/${id}`;
                setLocation(
                  `/propostas?edit=${encodeURIComponent(orcamentoExistente.id)}&returnTo=${encodeURIComponent(returnTo)}`
                );
                return;
              }
              setPropostaModalOpen(true);
            }}
            disabled={propostasLoading || dealPropostasLoading}
            data-testid="btn-new-budget"
          >
            <FileText className="h-4 w-4" />
            {orcamentoExistente ? "Abrir orçamento" : "Gerar orçamento"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setLeadWorkspaceTab("proposta");
              requestAnimationFrame(() => {
                document.getElementById("lead-workspace-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            data-testid="btn-open-proposals"
          >
            <Sparkles className="h-4 w-4" />
            Propostas
          </Button>
          <Button
            size="sm"
            className="bg-[#25D366] hover:bg-[#1ebe5d] text-white gap-1.5"
            onClick={openDirectWhatsApp}
            disabled={!lead.telefone}
            title={lead.telefone ? `Abrir conversa com ${lead.telefone}` : "WhatsApp não cadastrado"}
            data-testid="btn-start-whatsapp"
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" }}
            onClick={openDirectInstagram}
            disabled={!normalizeInstagramHandle((lead as { instagramHandle?: string | null }).instagramHandle)}
            title={normalizeInstagramHandle((lead as { instagramHandle?: string | null }).instagramHandle) ? `Abrir conversa com @${normalizeInstagramHandle((lead as { instagramHandle?: string | null }).instagramHandle)}` : "Instagram não cadastrado"}
            data-testid="btn-start-instagram"
          >
            <InstagramIcon className="h-4 w-4" />
            Instagram
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAgendarOpen(true)}
          >
            <CalendarDays className="h-4 w-4" />
            Agendar reunião
          </Button>
          {lead.naoLeadTipo ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={naoLeadSalvando}
              onClick={() => void reclassificarComoLead()}
            >
              <UserCog className="h-4 w-4" />
              Voltar a ser lead
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setNaoLeadOpen(true)}
            >
              <UserCog className="h-4 w-4" />
              Classificar como Não Lead
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
                {/* Campos extras — importados via CSV com colunas fora do
                    padrão (nome, telefone, email etc.) e guardados em
                    metadata. donome/socios já têm exibição própria em
                    outro lugar da ficha, não repete aqui. */}
                {Object.entries((lead as any).metadata ?? {})
                  .filter(([key, value]) => !["donome", "socios"].includes(key) && !INTERNAL_PROSPECTOR_METADATA_KEYS.has(key) && value != null && formatLeadMetadataValue(value).trim() !== "")
                  .map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                      <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                        <Tag className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs capitalize">{key.replace(/_/g, " ")}</span>
                      </dt>
                      <dd className="text-foreground break-words">{formatLeadMetadataValue(value)}</dd>
                    </div>
                  ))}
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
                {lead.assignedTo && (() => {
                  const responsible = tenantUsers?.find((u) => u.id === lead.assignedTo);
                  const name = responsible?.name || responsible?.email || lead.assignedTo;
                  return (
                    <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                      <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                        <UserRound className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">Responsável</span>
                      </dt>
                      <dd className="text-foreground">{name}</dd>
                    </div>
                  );
                })()}
                {(lead as any).maturidadeIA && (() => {
                  const matMap: Record<number, { label: string; color: string; emoji: string }> = {
                    1: { label: "Manual, sem sistema", color: "text-orange-600 bg-orange-50 border-orange-200", emoji: "✋" },
                    2: { label: "Tem sistema, sem IA", color: "text-blue-600 bg-blue-50 border-blue-200", emoji: "⚙️" },
                    3: { label: "Já usa IA/automação", color: "text-emerald-600 bg-emerald-50 border-emerald-200", emoji: "🤖" },
                  };
                  const m = matMap[(lead as any).maturidadeIA as number];
                  if (!m) return null;
                  return (
                    <div className="grid grid-cols-[7rem_1fr] gap-x-2 items-start">
                      <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 pt-px">
                        <span className="text-xs">Maturidade IA</span>
                      </dt>
                      <dd>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${m.color}`}>
                          {m.emoji} {m.label}
                        </span>
                        {(lead as any).dataRespostaPesquisa && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Respondido em {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date((lead as any).dataRespostaPesquisa))}
                          </p>
                        )}
                      </dd>
                    </div>
                  );
                })()}
              </dl>
              <div className="mt-3 pt-2.5 border-t">
                <p className="text-xs text-muted-foreground">
                  Criado em {formatDate(lead.createdAt)}
                </p>
              </div>
            </CardContent>
          </Card>

          {(lead as any).tipoPessoa === "juridica" && (
            <Card data-testid="card-company-context">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Empresa e contatos
                  </span>
                  <div className="flex items-center gap-1">
                    {companyContext?.company?.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLocation(`/empresas/${companyContext.company.id}`)}
                        className="h-7 text-xs"
                      >
                        Abrir empresa
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void loadOrEnrichCompanyContext(true)}
                      disabled={companyContextLoading}
                      className="h-7 text-xs"
                    >
                      {companyContextLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      <span className="ml-1">Enriquecer</span>
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {companyContextLoading && !companyContext && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Buscando dados empresariais e QSA...
                  </div>
                )}
                {companyContextError && (
                  <p className="text-xs text-destructive">{companyContextError}</p>
                )}
                {companyContext && (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">{companyContext.company.nomeFantasia || companyContext.company.razaoSocial || lead.empresa}</p>
                      <p className="text-xs text-muted-foreground font-mono">CNPJ {companyContext.company.cnpj}</p>
                      {companyContext.company.razaoSocial && companyContext.company.razaoSocial !== companyContext.company.nomeFantasia && (
                        <p className="text-xs text-muted-foreground">{companyContext.company.razaoSocial}</p>
                      )}
                      {companyContext.company.cnaePrincipal && (
                        <p className="text-xs text-muted-foreground">{companyContext.company.cnaePrincipal}</p>
                      )}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {companyContext.company.situacaoCadastral && <Badge variant="outline">{companyContext.company.situacaoCadastral}</Badge>}
                        {companyContext.company.porte && <Badge variant="outline">{companyContext.company.porte}</Badge>}
                      </div>
                    </div>
                    {!!((companyContext.relationships?.parents?.length ?? 0) + (companyContext.relationships?.children?.length ?? 0)) && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Estrutura societária</p>
                        <div className="flex flex-wrap gap-1">
                          {companyContext.relationships?.parents?.map((rel) => (
                            <Badge key={rel.id} variant="outline" className="text-[10px] capitalize">
                              ↑ {rel.relationshipType.replace(/_/g, " ")}
                            </Badge>
                          ))}
                          {companyContext.relationships?.children?.map((rel) => (
                            <Badge key={rel.id} variant="outline" className="text-[10px] capitalize">
                              ↓ {rel.relationshipType.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contatos relacionados</p>
                        <Badge variant="secondary">{companyContext.contacts.length}</Badge>
                      </div>
                      {companyContext.contacts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum contato vinculado ainda.</p>
                      ) : (
                        <div className="space-y-2">
                          {companyContext.contacts.map((contact) => (
                            <div key={contact.personId} className="rounded-md border p-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">{contact.nome}</p>
                                  {(contact.cargo || contact.qualificacao) && (
                                    <p className="text-xs text-muted-foreground">{contact.cargo || contact.qualificacao}</p>
                                  )}
                                </div>
                                {contact.verifiedAt && contact.isPrimary && <Badge className="text-[10px]">Principal</Badge>}
                              </div>
                              {contact.verifiedAt && !!contact.roles?.length ? (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {contact.roles.map((role) => <Badge key={role} variant="outline" className="text-[10px] capitalize">{role}</Badge>)}
                                  <Badge variant="secondary" className="text-[10px]">papel confirmado</Badge>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {contact.metadata?.discoveredBy === "qsa" && (
                                    <Badge variant="outline" className="text-[10px]">QSA</Badge>
                                  )}
                                  <Badge variant="secondary" className="text-[10px]">papel comercial a confirmar</Badge>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => {
                                      setContactRoleDraft("comercial");
                                      setContactRoleDialog(contact);
                                    }}
                                  >
                                    Confirmar papel
                                  </Button>
                                </div>
                              )}
                              {(contact.telefones?.[0] || contact.emails?.[0]) && (
                                <div className="mt-2 space-y-1 text-xs">
                                  {contact.telefones?.[0] && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{contact.telefones[0]}</p>}
                                  {contact.emails?.[0] && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{contact.emails[0]}</p>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog open={!!contactRoleDialog} onOpenChange={(open) => !open && setContactRoleDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Confirmar papel do contato</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">{contactRoleDialog?.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {contactRoleDialog?.qualificacao || contactRoleDialog?.cargo || "Vínculo identificado"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Papel nesta empresa</p>
                  <Select value={contactRoleDraft} onValueChange={setContactRoleDraft}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="decisor">Decisor</SelectItem>
                      <SelectItem value="compras">Compras</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="administrativo">Administrativo</SelectItem>
                      <SelectItem value="suporte">Suporte</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    O QSA comprova o vínculo societário, mas este papel só será usado pelos agentes após sua confirmação.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setContactRoleDialog(null)} disabled={contactRoleSaving}>
                  Cancelar
                </Button>
                <Button onClick={() => void confirmCompanyContactRole()} disabled={contactRoleSaving}>
                  {contactRoleSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dados Pessoais */}
          <Card data-testid="card-dados-pessoais">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Dados Pessoais
                  {(lead as any).tipoPessoa === "juridica" ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                      <Building2 className="h-2.5 w-2.5" /> PJ
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">PF</Badge>
                  )}
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
              {(() => {
                const tipoPessoa = (lead as any).tipoPessoa ?? "fisica";
                const dadosPj = (lead as any).dadosPj ?? {};
                const sociosPj = (dadosPj.socios ?? (lead as any).metadata?.socios ?? []) as Array<{ nome?: string; dataNascimento?: string; telefone?: string; email?: string }>;

                if (tipoPessoa === "juridica") {
                  const hasPjData = dadosPj.cnpj || dadosPj.razaoSocial || dadosPj.segmento || dadosPj.numFuncionarios || dadosPj.faturamentoEstimado || sociosPj.length > 0;
                  if (!hasPjData) {
                    return (
                      <p className="text-xs text-muted-foreground italic">
                        Clique em editar para adicionar dados da empresa.
                      </p>
                    );
                  }
                  const faturamentoLabels: Record<string, string> = {
                    ate_10k: "Até R$ 10 mil/mês",
                    "10k_50k": "R$ 10–50 mil/mês",
                    "50k_200k": "R$ 50–200 mil/mês",
                    "200k_1m": "R$ 200 mil–1 mi/mês",
                    acima_1m: "Acima de R$ 1 mi/mês",
                  };
                  return (
                    <>
                      {dadosPj.cnpj && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-mono text-xs">{dadosPj.cnpj}</span>
                        </div>
                      )}
                      {dadosPj.razaoSocial && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{dadosPj.razaoSocial}</span>
                        </div>
                      )}
                      {dadosPj.segmento && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="h-3.5 w-3.5 shrink-0" />
                          <span>{dadosPj.segmento}</span>
                        </div>
                      )}
                      {dadosPj.numFuncionarios && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span>{dadosPj.numFuncionarios} funcionários</span>
                        </div>
                      )}
                      {dadosPj.faturamentoEstimado && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <DollarSign className="h-3.5 w-3.5 shrink-0" />
                          <span>{faturamentoLabels[dadosPj.faturamentoEstimado] ?? dadosPj.faturamentoEstimado}</span>
                        </div>
                      )}
                      {sociosPj.length > 0 && (
                        <div className="space-y-1 border-l-2 border-muted pl-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sócios</p>
                          {sociosPj.map((s, i) => (
                            <div key={i} className="space-y-0.5">
                              <p className="font-medium">{s.nome}</p>
                              {s.telefone && (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  <Phone className="h-3 w-3" />
                                  <span className="font-mono">{s.telefone}</span>
                                </div>
                              )}
                              {s.email && (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  <Mail className="h-3 w-3" />
                                  <span>{s.email}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                }

                // Pessoa Física
                if (!lead.documento && !lead.dataNascimento && !lead.estadoCivil && !lead.conjugeNome && !lead.filhos?.length) {
                  return (
                    <p className="text-xs text-muted-foreground italic">
                      Clique em editar para adicionar dados pessoais.
                    </p>
                  );
                }
                return (
                  <>
                    {(lead as any).metadata?.donome && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <UserRound className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">
                          <span className="text-muted-foreground/70 mr-1">Dono:</span>
                          {(lead as any).metadata.donome}
                        </span>
                      </div>
                    )}
                    {lead.documento && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-mono text-xs">
                          {lead.documento.length === 11
                            ? lead.documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
                            : lead.documento}
                        </span>
                      </div>
                    )}
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
                            <span>{filho.nome}{filho.genero ? ` (${filho.genero === "masculino" ? "M" : "F"})` : ""}</span>
                            {filho.dataNascimento && (
                              <span className="text-xs ml-auto">🎂 {formatBirthday(filho.dataNascimento)}</span>
                            )}
                            {filho.source === "extracted_from_conversation" && (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded ml-auto">IA</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {lead.conjugeNome && (
                      <SpouseConsentBlock leadId={id} />
                    )}
                    {lead.empresa && (() => {
                      const socios = ((lead as any).metadata?.socios ?? []) as Array<{ nome?: string; dataNascimento?: string; telefone?: string; email?: string }>;
                      if (socios.length === 0) return null;
                      return (
                        <div className="space-y-1 border-l-2 border-muted pl-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sócios</p>
                          {socios.map((s, i) => (
                            <div key={i} className="space-y-0.5">
                              <p className="font-medium">{s.nome}</p>
                              {s.dataNascimento && (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  <CalendarDays className="h-3 w-3" />
                                  <span>{formatDate(s.dataNascimento)} · {calcularIdade(s.dataNascimento)}</span>
                                </div>
                              )}
                              {s.telefone && (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  <Phone className="h-3 w-3" />
                                  <span className="font-mono">{s.telefone}</span>
                                </div>
                              )}
                              {s.email && (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  <Mail className="h-3 w-3" />
                                  <span>{s.email}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
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
                        {(() => {
                          const plan = (intelligence as any).outreachPlan as {
                            objective?: string;
                            currentContactRole?: string;
                            decisionMakerStatus?: string;
                            decisionMakerHint?: string;
                            freeValueOffer?: string;
                            messageSuggestion?: string;
                            expectedResult?: string;
                            nextStepIfPositive?: string;
                            approvalRequired?: boolean;
                          } | null;
                          if (!plan) return null;
                          return (
                            <div className="mt-2 rounded-md border bg-background/70 p-2.5 space-y-2 text-xs">
                              <div className="grid gap-2 sm:grid-cols-2">
                                {plan.objective && <div><span className="font-medium">Objetivo:</span> {plan.objective}</div>}
                                {plan.currentContactRole && <div><span className="font-medium">Contato atual:</span> {plan.currentContactRole}</div>}
                              </div>
                              {plan.decisionMakerHint && (
                                <div><span className="font-medium">Decisor:</span> {plan.decisionMakerHint}</div>
                              )}
                              {plan.freeValueOffer && (
                                <div><span className="font-medium">Entrega gratuita:</span> {plan.freeValueOffer}</div>
                              )}
                              {plan.messageSuggestion && (
                                <div className="rounded border bg-muted/30 p-2">
                                  <span className="font-medium">Mensagem sugerida:</span>
                                  <p className="mt-1 whitespace-pre-wrap">{plan.messageSuggestion}</p>
                                </div>
                              )}
                              {plan.expectedResult && <div><span className="font-medium">Resultado esperado:</span> {plan.expectedResult}</div>}
                              {plan.nextStepIfPositive && <div><span className="font-medium">Se houver interesse:</span> {plan.nextStepIfPositive}</div>}
                              {plan.approvalRequired !== false && (
                                <Badge variant="secondary" className="text-[10px]">Requer aprovação antes de executar</Badge>
                              )}
                            </div>
                          );
                        })()}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-7 text-xs px-2 gap-1"
                            onClick={() => void approveAndExecuteSuggestedApproach()}
                            disabled={executingApprovedApproach}
                            data-testid="btn-aprovar-executar-nba"
                          >
                            {executingApprovedApproach ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Aprovar e executar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2 gap-1"
                            onClick={() => {
                              const plan = (intelligence as any).outreachPlan;
                              setNextBestActionDraft(plan?.messageSuggestion ?? intelligence.nextBestAction ?? "");
                              setEditingNextBestAction(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                            Editar abordagem
                          </Button>
                          {intelligence.lastAnalyzedAt && (
                            <span className="text-xs text-muted-foreground">
                              Atualizado {lastAnalyzedRelative}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {(lead as any)?.proximaAcao ?? "Análise comercial em andamento. A próxima ação será definida automaticamente."}
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
                      : ((lead as any)?.source === "prospector_auto" ? "Análise automática em processamento" : "Nunca analisado")}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — Activities + Conversations */}
        <div className="lg:col-span-2 space-y-4">

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
                              {activity.dataHoraInicio && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-xs text-muted-foreground">
                                    Início {formatDateTime(activity.dataHoraInicio)}
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
                            {activity.dealId && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={handoffSending} onClick={(e) => { e.stopPropagation(); void transferActivityToCompany(activity); }} data-testid={`btn-handoff-activity-${activity.id}`}><Building2 className="h-3.5 w-3.5" />Transferir</Button>}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openActivityObject(activity);
                              }}
                              data-testid={`btn-open-activity-${activity.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {getActivityOpenLabel(activity)}
                            </Button>
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
                              {activity.tipo !== "reuniao" && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vencimento</span>
                                  {activityDueEditId === activity.id ? (
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                      <Input type="date" value={activityDueDateDraft} onChange={(e) => setActivityDueDateDraft(e.target.value)} className="h-8 w-[155px] text-sm" autoFocus />
                                      <Button type="button" size="sm" className="h-8 px-2" disabled={isUpdatingActivity || !activityDueDateDraft} onClick={(e) => { e.stopPropagation(); saveActivityDueDate(activity.id); }} aria-label="Salvar nova data da tarefa">
                                        {isUpdatingActivity ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" disabled={isUpdatingActivity} onClick={(e) => { e.stopPropagation(); setActivityDueEditId(null); setActivityDueDateDraft(""); }} aria-label="Cancelar alteração da data">
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-foreground">{activity.dataVencimento ? formatDate(activity.dataVencimento) : "Sem prazo definido"}</span>
                                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Editar vencimento" aria-label="Editar vencimento da tarefa" onClick={(e) => { e.stopPropagation(); openActivityDueDateEdit(activity.id, activity.dataVencimento); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                              {activity.dataHoraInicio && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Início</span>
                                  <span className="text-foreground">{formatDateTime(activity.dataHoraInicio)}</span>
                                </div>
                              )}
                              {activity.dataHoraFim && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fim</span>
                                  <span className="text-foreground">{formatDateTime(activity.dataHoraFim)}</span>
                                </div>
                              )}
                              {activity.meetLink && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Google Meet</span>
                                  <a
                                    href={activity.meetLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    <Video className="h-3 w-3" />
                                    Entrar na reunião
                                  </a>
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
                              {activity.anexoUrl && (
                                <div className="space-y-1 pt-1 border-t border-border/40">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anexo</span>
                                  <a
                                    href={activity.anexoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 rounded-md border border-border p-2 bg-background hover:bg-muted/50 transition-colors"
                                  >
                                    {activity.anexoMimeType?.startsWith("image/") ? (
                                      <img
                                        src={activity.anexoUrl}
                                        alt={activity.anexoNome ?? "Anexo"}
                                        className="h-10 w-10 object-cover rounded"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                        <FileText className="h-5 w-5 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{activity.anexoNome ?? "Anexo"}</p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                          {activity.anexoCategoria === "projeto"
                                            ? "Projeto"
                                            : activity.anexoCategoria === "imagem"
                                            ? "Imagem"
                                            : activity.anexoCategoria === "documento"
                                            ? "Documento"
                                            : "Outras"}
                                        </Badge>
                                        {activity.anexoTamanho && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {(activity.anexoTamanho / 1024 / 1024).toFixed(1)} MB
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Status change section */}
                            <div className="space-y-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Alterar status
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  className="px-2.5 py-1 text-xs rounded border font-medium border-border text-muted-foreground hover:bg-muted"
                                  disabled={isUpdatingActivity}
                                  onClick={(e) => { e.stopPropagation(); updateActivity({ id: activity.id, data: { estadoExecucao: "em_execucao" } as any }); }}
                                >
                                  ▶ Iniciar
                                </button>
                                <button
                                  type="button"
                                  className="px-2.5 py-1 text-xs rounded border font-medium border-border text-muted-foreground hover:bg-muted"
                                  disabled={isUpdatingActivity}
                                  onClick={(e) => { e.stopPropagation(); updateActivity({ id: activity.id, data: { estadoExecucao: "aguardando" } as any }); }}
                                >
                                  ⏸ Aguardando
                                </button>
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
                                  <Input
                                    placeholder="Próxima ação (opcional) — se preenchida, será criada automaticamente"
                                    value={activityNextActionDraft}
                                    onChange={(e) => setActivityNextActionDraft(e.target.value)}
                                    className="text-sm"
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
                                      onClick={(e) => { e.stopPropagation(); setActivityStatusEditId(null); setActivityResultadoDraft(""); setActivityNextActionDraft(""); }}
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

        {/* Atendimento, Proposta, Apresentações e Renderizações — antes eram
            4 cards enormes empilhados na vertical; agora organizados em abas
            pra reduzir o scroll e deixar a tela mais limpa. */}
        <Tabs id="lead-workspace-tabs" value={leadWorkspaceTab} onValueChange={(value) => setLeadWorkspaceTab(value as "atendimento" | "proposta")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
            <TabsTrigger value="proposta">Proposta</TabsTrigger>
          </TabsList>

          <TabsContent value="atendimento" className="mt-4">
            <LeadServiceJourney leadId={id} tenantId={tenantId} lead={lead} dealId={activeLeadDeal?.id} />
          </TabsContent>

          <TabsContent value="proposta" className="mt-4">
            <LeadPropostaTab
              leadId={id}
              tenantId={tenantId}
              lead={lead}
              onCreateBudget={() => setPropostaModalOpen(true)}
            />
          </TabsContent>

          <TabsContent value="apresentacoes" className="mt-4">
            <LeadProductPresentationTab leadId={id} tenantId={tenantId} lead={lead} />
          </TabsContent>

          <TabsContent value="renderizacoes" className="mt-4">
            {(() => {
              const renderImages = (activities ?? []).filter(
                (a) => a.anexoCategoria === "imagem" && a.anexoUrl
              ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              return (
                <Card data-testid="card-imagens-proposta">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Galeria de Renderizações
                      {renderImages.length > 0 && (
                        <Badge variant="outline" className="text-xs ml-1">{renderImages.length}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activitiesLoading ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                        {[1,2,3].map((i) => (
                          <div key={i} className="aspect-video bg-muted animate-pulse rounded-lg" />
                        ))}
                      </div>
                    ) : renderImages.length === 0 ? (
                      <div className="py-8 text-center space-y-2">
                        <Image className="h-10 w-10 mx-auto text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Nenhuma imagem salva para este lead.</p>
                        <p className="text-xs text-muted-foreground/70">
                          Gere uma renderização em{" "}
                          <span className="font-medium">Módulo Arch → Renderização</span>{" "}
                          e clique em "Salvar no Lead".
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {renderImages.map((activity) => (
                          <button
                            key={activity.id}
                            type="button"
                            onClick={() => {
                              setLightboxUrl(activity.anexoUrl!);
                              setLightboxTitle(activity.titulo ?? "Imagem da Proposta");
                            }}
                            className="group relative aspect-video rounded-lg overflow-hidden border border-border bg-muted hover:border-violet-400 transition-all shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                          >
                            <img
                              src={activity.anexoUrl!}
                              alt={activity.titulo ?? "Imagem"}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                              loading="lazy"
                            />
                            {/* Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                            {/* Date badge */}
                            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
                              <p className="text-[10px] text-white/90 truncate">
                                {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(activity.createdAt))}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>
        </Tabs>

      </div>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-black border-black">
          <div className="relative">
            <div className="absolute top-3 right-3 flex gap-2 z-10">
              <a
                href={lightboxUrl ?? "#"}
                download
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs rounded-md px-3 py-1.5 transition-colors backdrop-blur-sm"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar
              </a>
              <button
                onClick={() => setLightboxUrl(null)}
                className="bg-black/60 hover:bg-black/80 text-white rounded-md p-1.5 transition-colors backdrop-blur-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {lightboxUrl && (
              <img
                src={lightboxUrl}
                alt={lightboxTitle}
                className="w-full max-h-[85vh] object-contain"
              />
            )}
            {lightboxTitle && (
              <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-sm text-white font-medium">{lightboxTitle}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dados do Lead — cadastro completo */}
      <Dialog open={editingLeadDados} onOpenChange={setEditingLeadDados}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cadastro do lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Contato</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input value={leadDadosDraft.nome} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, nome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Telefone</label>
                  <Input placeholder="(49) 99999-9999" value={leadDadosDraft.telefone} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, telefone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">E-mail</label>
                  <Input placeholder="email@cliente.com.br" value={leadDadosDraft.email} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" />Endereço completo</label>
                  <Input placeholder="Rua, número, bairro, cidade - UF, CEP" value={leadDadosDraft.endereco} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, endereco: e.target.value }))} />
                  <p className="text-[11px] text-muted-foreground">Este endereço também alimenta mapa, território e distribuição por proximidade.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Empresa vinculada</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Vincular empresa já cadastrada</label>
                  <Select
                    value={leadDadosDraft.companyId || "__none__"}
                    onValueChange={(value) => {
                      const companyId = value === "__none__" ? "" : value;
                      const company = crmCompanies.find((item) => item.companyId === companyId);
                      setLeadDadosDraft((d) => ({
                        ...d,
                        companyId,
                        empresa: company ? (company.nomeFantasia || company.razaoSocial || d.empresa) : d.empresa,
                        cnpj: company?.cnpj || d.cnpj,
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione uma empresa..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma / cadastrar pelo CNPJ</SelectItem>
                      {crmCompanies.map((company) => (
                        <SelectItem key={company.companyId} value={company.companyId}>
                          {(company.nomeFantasia || company.razaoSocial || "Empresa")} · {company.cnpj}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome da empresa</label>
                  <Input placeholder="Nome fantasia ou razão social" value={leadDadosDraft.empresa} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, empresa: e.target.value, companyId: "" }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">CNPJ</label>
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={leadDadosDraft.cnpj}
                    onChange={(e) => setLeadDadosDraft((d) => ({ ...d, cnpj: e.target.value, companyId: "" }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Ao salvar com CNPJ, a empresa é cadastrada/enriquecida e vinculada ao lead.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Comercial</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vendedor responsável</label>
                  <Select value={leadDadosDraft.assignedTo || "__none__"} onValueChange={(v) => setLeadDadosDraft((d) => ({ ...d, assignedTo: v === "__none__" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {(tenantUsers ?? []).filter((item) => item.active !== false).map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name || item.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">A alteração respeita as permissões de reatribuição do tenant e fica registrada no histórico.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Urgência</label>
                  <Select value={leadDadosDraft.urgencia || "__none__"} onValueChange={(v) => setLeadDadosDraft((d) => ({ ...d, urgencia: v === "__none__" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Objetivo / necessidade</label>
                  <Textarea rows={3} value={leadDadosDraft.objetivo} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, objetivo: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Dados adicionais</p></div>
                <Button type="button" variant="outline" size="sm" onClick={() => setLeadDadosDraft((d) => ({ ...d, extraFields: [...d.extraFields, { key: "", value: "" }] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Adicionar campo
                </Button>
              </div>
              <div className="space-y-2">
                {leadDadosDraft.extraFields.map((field, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1.6fr_auto] gap-2">
                    <Input placeholder="Campo (ex.: cargo)" value={field.key} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, extraFields: d.extraFields.map((item, i) => i === index ? { ...item, key: e.target.value } : item) }))} />
                    <Input placeholder="Informação" value={field.value} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, extraFields: d.extraFields.map((item, i) => i === index ? { ...item, value: e.target.value } : item) }))} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLeadDadosDraft((d) => ({ ...d, extraFields: d.extraFields.filter((_, i) => i !== index) }))} aria-label="Remover campo">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {!leadDadosDraft.extraFields.length && <p className="text-xs text-muted-foreground">Adicione cargo, origem, preferência, observação ou qualquer dado específico deste lead.</p>}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Identidade digital</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">URL do site</label>
                  <Input placeholder="https://www.cliente.com.br" value={leadDadosDraft.websiteUrl} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, websiteUrl: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Logo do cliente</label>
                  <div className="flex items-center gap-2">
                    <Input placeholder="https://... ou faça upload" value={leadDadosDraft.logoUrl} onChange={(e) => setLeadDadosDraft((d) => ({ ...d, logoUrl: e.target.value }))} />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
                      {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleLeadLogoUpload(file); e.target.value = ""; }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLeadDados(false)}>Cancelar</Button>
            <Button onClick={() => void saveLeadDados()} disabled={!leadDadosDraft.nome.trim() || isUpdatingLeadDados}>
              {isUpdatingLeadDados && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar cadastro
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
            {/* Tipo de Pessoa toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Tipo</p>
                <p className="text-xs text-muted-foreground">
                  {pessoalDraft.tipoPessoa === "juridica" ? "Pessoa Jurídica (Empresa)" : "Pessoa Física"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={pessoalDraft.tipoPessoa === "fisica" ? "font-semibold" : "text-muted-foreground"}>PF</span>
                <Switch
                  checked={pessoalDraft.tipoPessoa === "juridica"}
                  onCheckedChange={(checked) =>
                    setPessoalDraft((d) => ({ ...d, tipoPessoa: checked ? "juridica" : "fisica" }))
                  }
                />
                <span className={pessoalDraft.tipoPessoa === "juridica" ? "font-semibold" : "text-muted-foreground"}>PJ</span>
              </div>
            </div>

            {/* ── Campos Pessoa Física ── */}
            {pessoalDraft.tipoPessoa === "fisica" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome completo</label>
                  <Input
                    placeholder="Ex: João da Silva"
                    value={pessoalDraft.pfNome}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, pfNome: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Nome do dono / proprietário
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <Input
                    placeholder="Ex: Maria Souza"
                    value={pessoalDraft.pfDonome}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, pfDonome: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">CPF</label>
                  <Input
                    placeholder="000.000.000-00"
                    value={pessoalDraft.pfCpf}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
                      const fmt = raw
                        .replace(/(\d{3})(\d)/, "$1.$2")
                        .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
                        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
                      setPessoalDraft((d) => ({ ...d, pfCpf: fmt }));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Data de Nascimento</label>
                  <Input
                    type="date"
                    value={pessoalDraft.dataNascimento}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, dataNascimento: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Profissão</label>
                  <Input
                    placeholder="Ex: Médico veterinário"
                    value={pessoalDraft.profissao}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, profissao: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usada para enviar parabéns nas datas profissionais configuradas no calendário.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Gênero</label>
                  <Select
                    value={pessoalDraft.genero || "__none__"}
                    onValueChange={(v) =>
                      setPessoalDraft((d) => ({ ...d, genero: v === "__none__" ? "" : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
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
                          filhos: [...d.filhos, { nome: "", dataNascimento: "", genero: "" }],
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
                      <div className="flex-1 grid grid-cols-3 gap-2">
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
                        <Select
                          value={filho.genero || "__none__"}
                          onValueChange={(v) => {
                            const filhos = [...pessoalDraft.filhos];
                            filhos[i] = { ...filhos[i]!, genero: v === "__none__" ? "" : v };
                            setPessoalDraft((d) => ({ ...d, filhos }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Gênero" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não informado</SelectItem>
                            <SelectItem value="masculino">Masculino</SelectItem>
                            <SelectItem value="feminino">Feminino</SelectItem>
                          </SelectContent>
                        </Select>
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

                <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Datas especiais</p>
                      <p className="text-xs text-muted-foreground">Relacionamento, casamento, primeira compra, formatura ou qualquer marco importante.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() =>
                        setPessoalDraft((d) => ({
                          ...d,
                          specialDates: [
                            ...d.specialDates,
                            {
                              id: crypto.randomUUID(),
                              name: "",
                              date: "",
                              recurring: true,
                              category: "custom",
                              notes: "",
                              active: true,
                            },
                          ],
                        }))
                      }
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar
                    </Button>
                  </div>
                  {pessoalDraft.specialDates.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma data especial cadastrada.</p>
                  )}
                  {pessoalDraft.specialDates.map((item, i) => (
                    <div key={item.id ?? i} className="grid gap-2 rounded-md border bg-background p-2 md:grid-cols-[1.2fr_150px_150px_auto]">
                      <Input
                        placeholder="Ex: Aniversário de casamento"
                        value={item.name}
                        onChange={(e) => {
                          const specialDates = [...pessoalDraft.specialDates];
                          specialDates[i] = { ...specialDates[i]!, name: e.target.value };
                          setPessoalDraft((d) => ({ ...d, specialDates }));
                        }}
                      />
                      <Input
                        type="date"
                        value={item.date}
                        onChange={(e) => {
                          const specialDates = [...pessoalDraft.specialDates];
                          specialDates[i] = { ...specialDates[i]!, date: e.target.value };
                          setPessoalDraft((d) => ({ ...d, specialDates }));
                        }}
                      />
                      <Select
                        value={item.category || "custom"}
                        onValueChange={(value) => {
                          const specialDates = [...pessoalDraft.specialDates];
                          specialDates[i] = { ...specialDates[i]!, category: value };
                          setPessoalDraft((d) => ({ ...d, specialDates }));
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Pessoal</SelectItem>
                          <SelectItem value="family">Família</SelectItem>
                          <SelectItem value="relationship">Relacionamento</SelectItem>
                          <SelectItem value="purchase">Compra/cliente</SelectItem>
                          <SelectItem value="professional">Profissional</SelectItem>
                          <SelectItem value="custom">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setPessoalDraft((d) => ({
                            ...d,
                            specialDates: d.specialDates.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Campos Pessoa Jurídica ── */}
            {pessoalDraft.tipoPessoa === "juridica" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">CNPJ</label>
                    <Input
                      placeholder="00.000.000/0001-00"
                      value={pessoalDraft.pjCnpj}
                      onChange={(e) => setPessoalDraft((d) => ({ ...d, pjCnpj: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Razão Social</label>
                    <Input
                      placeholder="Razão social"
                      value={pessoalDraft.pjRazaoSocial}
                      onChange={(e) => setPessoalDraft((d) => ({ ...d, pjRazaoSocial: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Segmento</label>
                  <Input
                    placeholder="Ex: Varejo, Saúde, Construção..."
                    value={pessoalDraft.pjSegmento}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, pjSegmento: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Nº de Funcionários</label>
                    <Select
                      value={pessoalDraft.pjNumFuncionarios || "__none__"}
                      onValueChange={(v) =>
                        setPessoalDraft((d) => ({ ...d, pjNumFuncionarios: v === "__none__" ? "" : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="1-5">1 a 5</SelectItem>
                        <SelectItem value="6-20">6 a 20</SelectItem>
                        <SelectItem value="21-50">21 a 50</SelectItem>
                        <SelectItem value="51-200">51 a 200</SelectItem>
                        <SelectItem value="201+">201+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Faturamento Mensal Est.</label>
                    <Select
                      value={pessoalDraft.pjFaturamentoEstimado || "__none__"}
                      onValueChange={(v) =>
                        setPessoalDraft((d) => ({ ...d, pjFaturamentoEstimado: v === "__none__" ? "" : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="ate_10k">Até R$ 10 mil</SelectItem>
                        <SelectItem value="10k_50k">R$ 10 mil – R$ 50 mil</SelectItem>
                        <SelectItem value="50k_200k">R$ 50 mil – R$ 200 mil</SelectItem>
                        <SelectItem value="200k_1m">R$ 200 mil – R$ 1 mi</SelectItem>
                        <SelectItem value="acima_1m">Acima de R$ 1 mi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* Sócios — visível para PJ ou quando tem empresa (legacy PF) */}
            {(pessoalDraft.tipoPessoa === "juridica" || lead?.empresa) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Sócios</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      setPessoalDraft((d) => ({
                        ...d,
                        socios: [...d.socios, { nome: "", dataNascimento: "", telefone: "", email: "" }],
                      }))
                    }
                  >
                    <Plus className="h-3 w-3" />
                    Adicionar sócio
                  </Button>
                </div>
                {pessoalDraft.socios.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum sócio cadastrado.</p>
                )}
                {pessoalDraft.socios.map((socio, i) => (
                  <div key={i} className="border rounded-md p-3 bg-muted/30 space-y-2 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setPessoalDraft((d) => ({ ...d, socios: d.socios.filter((_, j) => j !== i) }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <div className="space-y-1.5 pr-8">
                      <label className="text-xs font-medium">Nome</label>
                      <Input
                        placeholder="Nome do sócio"
                        value={socio.nome}
                        onChange={(e) => {
                          const socios = [...pessoalDraft.socios];
                          socios[i] = { ...socios[i]!, nome: e.target.value };
                          setPessoalDraft((d) => ({ ...d, socios }));
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Data de Nascimento</label>
                        <Input
                          type="date"
                          value={socio.dataNascimento}
                          onChange={(e) => {
                            const socios = [...pessoalDraft.socios];
                            socios[i] = { ...socios[i]!, dataNascimento: e.target.value };
                            setPessoalDraft((d) => ({ ...d, socios }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Telefone</label>
                        <Input
                          placeholder="(11) 99999-9999"
                          value={socio.telefone}
                          onChange={(e) => {
                            const socios = [...pessoalDraft.socios];
                            socios[i] = { ...socios[i]!, telefone: e.target.value };
                            setPessoalDraft((d) => ({ ...d, socios }));
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">E-mail</label>
                      <Input
                        placeholder="email@..."
                        value={socio.email}
                        onChange={(e) => {
                          const socios = [...pessoalDraft.socios];
                          socios[i] = { ...socios[i]!, email: e.target.value };
                          setPessoalDraft((d) => ({ ...d, socios }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Dados para Contrato — usados na geração automática do contrato (ZapSign) */}
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Dados para Contrato</p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Endereço</label>
                <Input
                  placeholder="Rua, número, bairro, cidade - UF, CEP"
                  value={pessoalDraft.endereco}
                  onChange={(e) => setPessoalDraft((d) => ({ ...d, endereco: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Cargo do representante</label>
                  <Input
                    placeholder="Sócio-Administrador"
                    value={pessoalDraft.representanteCargo}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, representanteCargo: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Nacionalidade do representante</label>
                  <Input
                    placeholder="Brasileiro(a)"
                    value={pessoalDraft.representanteNacionalidade}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, representanteNacionalidade: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Estado civil do representante</label>
                  <Input
                    placeholder="Casado(a)"
                    value={pessoalDraft.representanteEstadoCivil}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, representanteEstadoCivil: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Profissão do representante</label>
                  <Input
                    placeholder="Empresário(a)"
                    value={pessoalDraft.representanteProfissao}
                    onChange={(e) => setPessoalDraft((d) => ({ ...d, representanteProfissao: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">RG do representante</label>
                <Input
                  placeholder="00.000.000-0"
                  value={pessoalDraft.representanteRg}
                  onChange={(e) => setPessoalDraft((d) => ({ ...d, representanteRg: e.target.value }))}
                />
              </div>
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
                onValueChange={(v) => {
                  const next = v as typeof newActivityTipo;
                  setNewActivityTipo(next);
                  if (next === "assistencia") {
                    if (newActivityResponsavelId === "__ia__") {
                      setNewActivityResponsavelId(user?.id ?? (tenantUsers ?? [])[0]?.id ?? "");
                    }
                    applyAssistenciaPreAgendaDefault();
                  }
                }}
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
                  {newActivityTipo !== "assistencia" && <SelectItem value="__ia__">🤖 IA</SelectItem>}
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

            {newActivityTipo === "assistencia" && (
              <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Abertura estruturada da assistência</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Categoria *</label>
                    <Select value={newAssistenciaCategoria} onValueChange={setNewAssistenciaCategoria}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="defeito">Defeito</SelectItem>
                        <SelectItem value="instalacao">Instalação</SelectItem>
                        <SelectItem value="funcionamento">Funcionamento</SelectItem>
                        <SelectItem value="avaria">Avaria</SelectItem>
                        <SelectItem value="falta_material">Falta de material</SelectItem>
                        <SelectItem value="erro_medida">Erro de medida</SelectItem>
                        <SelectItem value="duvida_tecnica">Dúvida técnica</SelectItem>
                        <SelectItem value="garantia">Garantia</SelectItem>
                        <SelectItem value="manutencao">Manutenção</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Pedido relacionado</label>
                    <Select value={newAssistenciaDealId || "__none__"} onValueChange={(v) => setNewAssistenciaDealId(v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem pedido específico</SelectItem>
                        {(leadDeals ?? []).map((deal) => <SelectItem key={deal.id} value={deal.id}>{deal.titulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Itens/produtos afetados</label>
                  <Input value={newAssistenciaProdutos} onChange={(e) => setNewAssistenciaProdutos(e.target.value)} placeholder="Ex: janela suíte, porta varanda, motor..." />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Relato claro do problema *</label>
                  <Textarea rows={5} value={newAssistenciaRelato} onChange={(e) => setNewAssistenciaRelato(e.target.value)} placeholder="Descreva o sintoma, quando começou, onde ocorre, o que já foi testado e tudo que o suporte precisa saber antes de ir ao cliente." />
                  <p className="text-xs text-muted-foreground">IA ou humano devem coletar informação suficiente antes de enviar o chamado ao suporte.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Prioridade</label>
                    <Select value={newAssistenciaPrioridade} onValueChange={setNewAssistenciaPrioridade}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Fotos, vídeos, áudios e documentos</label>
                    <Input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setNewAssistenciaFiles(Array.from(e.target.files ?? []))} />
                    <p className="text-xs text-muted-foreground">{newAssistenciaFiles.length ? `${newAssistenciaFiles.length} arquivo(s)` : "Opcional"}</p>
                  </div>
                </div>
                {assistenciaScheduleDefault?.enabled && newActivityData && (
                  <div className="rounded-lg border border-dashed bg-background/70 p-3">
                    <p className="text-sm font-medium">Pré-agenda sugerida: {new Date(`${newActivityData}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                    <p className="text-xs text-muted-foreground mt-1">Data aplicada pelo padrão da atividade Assistência. Pode ser alterada no vencimento ou convertida em horário confirmado abaixo.</p>
                  </div>
                )}
                <div className="rounded-lg border bg-background/70 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Agendar atendimento</p>
                      <p className="text-xs text-muted-foreground">Busca a agenda interna da equipe de suporte e reserva o horário para o responsável.</p>
                    </div>
                    <Switch
                      checked={newAssistenciaAgendar}
                      onCheckedChange={(checked) => {
                        setNewAssistenciaAgendar(checked);
                        if (checked) {
                          prefillAssistenciaTimeFromDate();
                          if (!newActivityAgendaId) {
                            const preferredAgendaId = assistenciaScheduleDefault?.agendaId;
                            const preferredExists = preferredAgendaId && (agendas ?? []).some((agenda) => agenda.id === preferredAgendaId);
                            setNewActivityAgendaId(preferredExists ? preferredAgendaId! : (agendasOrdenadasParaSuporte[0]?.id ?? ""));
                          }
                        }
                      }}
                    />
                  </div>
                  {newAssistenciaAgendar && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Agenda interna de suporte *</label>
                        <Select value={newActivityAgendaId} onValueChange={setNewActivityAgendaId}>
                          <SelectTrigger><SelectValue placeholder="Selecione a agenda..." /></SelectTrigger>
                          <SelectContent>
                            {agendasOrdenadasParaSuporte.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.nome}{a.googleEmail ? ` (${a.googleEmail})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {agendasOrdenadasParaSuporte.length === 0 && (
                          <p className="text-xs text-amber-600">Nenhuma agenda interna cadastrada. Cadastre uma em Agenda antes de reservar o atendimento.</p>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Início *</label>
                          <Input type="datetime-local" value={newActivityDataHoraInicio} onChange={(e) => setNewActivityDataHoraInicio(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Fim *</label>
                          <Input type="datetime-local" value={newActivityDataHoraFim} onChange={(e) => setNewActivityDataHoraFim(e.target.value)} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">O sistema valida conflito do responsável antes de abrir a assistência e cria o compromisso na agenda interna vinculado ao chamado.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

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
            {newActivityTipo !== "assistencia" && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold">Execução e resultado</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Objetivo <span className="text-xs text-muted-foreground">(opcional)</span></label>
                  <Input
                    placeholder="Ex.: conseguir uma definição sobre a proposta"
                    value={newActivityObjetivo}
                    onChange={(e) => setNewActivityObjetivo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Resultado esperado <span className="text-xs text-muted-foreground">(opcional)</span></label>
                  <Input
                    placeholder="Ex.: aceite, pedido de alteração ou nova data de decisão"
                    value={newActivityResultadoEsperado}
                    onChange={(e) => setNewActivityResultadoEsperado(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Prioridade</label>
                  <Select value={newActivityPrioridade} onValueChange={(v) => setNewActivityPrioridade(v as typeof newActivityPrioridade)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Data de vencimento — apenas para tipos que não são reunião */}
            {newActivityTipo !== "reuniao" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{newActivityTipo === "assistencia" ? "Pré-agenda / data prevista" : "Vencimento"} <span className="text-xs text-muted-foreground">(opcional)</span></label>
                <Input
                  type="date"
                  value={newActivityData}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setNewActivityData(e.target.value)}
                  data-testid="input-activity-data"
                />
              </div>
            )}

            {/* Campos de reunião online */}
            {newActivityTipo === "reuniao" && (
              <>
                {/* Agenda */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Agenda Google <span className="text-destructive">*</span></label>
                  <Select
                    value={newActivityAgendaId}
                    onValueChange={setNewActivityAgendaId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma agenda…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(agendas ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome} {a.googleEmail ? `(${a.googleEmail})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Data/hora início */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Início <span className="text-destructive">*</span></label>
                  <Input
                    type="datetime-local"
                    value={newActivityDataHoraInicio}
                    onChange={(e) => setNewActivityDataHoraInicio(e.target.value)}
                    data-testid="input-activity-inicio"
                  />
                </div>

                {/* Data/hora fim */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Fim <span className="text-destructive">*</span></label>
                  <Input
                    type="datetime-local"
                    value={newActivityDataHoraFim}
                    onChange={(e) => setNewActivityDataHoraFim(e.target.value)}
                    data-testid="input-activity-fim"
                  />
                </div>

                {/* Gerar Google Meet */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newActivityGerarMeet}
                    onCheckedChange={setNewActivityGerarMeet}
                    id="gerar-meet"
                  />
                  <label htmlFor="gerar-meet" className="text-sm font-medium">
                    Gerar link do Google Meet
                  </label>
                </div>
              </>
            )}

            {/* Campos de visita presencial */}
            {newActivityTipo === "visita" && (
              <div className="space-y-3 rounded-md border border-border p-3 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Informações da visita</p>
                <div className="flex items-center gap-2">
                  <Switch
                    id="falou-com-decisor"
                    checked={newActivityFalouComDecisor}
                    onCheckedChange={setNewActivityFalouComDecisor}
                  />
                  <label htmlFor="falou-com-decisor" className="text-sm font-medium cursor-pointer">
                    Falou com o decisor
                  </label>
                </div>
                {!newActivityFalouComDecisor && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Nome do gatekeeper <span className="text-xs text-muted-foreground">(opcional)</span>
                    </label>
                    <Input
                      placeholder="Ex: Recepcionista, secretária, gerente intermediário…"
                      value={newActivityNomeGatekeeper}
                      onChange={(e) => setNewActivityNomeGatekeeper(e.target.value)}
                      maxLength={100}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Anexo ── */}
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium">Anexo</label>
              <input
                type="file"
                ref={anexoInputRef}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 20 * 1024 * 1024) {
                    toast({ title: "Arquivo excede 20MB", variant: "destructive" });
                    return;
                  }
                  setNewActivityAnexoFile(f);
                  if (f) {
                    if (f.type.startsWith("image/")) setNewActivityAnexoCategoria("imagem");
                    else if (f.name.endsWith(".pdf")) setNewActivityAnexoCategoria("documento");
                  }
                }}
              />
              {!newActivityAnexoFile ? (
                <button
                  type="button"
                  onClick={() => anexoInputRef.current?.click()}
                  className="w-full flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <FileUp className="h-4 w-4" />
                  <span>Clique para selecionar um arquivo</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-border p-2 text-sm bg-muted/30">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{newActivityAnexoFile.name}</span>
                  <span className="text-xs text-muted-foreground">{(newActivityAnexoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button
                    type="button"
                    onClick={() => setNewActivityAnexoFile(null)}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              )}
              {newActivityAnexoFile && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tipo de anexo</label>
                  <Select
                    value={newActivityAnexoCategoria}
                    onValueChange={(v) => setNewActivityAnexoCategoria(v as typeof newActivityAnexoCategoria)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projeto">Projeto</SelectItem>
                      <SelectItem value="imagem">Imagem</SelectItem>
                      <SelectItem value="documento">Documento</SelectItem>
                      <SelectItem value="outras_informacoes">Outras informações</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewActivityOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateActivity}
              disabled={
                isCreatingActivity ||
                isUploadingAnexo ||
                !newActivityTitulo.trim() ||
                (newActivityTipo === "reuniao" && (!newActivityAgendaId || !newActivityDataHoraInicio || !newActivityDataHoraFim)) ||
                (newActivityTipo === "assistencia" && (newActivityResponsavelId === "__ia__" || !newActivityResponsavelId || newAssistenciaRelato.trim().length < 10))
              }
              data-testid="btn-salvar-atividade"
            >
              {(isCreatingActivity || isUploadingAnexo) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isUploadingAnexo ? "Enviando anexo..." : "Criar Atividade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog unificado: Iniciar Conversa (WhatsApp ou Instagram) ── */}
      <Dialog open={iniciarDialogOpen} onOpenChange={setIniciarDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {iniciarCanal === "whatsapp" ? (
                <MessageSquare className="h-5 w-5 text-[#25D366]" />
              ) : (
                <InstagramIcon className="h-5 w-5" />
              )}
              Iniciar conversa
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Channel selector */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIniciarCanal("whatsapp")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all ${
                  iniciarCanal === "whatsapp"
                    ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setIniciarCanal("instagram")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all ${
                  iniciarCanal === "instagram"
                    ? "border-purple-500 bg-purple-50 text-purple-600"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <InstagramIcon className="h-4 w-4" />
                Instagram
              </button>
            </div>

            {/* AI-suggested message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Mensagem inicial</label>
                <button
                  type="button"
                  onClick={() => void fetchAiStarter()}
                  disabled={gerandoSugestao}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                >
                  {gerandoSugestao
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Wand2 className="h-3 w-3" />
                  }
                  {gerandoSugestao ? "Gerando…" : "Sugestão da IA"}
                </button>
              </div>
              {gerandoSugestao && !iniciarMensagem && (
                <div className="h-20 rounded-md border bg-muted/30 animate-pulse" />
              )}
              {(!gerandoSugestao || iniciarMensagem) && (
                <Textarea
                  rows={4}
                  value={iniciarMensagem}
                  onChange={(e) => setIniciarMensagem(e.target.value)}
                  placeholder="Digite a mensagem inicial…"
                  className={gerandoSugestao ? "opacity-60" : ""}
                />
              )}
              {gerandoSugestao && iniciarMensagem && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Gerando sugestão personalizada…
                </p>
              )}
              {!gerandoSugestao && iniciarMensagem && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Sugestão gerada pela IA com base no perfil do lead. Edite se quiser.
                </p>
              )}
            </div>

            {/* Pipeline stage — só mostra se lead ainda não está no pipeline */}
            {leadJaNoPipeline ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Lead já está no pipeline — nenhum card novo será criado.
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Etapa no pipeline</label>
                <Select value={iniciarEtapa} onValueChange={setIniciarEtapa}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_aquecimento">Em aquecimento</SelectItem>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="qualificado">Qualificado</SelectItem>
                    <SelectItem value="proposta">Orçamento</SelectItem>
                    <SelectItem value="negociacao">Negociação</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Um card será criado automaticamente no pipeline com esta etapa.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIniciarDialogOpen(false)}
              disabled={isStartingConversation}
            >
              Cancelar
            </Button>
            <Button
              className={iniciarCanal === "whatsapp"
                ? "bg-[#25D366] hover:bg-[#1ebe5d] text-white"
                : "text-white"
              }
              style={iniciarCanal === "instagram"
                ? { background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)" }
                : undefined
              }
              onClick={() => void handleIniciarConversa()}
              disabled={isStartingConversation || !iniciarMensagem.trim()}
            >
              {isStartingConversation ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Iniciando…</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Enviar e abrir conversa</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp conversation starter dialog (legado — mantido para compatibilidade) */}
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
                  <SelectItem value="proposta">Orçamento</SelectItem>
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

      {/* Orçamento Modal inline para este lead */}
      <PropostaModal
        open={propostaModalOpen}
        onClose={() => setPropostaModalOpen(false)}
        tenantId={tenantId}
        catalog={catalog}
        leadId={id}
        leadNome={lead?.nome ?? undefined}
        leadTelefone={lead?.telefone ?? undefined}
        leadEmpresa={lead?.empresa ?? undefined}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: id }) });
          void queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
        }}
      />

      <VendidoModal
        open={vendidoOpen}
        onOpenChange={setVendidoOpen}
        leadNome={lead?.nome ?? lead?.empresa ?? "Lead"}
        propostas={orcamentosDoAtendimento}
        deals={leadDeals ?? []}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
        }}
      />

      <Dialog open={naoLeadOpen} onOpenChange={setNaoLeadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Classificar como Não Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {lead?.nome ?? "Este contato"} sai da pipeline de vendas e da análise de churn. Continua acessível na aba "Contatos não-leads".
            </p>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Tipo de contato</p>
              <Select value={naoLeadTipoSel} onValueChange={setNaoLeadTipoSel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {nonLeadClassifications.filter((item) => item.active !== false).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Observações (opcional)</p>
              <Textarea
                value={naoLeadNotasInput}
                onChange={(e) => setNaoLeadNotasInput(e.target.value)}
                placeholder="Ex: fornecedor de material elétrico"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNaoLeadOpen(false)}>Cancelar</Button>
            <Button onClick={() => void classificarComoNaoLead()} disabled={naoLeadSalvando}>
              {naoLeadSalvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agendar reunião — mesmo modal da pipeline */}
      <AgendarReuniaoModal
        open={agendarOpen}
        onClose={() => setAgendarOpen(false)}
        tenantId={tenantId}
        leadId={id}
        leadNome={lead?.nome ?? ""}
        leadEmail={lead?.email ?? null}
        responsavelId={(lead as any)?.responsavelId ?? null}
      />
    </div>
  );
}

function SpouseConsentBlock({ leadId }: { leadId: string | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: consent, isLoading } = useGetLeadSpouseConsent(leadId || "", {
    query: { enabled: !!leadId, retry: false, queryKey: getGetLeadSpouseConsentQueryKey(leadId || "") },
  });
  const create = useCreateLeadSpouseConsent({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetLeadSpouseConsentQueryKey(leadId || "") });
        toast({ title: "Preferência salva." });
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });
  const update = useUpdateLeadSpouseConsent({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetLeadSpouseConsentQueryKey(leadId || "") });
        toast({ title: "Preferência atualizada." });
      },
      onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
    },
  });

  const [draft, setDraft] = useState({
    consentGiven: false,
    giftPreference: "",
  });

  useEffect(() => {
    if (consent) {
      setDraft({
        consentGiven: consent.consentGiven,
        giftPreference: consent.giftPreference ?? "",
      });
    }
  }, [consent]);

  function save() {
    if (!leadId) return;
    if (consent) {
      update.mutate({ leadId, data: { consentGiven: draft.consentGiven, giftPreference: draft.giftPreference || null } });
    } else {
      create.mutate({ leadId, data: { consentGiven: draft.consentGiven, giftPreference: draft.giftPreference || null } });
    }
  }

  return (
    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Gift className="h-3.5 w-3.5 text-rose-500" />
        <span>Presente para cônjuge</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.consentGiven}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, consentGiven: v }))}
            />
            <span className="text-sm text-muted-foreground">
              {draft.consentGiven
                ? "Lead autorizou envio de sugestões de presente"
                : "Lead ainda não autorizou"}
            </span>
          </div>
          {draft.consentGiven && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Preferência de presente</label>
              <Input
                placeholder="Ex: perfumes, eletrônicos, roupas"
                value={draft.giftPreference}
                onChange={(e) => setDraft((d) => ({ ...d, giftPreference: e.target.value }))}
                className="text-sm"
              />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}