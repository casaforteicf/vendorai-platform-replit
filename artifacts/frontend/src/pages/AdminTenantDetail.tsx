import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getListTenantsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Building2, Shield, ShieldOff, Mail, Loader2, Zap, Bot,
  CheckCircle2, XCircle, Clock, UserCheck, MessageSquare,
  SlidersHorizontal,
  FileText, Paperclip,
  Wifi, Send,
} from "lucide-react";

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "cancelled";
  vertical?: string | null;
  planId?: string | null;
  provisioningMethod?: string | null;
  firstLoginAt?: string | null;
  accessSentAt?: string | null;
  createdAt?: string | null;
};

type AIUsage = {
  planId?: string | null;
  aiCreditsUsd?: string | null;
  aiDailySpendUsd?: string | null;
  openaiKeyStatus?: string | null;
  anthropicKeyStatus?: string | null;
  quotaUsd?: number | null;
  spentThisMonthUsd?: number;
  featureBreakdown?: Array<{ feature: string; total: number }>;
};

type AgentActivity = {
  agentActions: Array<{
    agentName: string;
    total: number;
    executed: number;
    approved: number;
    rejected: number;
    pending: number;
  }>;
  messagesByAgent: Array<{ canal: string; total: number }>;
  dealConversions: Array<{ source: string | null; total: number; valor: string | null }>;
};

type TenantNavModule = {
  moduleKey: string;
  moduleName: string;
  description: string;
  isEnabled: boolean;
};

type TenantAgentOverview = {
  agentKey: string;
  nome: string;
  descricao: string;
  categoria: string;
  ativo: boolean;
  nomePerfil?: string | null;
  tom: string;
  restricoes?: string | null;
  systemPromptBase: string;
  systemPromptCustom?: string | null;
  attachments: Array<{ name?: string; objectPath?: string; mimeType?: string; size?: number }>;
  knowledgeItems: Array<{ id: string; titulo: string; categoria: string; conteudo: string; ativo: boolean }>;
};

type TenantAgentsResponse = {
  agents: TenantAgentOverview[];
  knowledgeBase: Array<{ id: string; titulo: string; categoria: string; conteudo: string; ativo: boolean }>;
};

type TenantZapiStatus = {
  configured: boolean;
  connected: boolean;
  session?: boolean;
  smartphoneConnected?: boolean;
  credentials: { instanceId: boolean; token: boolean; clientToken: boolean };
  providerStatus?: number;
  error?: string;
};

const PROTECTED_MODULES = new Set(["dashboard", "settings"]);
const VERTICAL_RECOMMENDED: Record<string, string[]> = {
  "Construção & Reforma": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "Varejo de Roupas & Acessórios": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "varejo", "content", "analytics"],
  "Supermercado": ["dashboard", "leads", "deals", "conversations", "inventory", "campaigns", "agents", "team", "settings", "setup", "supermercado", "content", "analytics"],
  "Salão de Beleza": ["dashboard", "leads", "deals", "conversations", "scheduler", "campaigns", "agents", "team", "settings", "setup", "beauty", "content"],
  "Clínica": ["dashboard", "leads", "deals", "conversations", "scheduler", "agents", "team", "settings", "setup", "clinic", "analytics"],
};

const AGENT_LABELS: Record<string, string> = {
  sdr:            "Prospecção (SDR)",
  closer:         "Fechamento",
  scheduler:      "Agendamento",
  service:        "Suporte Pós-venda",
  reactivation:   "Reativação",
  followup:       "Follow-up",
  relacionamento: "Relacionamento",
};

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  suspended: "bg-orange-100 text-orange-700 border-orange-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const PROV_LABELS: Record<string, string> = {
  manual:       "Manual",
  self_service: "Self-service",
  trial:        "Trial",
};

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
  } catch {
    return "—";
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right truncate">{value}</span>
    </div>
  );
}

export default function AdminTenantDetail() {
  const { id } = useParams() as { id: string };
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [resending, setResending] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [sendingZapiTest, setSendingZapiTest] = useState(false);
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken, setZapiToken] = useState("");
  const [zapiClientToken, setZapiClientToken] = useState("");
  const [savingZapiCredentials, setSavingZapiCredentials] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const { data: tenant, isLoading: tenantLoading } = useQuery<TenantDetail>({
    queryKey: ["admin-tenant-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}`, { headers: authHeaders });
      if (!r.ok) throw new Error("Tenant not found");
      return r.json() as Promise<TenantDetail>;
    },
    enabled: !!id && !!token,
  });

  const { data: aiUsage, isLoading: aiLoading } = useQuery<AIUsage>({
    queryKey: ["admin-tenant-ai-usage", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}/ai-usage`, { headers: authHeaders });
      if (!r.ok) return {} as AIUsage;
      return r.json() as Promise<AIUsage>;
    },
    enabled: !!id && !!token,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AgentActivity>({
    queryKey: ["admin-tenant-analytics-agents", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}/analytics/agents`, { headers: authHeaders });
      if (!r.ok) return { agentActions: [], messagesByAgent: [], dealConversions: [] } as AgentActivity;
      return r.json() as Promise<AgentActivity>;
    },
    enabled: !!id && !!token,
  });

  const { data: navModules, isLoading: modulesLoading } = useQuery<TenantNavModule[]>({
    queryKey: ["tenant-nav-modules", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}/nav-modules`, { headers: authHeaders });
      if (!r.ok) throw new Error("Falha ao carregar módulos");
      return r.json() as Promise<TenantNavModule[]>;
    },
    enabled: !!id && !!token,
  });

  const { data: agentsOverview, isLoading: agentsOverviewLoading } = useQuery<TenantAgentsResponse>({
    queryKey: ["admin-tenant-agents-overview", id],
    queryFn: async () => {
      const response = await fetch(`/api/superadmin/tenants/${id}/agents`, { headers: authHeaders });
      if (!response.ok) throw new Error("Falha ao carregar agentes do tenant");
      return response.json() as Promise<TenantAgentsResponse>;
    },
    enabled: !!id && !!token,
  });

  const { data: zapiStatus, isLoading: zapiStatusLoading, refetch: refetchZapiStatus } = useQuery<TenantZapiStatus>({
    queryKey: ["admin-tenant-zapi-status", id],
    queryFn: async () => {
      const response = await fetch(`/api/superadmin/tenants/${id}/zapi-status`, { headers: authHeaders });
      const result = await response.json() as TenantZapiStatus;
      if (!response.ok) throw new Error(result.error ?? "Falha ao consultar Z-API");
      return result;
    },
    enabled: !!id && !!token,
    retry: false,
  });

  async function sendZapiTest() {
    setSendingZapiTest(true);
    try {
      const response = await fetch(`/api/superadmin/tenants/${id}/zapi-test`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone, message: "Teste de integração Vendor.ai" }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao enviar teste");
      toast({ title: "Mensagem de teste enviada pela Z-API" });
      await refetchZapiStatus();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Falha ao enviar teste", variant: "destructive" });
    } finally {
      setSendingZapiTest(false);
    }
  }

  async function saveZapiCredentials() {
    const payload: Record<string, string> = {};
    if (zapiInstanceId.trim()) payload.instanceId = zapiInstanceId.trim();
    if (zapiToken.trim()) payload.token = zapiToken.trim();
    if (zapiClientToken.trim()) payload.clientToken = zapiClientToken.trim();
    if (!Object.keys(payload).length) {
      toast({ title: "Informe ao menos uma credencial", variant: "destructive" });
      return;
    }

    setSavingZapiCredentials(true);
    try {
      const response = await fetch(`/api/superadmin/tenants/${id}/zapi-credentials`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao salvar credenciais");
      setZapiInstanceId("");
      setZapiToken("");
      setZapiClientToken("");
      await refetchZapiStatus();
      toast({ title: "Credenciais Z-API salvas" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Falha ao salvar credenciais", variant: "destructive" });
    } finally {
      setSavingZapiCredentials(false);
    }
  }

  async function toggleModule(moduleKey: string, isEnabled: boolean) {
    setSavingModule(moduleKey);
    try {
      const response = await fetch(`/api/tenants/${id}/nav-modules/${moduleKey}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao atualizar módulo");
      await qc.invalidateQueries({ queryKey: ["tenant-nav-modules", id] });
      toast({ title: isEnabled ? "Tela ativada" : "Tela ocultada" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao atualizar módulo", variant: "destructive" });
    } finally {
      setSavingModule(null);
    }
  }

  async function applyVerticalPreset() {
    if (!navModules) return;
    const recommended = new Set(VERTICAL_RECOMMENDED[tenant?.vertical ?? ""] ?? ["dashboard", "leads", "deals", "conversations", "scheduler", "agents", "team", "settings", "setup"]);
    setApplyingPreset(true);
    try {
      const response = await fetch(`/api/tenants/${id}/nav-modules`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ modules: navModules.map((item) => ({ moduleKey: item.moduleKey, isEnabled: recommended.has(item.moduleKey) || PROTECTED_MODULES.has(item.moduleKey) })) }),
      });
      if (!response.ok) throw new Error("Falha ao aplicar configuração recomendada");
      await qc.invalidateQueries({ queryKey: ["tenant-nav-modules", id] });
      toast({ title: `Configuração recomendada aplicada para ${tenant?.vertical ?? "o tenant"}` });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao aplicar configuração", variant: "destructive" });
    } finally {
      setApplyingPreset(false);
    }
  }

  async function handleBlock(newStatus: "active" | "suspended") {
    setBlocking(true);
    try {
      const r = await fetch(`/api/tenants/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) {
        toast({ title: data.error ?? "Erro ao atualizar status", variant: "destructive" });
        return;
      }
      void qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] });
      void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      toast({ title: newStatus === "active" ? "Tenant reativado com sucesso" : "Tenant suspenso com sucesso" });
    } finally {
      setBlocking(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const r = await fetch(`/api/superadmin/tenants/${id}/resend-access`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await r.json() as { emailSent?: boolean; email?: string; tempPassword?: string; error?: string };
      if (r.ok) {
        toast({
          title: data.emailSent
            ? `E-mail reenviado para ${data.email ?? ""}`
            : `Nova senha gerada: ${data.tempPassword ?? ""}`,
        });
        void qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] });
        void qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      } else {
        toast({ title: data.error ?? "Erro ao reenviar acesso", variant: "destructive" });
      }
    } finally {
      setResending(false);
    }
  }

  const totalMsgs    = analytics?.messagesByAgent?.reduce((s, m) => s + m.total, 0) ?? 0;
  const totalActions = analytics?.agentActions?.reduce((s, a) => s + a.total, 0) ?? 0;
  const activeAgents = (analytics?.agentActions ?? [])
    .filter((a) => a.total > 0)
    .sort((a, b) => b.total - a.total);

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-muted-foreground">Tenant não encontrado.</p>
        <Button variant="outline" onClick={() => setLocation("/admin/tenants")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/admin/tenants")}
          className="shrink-0 mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 shrink-0" />
              <span className="truncate">{tenant.name}</span>
            </h1>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${STATUS_COLORS[tenant.status] ?? ""}`}
            >
              {tenant.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tenant.slug}
            {tenant.createdAt && ` · criado em ${fmt(tenant.createdAt)}`}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void handleResend()}
            disabled={resending}
          >
            {resending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Mail className="h-3.5 w-3.5" />}
            Reenviar acesso
          </Button>

          {tenant.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
              onClick={() => void handleBlock("suspended")}
              disabled={blocking}
            >
              {blocking
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ShieldOff className="h-3.5 w-3.5" />}
              Suspender
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              onClick={() => void handleBlock("active")}
              disabled={blocking}
            >
              {blocking
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Shield className="h-3.5 w-3.5" />}
              Reativar
            </Button>
          )}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Card 1 — Basic info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <InfoRow
              label="Status"
              value={
                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[tenant.status] ?? ""}`}>
                  {tenant.status}
                </Badge>
              }
            />
            <InfoRow label="Vertical"    value={tenant.vertical ?? "—"} />
            <InfoRow
              label="Origem"
              value={tenant.provisioningMethod
                ? (PROV_LABELS[tenant.provisioningMethod] ?? tenant.provisioningMethod)
                : "—"}
            />
            <InfoRow label="Plano" value={tenant.planId ?? "Sem plano"} />
            <Separator />
            <InfoRow
              label="Primeiro acesso"
              value={
                tenant.firstLoginAt ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <UserCheck className="h-3 w-3" />
                    {fmt(tenant.firstLoginAt)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" /> nunca
                  </span>
                )
              }
            />
            <InfoRow label="Acesso enviado" value={fmt(tenant.accessSentAt)} />
            <InfoRow label="Criado em"      value={fmt(tenant.createdAt)} />
          </CardContent>
        </Card>

        {/* Card 2 — AI Usage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4" /> Consumo de IA — mês atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="text-xs text-muted-foreground">Gasto no mês</span>
                  <span className="text-xl font-bold tabular-nums">
                    ${(aiUsage?.spentThisMonthUsd ?? 0).toFixed(4)}
                  </span>
                </div>

                {aiUsage?.quotaUsd != null && (
                  <>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-violet-500 h-1.5 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, ((aiUsage.spentThisMonthUsd ?? 0) / aiUsage.quotaUsd) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cota do plano: ${aiUsage.quotaUsd.toFixed(2)} / mês
                    </p>
                  </>
                )}

                {aiUsage?.aiCreditsUsd && Number(aiUsage.aiCreditsUsd) > 0 && (
                  <InfoRow
                    label="Créditos avulsos"
                    value={`$${Number(aiUsage.aiCreditsUsd).toFixed(4)}`}
                  />
                )}

                <Separator />

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Por feature</p>
                  {(aiUsage?.featureBreakdown ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sem uso registrado este mês</p>
                  ) : (
                    (aiUsage?.featureBreakdown ?? []).slice(0, 6).map((f) => (
                      <div key={f.feature} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground capitalize">
                          {f.feature.replace(/_/g, " ")}
                        </span>
                        <span className="font-medium tabular-nums">
                          ${Number(f.total).toFixed(4)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <Separator />

                <div className="flex gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={`h-2 w-2 rounded-full ${aiUsage?.openaiKeyStatus === "valid" ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    <span>OpenAI {aiUsage?.openaiKeyStatus === "valid" ? "(BYOK)" : "(plataforma)"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={`h-2 w-2 rounded-full ${aiUsage?.anthropicKeyStatus === "valid" ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    <span>Anthropic {aiUsage?.anthropicKeyStatus === "valid" ? "(BYOK)" : "(plataforma)"}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3 — Agent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="h-4 w-4" /> Agentes — últimos 30 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary counters */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold tabular-nums">{totalMsgs}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Mensagens</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold tabular-nums">{totalActions}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Ações IA</p>
                  </div>
                </div>

                {/* Active agents */}
                {activeAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2 italic">
                    Nenhuma atividade registrada no período
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Agentes ativos</p>
                    {activeAgents.map((a) => (
                      <div key={a.agentName} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-foreground truncate">
                          {AGENT_LABELS[a.agentName] ?? a.agentName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">{a.total}</span>
                          {a.executed > 0 && (
                            <span className="flex items-center gap-0.5 text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />{a.executed}
                            </span>
                          )}
                          {a.rejected > 0 && (
                            <span className="flex items-center gap-0.5 text-red-500">
                              <XCircle className="h-3 w-3" />{a.rejected}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Messages by channel */}
                {(analytics?.messagesByAgent ?? []).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Por canal</p>
                      {analytics!.messagesByAgent.map((m) => (
                        <div key={m.canal} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{m.canal}</span>
                          <span className="font-medium flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {m.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Deal conversions */}
                {(analytics?.dealConversions ?? []).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Deals convertidos</p>
                      {analytics!.dealConversions.slice(0, 4).map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{d.source ?? "direto"}</span>
                          <span className="font-medium">{d.total} deal{d.total !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wifi className="h-5 w-5" /> Integração WhatsApp — Z-API
          </CardTitle>
          <p className="text-sm text-muted-foreground">Status e teste isolados para este tenant, sem exibir credenciais.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {zapiStatusLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={zapiStatus?.configured ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200"}>
                {zapiStatus?.configured ? "Credenciais completas" : "Credenciais incompletas"}
              </Badge>
              <Badge variant="outline" className={zapiStatus?.connected ? "text-emerald-600 border-emerald-200" : "text-orange-600 border-orange-200"}>
                {zapiStatus?.connected ? "Instância conectada" : "Instância desconectada"}
              </Badge>
              {zapiStatus?.configured && !zapiStatus.connected && zapiStatus.providerStatus && (
                <span className="text-xs text-muted-foreground">Z-API HTTP {zapiStatus.providerStatus}</span>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              type="password"
              value={zapiInstanceId}
              onChange={(event) => setZapiInstanceId(event.target.value)}
              placeholder={zapiStatus?.credentials.instanceId ? "Instance ID configurado" : "Instance ID"}
              aria-label="Instance ID da Z-API"
              autoComplete="off"
            />
            <Input
              type="password"
              value={zapiToken}
              onChange={(event) => setZapiToken(event.target.value)}
              placeholder={zapiStatus?.credentials.token ? "Token configurado" : "Token"}
              aria-label="Token da Z-API"
              autoComplete="off"
            />
            <Input
              type="password"
              value={zapiClientToken}
              onChange={(event) => setZapiClientToken(event.target.value)}
              placeholder={zapiStatus?.credentials.clientToken ? "Client-Token configurado" : "Client-Token"}
              aria-label="Client-Token da Z-API"
              autoComplete="off"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => void saveZapiCredentials()}
            disabled={savingZapiCredentials || (!zapiInstanceId.trim() && !zapiToken.trim() && !zapiClientToken.trim())}
          >
            {savingZapiCredentials && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar credenciais
          </Button>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
            <Input
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
              placeholder="Telefone com DDD, ex.: 49998089269"
              aria-label="Telefone para teste Z-API"
            />
            <Button onClick={() => void sendZapiTest()} disabled={sendingZapiTest || !zapiStatus?.connected || testPhone.replace(/\D/g, "").length < 10}>
              {sendingZapiTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar teste
            </Button>
          </div>
          {!zapiStatus?.configured && (
            <p className="text-xs text-red-600">Cadastre Instance ID, Token e Client-Token nas configurações de integração deste tenant.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> Agentes, prompts e arquivos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Visão administrativa das configurações de IA exclusivas deste tenant.
          </p>
        </CardHeader>
        <CardContent>
          {agentsOverviewLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !agentsOverview?.agents.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum agente disponível.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {agentsOverview.agents.map((agent) => (
                <details key={agent.agentKey} className="rounded-lg border bg-card group">
                  <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{agent.nomePerfil || agent.nome}</span>
                        <Badge variant="outline" className={agent.ativo ? "text-emerald-600 border-emerald-200" : "text-muted-foreground"}>
                          {agent.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                        <Badge variant="secondary">{agent.tom}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{agent.descricao || agent.agentKey}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {agent.attachments.length} arquivo(s)
                    </span>
                  </summary>
                  <div className="border-t p-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold mb-1.5">Prompt em uso</p>
                      <pre className="text-xs whitespace-pre-wrap break-words rounded-md bg-muted p-3 max-h-64 overflow-auto font-sans">
                        {agent.systemPromptCustom?.trim() || agent.systemPromptBase}
                      </pre>
                      {!agent.systemPromptCustom?.trim() && <p className="text-[11px] text-muted-foreground mt-1">Usando prompt padrão da plataforma</p>}
                    </div>
                    {agent.restricoes && (
                      <div><p className="text-xs font-semibold mb-1">Restrições</p><p className="text-xs text-muted-foreground whitespace-pre-wrap">{agent.restricoes}</p></div>
                    )}
                    <div>
                      <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Arquivos do agente</p>
                      {agent.attachments.length ? (
                        <div className="space-y-1.5">{agent.attachments.map((file, index) => (
                          <div key={`${file.objectPath ?? file.name}-${index}`} className="text-xs rounded border px-3 py-2 flex justify-between gap-2">
                            <span className="truncate">{file.name || "Arquivo sem nome"}</span>
                            <span className="text-muted-foreground shrink-0">{file.mimeType || "arquivo"}</span>
                          </div>
                        ))}</div>
                      ) : <p className="text-xs text-muted-foreground">Nenhum arquivo anexado.</p>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Base de conhecimento vinculada</p>
                      {agent.knowledgeItems.length ? (
                        <div className="space-y-1.5">{agent.knowledgeItems.map((item) => (
                          <div key={item.id} className="rounded border px-3 py-2">
                            <div className="text-xs font-medium">{item.titulo}</div>
                            <div className="text-[11px] text-muted-foreground">{item.categoria} · {item.ativo ? "Ativo" : "Inativo"}</div>
                          </div>
                        ))}</div>
                      ) : <p className="text-xs text-muted-foreground">Nenhum item vinculado especificamente.</p>}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
          {!!agentsOverview?.knowledgeBase.length && (
            <div className="mt-5 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Base geral do tenant ({agentsOverview.knowledgeBase.length})</p>
              <div className="flex flex-wrap gap-2">
                {agentsOverview.knowledgeBase.map((item) => <Badge key={item.id} variant="secondary">{item.titulo}</Badge>)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Telas e módulos do tenant
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Ative somente as telas necessárias para este segmento. A alteração aparece no menu imediatamente.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void applyVerticalPreset()} disabled={applyingPreset || modulesLoading}>
            {applyingPreset && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Aplicar recomendado para a vertical
          </Button>
        </CardHeader>
        <CardContent>
          {modulesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(navModules ?? []).map((module) => {
                const protectedModule = PROTECTED_MODULES.has(module.moduleKey);
                return (
                  <div key={module.moduleKey} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{module.moduleName}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{module.description}</p>
                      {protectedModule && <p className="text-[10px] text-primary mt-1">Módulo essencial</p>}
                    </div>
                    <Switch
                      checked={module.isEnabled || protectedModule}
                      disabled={protectedModule || savingModule === module.moduleKey}
                      onCheckedChange={(checked) => void toggleModule(module.moduleKey, checked)}
                      aria-label={`${module.isEnabled ? "Desativar" : "Ativar"} ${module.moduleName}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
