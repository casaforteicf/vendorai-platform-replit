import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import logoFull from "/logo-full-light.svg";
import {
  LogOut, Building2, RefreshCw, AlertTriangle, ArrowLeft, Zap,
  MessageSquare, CheckCircle2, Circle, DollarSign, TrendingUp, Calendar,
} from "lucide-react";
import {
  useGetPartnerTenantUsage,
  useGetTenantSetupStatus,
  getGetTenantSetupStatusQueryKey,
} from "@workspace/api-client-react";
function api(path: string) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${base}${path}`;
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    suspended: "Suspenso",
    cancelled: "Cancelado",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", variants[status] ?? variants["active"])}>
      {labels[status] ?? status}
    </span>
  );
}

function UsageBar({ used, limit, label }: { used: number; limit?: number | null; label: string }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{used.toLocaleString("pt-BR")}{limit ? ` / ${limit.toLocaleString("pt-BR")}` : ""}</span>
      </div>
      {pct !== null && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

const SETUP_CHECKS: { key: string; label: string }[] = [
  { key: "onboardingComplete",        label: "Onboarding concluído" },
  { key: "businessProfileConfigured", label: "Perfil da empresa" },
  { key: "productsConfigured",        label: "Produtos cadastrados" },
  { key: "agentConfigured",           label: "Agentes configurados" },
  { key: "whatsappConnected",         label: "WhatsApp conectado" },
  { key: "webhookConfigured",         label: "Webhook de entrada" },
  { key: "instagramConnected",        label: "Instagram conectado" },
  { key: "firstLeadAdded",            label: "Primeiro lead" },
  { key: "autonomyEnabled",           label: "Autonomia ativada" },
];

function TenantDetail({ tenantId, onBack }: { tenantId: string; onBack: () => void }) {
  const { data, isLoading, isError } = useGetPartnerTenantUsage(tenantId);
  const { data: setupStatus } = useGetTenantSetupStatus(tenantId, {
    query: { enabled: !!tenantId, queryKey: getGetTenantSetupStatusQueryKey(tenantId) },
  });

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Carregando uso...
        </div>
      ) : isError || !data ? (
        <div className="flex items-center gap-2 text-destructive py-8">
          <AlertTriangle className="h-4 w-4" />
          Erro ao carregar dados do tenant.
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{data.tenant.name}</h2>
              <StatusBadge status={data.tenant.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">/{data.tenant.slug}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-amber-500" />
                Tokens — Mês Atual
              </div>
              <UsageBar
                used={data.usage.tokensUsedCurrentMonth}
                limit={data.usage.monthlyTokenLimit}
                label="Tokens usados"
              />
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Mensagens — Hoje
              </div>
              <UsageBar
                used={data.usage.messagesSentToday}
                limit={data.usage.dailyMessageLimit}
                label="Mensagens enviadas"
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h3 className="text-sm font-semibold">Informações gerais</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex gap-2">
                <span className="w-32 shrink-0">Vertical:</span>
                <span>{data.tenant.vertical ?? "—"}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-32 shrink-0">Setup concluído:</span>
                <span>{data.tenant.setupCompletedAt ? new Date(data.tenant.setupCompletedAt).toLocaleDateString("pt-BR") : "Pendente"}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-32 shrink-0">Cliente desde:</span>
                <span>{new Date(data.tenant.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          </div>

          {setupStatus && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Progresso de implantação</h3>
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  setupStatus.percentComplete === 100
                    ? "bg-emerald-100 text-emerald-700"
                    : setupStatus.percentComplete >= 50
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                )}>
                  {setupStatus.percentComplete}%
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    setupStatus.percentComplete === 100 ? "bg-emerald-500"
                    : setupStatus.percentComplete >= 50 ? "bg-amber-400"
                    : "bg-red-500"
                  )}
                  style={{ width: `${setupStatus.percentComplete}%` }}
                />
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {SETUP_CHECKS.map((check) => {
                  const done = !!(setupStatus as unknown as Record<string, unknown>)[check.key];
                  return (
                    <div key={check.key} className="flex items-center gap-2">
                      {done
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        : <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      }
                      <span className={cn("text-xs", done ? "text-muted-foreground line-through" : "text-foreground")}>
                        {check.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                {setupStatus.completedSteps}/{setupStatus.totalSteps} etapas concluídas
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DashboardData {
  summary: {
    activeTenants: number;
    commissionThisMonth: number;
    commissionThisYear: number;
    nextPaymentDate: string;
  };
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    vertical: string | null;
    setupCompletedAt: string | null;
    createdAt: string;
  }>;
  commissions: Array<{
    id: string;
    tenantId: string;
    tipo: string | null;
    valor: string | null;
    dataReferencia: string | null;
    status: string;
    createdAt: string;
  }>;
}

function SummaryCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className={cn("flex items-center gap-2 text-xs font-medium text-muted-foreground")}>
        <Icon className={cn("h-4 w-4", color)} />
        {label}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function PartnerDashboard() {
  const { user, logout } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const token = (user as any)?.token ?? localStorage.getItem("vendorai_token") ?? "";

  const { data: dashboard, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["partnerDashboard"],
    queryFn: async () => {
      const res = await fetch(api("/api/partner/dashboard"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <img src={logoFull} alt="Vendor.ai" className="h-9 w-auto" />
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Parceiro</p>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {selectedTenantId ? (
          <TenantDetail tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
        ) : (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Painel do Parceiro</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Visão agregada dos seus clientes na plataforma.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Carregando dados...
              </div>
            ) : isError || !dashboard ? (
              <div className="flex items-center gap-2 text-destructive py-8">
                <AlertTriangle className="h-4 w-4" />
                Erro ao carregar dashboard.
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <SummaryCard
                    icon={Building2}
                    label="Tenants ativos"
                    value={String(dashboard.summary.activeTenants)}
                    sub={`${dashboard.tenants.length} total`}
                    color="text-blue-500"
                  />
                  <SummaryCard
                    icon={DollarSign}
                    label="Comissão do mês"
                    value={fmt(dashboard.summary.commissionThisMonth)}
                    color="text-emerald-500"
                  />
                  <SummaryCard
                    icon={TrendingUp}
                    label="Acumulado anual"
                    value={fmt(dashboard.summary.commissionThisYear)}
                    color="text-amber-500"
                  />
                  <SummaryCard
                    icon={Calendar}
                    label="Próximo pagamento"
                    value={new Date(dashboard.summary.nextPaymentDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    sub="Dia 5 do mês seguinte"
                    color="text-purple-500"
                  />
                </div>

                {/* Tenants table */}
                {dashboard.tenants.length === 0 ? (
                  <div className="rounded-xl border bg-card p-12 text-center space-y-2">
                    <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium">Nenhum cliente associado</p>
                    <p className="text-xs text-muted-foreground">
                      Entre em contato com o administrador da plataforma para vincular tenants à sua conta.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold">Seus clientes</h2>
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40">
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nome</th>
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Vertical</th>
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Ativação</th>
                              <th className="py-3 px-4" />
                            </tr>
                          </thead>
                          <tbody>
                            {dashboard.tenants.map((t) => (
                              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="py-3 px-4 font-medium">{t.name}</td>
                                <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{t.vertical ?? "—"}</td>
                                <td className="py-3 px-4"><StatusBadge status={t.status} /></td>
                                <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                                  {t.setupCompletedAt ? new Date(t.setupCompletedAt).toLocaleDateString("pt-BR") : "Pendente"}
                                </td>
                                <td className="py-3 px-4">
                                  <Button variant="ghost" size="sm" onClick={() => setSelectedTenantId(t.id)}>
                                    Detalhes
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Commissions history */}
                {dashboard.commissions.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold">Histórico de comissões</h2>
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40">
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Referência</th>
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
                              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Valor</th>
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...dashboard.commissions].reverse().map((c) => (
                              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="py-3 px-4 text-muted-foreground">
                                  {c.dataReferencia ? new Date(c.dataReferencia + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—"}
                                </td>
                                <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{c.tipo ?? "—"}</td>
                                <td className="py-3 px-4 text-right font-medium">{c.valor ? fmt(parseFloat(c.valor)) : "—"}</td>
                                <td className="py-3 px-4">
                                  <span className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    c.status === "pago"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700"
                                  )}>
                                    {c.status === "pago" ? "Pago" : "Pendente"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
