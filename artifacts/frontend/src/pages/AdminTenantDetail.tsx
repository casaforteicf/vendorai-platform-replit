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
import {
  ArrowLeft, Building2, Shield, ShieldOff, Mail, Loader2, Zap, Bot,
  CheckCircle2, XCircle, Clock, UserCheck, MessageSquare,
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
    </div>
  );
}
