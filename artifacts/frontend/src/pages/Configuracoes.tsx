import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
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

type AgentKey = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding";

const AGENT_LABELS: Record<AgentKey, { label: string; description: string }> = {
  sdr:          { label: "SDR",          description: "Qualificação e primeiro contato com leads" },
  closer:       { label: "Closer",       description: "Condução e fechamento de negócios" },
  followup:     { label: "Follow-up",    description: "Acompanhamento de leads em aberto" },
  reactivation: { label: "Reativação",   description: "Recuperação de leads inativos" },
  scheduler:    { label: "Agendador",    description: "Marcação e confirmação de reuniões" },
  service:      { label: "Atendimento",  description: "Suporte e dúvidas de clientes" },
  onboarding:   { label: "Onboarding",   description: "Integração e ativação de novos clientes" },
};

const AGENT_KEYS: AgentKey[] = ["sdr", "closer", "followup", "reactivation", "scheduler", "service", "onboarding"];

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

  // ── Business Profile ───────────────────────────────────────────────────────
  const profileQuery   = useGetBusinessProfileByTenant(tenantId, { query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId, retry: false } });
  const createProfile  = useCreateBusinessProfile();
  const updateProfile  = useUpdateBusinessProfile();

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { razaoSocial: "", nomeFantasia: "", cnpj: "", endereco: "", telefone: "", email: "", vertical: "" },
    values: profileQuery.data
      ? {
          razaoSocial:  profileQuery.data.razaoSocial ?? "",
          nomeFantasia: profileQuery.data.nomeFantasia ?? "",
          cnpj:         profileQuery.data.cnpj ?? "",
          endereco:     profileQuery.data.endereco ?? "",
          telefone:     profileQuery.data.telefone ?? "",
          email:        profileQuery.data.email ?? "",
          vertical:     profileQuery.data.vertical ?? "",
        }
      : undefined,
  });

  function onSaveProfile(values: ProfileForm) {
    const profileExists = !!profileQuery.data?.id;
    const payload = {
      razaoSocial:  values.razaoSocial,
      nomeFantasia: values.nomeFantasia || undefined,
      cnpj:         values.cnpj || undefined,
      endereco:     values.endereco || undefined,
      telefone:     values.telefone || undefined,
      email:        values.email || undefined,
      vertical:     values.vertical || undefined,
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

  const [webhookUrlInput, setWebhookUrlInput] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const regenerateWebhookSecretMutation = useRegenerateWebhookSecret();

  const integrationData = integrationQuery.data;
  const [syncedIntegration, setSyncedIntegration] = useState(false);
  if (integrationData !== undefined && !syncedIntegration) {
    setWebhookUrlInput(integrationData.webhookEstoqueUrl ?? "");
    setSyncedIntegration(true);
  }

  // ── Z-API (WhatsApp outbound) connection state ────────────────────────────
  const [zapiInstanceInput, setZapiInstanceInput] = useState<string>("");
  const [zapiTokenInput, setZapiTokenInput] = useState<string>("");
  const [zapiClientTokenInput, setZapiClientTokenInput] = useState<string>("");
  const [zapiSaving, setZapiSaving] = useState(false);
  const [syncedZapi, setSyncedZapi] = useState(false);
  const [zapiStatusChecking, setZapiStatusChecking] = useState(false);
  const [zapiStatus, setZapiStatus] = useState<{ connected: boolean; session: boolean } | null>(null);

  async function checkZapiStatus() {
    if (!agentQuery.data?.id) return;
    setZapiStatusChecking(true);
    setZapiStatus(null);
    try {
      const res = await fetch(`/api/agent-configs/${agentQuery.data.id}/zapi-status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (res.ok) {
        const data = await res.json() as { connected: boolean; session: boolean };
        setZapiStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setZapiStatusChecking(false);
    }
  }
  if (agentQuery.data && !syncedZapi) {
    setZapiInstanceInput(agentQuery.data.zapiInstanceId ?? "");
    setZapiTokenInput(agentQuery.data.zapiToken ?? "");
    setZapiClientTokenInput(agentQuery.data.zapiClientToken ?? "");
    setSyncedZapi(true);
  }

  function onSaveZapi() {
    if (!agentQuery.data?.id) return;
    setZapiSaving(true);
    updateAgentConf.mutate(
      {
        id: agentQuery.data.id,
        data: {
          zapiInstanceId: zapiInstanceInput.trim() || null,
          zapiToken: zapiTokenInput.trim() || null,
          zapiClientToken: zapiClientTokenInput.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetAgentConfigByTenantQueryKey(tenantId ?? ""), updated);
          setSyncedZapi(false);
          setZapiSaving(false);
          toast({ title: "Conexão Z-API salva com sucesso." });
        },
        onError: () => {
          setZapiSaving(false);
          toast({ title: "Erro ao salvar Z-API.", variant: "destructive" });
        },
      }
    );
  }

  function onDisconnectZapi() {
    if (!agentQuery.data?.id) return;
    setZapiSaving(true);
    updateAgentConf.mutate(
      {
        id: agentQuery.data.id,
        data: { zapiInstanceId: null, zapiToken: null, zapiClientToken: null },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetAgentConfigByTenantQueryKey(tenantId ?? ""), updated);
          setZapiInstanceInput("");
          setZapiTokenInput("");
          setZapiClientTokenInput("");
          setSyncedZapi(false);
          setZapiSaving(false);
          toast({ title: "Z-API desconectado." });
        },
        onError: () => {
          setZapiSaving(false);
          toast({ title: "Erro ao desconectar Z-API.", variant: "destructive" });
        },
      }
    );
  }

  // ── Instagram connection state ─────────────────────────────────────────────
  const [igTokenInput, setIgTokenInput] = useState<string>("");
  const [igPageIdInput, setIgPageIdInput] = useState<string>("");
  const [igUsernameInput, setIgUsernameInput] = useState<string>("");
  const [igSaving, setIgSaving] = useState(false);
  const [syncedIg, setSyncedIg] = useState(false);
  if (agentQuery.data && !syncedIg) {
    setIgTokenInput(agentQuery.data.instagramPageAccessToken ?? "");
    setIgPageIdInput(agentQuery.data.instagramPageId ?? "");
    setIgUsernameInput(agentQuery.data.instagramUsername ?? "");
    setSyncedIg(true);
  }

  function onSaveInstagram() {
    if (!agentQuery.data?.id) return;
    setIgSaving(true);
    updateAgentConf.mutate(
      {
        id: agentQuery.data.id,
        data: {
          instagramPageAccessToken: igTokenInput.trim() || null,
          instagramPageId: igPageIdInput.trim() || null,
          instagramUsername: igUsernameInput.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetAgentConfigByTenantQueryKey(tenantId ?? ""), updated);
          setSyncedIg(false);
          setIgSaving(false);
          toast({ title: "Conexão Instagram salva com sucesso." });
        },
        onError: () => {
          setIgSaving(false);
          toast({ title: "Erro ao salvar Instagram.", variant: "destructive" });
        },
      }
    );
  }

  function onDisconnectInstagram() {
    if (!agentQuery.data?.id) return;
    setIgSaving(true);
    updateAgentConf.mutate(
      {
        id: agentQuery.data.id,
        data: { instagramPageAccessToken: null, instagramPageId: null, instagramUsername: null },
      },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetAgentConfigByTenantQueryKey(tenantId ?? ""), updated);
          setIgTokenInput("");
          setIgPageIdInput("");
          setIgUsernameInput("");
          setSyncedIg(false);
          setIgSaving(false);
          toast({ title: "Instagram desconectado." });
        },
        onError: () => {
          setIgSaving(false);
          toast({ title: "Erro ao desconectar Instagram.", variant: "destructive" });
        },
      }
    );
  }

  function onSaveWebhookUrl() {
    updateIntegration.mutate(
      { id: tenantId, data: { webhookEstoqueUrl: webhookUrlInput || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetIntegrationSettingsQueryKey(tenantId) });
          setSyncedIntegration(false);
          toast({ title: "URL do webhook salva." });
        },
        onError: () => toast({ title: "Erro ao salvar webhook.", variant: "destructive" }),
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

      <Tabs defaultValue="perfil" className="space-y-6">
        <TabsList className={cn("grid w-full max-w-2xl", isTenantAdmin ? "grid-cols-6" : "grid-cols-5")}>
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
          <div className="rounded-xl border bg-card p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Landing Page Pública
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Configure a página pública do seu negócio. Acessível em{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">/site/{"{seu-slug}"}</code>
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
        {/* ── Tab: Integrações ERP ────────────────────────────────────────── */}
        <TabsContent value="integracoes">
          <div className="space-y-6">

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

            {/* Z-API — WhatsApp outbound */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    WhatsApp — Z-API (envio de mensagens)
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure as credenciais da Z-API para que os agentes e ações manuais consigam
                    enviar mensagens diretamente pelo WhatsApp. Encontre as credenciais em{" "}
                    <strong>app.z-api.io → sua instância → Tokens</strong>.
                  </p>
                </div>
                {agentQuery.data?.zapiInstanceId && agentQuery.data?.zapiToken && agentQuery.data?.zapiClientToken && (
                  <div className="shrink-0 flex items-center gap-2">
                    {zapiStatus === null ? (
                      <button
                        onClick={checkZapiStatus}
                        disabled={zapiStatusChecking}
                        className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 px-2.5 py-1 rounded-full cursor-pointer border border-border transition-colors"
                      >
                        {zapiStatusChecking ? "Verificando…" : "Testar conexão"}
                      </button>
                    ) : zapiStatus.connected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> WhatsApp ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="h-3 w-3" /> Sessão expirada
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
                      <label className="text-sm font-medium">Instance ID</label>
                      <Input
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                        value={zapiInstanceInput}
                        onChange={(e) => setZapiInstanceInput(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">ID da instância Z-API.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Token da instância</label>
                      <Input
                        type="password"
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                        value={zapiTokenInput}
                        onChange={(e) => setZapiTokenInput(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">Token gerado pela instância.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Client Token (Security Token)</label>
                    <Input
                      type="password"
                      placeholder="Fxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={zapiClientTokenInput}
                      onChange={(e) => setZapiClientTokenInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Security Token da sua conta Z-API — encontrado em <strong>Conta → Security Token</strong>.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={onSaveZapi}
                      disabled={zapiSaving || !agentQuery.data?.id || !zapiInstanceInput.trim() || !zapiTokenInput.trim() || !zapiClientTokenInput.trim()}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {zapiSaving ? "Salvando…" : agentQuery.data?.zapiInstanceId ? "Atualizar conexão" : "Conectar Z-API"}
                    </Button>
                    {agentQuery.data?.zapiInstanceId && (
                      <Button
                        variant="outline"
                        onClick={onDisconnectZapi}
                        disabled={zapiSaving}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Desconectar
                      </Button>
                    )}
                  </div>

                  {!agentQuery.data?.zapiInstanceId && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        Sem a Z-API configurada, mensagens WhatsApp enviadas pelos agentes ficam salvas
                        no sistema mas <strong>não chegam ao destinatário</strong>.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instagram DM — conexão direta via Graph API */}
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
                    Conecte sua página do Instagram Business para enviar e receber DMs diretamente pelo VendorAI.
                    Você precisará de um <strong>Page Access Token</strong> de longa duração (60 dias) e do <strong>Page ID</strong> da sua conta Business.
                  </p>
                </div>
                {agentQuery.data?.instagramPageAccessToken && (
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Conectado
                    </span>
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
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Page Access Token</label>
                    <Input
                      type="password"
                      placeholder="EAAxxxxxxxxxxxxxxx…"
                      value={igTokenInput}
                      onChange={(e) => setIgTokenInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Token de acesso à página (longa duração, válido por ~60 dias). Gere em <strong>Meta for Developers → Graph API Explorer</strong>.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Page ID</label>
                      <Input
                        placeholder="123456789012345"
                        value={igPageIdInput}
                        onChange={(e) => setIgPageIdInput(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Username (para exibição)</label>
                      <Input
                        placeholder="@suamarca"
                        value={igUsernameInput}
                        onChange={(e) => setIgUsernameInput(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={onSaveInstagram}
                      disabled={igSaving || !agentQuery.data?.id || !igTokenInput.trim()}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {igSaving ? "Salvando…" : agentQuery.data?.instagramPageAccessToken ? "Atualizar conexão" : "Conectar Instagram"}
                    </Button>
                    {agentQuery.data?.instagramPageAccessToken && (
                      <Button
                        variant="outline"
                        onClick={onDisconnectInstagram}
                        disabled={igSaving}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Desconectar
                      </Button>
                    )}
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
                  Quando uma proposta for aceita ou um deal marcado como ganho, o sistema dispara
                  um POST para esta URL com os dados da venda. Use para conectar ao n8n e
                  atualizar automaticamente seu ERP (Bling, Tiny, Omie etc.).
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">URL do webhook (n8n)</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://seu-n8n.app/webhook/xxxxxxxx"
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
                      Webhook configurado e ativo.
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

      </Tabs>
    </div>
  );
}
