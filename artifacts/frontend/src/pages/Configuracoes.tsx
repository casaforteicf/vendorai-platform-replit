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
  useListIntelligenceAnalysisLog,
  getListIntelligenceAnalysisLogQueryKey,
  useGetTenant,
  getGetTenantQueryKey,
  useUpdateTenant,
  AgentsMap,
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
    defaultValues: { analysisStalenessHours: "", analysisMessageThreshold: "" },
    values: tenantQuery.data
      ? {
          analysisStalenessHours:     tenantQuery.data.analysisStalenessHours    != null ? String(tenantQuery.data.analysisStalenessHours)    : "",
          analysisMessageThreshold:   tenantQuery.data.analysisMessageThreshold  != null ? String(tenantQuery.data.analysisMessageThreshold)  : "",
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

  const profileSaving    = createProfile.isPending || updateProfile.isPending;
  const agentSaving      = createAgentConf.isPending || updateAgentConf.isPending;
  const thresholdSaving  = updateTenant.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie o perfil da empresa e os agentes de IA.</p>
      </div>

      <Tabs defaultValue="perfil" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="perfil" className="gap-2">
            <Building2 className="h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="agentes" className="gap-2">
            <Bot className="h-4 w-4" />
            Agentes de IA
          </TabsTrigger>
          <TabsTrigger value="analise" className="gap-2">
            <Brain className="h-4 w-4" />
            Análise de IA
          </TabsTrigger>
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
      </Tabs>
    </div>
  );
}
