import { VendorBackButton } from "@/components/ui/back-button";
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
import { AccessLicenseAdminCard } from "@/components/billing/AccessLicenseAdminCard";
import { TenantInternationalProfileCard } from "@/components/admin/TenantInternationalProfileCard";
import { TenantImplementationStatusCard } from "@/components/admin/TenantImplementationStatusCard";
import { Building2, Shield, ShieldOff, Mail, Loader2, Zap, Bot, CheckCircle2, XCircle, Clock, UserCheck, MessageSquare, SlidersHorizontal, FileText, Paperclip, Wifi, Send, Settings2, CreditCard, Users, PlugZap, Rocket, LayoutGrid } from "lucide-react";

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "cancelled";
  tenantCode?: string | null;
  isDemo?: boolean | null;
  demoStartedAt?: string | null;
  demoExpiresAt?: string | null;
  demoConvertedAt?: string | null;
  vertical?: string | null;
  verticalSecundaria?: string | null;
  planId?: string | null;
  comissaoPracaAiPercentual?: string | null;
  vendeNoPracaAi?: boolean | null;
  provisioningMethod?: string | null;
  firstLoginAt?: string | null;
  accessSentAt?: string | null;
  createdAt?: string | null;
  billingCycle?: "monthly" | "annual" | null;
  countryCode?: string | null;
  defaultLocale?: string | null;
  timezone?: string | null;
  defaultCurrency?: string | null;
  supportedCurrencies?: string[] | null;
  taxIdentifierType?: string | null;
  taxIdentifier?: string | null;
  mensalidadeValor?: string | number | null;
  mensalidadeTabelaValor?: string | number | null;
  taxaImplantacaoValor?: string | number | null;
  descontoPercentual?: string | number | null;
  formaPagamento?: "pix" | "boleto" | "cartao" | "transferencia" | "outro" | null;
  statusPagamento?: "pago" | "pendente" | "atrasado" | "isento" | null;
  diaVencimento?: number | null;
  ultimoPagamentoEm?: string | null;
  proximoPagamentoEm?: string | null;
  contratoInicioEm?: string | null;
  contratoFimEm?: string | null;
  renovacaoAutomatica?: boolean | null;
  origemCliente?: string | null;
  responsavelComercial?: string | null;
  observacoesComerciais?: string | null;
  motivoDesconto?: string | null;
};

type AdminPlan = { id: string; slug: string; name: string; aiQuotaUsd?: number | string | null };
type AIUsage = {
  usagePercent?: number;
  tokensUsed?: number;
  featureBreakdown?: Array<{ feature: string; tokens: number; calls: number }>;
};
type AgentActivity = {
  agentActions: Array<{ agentName: string; total: number; executed: number; approved: number; rejected: number; pending: number }>;
  messagesByAgent: Array<{ canal: string; total: number }>;
  dealConversions: Array<{ source: string | null; total: number; valor: string | null }>;
};
type TenantNavModule = { moduleKey: string; moduleName: string; description: string; isEnabled: boolean };
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
  credentials: { instanceId: boolean; token: boolean; clientToken: boolean };
  providerStatus?: number;
  error?: string;
};

const PROTECTED_MODULES = new Set(["dashboard", "settings"]);
const VERTICAL_RECOMMENDED: Record<string, string[]> = {
  "Construção & Reforma": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "construcao": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "Construtora": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "Construção Civil": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "Gestão de Obras": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "Obras": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "obras", "insumos", "composicoes", "revenue", "analytics"],
  "Arquitetura & Design": ["dashboard", "leads", "settings", "arch", "financeiro", "analytics"],
  "Varejo de Roupas & Acessórios": ["dashboard", "leads", "deals", "conversations", "scheduler", "proposals", "inventory", "campaigns", "agents", "team", "settings", "setup", "varejo", "content", "analytics"],
  Supermercado: ["dashboard", "leads", "deals", "conversations", "inventory", "campaigns", "agents", "team", "settings", "setup", "supermercado", "content", "analytics"],
  "Salão de Beleza": ["dashboard", "leads", "deals", "conversations", "scheduler", "campaigns", "agents", "team", "settings", "setup", "beauty", "content"],
  Clínica: ["dashboard", "leads", "deals", "conversations", "scheduler", "agents", "team", "settings", "setup", "clinic", "analytics"],
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  suspended: "bg-orange-100 text-orange-700 border-orange-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};
const STATUS_LABELS: Record<string, string> = { active: "Ativo", suspended: "Suspenso", cancelled: "Cancelado" };
const PROV_LABELS: Record<string, string> = { manual: "Manual", self_service: "Self-service", trial: "Trial" };
const AGENT_LABELS: Record<string, string> = {
  sdr: "Prospecção (SDR)", closer: "Fechamento", scheduler: "Agendamento", service: "Suporte Pós-venda",
  reactivation: "Reativação", followup: "Follow-up", relacionamento: "Relacionamento",
};

function fmt(date?: string | null) {
  if (!date) return "—";
  try { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date)); }
  catch { return "—"; }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{label}</span><span className="text-xs text-right">{value}</span></div>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-violet-600" /><h2 className="text-lg font-semibold">{title}</h2></div>
      <p className="text-sm text-muted-foreground mt-1 ml-7">{description}</p>
    </div>
  );
}

export default function AdminTenantDetail() {
  const { id } = useParams() as { id: string };
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [resending, setResending] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [savingPlan, setSavingPlan] = useState(false);
  const [editingComissao, setEditingComissao] = useState(false);
  const [comissaoInput, setComissaoInput] = useState("");
  const [savingComissao, setSavingComissao] = useState(false);
  const [savingVendeNoPracaAi, setSavingVendeNoPracaAi] = useState(false);
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken, setZapiToken] = useState("");
  const [zapiClientToken, setZapiClientToken] = useState("");
  const [savingZapiCredentials, setSavingZapiCredentials] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [sendingZapiTest, setSendingZapiTest] = useState(false);

  const { data: tenant, isLoading: tenantLoading } = useQuery<TenantDetail>({
    queryKey: ["admin-tenant-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}`, { headers: authHeaders });
      if (!r.ok) throw new Error("Tenant not found");
      return r.json() as Promise<TenantDetail>;
    },
    enabled: !!id && !!token,
  });
  const { data: availablePlans = [] } = useQuery<AdminPlan[]>({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const r = await fetch("/api/admin/plans", { headers: authHeaders });
      if (!r.ok) throw new Error("Não foi possível carregar os planos");
      return r.json() as Promise<AdminPlan[]>;
    },
    enabled: !!token,
  });
  const { data: aiUsage, isLoading: aiLoading } = useQuery<AIUsage>({
    queryKey: ["admin-tenant-ai-usage", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}/ai-usage`, { headers: authHeaders });
      return r.ok ? r.json() as Promise<AIUsage> : {} as AIUsage;
    }, enabled: !!id && !!token,
  });
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AgentActivity>({
    queryKey: ["admin-tenant-analytics-agents", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}/analytics/agents`, { headers: authHeaders });
      return r.ok ? r.json() as Promise<AgentActivity> : { agentActions: [], messagesByAgent: [], dealConversions: [] };
    }, enabled: !!id && !!token,
  });
  const { data: navModules, isLoading: modulesLoading } = useQuery<TenantNavModule[]>({
    queryKey: ["tenant-nav-modules", id],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${id}/nav-modules`, { headers: authHeaders });
      if (!r.ok) throw new Error("Falha ao carregar módulos");
      return r.json() as Promise<TenantNavModule[]>;
    }, enabled: !!id && !!token,
  });
  const { data: agentsOverview, isLoading: agentsOverviewLoading } = useQuery<TenantAgentsResponse>({
    queryKey: ["admin-tenant-agents-overview", id],
    queryFn: async () => {
      const r = await fetch(`/api/superadmin/tenants/${id}/agents`, { headers: authHeaders });
      if (!r.ok) throw new Error("Falha ao carregar agentes do tenant");
      return r.json() as Promise<TenantAgentsResponse>;
    }, enabled: !!id && !!token,
  });
  const { data: zapiStatus, isLoading: zapiStatusLoading, refetch: refetchZapiStatus } = useQuery<TenantZapiStatus>({
    queryKey: ["admin-tenant-zapi-status", id],
    queryFn: async () => {
      const r = await fetch(`/api/superadmin/tenants/${id}/zapi-status`, { headers: authHeaders });
      const result = await r.json() as TenantZapiStatus;
      if (!r.ok) throw new Error(result.error ?? "Falha ao consultar Z-API");
      return result;
    }, enabled: !!id && !!token, retry: false,
  });
  const { data: segmentTemplates = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ["segment-templates", "tenant-admin-detail"],
    queryFn: async () => {
      const r = await fetch("/api/segment-templates", { headers: authHeaders });
      if (!r.ok) return [];
      return r.json() as Promise<{ id: string; nome: string }[]>;
    },
    enabled: !!token,
  });
  const [verticalSecundariaDraft, setVerticalSecundariaDraft] = useState<string | null>(null);
  const [savingVerticalSecundaria, setSavingVerticalSecundaria] = useState(false);
  const verticalSecundariaValue = verticalSecundariaDraft ?? tenant?.verticalSecundaria ?? "";

  async function saveVerticalSecundaria() {
    setSavingVerticalSecundaria(true);
    try {
      await patchTenant({ verticalSecundaria: verticalSecundariaValue || null });
      toast({ title: "Vertical secundária atualizada" });
      setVerticalSecundariaDraft(null);
    } catch (err) {
      toast({ title: "Erro ao salvar vertical secundária", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSavingVerticalSecundaria(false);
    }
  }

  async function patchTenant(payload: Record<string, unknown>) {
    const r = await fetch(`/api/tenants/${id}`, { method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) throw new Error(data.error ?? "Erro ao atualizar tenant");
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] }), qc.invalidateQueries({ queryKey: getListTenantsQueryKey() })]);
  }

  async function handleBlock(status: "active" | "suspended") {
    setBlocking(true);
    try { await patchTenant({ status }); toast({ title: status === "active" ? "Tenant reativado" : "Tenant suspenso" }); }
    catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao atualizar status", variant: "destructive" }); }
    finally { setBlocking(false); }
  }

  async function handleResend() {
    setResending(true);
    try {
      const r = await fetch(`/api/superadmin/tenants/${id}/resend-access`, { method: "POST", headers: authHeaders });
      const data = await r.json() as { emailSent?: boolean; email?: string; tempPassword?: string; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Erro ao reenviar acesso");
      toast({ title: data.emailSent ? `E-mail reenviado para ${data.email ?? ""}` : `Nova senha gerada: ${data.tempPassword ?? ""}` });
      await qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao reenviar acesso", variant: "destructive" }); }
    finally { setResending(false); }
  }

  function startEditingPlan() {
    setSelectedPlanId(tenant?.planId ?? "");
    setSelectedBillingCycle(tenant?.billingCycle === "annual" ? "annual" : "monthly");
    setEditingPlan(true);
  }
  async function handleSavePlan() {
    if (!selectedPlanId) return;
    setSavingPlan(true);
    try {
      const r = await fetch(`/api/admin/tenants/${id}/plan`, { method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ planId: selectedPlanId, billingCycle: selectedBillingCycle }) });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Erro ao atualizar plano");
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] }), qc.invalidateQueries({ queryKey: ["admin-tenant-ai-usage", id] }), qc.invalidateQueries({ queryKey: getListTenantsQueryKey() })]);
      setEditingPlan(false); toast({ title: "Plano atualizado" });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao atualizar plano", variant: "destructive" }); }
    finally { setSavingPlan(false); }
  }

  async function toggleModule(moduleKey: string, isEnabled: boolean) {
    setSavingModule(moduleKey);
    try {
      const r = await fetch(`/api/tenants/${id}/nav-modules/${moduleKey}`, { method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ isEnabled }) });
      if (!r.ok) throw new Error("Falha ao atualizar módulo");
      await qc.invalidateQueries({ queryKey: ["tenant-nav-modules", id] });
      toast({ title: isEnabled ? "Módulo ativado" : "Módulo desativado" });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao atualizar módulo", variant: "destructive" }); }
    finally { setSavingModule(null); }
  }

  async function applyVerticalPreset() {
    if (!navModules) return;
    const recommended = new Set(VERTICAL_RECOMMENDED[tenant?.vertical ?? ""] ?? ["dashboard", "leads", "deals", "conversations", "scheduler", "agents", "team", "settings", "setup"]);
    setApplyingPreset(true);
    try {
      const r = await fetch(`/api/tenants/${id}/nav-modules`, { method: "PUT", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ modules: navModules.map((item) => ({ moduleKey: item.moduleKey, isEnabled: recommended.has(item.moduleKey) || PROTECTED_MODULES.has(item.moduleKey) })) }) });
      if (!r.ok) throw new Error("Falha ao aplicar configuração recomendada");
      await qc.invalidateQueries({ queryKey: ["tenant-nav-modules", id] });
      toast({ title: `Módulos recomendados aplicados para ${tenant?.vertical ?? "o tenant"}` });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao aplicar configuração", variant: "destructive" }); }
    finally { setApplyingPreset(false); }
  }

  async function handleToggleVendeNoPracaAi(enabled: boolean) {
    setSavingVendeNoPracaAi(true);
    try {
      const r = await fetch(`/api/superadmin/tenants/${id}/praca-ai`, { method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Erro ao atualizar Praça.ai");
      await qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] });
      toast({ title: enabled ? "Praça.ai liberado" : "Praça.ai desativado" });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao atualizar Praça.ai", variant: "destructive" }); }
    finally { setSavingVendeNoPracaAi(false); }
  }

  async function handleSaveComissao() {
    const value = Number(comissaoInput.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100) { toast({ title: "Percentual inválido", variant: "destructive" }); return; }
    setSavingComissao(true);
    try { await patchTenant({ comissaoPracaAiPercentual: value.toFixed(2) }); setEditingComissao(false); toast({ title: "Comissão atualizada" }); }
    catch (error) { toast({ title: error instanceof Error ? error.message : "Erro ao atualizar comissão", variant: "destructive" }); }
    finally { setSavingComissao(false); }
  }

  async function saveZapiCredentials() {
    const payload: Record<string, string> = {};
    if (zapiInstanceId.trim()) payload.instanceId = zapiInstanceId.trim();
    if (zapiToken.trim()) payload.token = zapiToken.trim();
    if (zapiClientToken.trim()) payload.clientToken = zapiClientToken.trim();
    if (!Object.keys(payload).length) return;
    setSavingZapiCredentials(true);
    try {
      const r = await fetch(`/api/superadmin/tenants/${id}/zapi-credentials`, { method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Falha ao salvar credenciais");
      setZapiInstanceId(""); setZapiToken(""); setZapiClientToken(""); await refetchZapiStatus(); toast({ title: "Credenciais Z-API salvas" });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Falha ao salvar credenciais", variant: "destructive" }); }
    finally { setSavingZapiCredentials(false); }
  }

  async function sendZapiTest() {
    setSendingZapiTest(true);
    try {
      const r = await fetch(`/api/superadmin/tenants/${id}/zapi-test`, { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ phone: testPhone, message: "Teste de integração appvendorai.com" }) });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Falha ao enviar teste");
      toast({ title: "Mensagem de teste enviada" }); await refetchZapiStatus();
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Falha ao enviar teste", variant: "destructive" }); }
    finally { setSendingZapiTest(false); }
  }

  const totalMsgs = analytics?.messagesByAgent?.reduce((sum, item) => sum + item.total, 0) ?? 0;
  const totalActions = analytics?.agentActions?.reduce((sum, item) => sum + item.total, 0) ?? 0;
  const activeAgents = (analytics?.agentActions ?? []).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  const enabledModules = (navModules ?? []).filter((item) => item.isEnabled || PROTECTED_MODULES.has(item.moduleKey)).length;

  if (tenantLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!tenant) return <div className="p-6 text-center space-y-3"><p>Tenant não encontrado.</p><VendorBackButton to="/admin/tenants" label="Voltar para tenants" /></div>;

  const planName = availablePlans.find((plan) => plan.id === tenant.planId)?.name ?? tenant.planId ?? "Sem plano";

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex items-start gap-3 flex-wrap">
        <VendorBackButton to="/admin/tenants" label="Voltar para tenants" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="truncate">{tenant.name}</span></h1>
            {tenant.tenantCode && <Badge variant="outline" className="font-mono">{tenant.tenantCode}</Badge>}
            <Badge variant="outline" className={tenant.isDemo ? "text-violet-700 border-violet-200 bg-violet-50" : "text-slate-600"}>{tenant.isDemo ? "Demo" : "Cliente"}</Badge>
            <Badge variant="outline" className={STATUS_COLORS[tenant.status] ?? ""}>{STATUS_LABELS[tenant.status] ?? tenant.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{tenant.slug} · {tenant.vertical ?? "CRM Geral"} · {planName}</p>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleResend()} disabled={resending}>{resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Reenviar acesso</Button>
          {tenant.status === "active" ? <Button size="sm" variant="outline" className="gap-1.5 text-orange-600 border-orange-200" onClick={() => void handleBlock("suspended")} disabled={blocking}><ShieldOff className="h-3.5 w-3.5" />Suspender</Button> : <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-200" onClick={() => void handleBlock("active")} disabled={blocking}><Shield className="h-3.5 w-3.5" />Reativar</Button>}
        </div>
      </div>

      <Card className="border-violet-100 bg-violet-50/30">
        <CardContent className="p-3 sm:p-4 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {[
              ["identidade", "Identidade", Building2], ["plano", "Plano & financeiro", CreditCard], ["acessos", "Acessos", Users], ["implantacao", "Implantação", Rocket],
              ["modulos", "Módulos", LayoutGrid], ["agentes", "Agentes & IA", Bot], ["integracoes", "Integrações", PlugZap],
            ].map(([anchor, label, Icon]) => <Button key={String(anchor)} variant="ghost" size="sm" className="gap-1.5" onClick={() => document.getElementById(String(anchor))?.scrollIntoView({ behavior: "smooth", block: "start" })}><Icon className="h-3.5 w-3.5" />{String(label)}</Button>)}
          </div>
        </CardContent>
      </Card>

      <section id="identidade" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={Building2} title="Identidade e segmento" description="Dados-base do tenant e contexto operacional que direciona as demais funções." />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Resumo do tenant</CardTitle></CardHeader><CardContent className="space-y-2.5">
            <InfoRow label="Código" value={tenant.tenantCode ?? "—"} /><InfoRow label="Status" value={STATUS_LABELS[tenant.status] ?? tenant.status} /><InfoRow label="Tipo" value={tenant.isDemo ? `Demo até ${fmt(tenant.demoExpiresAt)}` : "Cliente"} /><InfoRow label="Segmento" value={tenant.vertical ?? "CRM Geral"} /><InfoRow label="Origem" value={tenant.provisioningMethod ? PROV_LABELS[tenant.provisioningMethod] ?? tenant.provisioningMethod : "—"} /><InfoRow label="Criado em" value={fmt(tenant.createdAt)} />
            <div className="pt-1.5 border-t">
              <p className="text-xs text-muted-foreground mb-1">Vertical secundária (opcional)</p>
              <p className="text-[11px] text-muted-foreground mb-1.5">Soma módulos das duas verticais — ex: uma padaria que também é confeitaria.</p>
              <div className="flex gap-1.5">
                <select
                  className="flex-1 h-8 text-xs rounded-md border border-input bg-background px-2"
                  value={verticalSecundariaValue}
                  onChange={(e) => setVerticalSecundariaDraft(e.target.value)}
                >
                  <option value="">Nenhuma</option>
                  {segmentTemplates.filter((s) => s.nome !== tenant.vertical).map((s) => (
                    <option key={s.id} value={s.nome}>{s.nome}</option>
                  ))}
                </select>
                {verticalSecundariaDraft !== null && verticalSecundariaDraft !== (tenant.verticalSecundaria ?? "") && (
                  <Button size="sm" className="h-8 text-xs px-2.5" disabled={savingVerticalSecundaria} onClick={() => void saveVerticalSecundaria()}>
                    {savingVerticalSecundaria ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent></Card>
          <Card className="lg:col-span-2"><CardHeader className="pb-3"><CardTitle className="text-sm">Estado operacional</CardTitle></CardHeader><CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Módulos ativos</p><p className="text-xl font-semibold mt-1">{enabledModules}</p></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Mensagens 30d</p><p className="text-xl font-semibold mt-1">{totalMsgs}</p></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Ações IA 30d</p><p className="text-xl font-semibold mt-1">{totalActions}</p></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Primeiro acesso</p><p className="text-sm font-semibold mt-1">{tenant.firstLoginAt ? fmt(tenant.firstLoginAt) : "Nunca"}</p></div>
          </CardContent></Card>
        </div>
      </section>

      <section id="plano" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={CreditCard} title="Plano e financeiro" description="Plano contratado, cobrança, contrato, negociação e condições comerciais em um só bloco." />
        <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-sm">Plano atual: {planName}</CardTitle><Button variant="outline" size="sm" onClick={startEditingPlan}>Alterar plano</Button></div></CardHeader><CardContent>
          {editingPlan ? <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 items-end"><div><label className="text-xs font-medium">Plano</label><select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"><option value="">Selecione</option>{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div><div><label className="text-xs font-medium">Ciclo</label><select value={selectedBillingCycle} onChange={(e) => setSelectedBillingCycle(e.target.value as "monthly" | "annual")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"><option value="monthly">Mensal</option><option value="annual">Anual</option></select></div><div className="flex gap-2"><Button variant="ghost" onClick={() => setEditingPlan(false)}>Cancelar</Button><Button onClick={() => void handleSavePlan()} disabled={savingPlan || !selectedPlanId}>{savingPlan && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button></div></div> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"><InfoRow label="Plano" value={planName} /><InfoRow label="Ciclo" value={tenant.billingCycle === "annual" ? "Anual" : "Mensal"} /><InfoRow label="Pagamento" value={tenant.statusPagamento ?? "—"} /><InfoRow label="Vencimento" value={tenant.diaVencimento ? `Dia ${tenant.diaVencimento}` : "—"} /></div>}
        </CardContent></Card>
        <TenantInternationalProfileCard tenantId={id} tenant={tenant} />
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Praça.ai</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Venda no Praça.ai</p><p className="text-xs text-muted-foreground">Libera os produtos marcados para a vitrine pública.</p></div><Switch checked={!!tenant.vendeNoPracaAi} disabled={savingVendeNoPracaAi} onCheckedChange={handleToggleVendeNoPracaAi} /></div>{tenant.vendeNoPracaAi && <div className="flex items-center justify-between gap-3 border-t pt-3"><span className="text-sm">Comissão</span>{editingComissao ? <div className="flex gap-2"><Input className="h-8 w-24" value={comissaoInput} onChange={(e) => setComissaoInput(e.target.value)} /><Button size="sm" onClick={() => void handleSaveComissao()} disabled={savingComissao}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => setEditingComissao(false)}>Cancelar</Button></div> : <button className="text-sm hover:underline" onClick={() => { setComissaoInput(tenant.comissaoPracaAiPercentual ?? "8.00"); setEditingComissao(true); }}>{tenant.comissaoPracaAiPercentual ?? "8.00"}% · editar</button>}</div>}</CardContent></Card>
      </section>

      <section id="acessos" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={Users} title="Acessos e licença" description="Situação de acesso, primeiro login e regras da licença deste tenant." />
        <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"><InfoRow label="Primeiro acesso" value={tenant.firstLoginAt ? <span className="text-emerald-600 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" />{fmt(tenant.firstLoginAt)}</span> : <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Nunca</span>} /><InfoRow label="Acesso enviado" value={fmt(tenant.accessSentAt)} /><div className="sm:text-right"><Button size="sm" variant="outline" onClick={() => void handleResend()} disabled={resending}>Reenviar acesso</Button></div></CardContent></Card>
        <AccessLicenseAdminCard tenantId={id} />
      </section>

      <section id="implantacao" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={Rocket} title="Implantação" description="Checklist de implantação e pendências necessárias para o tenant operar corretamente." />
        <TenantImplementationStatusCard tenantId={id} />
      </section>

      <section id="modulos" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={SlidersHorizontal} title="Módulos e telas" description="O segmento define o contexto; aqui você confirma exatamente quais telas ficam disponíveis." />
        <Card><CardHeader className="pb-3"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><CardTitle className="text-base">Telas habilitadas</CardTitle><p className="text-sm text-muted-foreground mt-1">{enabledModules} de {(navModules ?? []).length} módulos ativos.</p></div><Button variant="outline" size="sm" onClick={() => void applyVerticalPreset()} disabled={applyingPreset || modulesLoading}>{applyingPreset && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Aplicar recomendado para {tenant.vertical ?? "o segmento"}</Button></div></CardHeader><CardContent>{modulesLoading ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{(navModules ?? []).map((module) => { const protectedModule = PROTECTED_MODULES.has(module.moduleKey); return <div key={module.moduleKey} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="text-sm font-medium">{module.moduleName}</p><p className="text-xs text-muted-foreground line-clamp-2">{module.description}</p>{protectedModule && <p className="text-[10px] text-violet-600 mt-1">Essencial</p>}</div><Switch checked={module.isEnabled || protectedModule} disabled={protectedModule || savingModule === module.moduleKey} onCheckedChange={(checked) => void toggleModule(module.moduleKey, checked)} /></div>; })}</div>}</CardContent></Card>
      </section>

      <section id="agentes" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={Bot} title="Agentes e IA" description="Uso de IA, atividade recente, prompts, arquivos e conhecimento vinculados ao tenant." />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" />Consumo de IA</CardTitle></CardHeader><CardContent>{aiLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="space-y-3"><div className="flex items-end justify-between gap-3"><div><span className="text-xs text-muted-foreground">Uso da cota</span><p className="text-xl font-bold">{(aiUsage?.usagePercent ?? 0).toFixed(2)}%</p></div><span className="text-xs text-muted-foreground text-right">{(aiUsage?.tokensUsed ?? 0).toLocaleString("pt-BR")} tokens utilizados</span></div><div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.min(100, aiUsage?.usagePercent ?? 0)}%` }} /></div><p className="text-xs text-muted-foreground">{(aiUsage?.usagePercent ?? 0) >= 100 ? "Cota de IA utilizada" : `${Math.max(0, 100 - (aiUsage?.usagePercent ?? 0)).toFixed(2)}% da cota disponível`}</p><Separator />{(aiUsage?.featureBreakdown ?? []).slice(0, 6).map((item) => <InfoRow key={item.feature} label={item.feature.replace(/_/g, " ")} value={`${Number(item.tokens ?? 0).toLocaleString("pt-BR")} tokens`} />)}</div>}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Atividade dos agentes · 30 dias</CardTitle></CardHeader><CardContent>{analyticsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-muted/50 rounded-lg p-3 text-center"><p className="text-xl font-bold">{totalMsgs}</p><p className="text-xs text-muted-foreground">Mensagens</p></div><div className="bg-muted/50 rounded-lg p-3 text-center"><p className="text-xl font-bold">{totalActions}</p><p className="text-xs text-muted-foreground">Ações IA</p></div></div>{activeAgents.slice(0, 6).map((agent) => <div key={agent.agentName} className="flex items-center justify-between text-xs"><span>{AGENT_LABELS[agent.agentName] ?? agent.agentName}</span><span className="flex gap-2"><span>{agent.total}</span>{agent.executed > 0 && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{agent.executed}</span>}{agent.rejected > 0 && <span className="text-red-500 flex items-center gap-1"><XCircle className="h-3 w-3" />{agent.rejected}</span>}</span></div>)}</div>}</CardContent></Card>
        </div>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Configuração dos agentes</CardTitle><p className="text-sm text-muted-foreground">Prompt efetivo, anexos e base de conhecimento de cada agente.</p></CardHeader><CardContent>{agentsOverviewLoading ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : !agentsOverview?.agents.length ? <p className="text-sm text-muted-foreground">Nenhum agente disponível.</p> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{agentsOverview.agents.map((agent) => <details key={agent.agentKey} className="rounded-lg border"><summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{agent.nomePerfil || agent.nome}</span><Badge variant="outline" className={agent.ativo ? "text-emerald-600 border-emerald-200" : ""}>{agent.ativo ? "Ativo" : "Inativo"}</Badge><Badge variant="secondary">{agent.tom}</Badge></div><p className="text-xs text-muted-foreground mt-1">{agent.descricao || agent.agentKey}</p></div><span className="text-xs text-muted-foreground">{agent.attachments.length} arquivo(s)</span></summary><div className="border-t p-4 space-y-4"><div><p className="text-xs font-semibold mb-1">Prompt em uso</p><pre className="text-xs whitespace-pre-wrap break-words rounded-md bg-muted p-3 max-h-52 overflow-auto font-sans">{agent.systemPromptCustom?.trim() || agent.systemPromptBase}</pre></div>{agent.restricoes && <div><p className="text-xs font-semibold">Restrições</p><p className="text-xs text-muted-foreground whitespace-pre-wrap">{agent.restricoes}</p></div>}<div><p className="text-xs font-semibold mb-2 flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />Arquivos</p>{agent.attachments.length ? agent.attachments.map((file, index) => <div key={`${file.objectPath ?? file.name}-${index}`} className="text-xs rounded border px-3 py-2 mb-1 flex justify-between gap-2"><span className="truncate">{file.name || "Arquivo"}</span><span className="text-muted-foreground">{file.mimeType || "arquivo"}</span></div>) : <p className="text-xs text-muted-foreground">Nenhum arquivo.</p>}</div><div><p className="text-xs font-semibold mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Conhecimento vinculado</p>{agent.knowledgeItems.length ? agent.knowledgeItems.map((item) => <div key={item.id} className="text-xs rounded border px-3 py-2 mb-1"><p className="font-medium">{item.titulo}</p><p className="text-muted-foreground">{item.categoria} · {item.ativo ? "Ativo" : "Inativo"}</p></div>) : <p className="text-xs text-muted-foreground">Nenhum item vinculado.</p>}</div></div></details>)}</div>}</CardContent></Card>
      </section>

      <section id="integracoes" className="scroll-mt-4 space-y-3">
        <SectionTitle icon={PlugZap} title="Integrações" description="Estado das integrações externas do tenant e testes operacionais." />
        <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wifi className="h-5 w-5" />WhatsApp · Z-API</CardTitle><p className="text-sm text-muted-foreground">Credenciais ficam ocultas; esta tela mostra apenas o estado e permite atualização segura.</p></CardHeader><CardContent className="space-y-4">{zapiStatusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="flex gap-2 flex-wrap"><Badge variant="outline" className={zapiStatus?.configured ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200"}>{zapiStatus?.configured ? "Credenciais completas" : "Credenciais incompletas"}</Badge><Badge variant="outline" className={zapiStatus?.connected ? "text-emerald-600 border-emerald-200" : "text-orange-600 border-orange-200"}>{zapiStatus?.connected ? "Conectada" : "Desconectada"}</Badge></div>}<div className="grid grid-cols-1 md:grid-cols-3 gap-2"><Input type="password" value={zapiInstanceId} onChange={(e) => setZapiInstanceId(e.target.value)} placeholder={zapiStatus?.credentials.instanceId ? "Instance ID configurado" : "Instance ID"} /><Input type="password" value={zapiToken} onChange={(e) => setZapiToken(e.target.value)} placeholder={zapiStatus?.credentials.token ? "Token configurado" : "Token"} /><Input type="password" value={zapiClientToken} onChange={(e) => setZapiClientToken(e.target.value)} placeholder={zapiStatus?.credentials.clientToken ? "Client-Token configurado" : "Client-Token"} /></div><Button variant="outline" onClick={() => void saveZapiCredentials()} disabled={savingZapiCredentials || (!zapiInstanceId.trim() && !zapiToken.trim() && !zapiClientToken.trim())}>{savingZapiCredentials && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar credenciais</Button><Separator /><div className="flex flex-col sm:flex-row gap-2 max-w-xl"><Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Telefone com DDD" /><Button onClick={() => void sendZapiTest()} disabled={sendingZapiTest || !zapiStatus?.connected || testPhone.replace(/\D/g, "").length < 10}>{sendingZapiTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Enviar teste</Button></div></CardContent></Card>
      </section>
    </div>
  );
}
