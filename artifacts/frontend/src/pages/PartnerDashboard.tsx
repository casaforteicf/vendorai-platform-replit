import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoFull from "/logo-full-light.svg";
import { LogOut, Building2, RefreshCw, AlertTriangle, ArrowLeft, Zap, MessageSquare } from "lucide-react";
import {
  useListPartnerTenants,
  useGetPartnerTenantUsage,
} from "@workspace/api-client-react";

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

function TenantDetail({ tenantId, onBack }: { tenantId: string; onBack: () => void }) {
  const { data, isLoading, isError } = useGetPartnerTenantUsage(tenantId);

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      )}
    </div>
  );
}

export default function PartnerDashboard() {
  const { user, logout } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const { data: tenants, isLoading, isError } = useListPartnerTenants();

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
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

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {selectedTenantId ? (
          <TenantDetail tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Painel do Parceiro</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Visão agregada dos seus clientes na plataforma.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Carregando clientes...
              </div>
            ) : isError ? (
              <div className="flex items-center gap-2 text-destructive py-8">
                <AlertTriangle className="h-4 w-4" />
                Erro ao carregar lista de clientes.
              </div>
            ) : !tenants || tenants.length === 0 ? (
              <div className="rounded-xl border bg-card p-12 text-center space-y-2">
                <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-medium">Nenhum cliente associado</p>
                <p className="text-xs text-muted-foreground">
                  Entre em contato com o administrador da plataforma para vincular tenants à sua conta.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tenants.map((tenant) => {
                  const tokenPct = tenant.monthlyTokenLimit
                    ? Math.round((tenant.tokensUsedCurrentMonth / tenant.monthlyTokenLimit) * 100)
                    : null;

                  return (
                    <div key={tenant.id} className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-base">{tenant.name}</h3>
                          <p className="text-xs text-muted-foreground">/{tenant.slug}</p>
                        </div>
                        <StatusBadge status={tenant.status} />
                      </div>

                      <div className="space-y-2">
                        <UsageBar
                          used={tenant.tokensUsedCurrentMonth}
                          limit={tenant.monthlyTokenLimit}
                          label="Tokens/mês"
                        />
                        <UsageBar
                          used={tenant.messagesSentToday}
                          limit={tenant.dailyMessageLimit}
                          label="Mensagens/dia"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {tenant.setupCompletedAt ? "Setup concluído" : "Setup pendente"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedTenantId(tenant.id)}
                        >
                          Ver detalhes
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
