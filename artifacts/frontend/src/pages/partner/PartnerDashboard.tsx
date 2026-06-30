import { PartnerLayout } from "@/components/partner/PartnerLayout";
import { PartnerIndicationForm } from "@/components/partner/PartnerIndicationForm";
import { usePartnerDashboardV2, type PartnerCommissionRecord, type PartnerTenantSummary } from "@/lib/partnerApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Plus,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

function fmtMonth(iso: string) {
  try {
    return format(parseISO(iso), "MMM/yy", { locale: ptBR });
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    suspended: "bg-yellow-100 text-yellow-700",
    cancelled: "bg-red-100 text-red-700",
    paid: "bg-emerald-100 text-emerald-700",
    pending: "bg-blue-100 text-blue-700",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    suspended: "Suspenso",
    cancelled: "Cancelado",
    paid: "Pago",
    pending: "Pendente",
  };
  return (
    <Badge className={`text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  );
}

export default function PartnerDashboard() {
  const { data, isLoading, isError } = usePartnerDashboardV2();

  return (
    <PartnerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard do Parceiro</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Acompanhe seus clientes, comissões e resultados
            </p>
          </div>
          <PartnerIndicationForm
            trigger={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Indicar Cliente
              </Button>
            }
          />
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : isError ? (
          <p className="text-destructive text-sm">Erro ao carregar dashboard.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tenants Ativos
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data!.summary.activeTenants}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Comissão do Mês
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-600">
                  {fmt(data!.summary.commissionThisMonth)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Comissão Anual
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{fmt(data!.summary.commissionThisYear)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Próximo Pagamento
                </CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {fmtDate(data!.summary.nextPaymentDate)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tenants Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data || data.tenants.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhum cliente ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plano</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ativação</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comissão Mensal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tenants.map((t: PartnerTenantSummary) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.planName ?? "—"}</td>
                        <td className="px-4 py-3">{statusBadge(t.status)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {t.setupCompletedAt ? fmtDate(t.setupCompletedAt) : fmtDate(t.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-emerald-600 font-medium">{fmt(t.monthlyCommission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commissions History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Comissões</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data || data.commissions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma comissão registrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mês</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Valor</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.commissions.map((c: PartnerCommissionRecord) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{fmtMonth(c.dataReferencia)}</td>
                        <td className="px-4 py-3 text-emerald-600 font-medium">{fmt(parseFloat(c.valor))}</td>
                        <td className="px-4 py-3">{statusBadge(c.status)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.dataPagamento ? fmtDate(c.dataPagamento) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PartnerLayout>
  );
}
