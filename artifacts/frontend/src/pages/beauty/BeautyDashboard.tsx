import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle2, DollarSign, Users, Plus, Clock, Scissors } from "lucide-react";
import { Link } from "wouter";
import NovoAgendamentoDialog from "./components/NovoAgendamentoDialog";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_COLORS: Record<string, string> = {
  agendado:  "bg-blue-50 text-blue-700 border-blue-200",
  confirmado:"bg-green-50 text-green-700 border-green-200",
  concluido: "bg-slate-50 text-slate-600 border-slate-200",
  cancelado: "bg-red-50 text-red-700 border-red-200",
  faltou:    "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABELS: Record<string, string> = {
  agendado:  "Agendado",
  confirmado:"Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou:    "Faltou",
};

export default function BeautyDashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const today = format(new Date(), "yyyy-MM-dd");
  const [showNovoDialog, setShowNovoDialog] = useState(false);

  const { data: agendamentosHoje = [], isLoading: loadingHoje, refetch: refetchHoje } = useQuery<any[]>({
    queryKey: ["beauty-agendamentos", tenantId, today],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/beauty/agendamentos?data=${today}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: agendamentosMes = [], isLoading: loadingMes } = useQuery<any[]>({
    queryKey: ["beauty-agendamentos-mes", tenantId],
    queryFn: () => {
      const ini = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
      const fim = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd");
      return fetch(
        `/api/tenants/${tenantId}/beauty/agendamentos?dataInicio=${ini}&dataFim=${fim}`,
        { headers: authHeaders() }
      ).then((r) => r.json());
    },
    enabled: !!tenantId,
  });

  const concluidosMes = Array.isArray(agendamentosMes)
    ? agendamentosMes.filter((a) => a.status === "concluido")
    : [];
  const faturamentoMes = concluidosMes.reduce((s: number, a: any) => s + Number(a.valorCobrado ?? a.valorServico ?? 0), 0);
  const clientesSet = new Set(
    Array.isArray(agendamentosMes) ? agendamentosMes.map((a: any) => a.leadId).filter(Boolean) : []
  );

  const sorted = Array.isArray(agendamentosHoje)
    ? [...agendamentosHoje].sort((a, b) => a.horario.localeCompare(b.horario))
    : [];

  const kpis = [
    { label: "Agendamentos Hoje",  value: Array.isArray(agendamentosHoje) ? agendamentosHoje.length : 0, icon: Calendar,      color: "text-blue-500",   loading: loadingHoje },
    { label: "Concluídos do Mês",  value: concluidosMes.length,                                          icon: CheckCircle2,  color: "text-emerald-500",loading: loadingMes },
    { label: "Faturamento do Mês", value: fmt(faturamentoMes),                                           icon: DollarSign,    color: "text-violet-500", loading: loadingMes },
    { label: "Clientes Ativos",    value: clientesSet.size,                                              icon: Users,         color: "text-amber-500",  loading: loadingMes },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scissors className="h-6 w-6" /> Salão de Beleza
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Button onClick={() => setShowNovoDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Agendamento
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
                {k.loading ? (
                  <Skeleton className="h-7 w-20 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-1">{k.value}</p>
                )}
              </div>
              <k.icon className={`h-5 w-5 shrink-0 mt-0.5 ${k.color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* Agendamentos do dia */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Agenda de Hoje</CardTitle>
          <Link href="/beauty/agenda">
            <Button variant="ghost" size="sm">Ver agenda completa →</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loadingHoje ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum agendamento para hoje.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((ag: any) => (
                <div
                  key={ag.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-1 text-sm font-mono font-medium text-muted-foreground min-w-[48px]">
                    <Clock className="h-3.5 w-3.5" />
                    {ag.horario?.slice(0, 5)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ag.clienteNome ?? "Cliente"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ag.servicoNome ?? "Serviço"} • {ag.profissionalNome ?? "Profissional"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-xs ${STATUS_COLORS[ag.status] ?? ""}`}
                  >
                    {STATUS_LABELS[ag.status] ?? ag.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NovoAgendamentoDialog
        open={showNovoDialog}
        onOpenChange={setShowNovoDialog}
        tenantId={tenantId}
        onSuccess={() => { refetchHoje(); setShowNovoDialog(false); }}
      />
    </div>
  );
}
