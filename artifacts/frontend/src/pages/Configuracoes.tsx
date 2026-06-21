import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";

type UserFunction = "vendedor" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  useGetBusinessProfileByTenant,
  getGetBusinessProfileByTenantQueryKey,
  useCreateBusinessProfile,
  useUpdateBusinessProfile,
  useGetAgentConfigByTenant,
  getGetAgentConfigByTenantQueryKey,
  useCreateAgentConfig,
  useUpdateAgentConfig,
  useGetAgentConfigUsage,
  useCompleteAgentConfigSetup,
  useRegenerateWebhookSecret,
  useListIntelligenceAnalysisLog,
  getListIntelligenceAnalysisLogQueryKey,
  useGetTenant,
  getGetTenantQueryKey,
  useUpdateTenant,
  AgentsMap,
  useGetSiteConfigByTenant,
  getGetSiteConfigByTenantQueryKey,
  useCreateSiteConfig,
  useUpdateSiteConfig,
  useGetIntegrationSettings,
  getGetIntegrationSettingsQueryKey,
  useUpdateIntegrationSettings,
  useRegenerateIntegrationApiKey,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  useInviteTenantSeller,
  useDeleteUser,
  TipoFechamento,
  useRequestUploadUrl,
  useGetInstagramConnectionStatus,
  getGetInstagramConnectionStatusQueryKey,
  useDisconnectInstagram,
  useRefreshInstagramToken,
  useGetWhatsappConnectionStatus,
  getGetWhatsappConnectionStatusQueryKey,
  useDisconnectWhatsapp,
  useRefreshWhatsappToken,
  useListAgendas,
  getListAgendasQueryKey,
  useDisconnectAgendaGoogle,
  getAgendaGoogleAuthUrl,
  useGetTenantCalendarSettings,
  useCreateTenantCalendarSettings,
  useUpdateTenantCalendarSettings,
  getGetTenantCalendarSettingsQueryKey,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Bot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  Zap,
  Save,
  Brain,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Download,
  Globe,
  ExternalLink,
  Webhook,
  Key,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Users,
  Trash2,
  UserPlus,
  Link,
  FileText,
  MessageCircle,
  Loader2,
  Lock,
  ShieldCheck,
  Wand2,
  Upload,
  ImageIcon,
  X,
  CalendarCheck,
  CalendarX,
  CalendarPlus,
  CalendarHeart,
  Receipt,
} from "lucide-react";
import { SiteGeneratorTab } from "./SiteGenerator";
import { FaturamentoTab } from "./FaturamentoTab";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const thresholdSchema = z.object({
  analysisStalenessHours: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) > 0), {
      message: "Digite um número inteiro positivo ou deixe em branco para usar o padrão global",
    }),
  analysisMessageThreshold: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) > 0), {
      message: "Digite um número inteiro positivo ou deixe em branco para usar o padrão global",
    }),
  maxAnalysesPerHour: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) > 0), {
      message: "Digite um número inteiro positivo ou deixe em branco para usar o padrão global",
    }),
});
type ThresholdForm = z.infer<typeof thresholdSchema>;

const profileSchema = z.object({
  razaoSocial: z.string().min(2, "Obrigatório"),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().optional(),
  endereco: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  vertical: z.string().optional(),
  urlLinhaProdutos: z.string().url("URL inválida").optional().or(z.literal("")),
  logoUrl: z.string().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const siteConfigSchema = z.object({
  template: z.enum(["padrao", "moderno", "minimalista"]),
  corPrimaria: z.string().optional(),
  tagline: z.string().optional(),
  sobreEmpresa: z.string().optional(),
  whatsappContato: z.string().optional(),
  ativo: z.boolean(),
});
type SiteConfigForm = z.infer<typeof siteConfigSchema>;

type AgentKey = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding" | "relacionamento";

const AGENT_LABELS: Record<AgentKey, { label: string; description: string }> = {
  sdr:          { label: "SDR",          description: "Qualificação e primeiro contato com leads" },
  closer:       { label: "Closer",       description: "Condução e fechamento de negócios" },
  followup:     { label: "Follow-up",    description: "Acompanhamento de leads em aberto" },
  reactivation: { label: "Reativação",   description: "Recuperação de leads inativos" },
  scheduler:    { label: "Agendador",    description: "Marcação e confirmação de reuniões" },
  service:      { label: "Atendimento",  description: "Suporte e dúvidas de clientes" },
  onboarding:   { label: "Onboarding",   description: "Integração e ativação de novos clientes" },
  relacionamento: { label: "Relacionamento", description: "Campanhas de datas especiais (aniversários, datas comerciais)" },
};

const AGENT_KEYS: AgentKey[] = ["sdr", "closer", "followup", "reactivation", "scheduler", "service", "onboarding", "relacionamento"];

const VERTICAIS = [
  { value: "tecnologia",     label: "Tecnologia" },
  { value: "saude",          label: "Saúde" },
  { value: "educacao",       label: "Educação" },
  { value: "financeiro",     label: "Financeiro" },
  { value: "varejo",         label: "Varejo" },
  { value: "imobiliario",    label: "Imobiliário" },
  { value: "servicos",       label: "Serviços" },
  { value: "industria",      label: "Indústria" },
  { value: "outro",          label: "Outro" },
];

// ─── Autonomy Status ──────────────────────────────────────────────────────────

function AutonomyStatus({ setupCompletedAt, autonomyEnabledAt }: {
  setupCompletedAt?: string | null;
  autonomyEnabledAt?: string | null;
}) {
  if (!setupCompletedAt) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <span className="text-sm">Setup não iniciado</span>
      </div>
    );
  }

  const now = new Date();
  const autonomyDate = autonomyEnabledAt ? new Date(autonomyEnabledAt) : null;

  if (!autonomyDate || autonomyDate > now) {
    const daysLeft = autonomyDate
      ? Math.ceil((autonomyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return (
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-yellow-500" />
        <span className="text-sm text-yellow-600 dark:text-yellow-400">
          {daysLeft != null ? `Autonomia em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}` : "Aguardando ativação"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-green-500" />
      <span className="text-sm text-green-600 dark:text-green-400">Autônomo ativo</span>
    </div>
  );
}

// ─── Usage Bars ───────────────────────────────────────────────────────────────

function UsageBars({ agentConfigId }: { agentConfigId: string }) {
  const { data: usage, isLoading } = useGetAgentConfigUsage(agentConfigId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (!usage) return null;

  const msgPct = Math.min(usage.messages.percentUsed, 100);
  const tokPct = Math.min(usage.tokens.percentUsed, 100);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            Mensagens hoje
          </div>
          <span className={cn(
            "text-sm font-medium",
            usage.messages.overLimit  && "text-red-500",
            usage.messages.nearLimit  && !usage.messages.overLimit && "text-yellow-500",
          )}>
            {usage.messages.sent.toLocaleString("pt-BR")} / {usage.messages.limit.toLocaleString("pt-BR")}
          </span>
        </div>
        <Progress
          value={msgPct}
          className={cn(
            "h-2",
            usage.messages.overLimit  ? "[&>div]:bg-red-500"
            : usage.messages.nearLimit ? "[&>div]:bg-yellow-500"
            : "[&>div]:bg-primary"
          )}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            Tokens este mês
          </div>
          <span className={cn(
            "text-sm font-medium",
            usage.tokens.overLimit  && "text-red-500",
            usage.tokens.nearLimit  && !usage.tokens.overLimit && "text-yellow-500",
          )}>
            {usage.tokens.used.toLocaleString("pt-BR")} / {usage.tokens.limit.toLocaleString("pt-BR")}
          </span>
        </div>
        <Progress
          value={tokPct}
          className={cn(
            "h-2",
            usage.tokens.overLimit  ? "[&>div]:bg-red-500"
            : usage.tokens.nearLimit ? "[&>div]:bg-yellow-500"
            : "[&>div]:bg-primary"
          )}
        />
      </div>
    </div>
  );
}

// ─── Triggered-by label map ──────────────────────────────────────────────────

const TRIGGERED_BY_LABEL: Record<string, string> = {
  manual:    "Manual",
  automatic: "Automático",
  webhook:   "Webhook",
};

function triggeredByLabel(val: string) {
  return TRIGGERED_BY_LABEL[val] ?? val;
}

// ─── Analysis Log Tab ─────────────────────────────────────────────────────────

function AnalysisLogTab({ tenantId }: { tenantId: string }) {
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const LIMIT = 20;

  const { user, token } = useAuth();
  const isSuperAdmin = user?.platformRole === "super_admin";

  const logParams = { page, limit: LIMIT };
  const { data, isLoading } = useListIntelligenceAnalysisLog(
    tenantId,
    logParams,
    { query: { queryKey: getListIntelligenceAnalysisLogQueryKey(tenantId, logParams), enabled: !!tenantId } }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  async function handleExport() {
    if (!token) return;
    setDownloading(true);
    try {
      const url = `/api/tenants/${encodeURIComponent(tenantId)}/intelligence-analysis-log/export`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `analysis-log-${tenantId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("CSV export failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      {isSuperAdmin && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={downloading}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Exportando…" : "Exportar CSV"}
          </Button>
        </div>
      )}
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total de análises</p>
          {isLoading
            ? <Skeleton className="h-7 w-24 mt-1" />
            : <p className="text-2xl font-bold">{(data?.stats.totalCalls ?? 0).toLocaleString("pt-BR")}</p>
          }
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Tokens consumidos</p>
          {isLoading
            ? <Skeleton className="h-7 w-24 mt-1" />
            : <p className="text-2xl font-bold">{(data?.stats.totalTokens ?? 0).toLocaleString("pt-BR")}</p>
          }
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Por origem</p>
          {isLoading
            ? <div className="space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-28" /></div>
            : data && Object.keys(data.stats.byTriggeredBy).length > 0
              ? (
                <ul className="space-y-1">
                  {Object.entries(data.stats.byTriggeredBy).map(([key, stat]) => (
                    <li key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{triggeredByLabel(key)}</span>
                      <span className="font-medium">{stat.calls.toLocaleString("pt-BR")} chamadas</span>
                    </li>
                  ))}
                </ul>
              )
              : <p className="text-sm text-muted-foreground">Nenhuma análise registrada.</p>
          }
        </div>
      </div>

      {/* Log table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Histórico de análises
          </h3>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma análise de IA registrada ainda.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Risco de Churn</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs text-muted-foreground">
                      {entry.leadId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {entry.tokensUsed.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.churnRisk != null ? (
                        <span className={cn(
                          "font-medium",
                          entry.churnRisk >= 60 ? "text-red-500" : entry.churnRisk >= 40 ? "text-yellow-500" : "text-green-600"
                        )}>
                          {entry.churnRisk}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {triggeredByLabel(entry.triggeredBy)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t text-sm text-muted-foreground">
                <span>
                  Página {page} de {totalPages} · {data.total} registros
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Configuracoes() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTenantAdmin = user?.platformRole === "tenant_admin";
  const isSuperAdmin = user?.platformRole === "super_admin";
  const isSeller = user?.platformRole === "tenant_seller";
  const userFunction = user?.userFunction as UserFunction | undefined;
  const isAdmin = isTenantAdmin || isSuperAdmin;
  const showFaturamento = isAdmin || (userFunction && ["financeiro", "administrador", "outro"].includes(userFunction));

  // ── Team Management ────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const teamQuery = useListTenantUsers(tenantId, {
    query: { queryKey: getListTenantUsersQueryKey(tenantId), enabled: !!tenantId && isTenantAdmin },
  });

  const inviteSeller = useInviteTenantSeller({
    mutation: {
      onSuccess: (data) => {
        setLastInviteUrl(data.inviteUrl);
        setInviteEmail("");
        toast({ title: "Convite gerado!", description: `Link de acesso criado para ${data.email}.` });
      },
      onError: () => toast({ title: "Erro ao gerar convite.", variant: "destructive" }),
    },
  });

  const removeUser = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTenantUsersQueryKey(tenantId) });
        toast({ title: "Usuário removido." });
      },
      onError: () => toast({ title: "Erro ao remover usuário.", variant: "destructive" }),
    },
  });

  // ── Image Upload ───────────────────────────────────────────────────────────
  const requestUploadUrl = useRequestUploadUrl();
  const logoInputRef    = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading,    setLogoUploading]    = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);

  async function uploadImageFile(
    file: File,
    onDone: (objectPath: string) => void,
    setUploading: (v: boolean) => void,
  ) {
    setUploading(true);
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
      if (!uploadRes.ok) throw new Error("Upload para GCS falhou");
      onDone(result.objectPath);
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Business Profile ───────────────────────────────────────────────────────
  const profileQuery   = useGetBusinessProfileByTenant(tenantId, { query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId, retry: false } });
  const createProfile  = useCreateBusinessProfile();
  const updateProfile  = useUpdateBusinessProfile();

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { razaoSocial: "", nomeFantasia: "", cnpj: "", endereco: "", telefone: "", email: "", vertical: "", urlLinhaProdutos: "", logoUrl: "" },
    values: profileQuery.data
      ? {
          razaoSocial:      profileQuery.data.razaoSocial ?? "",
          nomeFantasia:     profileQuery.data.nomeFantasia ?? "",
          cnpj:             profileQuery.data.cnpj ?? "",
          endereco:         profileQuery.data.endereco ?? "",
          telefone:         profileQuery.data.telefone ?? "",
          email:            profileQuery.data.email ?? "",
          vertical:         profileQuery.data.vertical ?? "",
          urlLinhaProdutos: profileQuery.data.urlLinhaProdutos ?? "",
          logoUrl:          profileQuery.data.logoUrl ?? "",
        }
      : undefined,
  });

  function onSaveProfile(values: ProfileForm) {
    const profileExists = !!profileQuery.data?.id;
    const payload = {
      razaoSocial:      values.razaoSocial,
      nomeFantasia:     values.nomeFantasia || undefined,
      cnpj:             values.cnpj || undefined,
      endereco:         values.endereco || undefined,
      telefone:         values.telefone || undefined,
      email:            values.email || undefined,
      vertical:         values.vertical || undefined,
      urlLinhaProdutos: values.urlLinhaProdutos || undefined,
      logoUrl:          values.logoUrl || undefined,
    };

    if (profileExists) {
      updateProfile.mutate(
        { id: profileQuery.data!.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: profileQuery.queryKey });
            toast({ title: "Perfil atualizado com sucesso." });
          },
          onError: () => toast({ title: "Erro ao salvar perfil.", variant: "destructive" }),
        }
      );
    } else {
      createProfile.mutate(
        { data: { tenantId, ...payload } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: profileQuery.queryKey });
            toast({ title: "Perfil criado com sucesso." });
          },
          onError: () => toast({ title: "Erro ao criar perfil.", variant: "destructive" }),
        }
      );
    }
  }

  function saveImageUrl(field: "logoUrl" | "faviconUrl", value: string) {
    const profileExists = !!profileQuery.data?.id;
    const data = { [field]: value };
    if (profileExists) {
      updateProfile.mutate(
        { id: profileQuery.data!.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: profileQuery.queryKey });
            toast({ title: field === "logoUrl" ? "Logo salvo com sucesso." : "Favicon salvo com sucesso." });
          },
          onError: () => toast({ title: "Erro ao salvar imagem.", variant: "destructive" }),
        }
      );
    } else {
      createProfile.mutate(
        { data: { tenantId, razaoSocial: profileForm.getValues("razaoSocial") || "Empresa", ...data } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: profileQuery.queryKey });
            toast({ title: field === "logoUrl" ? "Logo salvo com sucesso." : "Favicon salvo com sucesso." });
          },
          onError: () => toast({ title: "Erro ao salvar imagem.", variant: "destructive" }),
        }
      );
    }
  }

  // ── Agent Config ───────────────────────────────────────────────────────────
  const agentQuery       = useGetAgentConfigByTenant(tenantId, { query: { queryKey: getGetAgentConfigByTenantQueryKey(tenantId), enabled: !!tenantId, retry: false } });
  const createAgentConf  = useCreateAgentConfig();
  const updateAgentConf  = useUpdateAgentConfig();
  const completeSetup    = useCompleteAgentConfigSetup();

  type AgentLocal = { enabled: boolean; prompt: string };
  const defaultAgents: Record<AgentKey, AgentLocal> = Object.fromEntries(
    AGENT_KEYS.map((k) => [k, { enabled: false, prompt: "" }])
  ) as Record<AgentKey, AgentLocal>;

  const [agentState, setAgentState] = useState<Record<AgentKey, AgentLocal>>(() => {
    const loaded = agentQuery.data?.agents ?? {};
    return Object.fromEntries(
      AGENT_KEYS.map((k) => [
        k,
        { enabled: loaded[k]?.enabled ?? false, prompt: loaded[k]?.prompt ?? "" },
      ])
    ) as Record<AgentKey, AgentLocal>;
  });

  // Sync agentState when server data arrives
  const agentDataId = agentQuery.data?.id;
  const [syncedId, setSyncedId] = useState<string | undefined>(undefined);
  if (agentDataId && agentDataId !== syncedId) {
    const loaded = agentQuery.data!.agents ?? {};
    const next = Object.fromEntries(
      AGENT_KEYS.map((k) => [
        k,
        { enabled: loaded[k]?.enabled ?? false, prompt: loaded[k]?.prompt ?? "" },
      ])
    ) as Record<AgentKey, AgentLocal>;
    setAgentState(next);
    setSyncedId(agentDataId);
  }

  function buildAgentsMap(): AgentsMap {
    return Object.fromEntries(
      AGENT_KEYS.map((k) => [k, { enabled: agentState[k].enabled, prompt: agentState[k].prompt || undefined }])
    ) as AgentsMap;
  }

  function onSaveAgents() {
    const configExists = !!agentQuery.data?.id;
    const agents = buildAgentsMap();

    if (configExists) {
      updateAgentConf.mutate(
        { id: agentQuery.data!.id, data: { agents } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: agentQuery.queryKey });
            toast({ title: "Configuração de agentes salva." });
          },
          onError: () => toast({ title: "Erro ao salvar agentes.", variant: "destructive" }),
        }
      );
    } else {
      createAgentConf.mutate(
        { data: { tenantId, agents } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: agentQuery.queryKey });
            toast({ title: "Configuração de agentes criada." });
          },
          onError: () => toast({ title: "Erro ao criar configuração.", variant: "destructive" }),
        }
      );
    }
  }

  function onCompleteSetup() {
    if (!agentQuery.data?.id) return;
    completeSetup.mutate(
      { id: agentQuery.data.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: agentQuery.queryKey });
          toast({ title: "Setup concluído. Autonomia será ativada em 5 dias." });
        },
        onError: () => toast({ title: "Erro ao concluir setup.", variant: "destructive" }),
      }
    );
  }

  // ── Tenant Thresholds ──────────────────────────────────────────────────────
  const tenantQuery  = useGetTenant(tenantId, { query: { queryKey: getGetTenantQueryKey(tenantId), enabled: !!tenantId } });
  const updateTenant = useUpdateTenant();

  const thresholdForm = useForm<ThresholdForm>({
    resolver: zodResolver(thresholdSchema),
    defaultValues: { analysisStalenessHours: "", analysisMessageThreshold: "", maxAnalysesPerHour: "" },
    values: tenantQuery.data
      ? {
          analysisStalenessHours:     tenantQuery.data.analysisStalenessHours    != null ? String(tenantQuery.data.analysisStalenessHours)    : "",
          analysisMessageThreshold:   tenantQuery.data.analysisMessageThreshold  != null ? String(tenantQuery.data.analysisMessageThreshold)  : "",
          maxAnalysesPerHour:         tenantQuery.data.maxAnalysesPerHour        != null ? String(tenantQuery.data.maxAnalysesPerHour)        : "",
        }
      : undefined,
  });

  function onSaveThresholds(values: ThresholdForm) {
    updateTenant.mutate(
      {
        id: tenantId,
        data: {
          analysisStalenessHours:   values.analysisStalenessHours   !== "" ? parseInt(values.analysisStalenessHours!, 10)   : null,
          analysisMessageThreshold: values.analysisMessageThreshold  !== "" ? parseInt(values.analysisMessageThreshold!, 10) : null,
          maxAnalysesPerHour:       values.maxAnalysesPerHour        !== "" ? parseInt(values.maxAnalysesPerHour!, 10)       : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
          toast({ title: "Configurações de análise salvas." });
        },
        onError: () => toast({ title: "Erro ao salvar configurações.", variant: "destructive" }),
      }
    );
  }

  // ── Tipo de Fechamento Padrão ─────────────────────────────────────────────
  const [tipoFechamentoDefaultLocal, setTipoFechamentoDefaultLocal] = useState<TipoFechamento>("pedido");
  const [syncedTipo, setSyncedTipo] = useState(false);
  if (tenantQuery.data !== undefined && !syncedTipo) {
    setTipoFechamentoDefaultLocal((tenantQuery.data.tipoFechamentoDefault as TipoFechamento | null) ?? "pedido");
    setSyncedTipo(true);
  }

  function onSaveTipoFechamento() {
    updateTenant.mutate(
      { id: tenantId, data: { tipoFechamentoDefault: tipoFechamentoDefaultLocal } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
          toast({ title: "Tipo de fechamento padrão atualizado." });
        },
        onError: () => toast({ title: "Erro ao salvar configuração.", variant: "destructive" }),
      }
    );
  }

  // ── Site Config ───────────────────────────────────────────────────────────
  const siteQuery      = useGetSiteConfigByTenant(tenantId, { query: { queryKey: getGetSiteConfigByTenantQueryKey(tenantId), enabled: !!tenantId } });
  const createSite     = useCreateSiteConfig();
  const updateSite     = useUpdateSiteConfig();

  const siteForm = useForm<SiteConfigForm>({
    resolver: zodResolver(siteConfigSchema),
    defaultValues: { template: "padrao", corPrimaria: "", tagline: "", sobreEmpresa: "", whatsappContato: "", ativo: true },
    values: siteQuery.data
      ? {
          template: (siteQuery.data.template as "padrao" | "moderno" | "minimalista") ?? "padrao",
          corPrimaria: siteQuery.data.corPrimaria ?? "",
          tagline: siteQuery.data.tagline ?? "",
          sobreEmpresa: siteQuery.data.sobreEmpresa ?? "",
          whatsappContato: siteQuery.data.whatsappContato ?? "",
          ativo: siteQuery.data.ativo ?? true,
        }
      : undefined,
  });

  function onSaveSite(values: SiteConfigForm) {
    const payload = {
      ...values,
      corPrimaria: values.corPrimaria || undefined,
      tagline: values.tagline || undefined,
      sobreEmpresa: values.sobreEmpresa || undefined,
      whatsappContato: values.whatsappContato || undefined,
    };
    if (siteQuery.data?.id) {
      updateSite.mutate(
        { id: siteQuery.data.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSiteConfigByTenantQueryKey(tenantId) });
            toast({ title: "Configurações do site salvas." });
          },
          onError: () => toast({ title: "Erro ao salvar configurações do site.", variant: "destructive" }),
        }
      );
    } else {
      createSite.mutate(
        { data: { tenantId, ...payload } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSiteConfigByTenantQueryKey(tenantId) });
            toast({ title: "Site configurado com sucesso." });
          },
          onError: () => toast({ title: "Erro ao criar configuração do site.", variant: "destructive" }),
        }
      );
    }
  }

  // ── Integration Settings ───────────────────────────────────────────────────
  const integrationQuery    = useGetIntegrationSettings(tenantId, { query: { queryKey: getGetIntegrationSettingsQueryKey(tenantId), enabled: !!tenantId } });
  const updateIntegration   = useUpdateIntegrationSettings();
  const regenerateKey       = useRegenerateIntegrationApiKey();

  // ── Integrações — bloqueio por senha ────────────────────────────────────
  const [integracoesUnlocked, setIntegracoesUnlocked] = useState(false);
  const [integracoesPasswordInput, setIntegracoesPasswordInput] = useState("");
  const [integracoesUnlocking, setIntegracoesUnlocking] = useState(false);
  const [integracoesUnlockError, setIntegracoesUnlockError] = useState("");

  async function verifyIntegrationPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    setIntegracoesUnlocking(true);
    setIntegracoesUnlockError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password: integracoesPasswordInput }),
      });
      if (res.ok) {
        setIntegracoesUnlocked(true);
        setIntegracoesPasswordInput("");
      } else {
        setIntegracoesUnlockError("Senha incorreta. Tente novamente.");
      }
    } catch {
      setIntegracoesUnlockError("Erro ao verificar senha. Tente novamente.");
    } finally {
      setIntegracoesUnlocking(false);
    }
  }

  const [webhookUrlInput, setWebhookUrlInput] = useState<string>("");
  const [integrationType, setIntegrationType] = useState<"n8n" | "api" | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const regenerateWebhookSecretMutation = useRegenerateWebhookSecret();

  const integrationData = integrationQuery.data;
  const [syncedIntegration, setSyncedIntegration] = useState(false);
  if (integrationData !== undefined && !syncedIntegration) {
    setWebhookUrlInput(integrationData.webhookEstoqueUrl ?? "");
    setIntegrationType(integrationData.integrationType ?? null);
    setSyncedIntegration(true);
  }

  // ── Custom Domain state ─────────────────────────────────────────────────
  const [customDomainInput, setCustomDomainInput] = useState<string>("");
  const [customDomainSaving, setCustomDomainSaving] = useState(false);
  const [customDomainList, setCustomDomainList] = useState<Array<{
    id: string; domain: string; status: string; dnsRecordName?: string; dnsRecordValue?: string;
  }>>([]);
  const [customDomainLoading, setCustomDomainLoading] = useState(false);
  const [domainStatusChecking, setDomainStatusChecking] = useState(false);

  async function loadCustomDomains() {
    if (!tenantId) return;
    setCustomDomainLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/domains`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCustomDomainList(data.domains ?? []);
      }
    } catch {
      // ignore
    } finally {
      setCustomDomainLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) loadCustomDomains();
  }, [tenantId]);

  async function onSaveCustomDomain() {
    if (!tenantId || !customDomainInput.trim()) return;
    setCustomDomainSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ domain: customDomainInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: "Domínio registrado com sucesso." });
        setCustomDomainInput("");
        setCustomDomainList((prev) => [...prev, { id: data.id, domain: data.domain, status: data.status, dnsRecordName: data.dnsRecordName, dnsRecordValue: data.dnsRecordValue }]);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || "Erro ao registrar domínio.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao registrar domínio.", variant: "destructive" });
    } finally {
      setCustomDomainSaving(false);
    }
  }

  async function onDeleteCustomDomain(domainId: string) {
    if (!tenantId) return;
    setDomainStatusChecking(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/domains/${domainId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (res.ok) {
        toast({ title: "Domínio removido." });
        setCustomDomainList((prev) => prev.filter((d) => d.id !== domainId));
      } else {
        toast({ title: "Erro ao remover domínio.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao remover domínio.", variant: "destructive" });
    } finally {
      setDomainStatusChecking(false);
    }
  }

  async function checkDomainStatus(domainId: string) {
    if (!tenantId) return;
    setDomainStatusChecking(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/domains/${domainId}/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        const domain = data.domain;
        setCustomDomainList((prev) => prev.map((d) => (d.id === domainId ? { ...d, status: domain.status, dnsRecordName: domain.dnsRecordName, dnsRecordValue: domain.dnsRecordValue } : d)));
        toast({ title: `Status: ${domain.status === "active" ? "Ativo" : domain.status === "pending_dns" ? "DNS pendente" : domain.status === "pending_ssl" ? "SSL pendente" : "Falhou"}.` });
      } else {
        toast({ title: "Erro ao verificar status.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao verificar status.", variant: "destructive" });
    } finally {
      setDomainStatusChecking(false);
    }
  }

  // ── Meta WhatsApp Cloud API connection state ──────────────────────────────
  const [metaPhoneNumberIdInput, setMetaPhoneNumberIdInput] = useState<string>("");
  const [metaWabaIdInput, setMetaWabaIdInput] = useState<string>("");
  const [metaAccessTokenInput, setMetaAccessTokenInput] = useState<string>("");
  const [metaVerifyTokenInput, setMetaVerifyTokenInput] = useState<string>("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [syncedMeta, setSyncedMeta] = useState(false);
  const [metaStatusChecking, setMetaStatusChecking] = useState(false);
  const [metaStatus, setMetaStatus] = useState<{
    configured: boolean; verified: boolean;
    displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string; error?: string;
  } | null>(null);

  async function checkMetaStatus() {
    if (!agentQuery.data?.id) return;
    setMetaStatusChecking(true);
    setMetaStatus(null);
    try {
      const res = await fetch(`/api/agent-configs/${agentQuery.data.id}/meta-status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (res.ok) {
        const data = await res.json() as typeof metaStatus;
        setMetaStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setMetaStatusChecking(false);
    }
  }

  if (agentQuery.data && !syncedMeta) {
    setMetaPhoneNumberIdInput(agentQuery.data.metaPhoneNumberId ?? "");
    setMetaWabaIdInput(agentQuery.data.metaWabaId ?? "");
    setMetaAccessTokenInput(agentQuery.data.metaAccessToken ?? "");
    setMetaVerifyTokenInput(agentQuery.data.metaVerifyToken ?? "");
    setSyncedMeta(true);
  }

  function onSaveMeta() {
    if (!agentQuery.data?.id) return;
    setMetaSaving(true);
    updateAgentConf.mutate(
      {
        id: agentQuery.data.id,
        data: {
          metaPhoneNumberId: metaPhoneNumberIdInput.trim() || null,
          metaWabaId: metaWabaIdInput.trim() || null,
          metaAccessToken: metaAccessTokenInput.trim() || null,
          metaVerifyToken: metaVerifyTokenInput.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetAgentConfigByTenantQueryKey(tenantId ?? ""), updated);
          setSyncedMeta(false);
          setMetaSaving(false);
          setMetaStatus(null);
          toast({ title: "Credenciais Meta WhatsApp salvas com sucesso." });
        },
        onError: () => {
          setMetaSaving(false);
          toast({ title: "Erro ao salvar credenciais Meta.", variant: "destructive" });
        },
      }
    );
  }

  function onDisconnectMeta() {
    if (!agentQuery.data?.id) return;
    setMetaSaving(true);
    updateAgentConf.mutate(
      {
        id: agentQuery.data.id,
        data: { metaPhoneNumberId: null, metaWabaId: null, metaAccessToken: null, metaVerifyToken: null },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetAgentConfigByTenantQueryKey(tenantId ?? ""), updated);
          setMetaPhoneNumberIdInput("");
          setMetaWabaIdInput("");
          setMetaAccessTokenInput("");
          setMetaVerifyTokenInput("");
          setSyncedMeta(false);
          setMetaSaving(false);
          setMetaStatus(null);
          toast({ title: "Meta WhatsApp desconectado." });
        },
        onError: () => {
          setMetaSaving(false);
          toast({ title: "Erro ao desconectar Meta WhatsApp.", variant: "destructive" });
        },
      }
    );
  }

  // ── Instagram OAuth connection state ─────────────────────────────────────────────
  const igConnection = useGetInstagramConnectionStatus(tenantId ?? "");
  const disconnectIg = useDisconnectInstagram();
  const refreshIg = useRefreshInstagramToken();

  const [location] = useLocation();
  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("instagramConnected");
    const error = url.searchParams.get("instagramError");
    if (connected === "1") {
      toast({ title: "Instagram conectado com sucesso!" });
      igConnection.refetch();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const messages: Record<string, string> = {
        access_denied: "Permissão negada. Tente novamente.",
        invalid_state: "Sessão inválida. Tente novamente.",
        no_pages: "Nenhuma página encontrada. Verifique se sua conta tem uma página com Instagram Business.",
        exchange_failed: "Erro ao conectar. Tente novamente.",
      };
      toast({ title: messages[error] ?? "Erro ao conectar Instagram.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  function onConnectInstagram() {
    window.location.href = "/api/auth/instagram";
  }
  function onDisconnectInstagramOAuth() {
    disconnectIg.mutate(
      { tenantId: tenantId ?? "" },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInstagramConnectionStatusQueryKey(tenantId ?? "") });
          toast({ title: "Instagram desconectado." });
        },
        onError: () => {
          toast({ title: "Erro ao desconectar Instagram.", variant: "destructive" });
        },
      }
    );
  }
  function onRefreshInstagram() {
    refreshIg.mutate(
      { tenantId: tenantId ?? "" },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInstagramConnectionStatusQueryKey(tenantId ?? "") });
          toast({ title: "Token renovado com sucesso." });
        },
        onError: () => {
          toast({ title: "Erro ao renovar token.", variant: "destructive" });
        },
      }
    );
  }

  // ── Google Calendar connection state ─────────────────────────────────────
  const agendasQuery = useListAgendas(tenantId ?? "");
  const disconnectGoogle = useDisconnectAgendaGoogle();
  const [googleLoadingId, setGoogleLoadingId] = useState<string | null>(null);

  // Agenda com Google Calendar conectado (mostrar na UI)
  const connectedAgendas = (agendasQuery.data ?? []).filter((a) => a.googleCalendarId);
  const disconnectedAgendas = (agendasQuery.data ?? []).filter((a) => !a.googleCalendarId);

  async function handleConnectGoogle(agenda: { id: string; nome: string }) {
    setGoogleLoadingId(agenda.id);
    try {
      const { url } = await getAgendaGoogleAuthUrl(agenda.id);
      window.location.href = url;
    } catch {
      toast({ title: "Erro ao obter URL do Google", variant: "destructive" });
    } finally {
      setGoogleLoadingId(null);
    }
  }

  function handleDisconnectGoogle(agenda: { id: string }) {
    disconnectGoogle.mutate(
      { id: agenda.id },
      {
        onSuccess: () => {
          toast({ title: "Google Calendar desconectado." });
          queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId ?? "") });
        },
        onError: () => toast({ title: "Erro ao desconectar", variant: "destructive" }),
      }
    );
  }

  // ── WhatsApp OAuth connection state ──────────────────────────────────────
  const waConnection = useGetWhatsappConnectionStatus(tenantId ?? "");
  const disconnectWa = useDisconnectWhatsapp();
  const refreshWa = useRefreshWhatsappToken();

  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("googleConnected");
    const error = url.searchParams.get("googleError");
    if (connected === "1") {
      toast({ title: "Google Calendar conectado com sucesso!" });
      agendasQuery.refetch();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const messages: Record<string, string> = {
        access_denied: "Permissão negada. Tente novamente.",
        invalid_state: "Sessão inválida. Tente novamente.",
        exchange_failed: "Erro ao conectar. Tente novamente.",
      };
      toast({ title: messages[error] ?? "Erro ao conectar Google Calendar.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("whatsappConnected");
    const error = url.searchParams.get("whatsappError");
    if (connected === "1") {
      toast({ title: "WhatsApp conectado com sucesso!" });
      waConnection.refetch();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const messages: Record<string, string> = {
        access_denied: "Permissão negada. Tente novamente.",
        invalid_state: "Sessão inválida. Tente novamente.",
        no_waba: "Nenhuma conta WhatsApp Business encontrada.",
        no_phone: "Nenhum número de telefone encontrado.",
        exchange_failed: "Erro ao conectar. Tente novamente.",
      };
      toast({ title: messages[error] ?? "Erro ao conectar WhatsApp.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);

  function onConnectWhatsapp() {
    window.location.href = "/api/auth/whatsapp";
  }
  function onDisconnectWhatsappOAuth() {
    disconnectWa.mutate(
      { tenantId: tenantId ?? "" },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWhatsappConnectionStatusQueryKey(tenantId ?? "") });
          toast({ title: "WhatsApp desconectado." });
        },
        onError: () => {
          toast({ title: "Erro ao desconectar WhatsApp.", variant: "destructive" });
        },
      }
    );
  }
  function onRefreshWhatsapp() {
    refreshWa.mutate(
      { tenantId: tenantId ?? "" },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWhatsappConnectionStatusQueryKey(tenantId ?? "") });
          toast({ title: "Token renovado com sucesso." });
        },
        onError: () => {
          toast({ title: "Erro ao renovar token.", variant: "destructive" });
        },
      }
    );
  }

  function onSaveWebhookUrl() {
    updateIntegration.mutate(
      { id: tenantId, data: { webhookEstoqueUrl: webhookUrlInput || null, integrationType: integrationType || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetIntegrationSettingsQueryKey(tenantId) });
          setSyncedIntegration(false);
          toast({ title: "Integração de estoque salva." });
        },
        onError: () => toast({ title: "Erro ao salvar integração.", variant: "destructive" }),
      }
    );
  }

  function onRegenerateKey() {
    regenerateKey.mutate(
      { id: tenantId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetIntegrationSettingsQueryKey(tenantId) });
          setSyncedIntegration(false);
          setShowApiKey(true);
          toast({ title: "API key regenerada com sucesso." });
        },
        onError: () => toast({ title: "Erro ao regenerar API key.", variant: "destructive" }),
      }
    );
  }

  const profileSaving    = createProfile.isPending || updateProfile.isPending;
  const agentSaving      = createAgentConf.isPending || updateAgentConf.isPending;
  const thresholdSaving  = updateTenant.isPending;
  const siteSaving       = createSite.isPending || updateSite.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie o perfil da empresa e os agentes de IA.</p>
      </div>

      <Tabs
        defaultValue="perfil"
        className="space-y-6"
        onValueChange={(tab) => { if (tab !== "integracoes") setIntegracoesUnlocked(false); }}
      >
        <TabsList className={cn("grid w-full max-w-3xl", (isTenantAdmin && showFaturamento) ? "grid-cols-8" : (isTenantAdmin || showFaturamento) ? "grid-cols-7" : "grid-cols-6")}>
          <TabsTrigger value="perfil" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="agentes" className="gap-1.5">
            <Bot className="h-4 w-4" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="analise" className="gap-1.5">
            <Brain className="h-4 w-4" />
            Análise
          </TabsTrigger>
          <TabsTrigger value="site" className="gap-1.5">
            <Globe className="h-4 w-4" />
            Site
          </TabsTrigger>
          <TabsTrigger value="calendario" className="gap-1.5">
            <CalendarHeart className="h-4 w-4" />
            Calendário
          </TabsTrigger>
          <TabsTrigger value="integracoes" className="gap-1.5">
            <Webhook className="h-4 w-4" />
            Integrações
          </TabsTrigger>
          {isTenantAdmin && (
            <TabsTrigger value="equipe" className="gap-1.5">
              <Users className="h-4 w-4" />
              Equipe
            </TabsTrigger>
          )}
          {showFaturamento && (
            <TabsTrigger value="faturamento" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              Faturamento
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab: Perfil da Empresa ──────────────────────────────────────── */}
        <TabsContent value="perfil">
          <div className="rounded-xl border bg-card p-6 space-y-6">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Perfil da Empresa
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Informações utilizadas pelos agentes de IA para contextualizar conversas.
              </p>
            </div>

            {profileQuery.isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-5">

                  {/* ── Logo + Favicon ─────────────────────────────────── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Logo */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Logo da empresa</label>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          uploadImageFile(
                            file,
                            (path) => saveImageUrl("logoUrl", path),
                            setLogoUploading,
                          );
                          e.target.value = "";
                        }}
                      />
                      {/* Logo preview + URL input */}
                      <div className="space-y-2">
                        {profileQuery.data?.logoUrl ? (
                          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                            <img
                              src={
                                profileQuery.data.logoUrl.startsWith("/objects/")
                                  ? `/api/storage${profileQuery.data.logoUrl}`
                                  : profileQuery.data.logoUrl
                              }
                              alt="Logo"
                              className="h-12 w-auto max-w-[160px] rounded object-contain"
                              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground">Logo atual</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => logoInputRef.current?.click()}
                              disabled={logoUploading}
                              className="gap-1.5 text-xs shrink-0"
                            >
                              {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                              Trocar
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            disabled={logoUploading}
                            className="w-full flex flex-col items-center gap-2 p-5 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {logoUploading ? (
                              <><Loader2 className="h-7 w-7 text-primary animate-spin" /><span className="text-sm text-muted-foreground">Enviando...</span></>
                            ) : (
                              <><ImageIcon className="h-7 w-7 text-muted-foreground/50" /><span className="text-sm font-medium">Selecionar logo</span><span className="text-xs text-muted-foreground">PNG, JPG, SVG ou WebP</span></>
                            )}
                          </button>
                        )}
                        {/* Logo URL input */}
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Ou cole a URL da logo..."
                            value={profileForm.watch("logoUrl") ?? ""}
                            onChange={(e) => {
                              profileForm.setValue("logoUrl", e.target.value, { shouldDirty: true });
                            }}
                            className="text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-xs"
                            onClick={() => {
                              const url = profileForm.getValues("logoUrl");
                              if (url) saveImageUrl("logoUrl", url);
                            }}
                          >
                            <Link className="h-3.5 w-3.5" />
                            Salvar
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Favicon */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Favicon</label>
                      <input
                        ref={faviconInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          uploadImageFile(
                            file,
                            (path) => saveImageUrl("faviconUrl", path),
                            setFaviconUploading,
                          );
                          e.target.value = "";
                        }}
                      />
                      {profileQuery.data?.faviconUrl ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                          <img
                            src={
                              profileQuery.data.faviconUrl.startsWith("/objects/")
                                ? `/api/storage${profileQuery.data.faviconUrl}`
                                : profileQuery.data.faviconUrl
                            }
                            alt="Favicon"
                            className="h-10 w-10 rounded object-contain"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Favicon atual</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => faviconInputRef.current?.click()}
                            disabled={faviconUploading}
                            className="gap-1.5 text-xs shrink-0"
                          >
                            {faviconUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            Trocar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => faviconInputRef.current?.click()}
                          disabled={faviconUploading}
                          className="w-full flex flex-col items-center gap-2 p-5 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {faviconUploading ? (
                            <><Loader2 className="h-7 w-7 text-primary animate-spin" /><span className="text-sm text-muted-foreground">Enviando...</span></>
                          ) : (
                            <><ImageIcon className="h-7 w-7 text-muted-foreground/50" /><span className="text-sm font-medium">Selecionar favicon</span><span className="text-xs text-muted-foreground">PNG ou ICO · 32×32 px</span></>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="razaoSocial"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Razão Social <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Empresa Ltda." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="nomeFantasia"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Fantasia</FormLabel>
                          <FormControl>
                            <Input placeholder="Marca comercial" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="cnpj"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CNPJ</FormLabel>
                          <FormControl>
                            <Input placeholder="00.000.000/0001-00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="telefone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefone</FormLabel>
                          <FormControl>
                            <Input placeholder="+55 11 99999-9999" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail comercial</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contato@empresa.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="vertical"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vertical / Segmento</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecionar segmento..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">Não informado</SelectItem>
                              {VERTICAIS.map((v) => (
                                <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="endereco"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Endereço</FormLabel>
                          <FormControl>
                            <Input placeholder="Rua, número, cidade — UF" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="urlLinhaProdutos"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>
                            URL da linha de produtos
                            <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://meusite.com.br/produtos"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            Link público com informações dos produtos para a IA consultar.
                          </p>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={profileSaving} className="gap-2">
                      <Save className="h-4 w-4" />
                      {profileSaving ? "Salvando..." : "Salvar Perfil"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </div>

          {/* Tipo de Fechamento Padrão — admin only */}
          {(user?.platformRole === "tenant_admin" || user?.platformRole === "super_admin") && (
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Tipo de Fechamento Padrão
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Define o comportamento padrão ao marcar um negócio como Ganho. Pode ser alterado em cada negócio individualmente.
                </p>
              </div>

              {tenantQuery.isLoading ? (
                <div className="h-10 w-full animate-pulse bg-muted rounded" />
              ) : (
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Select
                      value={tipoFechamentoDefaultLocal}
                      onValueChange={(v) => setTipoFechamentoDefaultLocal(v as TipoFechamento)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pedido">Pedido — confirmação simples, sem assinatura</SelectItem>
                        <SelectItem value="contrato">Contrato — assinatura eletrônica obrigatória</SelectItem>
                        <SelectItem value="pedido_e_contrato">Pedido e Contrato — escolhido em cada negócio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={onSaveTipoFechamento}
                    disabled={updateTenant.isPending}
                    className="gap-2 shrink-0"
                  >
                    <Save className="h-4 w-4" />
                    {updateTenant.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Agentes de IA ──────────────────────────────────────────── */}
        <TabsContent value="agentes" className="space-y-5">

          {/* Status & Usage Card */}
          <div className="rounded-xl border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  Status de Autonomia
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Após o setup, os agentes operam de forma autônoma após 5 dias.
                </p>
              </div>
              {agentQuery.data && (
                <AutonomyStatus
                  setupCompletedAt={agentQuery.data.setupCompletedAt}
                  autonomyEnabledAt={agentQuery.data.autonomyEnabledAt}
                />
              )}
            </div>

            {agentQuery.data && !agentQuery.data.setupCompletedAt && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onCompleteSetup}
                disabled={completeSetup.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                {completeSetup.isPending ? "Iniciando..." : "Concluir Setup e Ativar Autonomia"}
              </Button>
            )}

            {agentQuery.data?.id && (
              <div className="border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Uso atual</p>
                <UsageBars agentConfigId={agentQuery.data.id} />
              </div>
            )}

            {agentQuery.isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            )}
          </div>

          {/* Churn Auto-WhatsApp Card */}
          {agentQuery.data && (
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    Follow-up automático por churn
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Quando ativado, o agente envia WhatsApp automaticamente para leads com risco de churn acima de 70%, máximo uma vez a cada 24h por lead.
                  </p>
                </div>
                <Switch
                  checked={!!agentQuery.data.churnAutoWhatsapp}
                  onCheckedChange={(checked) => {
                    if (!agentQuery.data?.id) return;
                    updateAgentConf.mutate(
                      { id: agentQuery.data.id, data: { churnAutoWhatsapp: checked } },
                      { onSuccess: () => { agentQuery.refetch(); toast({ title: checked ? "Automação de churn ativada." : "Automação de churn desativada." }); } }
                    );
                  }}
                  disabled={updateAgentConf.isPending}
                />
              </div>
            </div>
          )}

          {/* Agents List */}
          <div className="rounded-xl border bg-card divide-y">
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-base">Configuração dos Agentes</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ative os agentes e personalize o prompt de cada um.
                </p>
              </div>
              <Button
                size="sm"
                onClick={onSaveAgents}
                disabled={agentSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {agentSaving ? "Salvando..." : "Salvar Agentes"}
              </Button>
            </div>

            {agentQuery.isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-6 py-5 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ))
              : AGENT_KEYS.map((key) => {
                  const meta    = AGENT_LABELS[key];
                  const current = agentState[key];
                  return (
                    <div key={key} className="px-6 py-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
                            current.enabled
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {meta.label.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{meta.label}</p>
                            <p className="text-xs text-muted-foreground">{meta.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={current.enabled ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {current.enabled ? "Ativo" : "Inativo"}
                          </Badge>
                          <Switch
                            checked={current.enabled}
                            onCheckedChange={(v) =>
                              setAgentState((prev) => ({ ...prev, [key]: { ...prev[key], enabled: v } }))
                            }
                          />
                        </div>
                      </div>

                      {current.enabled && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Prompt personalizado</p>
                          <Textarea
                            placeholder={`Instruções específicas para o agente ${meta.label}... (deixe em branco para usar o padrão)`}
                            className="text-sm resize-none min-h-[90px]"
                            value={current.prompt}
                            onChange={(e) =>
                              setAgentState((prev) => ({ ...prev, [key]: { ...prev[key], prompt: e.target.value } }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </div>
        </TabsContent>

        {/* ── Tab: Análise de IA ──────────────────────────────────────────── */}
        <TabsContent value="analise" className="space-y-5">

          {/* Threshold Settings Card — admin only */}
          {(user?.platformRole === "tenant_admin" || user?.platformRole === "super_admin") && (
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  Configurações de Re-análise
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Defina quando um lead deve ser reanalisado automaticamente. Deixe em branco para usar o padrão global.
                </p>
              </div>

              {tenantQuery.isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <Form {...thresholdForm}>
                  <form onSubmit={thresholdForm.handleSubmit(onSaveThresholds)} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={thresholdForm.control}
                        name="analysisStalenessHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Re-analisar após (horas)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                placeholder="Padrão global"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Horas de inatividade antes de um lead ser considerado desatualizado.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={thresholdForm.control}
                        name="analysisMessageThreshold"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Re-analisar após (novas mensagens)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                placeholder="Padrão global"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Quantidade de novas mensagens que dispara uma nova análise automática.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={thresholdForm.control}
                        name="maxAnalysesPerHour"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Limite de análises por hora</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                placeholder="Padrão global"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Máximo de análises de IA permitidas por hora para este tenant. Deixe em branco para usar o padrão global.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button type="submit" disabled={thresholdSaving} className="gap-2">
                        <Save className="h-4 w-4" />
                        {thresholdSaving ? "Salvando..." : "Salvar Configurações"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          )}

          {/* Analysis Log */}
          <div>
            <div className="mb-5">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Uso de Análise de IA
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tokens consumidos por análises de risco de churn via IA.
              </p>
            </div>
            <AnalysisLogTab tenantId={tenantId} />
          </div>
        </TabsContent>

        {/* ── Tab: Site ───────────────────────────────────────────────────── */}
        <TabsContent value="site" className="space-y-5">
          <Tabs defaultValue="configurar" className="space-y-4">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="configurar" className="gap-1.5">
                <Globe className="h-4 w-4" />
                Configurar
              </TabsTrigger>
              <TabsTrigger value="gerador-ia" className="gap-1.5">
                <Wand2 className="h-4 w-4" />
                Gerador IA
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configurar">
          {/* ── Domain Card ─────────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Link className="h-4 w-4 text-primary" />
                Endereço do seu site
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Subdomínio gratuito e opção de domínio próprio via Cloudflare.
              </p>
            </div>

            {/* Subdomínio */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Subdomínio VendorAI
              </div>
              {tenantQuery.data?.subdomainSlug ? (
                <div className="flex items-center gap-3">
                  <code className="text-sm bg-background border rounded px-3 py-1.5 font-mono">
                    https://{tenantQuery.data.subdomainSlug}.vendor.ai
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={() => {
                      const url = `https://${tenantQuery.data?.subdomainSlug}.vendor.ai`;
                      navigator.clipboard.writeText(url);
                      toast({ title: "URL copiada." });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                  {siteQuery.data?.ativo && (
                    <a
                      href={`/site/${tenantQuery.data?.slug ?? ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver site
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Subdomínio será gerado automaticamente após o onboarding.
                </p>
              )}
            </div>

            {/* Domínio próprio */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Link className="h-4 w-4 text-muted-foreground" />
                Domínio próprio
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="exemplo.com.br"
                  value={customDomainInput}
                  onChange={(e) => setCustomDomainInput(e.target.value)}
                  className="max-w-sm"
                />
                <Button
                  onClick={onSaveCustomDomain}
                  disabled={customDomainSaving || !customDomainInput.trim()}
                  className="gap-2"
                >
                  {customDomainSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                  {customDomainSaving ? "Registrando..." : "Adicionar"}
                </Button>
              </div>
              {customDomainList.length > 0 && (
                <div className="space-y-2">
                  {customDomainList.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{d.domain}</span>
                          {d.status === "active" && (
                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Ativo
                            </Badge>
                          )}
                          {d.status === "pending_dns" && (
                            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1">
                              <Clock className="h-3 w-3" /> DNS pendente
                            </Badge>
                          )}
                          {d.status === "pending_ssl" && (
                            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 gap-1">
                              <Clock className="h-3 w-3" /> SSL pendente
                            </Badge>
                          )}
                          {d.status === "failed" && (
                            <Badge variant="outline" className="text-destructive border-red-200 bg-red-50 gap-1">
                              <AlertTriangle className="h-3 w-3" /> Falhou
                            </Badge>
                          )}
                        </div>
                        {d.status === "pending_dns" && (
                          <div className="text-xs text-muted-foreground">
                            Crie um registro <strong>CNAME</strong> em seu DNS:
                            <code className="ml-1 font-mono bg-background border rounded px-1">{d.dnsRecordName}</code> → <code className="font-mono bg-background border rounded px-1">{d.dnsRecordValue}</code>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => checkDomainStatus(d.id)}
                          disabled={domainStatusChecking}
                          title="Verificar status"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onDeleteCustomDomain(d.id)}
                          disabled={domainStatusChecking}
                          title="Remover domínio"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {customDomainList.length === 0 && !customDomainInput && (
                <p className="text-sm text-muted-foreground">
                  Adicione um domínio próprio para apontar seu site para um endereço personalizado.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Landing Page Pública
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Configure a página pública do seu negócio.
                </p>
              </div>
              {siteQuery.data?.ativo && (
                <a
                  href={`/site/${tenantQuery.data?.slug ?? ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver site
                </a>
              )}
            </div>

            {siteQuery.isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Form {...siteForm}>
                <form onSubmit={siteForm.handleSubmit(onSaveSite)} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* Template */}
                    <FormField
                      control={siteForm.control}
                      name="template"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Template</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um template" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="padrao">Padrão</SelectItem>
                              <SelectItem value="moderno">Moderno</SelectItem>
                              <SelectItem value="minimalista">Minimalista</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Cor Primária */}
                    <FormField
                      control={siteForm.control}
                      name="corPrimaria"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cor Primária</FormLabel>
                          <FormControl>
                            <div className="flex gap-2 items-center">
                              <input
                                type="color"
                                className="h-10 w-14 rounded border cursor-pointer p-1 bg-background"
                                value={field.value || "#1e3a5f"}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                              <Input
                                placeholder="#1e3a5f"
                                {...field}
                                className="flex-1"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Tagline */}
                    <FormField
                      control={siteForm.control}
                      name="tagline"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Tagline</FormLabel>
                          <FormControl>
                            <Input placeholder="Soluções que transformam seu negócio." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Sobre Empresa */}
                    <FormField
                      control={siteForm.control}
                      name="sobreEmpresa"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Sobre a Empresa</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Descreva sua empresa, missão e diferenciais para os visitantes do site..."
                              rows={4}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* WhatsApp */}
                    <FormField
                      control={siteForm.control}
                      name="whatsappContato"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp de Contato</FormLabel>
                          <FormControl>
                            <Input placeholder="5511999999999 (com DDI e DDD)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Ativo */}
                    <FormField
                      control={siteForm.control}
                      name="ativo"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div>
                            <FormLabel className="text-sm font-medium">Site Ativo</FormLabel>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Site inativo retorna 404 para visitantes.
                            </p>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" disabled={siteSaving} className="gap-2">
                    <Save className="h-4 w-4" />
                    {siteSaving ? "Salvando..." : "Salvar Site"}
                  </Button>
                </form>
              </Form>
            )}
          </div>
            </TabsContent>

            <TabsContent value="gerador-ia">
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    Gerador de Sites com IA
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Crie landing pages, e-commerces e sites institucionais em segundos.
                  </p>
                </div>
                <SiteGeneratorTab />
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── Tab: Calendário Comercial ───────────────────────────────────── */}
        <TabsContent value="calendario">
          <CalendarSettingsTab tenantId={tenantId} />
        </TabsContent>

        {/* ── Tab: Integrações ERP ────────────────────────────────────────── */}
        <TabsContent value="integracoes">
          {/* ── Lock screen ─────────────────────────────────────────────── */}
          {!integracoesUnlocked ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-full max-w-sm">
                <form onSubmit={verifyIntegrationPassword} className="rounded-xl border bg-card p-8 space-y-6 shadow-sm">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="rounded-full bg-muted p-4">
                      <Lock className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base">Área protegida</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Confirme sua senha para acessar as integrações e chaves de API.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sua senha</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={integracoesPasswordInput}
                      onChange={(e) => {
                        setIntegracoesPasswordInput(e.target.value);
                        setIntegracoesUnlockError("");
                      }}
                      autoFocus
                    />
                    {integracoesUnlockError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {integracoesUnlockError}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={integracoesUnlocking || !integracoesPasswordInput}
                  >
                    {integracoesUnlocking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    {integracoesUnlocking ? "Verificando…" : "Desbloquear"}
                  </Button>
                </form>
              </div>
            </div>
          ) : (
          <div className="space-y-6">

            {/* Google Calendar — OAuth */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-red-500" />
                    Google Calendar — OAuth
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Conecte suas agendas ao Google Calendar para criar eventos com Google Meet automaticamente e enviar convites aos leads.
                  </p>
                </div>
                {connectedAgendas.length > 0 && (
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> {connectedAgendas.length} conectada{connectedAgendas.length > 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>

              {agendasQuery.isLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                </div>
              ) : agendasQuery.data && agendasQuery.data.length > 0 ? (
                <div className="space-y-4">
                  {/* Agendas conectadas */}
                  {connectedAgendas.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agendas conectadas</p>
                      {connectedAgendas.map((agenda) => (
                        <div key={agenda.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 border p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: agenda.cor }} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{agenda.nome}</p>
                              {agenda.googleEmail && (
                                <p className="text-xs text-muted-foreground truncate">{agenda.googleEmail}</p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisconnectGoogle(agenda)}
                            disabled={disconnectGoogle.isPending || googleLoadingId === agenda.id}
                            className="gap-1.5 text-destructive hover:text-destructive shrink-0"
                          >
                            <CalendarX className="h-3.5 w-3.5" />
                            {disconnectGoogle.isPending ? "Desconectando…" : "Desconectar"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agendas desconectadas */}
                  {disconnectedAgendas.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agendas disponíveis</p>
                      {disconnectedAgendas.map((agenda) => (
                        <div key={agenda.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 border p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: agenda.cor }} />
                            <p className="text-sm font-medium truncate">{agenda.nome}</p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleConnectGoogle(agenda)}
                            disabled={googleLoadingId === agenda.id}
                            className="gap-1.5 shrink-0"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            {googleLoadingId === agenda.id ? "Conectando…" : "Conectar Google"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center space-y-1">
                  <CalendarCheck className="h-7 w-7 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Nenhuma agenda cadastrada.</p>
                  <p className="text-xs text-muted-foreground">Crie uma agenda na página Agenda primeiro.</p>
                </div>
              )}
            </div>

            {/* Webhook de entrada — WhatsApp Omnichannel */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-primary" />
                  Webhook de entrada — WhatsApp Omnichannel
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure o n8n (ou qualquer gateway) para enviar mensagens recebidas do WhatsApp para
                  este endpoint. Use o <strong>Tenant ID</strong> na URL e o <strong>Webhook Secret</strong> no header
                  <code className="text-xs bg-muted px-1 py-0.5 rounded mx-1">X-Webhook-Secret</code>.
                </p>
              </div>

              <div className="space-y-4">
                {/* Tenant ID */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tenant ID</label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm text-muted-foreground select-all">
                      {tenantId}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Copiar Tenant ID"
                      onClick={() => {
                        navigator.clipboard.writeText(tenantId ?? "");
                        toast({ title: "Tenant ID copiado." });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Webhook Secret */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Webhook Secret</label>
                  {agentQuery.isLoading ? (
                    <div className="h-10 bg-muted rounded-md animate-pulse" />
                  ) : agentQuery.data?.webhookSecret ? (
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
                        {showWebhookSecret
                          ? agentQuery.data.webhookSecret
                          : "whs_" + "•".repeat(32)}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowWebhookSecret((v) => !v)}
                        title={showWebhookSecret ? "Ocultar" : "Mostrar"}
                      >
                        {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Copiar secret"
                        onClick={() => {
                          navigator.clipboard.writeText(agentQuery.data?.webhookSecret ?? "");
                          toast({ title: "Webhook secret copiado." });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center space-y-1">
                      <Key className="h-7 w-7 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">Nenhum secret gerado ainda.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant={agentQuery.data?.webhookSecret ? "outline" : "default"}
                    disabled={regenerateWebhookSecretMutation.isPending || !agentQuery.data?.id}
                    onClick={() => {
                      if (!agentQuery.data?.id) return;
                      regenerateWebhookSecretMutation.mutate(
                        { id: agentQuery.data.id },
                        {
                          onSuccess: (updated) => {
                            queryClient.setQueryData(
                              getGetAgentConfigByTenantQueryKey(tenantId ?? ""),
                              updated,
                            );
                            toast({ title: "Webhook secret gerado com sucesso." });
                          },
                          onError: () => toast({ title: "Erro ao gerar secret.", variant: "destructive" }),
                        },
                      );
                    }}
                    className="gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", regenerateWebhookSecretMutation.isPending && "animate-spin")} />
                    {regenerateWebhookSecretMutation.isPending
                      ? "Gerando…"
                      : agentQuery.data?.webhookSecret
                      ? "Regenerar secret"
                      : "Gerar secret"}
                  </Button>
                  {agentQuery.data?.webhookSecret && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Ao regenerar, o secret anterior é invalidado. Atualize o n8n antes.
                    </p>
                  )}
                </div>

                {/* Endpoint reference */}
                <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint n8n → Vendor.ai</p>
                  <code className="text-xs block text-muted-foreground">
                    POST /api/tenants/{tenantId}/webhooks/whatsapp
                  </code>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-2">
{`Headers:
  X-Webhook-Secret: <seu-webhook-secret>
  Content-Type: application/json

Body:
{
  "telefone": "5511999998888",
  "mensagem": "Olá, quero saber mais",
  "nome": "João Silva"
}`}
                  </pre>
                </div>
              </div>
            </div>

            {/* WhatsApp — OAuth via Meta */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    WhatsApp — Meta Cloud API (oficial)
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Conecte sua conta WhatsApp Business via Meta OAuth para enviar e receber mensagens diretamente pelo VendorAI.
                  </p>
                </div>
                {waConnection.data?.connected && (
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Conectado
                    </span>
                  </div>
                )}
              </div>

              {waConnection.isLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                </div>
              ) : waConnection.data?.connected ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/30 border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Número:</span>
                      <span className="text-sm font-semibold text-foreground">{waConnection.data.displayPhoneNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">WABA ID:</span>
                      <code className="text-sm font-mono text-muted-foreground">{waConnection.data.wabaId}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Phone Number ID:</span>
                      <code className="text-sm font-mono text-muted-foreground">{waConnection.data.phoneNumberId}</code>
                    </div>
                    {waConnection.data.tokenExpiresAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Token expira em:</span>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(waConnection.data.tokenExpiresAt), "dd/MM/yyyy HH:mm")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={onConnectWhatsapp}
                      variant="outline"
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reconectar
                    </Button>
                    <Button
                      onClick={onRefreshWhatsapp}
                      variant="outline"
                      disabled={refreshWa.isPending}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {refreshWa.isPending ? "Renovando…" : "Renovar token"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onDisconnectWhatsappOAuth}
                      disabled={disconnectWa.isPending}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {disconnectWa.isPending ? "Desconectando…" : "Desconectar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Clique no botão abaixo para autorizar a conexão com sua conta WhatsApp Business via Meta.
                  </p>
                  <Button
                    onClick={onConnectWhatsapp}
                    className="gap-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Conectar WhatsApp
                  </Button>
                </div>
              )}
            </div>

            {/* Meta WhatsApp Cloud API — Legacy Manual */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    WhatsApp — Configuração Manual (legado)
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configuração manual das credenciais Meta. Use apenas se o OAuth não estiver disponível.
                  </p>
                </div>
                {agentQuery.data?.metaPhoneNumberId && agentQuery.data?.metaAccessToken && (
                  <div className="shrink-0 flex items-center gap-2">
                    {metaStatus === null ? (
                      <button
                        onClick={checkMetaStatus}
                        disabled={metaStatusChecking}
                        className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 px-2.5 py-1 rounded-full cursor-pointer border border-border transition-colors"
                      >
                        {metaStatusChecking ? "Verificando…" : "Testar conexão"}
                      </button>
                    ) : metaStatus?.verified ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        {metaStatus.displayPhoneNumber ?? "Verificado"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="h-3 w-3" /> Credenciais inválidas
                      </span>
                    )}
                  </div>
                )}
              </div>

              {agentQuery.isLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Phone Number ID</label>
                      <Input
                        placeholder="123456789012345"
                        value={metaPhoneNumberIdInput}
                        onChange={(e) => setMetaPhoneNumberIdInput(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">ID do número no Meta Business Manager.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">WABA ID (opcional)</label>
                      <Input
                        placeholder="123456789012345"
                        value={metaWabaIdInput}
                        onChange={(e) => setMetaWabaIdInput(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">WhatsApp Business Account ID.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Access Token (System User Token)</label>
                    <Input
                      type="password"
                      placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={metaAccessTokenInput}
                      onChange={(e) => setMetaAccessTokenInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Token permanente de usuário do sistema — em <strong>Meta Business Suite → Configurações → Usuários do sistema</strong>.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Verify Token (webhook)</label>
                    <Input
                      placeholder="meu-token-secreto"
                      value={metaVerifyTokenInput}
                      onChange={(e) => setMetaVerifyTokenInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Token livre escolhido por você — usado para verificar o webhook no painel Meta.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={onSaveMeta}
                      disabled={metaSaving || !agentQuery.data?.id || !metaPhoneNumberIdInput.trim() || !metaAccessTokenInput.trim()}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {metaSaving ? "Salvando…" : agentQuery.data?.metaPhoneNumberId ? "Atualizar credenciais" : "Conectar Meta WhatsApp"}
                    </Button>
                    {agentQuery.data?.metaPhoneNumberId && (
                      <Button
                        variant="outline"
                        onClick={onDisconnectMeta}
                        disabled={metaSaving}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Desconectar
                      </Button>
                    )}
                  </div>

                  {!agentQuery.data?.metaPhoneNumberId && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        Sem a Meta Cloud API configurada, mensagens WhatsApp dos agentes ficam salvas
                        no sistema mas <strong>não chegam ao destinatário</strong>.
                      </p>
                    </div>
                  )}

                  {/* Webhook de entrada — instruções Meta */}
                  {agentQuery.data?.metaPhoneNumberId && (
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <span className="text-base">📥</span>
                        Webhook de entrada (receber mensagens)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        No painel Meta Developers, vá em <strong>WhatsApp → Configuração</strong> e
                        configure o webhook com a URL e o Verify Token abaixo.
                      </p>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">URL do webhook:</p>
                          <div className="flex gap-2 items-center">
                            <code className="flex-1 text-xs break-all bg-muted border rounded px-2 py-1.5 text-foreground/80">
                              {`https://${window.location.hostname}/api/webhooks/meta/whatsapp`}
                            </code>
                            <Button
                              variant="outline"
                              size="icon"
                              className="shrink-0 h-7 w-7"
                              onClick={() => {
                                navigator.clipboard.writeText(`https://${window.location.hostname}/api/webhooks/meta/whatsapp`);
                                toast({ title: "URL copiada." });
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {agentQuery.data?.metaVerifyToken && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Verify Token:</p>
                            <div className="flex gap-2 items-center">
                              <code className="flex-1 text-xs bg-muted border rounded px-2 py-1.5 text-foreground/80 font-mono">
                                {agentQuery.data.metaVerifyToken}
                              </code>
                              <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0 h-7 w-7"
                                onClick={() => {
                                  navigator.clipboard.writeText(agentQuery.data?.metaVerifyToken ?? "");
                                  toast({ title: "Verify Token copiado." });
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Assine o campo <strong>messages</strong> no webhook para receber mensagens dos clientes.
                        </p>
                      </div>
                    </div>
                  )}

                  {metaStatus?.verified && (
                    <div className="rounded-lg bg-muted/30 border p-3 space-y-1">
                      <p className="text-xs font-medium text-foreground/80">Número verificado pela Meta</p>
                      {metaStatus.verifiedName && <p className="text-xs text-muted-foreground">Nome: <strong>{metaStatus.verifiedName}</strong></p>}
                      {metaStatus.qualityRating && <p className="text-xs text-muted-foreground">Qualidade: <strong>{metaStatus.qualityRating}</strong></p>}
                    </div>
                  )}
                  {metaStatus?.verified === false && metaStatus?.error && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {metaStatus.error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Instagram DM — OAuth via Meta */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="currentColor"/>
                    </svg>
                    Instagram DM — Omnichannel
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Conecte sua página do Instagram Business via Meta OAuth para enviar e receber DMs diretamente pelo VendorAI.
                  </p>
                </div>
                {igConnection.data?.connected && (
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Conectado
                    </span>
                  </div>
                )}
              </div>

              {igConnection.isLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                </div>
              ) : igConnection.data?.connected ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/30 border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Conta:</span>
                      <span className="text-sm font-semibold text-foreground">@{igConnection.data.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Page ID:</span>
                      <code className="text-sm font-mono text-muted-foreground">{igConnection.data.pageId}</code>
                    </div>
                    {igConnection.data.tokenExpiresAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Token expira em:</span>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(igConnection.data.tokenExpiresAt), "dd/MM/yyyy HH:mm")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={onConnectInstagram}
                      variant="outline"
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reconectar
                    </Button>
                    <Button
                      onClick={onRefreshInstagram}
                      variant="outline"
                      disabled={refreshIg.isPending}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {refreshIg.isPending ? "Renovando…" : "Renovar token"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onDisconnectInstagramOAuth}
                      disabled={disconnectIg.isPending}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {disconnectIg.isPending ? "Desconectando…" : "Desconectar"}
                    </Button>
                  </div>

                  <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook de entrada — DMs recebidas</p>
                    <p className="text-xs text-muted-foreground">Configure o n8n para encaminhar DMs recebidas do Instagram para:</p>
                    <code className="text-xs block text-muted-foreground">
                      POST /api/tenants/{tenantId}/webhooks/instagram
                    </code>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">
{`Headers:
  X-Webhook-Secret: <seu-webhook-secret>
  Content-Type: application/json

Body:
{
  "igsid": "123456789",
  "mensagem": "Olá, quero saber mais",
  "nome": "João Silva"
}`}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Clique no botão abaixo para autorizar a conexão com sua conta do Instagram Business via Meta.
                  </p>
                  <Button
                    onClick={onConnectInstagram}
                    className="gap-2"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="currentColor"/>
                    </svg>
                    Conectar Instagram
                  </Button>
                </div>
              )}
            </div>

            {/* Webhook de saída */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-primary" />
                  Webhook de saída — Venda realizada
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Quando um orçamento for aceito ou um deal marcado como ganho, o sistema dispara
                  um POST para esta URL com os dados da venda. Escolha entre n8n (automação) ou API genérica (ERP).
                </p>
              </div>

              <div className="space-y-3">
                {/* Tipo de integração */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tipo de integração</label>
                  <Select value={integrationType ?? ""} onValueChange={(v) => setIntegrationType(v as "n8n" | "api")}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="n8n">n8n (automação)</SelectItem>
                      <SelectItem value="api">API genérica (ERP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">URL do webhook</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={integrationType === "api" ? "https://erp.seusite.com/api/vendas" : "https://seu-n8n.app/webhook/xxxxxxxx"}
                      value={webhookUrlInput}
                      onChange={(e) => setWebhookUrlInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button
                      onClick={onSaveWebhookUrl}
                      disabled={updateIntegration.isPending}
                      className="gap-2 shrink-0"
                    >
                      <Save className="h-4 w-4" />
                      {updateIntegration.isPending ? "Salvando…" : "Salvar"}
                    </Button>
                  </div>
                  {integrationData?.webhookEstoqueUrl && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Webhook configurado e ativo ({integrationData.integrationType === "api" ? "API" : "n8n"}).
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payload enviado</p>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
{`{
  "event": "venda_realizada",
  "tenantId": "...",
  "vendaId": "...",
  "tipo": "proposta" | "deal",
  "produtos": [{ "nome": "...", "sku": "...", "quantidade": 2 }],
  "valorTotal": 1500.00,
  "realizadaEm": "2026-06-14T10:00:00Z"
}`}
                  </pre>
                </div>
              </div>
            </div>

            {/* API key de entrada */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  API Key — Sincronização de estoque
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Use esta chave no cabeçalho <code className="text-xs bg-muted px-1 py-0.5 rounded">x-api-key</code> para
                  chamar o endpoint de sincronização a partir do n8n ou de qualquer ERP externo.
                  Envie um array de itens com SKU e quantidade para atualizar o estoque.
                </p>
              </div>

              <div className="space-y-4">
                {/* API key display */}
                {integrationQuery.isLoading ? (
                  <div className="h-10 bg-muted rounded-md animate-pulse" />
                ) : integrationData?.apiKeyEstoque ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sua API key</label>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
                        {showApiKey
                          ? integrationData.apiKeyEstoque
                          : "vak_" + "•".repeat(32)}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowApiKey((v) => !v)}
                        title={showApiKey ? "Ocultar" : "Mostrar"}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Copiar"
                        onClick={() => {
                          navigator.clipboard.writeText(integrationData.apiKeyEstoque ?? "");
                          toast({ title: "API key copiada." });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-5 text-center space-y-2">
                    <Key className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Nenhuma API key gerada ainda.</p>
                  </div>
                )}

                <Button
                  variant={integrationData?.apiKeyEstoque ? "outline" : "default"}
                  onClick={onRegenerateKey}
                  disabled={regenerateKey.isPending}
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", regenerateKey.isPending && "animate-spin")} />
                  {regenerateKey.isPending
                    ? "Gerando…"
                    : integrationData?.apiKeyEstoque
                    ? "Regenerar API key"
                    : "Gerar API key"}
                </Button>
                {integrationData?.apiKeyEstoque && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Ao regenerar, a chave antiga é invalidada imediatamente. Atualize o n8n antes.
                  </p>
                )}

                {/* Endpoint reference */}
                <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint de sincronização</p>
                  <code className="text-xs block text-muted-foreground">
                    POST /api/tenants/{tenantId}/inventory/sync
                  </code>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-2">
{`Headers:
  x-api-key: <sua-api-key>
  Content-Type: application/json

Body:
{
  "items": [
    { "sku": "PROD-001", "quantidade": 100, "preco": 29.90 },
    { "sku": "PROD-002", "quantidade": 45 }
  ]
}`}
                  </pre>
                </div>
              </div>
            </div>

          </div>
          )}
        </TabsContent>

        {/* ── Tab: Equipe ─────────────────────────────────────────────────── */}
        {isTenantAdmin && (
          <TabsContent value="equipe">
            <div className="space-y-6">

              {/* Invite form */}
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Convidar Vendedor
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gere um link de convite para um novo membro da equipe com acesso de vendedor.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    onClick={() => {
                      if (!inviteEmail.trim()) return;
                      inviteSeller.mutate({ tenantId, data: { email: inviteEmail.trim() } });
                    }}
                    disabled={inviteSeller.isPending || !inviteEmail.trim()}
                    size="sm"
                    className="shrink-0"
                  >
                    {inviteSeller.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Link className="h-4 w-4 mr-1.5" />
                        Gerar Link
                      </>
                    )}
                  </Button>
                </div>

                {lastInviteUrl && (
                  <div className="rounded-lg bg-muted p-3 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Link de convite gerado:</p>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 truncate">
                        {lastInviteUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(lastInviteUrl);
                          toast({ title: "Link copiado!" });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Envie este link para o vendedor. Ele expira em 7 dias.
                    </p>
                  </div>
                )}
              </div>

              {/* Users list */}
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Membros da Equipe
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Usuários com acesso a este tenant.
                  </p>
                </div>

                {teamQuery.isPending ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Carregando equipe...
                  </div>
                ) : teamQuery.isError ? (
                  <div className="flex items-center gap-2 text-destructive text-sm py-4">
                    <AlertTriangle className="h-4 w-4" />
                    Erro ao carregar membros da equipe.
                  </div>
                ) : !teamQuery.data || teamQuery.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum membro encontrado.
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-lg border">
                    {teamQuery.data.map((member) => (
                      <div key={member.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-4 shrink-0">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            member.platformRole === "tenant_admin"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          )}>
                            {member.platformRole === "tenant_admin" ? "Admin" : "Vendedor"}
                          </span>
                          {member.platformRole !== "tenant_admin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={removeUser.isPending}
                              onClick={() => removeUser.mutate({ id: member.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </TabsContent>
        )}

        {/* ── Tab: Faturamento ──────────────────────────────────────────────── */}
        {showFaturamento && (
          <TabsContent value="faturamento">
            <FaturamentoTab />
          </TabsContent>
        )}

      </Tabs>
    </div>
  );
}

// ── Calendar Settings Tab ─────────────────────────────────────────────────

function CalendarSettingsTab({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetTenantCalendarSettings(tenantId);
  const create = useCreateTenantCalendarSettings({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTenantCalendarSettingsQueryKey(tenantId) });
        toast({ title: "Configurações de calendário salvas." });
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });
  const update = useUpdateTenantCalendarSettings({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTenantCalendarSettingsQueryKey(tenantId) });
        toast({ title: "Configurações de calendário atualizadas." });
      },
      onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
    },
  });

  const [draft, setDraft] = useState<{
    enableSpouseGiftFlow: boolean;
    commercialDates: Array<{ name: string; active: boolean; daysBeforeToSend: number; movableDate?: boolean; targetGender?: string }>;
  }>({
    enableSpouseGiftFlow: false,
    commercialDates: [
      { name: "Páscoa", active: true, daysBeforeToSend: 3, movableDate: true },
      { name: "Dia das Mães", active: true, daysBeforeToSend: 3, movableDate: true, targetGender: "feminino" },
      { name: "Dia dos Pais", active: true, daysBeforeToSend: 3, movableDate: true, targetGender: "masculino" },
      { name: "Dia das Crianças", active: true, daysBeforeToSend: 3, movableDate: true },
      { name: "Dia dos Namorados", active: true, daysBeforeToSend: 3, movableDate: true },
      { name: "Natal", active: true, daysBeforeToSend: 5, movableDate: true },
      { name: "Black Friday", active: true, daysBeforeToSend: 1, movableDate: true },
    ],
  });

  useEffect(() => {
    if (settings) {
      setDraft({
        enableSpouseGiftFlow: settings.enableSpouseGiftFlow,
        commercialDates: settings.commercialDates ?? [],
      });
    }
  }, [settings]);

  const dates = [
    { name: "Páscoa", desc: "Domingo de Páscoa (data móvel)", defaultDays: 3 },
    { name: "Dia das Mães", desc: "2º domingo de maio", defaultDays: 3 },
    { name: "Dia dos Pais", desc: "2º domingo de agosto", defaultDays: 3 },
    { name: "Dia das Crianças", desc: "12 de outubro", defaultDays: 3 },
    { name: "Dia dos Namorados", desc: "12 de junho", defaultDays: 3 },
    { name: "Natal", desc: "25 de dezembro", defaultDays: 5 },
    { name: "Black Friday", desc: "Última sexta de novembro", defaultDays: 1 },
  ] as const;

  function findEntry(name: string) {
    return draft.commercialDates.find((c) => c.name === name);
  }

  function updateEntry(name: string, patch: Partial<(typeof draft.commercialDates)[0]>) {
    const idx = draft.commercialDates.findIndex((c) => c.name === name);
    if (idx >= 0) {
      const updated = [...draft.commercialDates];
      updated[idx] = { ...updated[idx], ...patch };
      setDraft((prev) => ({ ...prev, commercialDates: updated }));
    }
  }

  function save() {
    const payload = {
      commercialDates: draft.commercialDates,
      enableSpouseGiftFlow: draft.enableSpouseGiftFlow,
    };
    if (settings) {
      update.mutate({ tenantId, data: payload });
    } else {
      create.mutate({ tenantId, data: payload });
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-base flex items-center gap-2">
          <CalendarHeart className="h-4 w-4 text-primary" />
          Calendário Comercial
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ative as datas comerciais que o Agente Relacionamento usará para campanhas automáticas.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {dates.map((d) => {
            const entry = findEntry(d.name);
            const active = entry?.active ?? false;
            const daysBefore = entry?.daysBeforeToSend ?? d.defaultDays;
            return (
              <div key={d.name} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.desc} • Enviar {daysBefore} dias antes</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    className="w-20 text-sm"
                    value={daysBefore}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isNaN(val)) return;
                      updateEntry(d.name, { daysBeforeToSend: val });
                    }}
                  />
                  <Switch
                    checked={active}
                    onCheckedChange={(v) => {
                      if (findEntry(d.name)) {
                        updateEntry(d.name, { active: v });
                      } else {
                        setDraft((prev) => ({
                          ...prev,
                          commercialDates: [
                            ...prev.commercialDates,
                            { name: d.name, active: v, daysBeforeToSend: d.defaultDays, movableDate: true },
                          ],
                        }));
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border p-3 mt-4">
        <div>
          <p className="font-medium text-sm">Fluxo de Presente para Cônjuge</p>
          <p className="text-xs text-muted-foreground">Ativa a campanha de relacionamento que oferece um presente especial para o cônjuge do lead, quando o lead optar por compartilhar o contato.</p>
        </div>
        <Switch
          checked={draft.enableSpouseGiftFlow}
          onCheckedChange={(v) => setDraft((prev) => ({ ...prev, enableSpouseGiftFlow: v }))}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
