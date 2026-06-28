import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle2, DollarSign, Users, Plus, Clock, Stethoscope, Video } from "lucide-react";
import { Link } from "wouter";
import NovaConsultaDialog from "./components/NovaConsultaDialog";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_COLORS: Record<string, string> = {
  agendada:  "bg-blue-50 text-blue-700 border-blue-200",
  confirmada:"bg-green-50 text-green-700 border-green-200",
  realizada: "bg-slate-50 text-slate-600 border-slate-200",
  cancelada: "bg-red-50 text-red-700 border-red-200",
  faltou:    "bg-orange-50 text-orange-700 border-orange-200",
};
const STATUS_LABELS: Record<string, string> = {
  agendada:  "Agendada",
  confirmada:"Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  faltou:    "Faltou",
};

export default function ClinicDashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const today = format(new Date(), "yyyy-MM-dd");
  const [showDialog, setShowDialog] = useState(false);

  const { data: consultasHoje = [], isLoading: loadingHoje, refetch } = useQuery<any[]>({
    queryKey: ["clinic-consultas", tenantId, today],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/clinic/consultas?data=${today}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: consultasMes = [], isLoading: loadingMes } = useQuery<any[]>({
    queryKey: ["clinic-consultas-mes", tenantId],
    queryFn: () => {
      const ini = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
      const fim = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd");
      return fetch(`${getBase()}/api/tenants/${tenantId}/clinic/consultas?dataInicio=${ini}&dataFim=${fim}`, {
        headers: authHeaders(),
      }).then((r) => r.json());
    },
    enabled: !!tenantId,
  });

  const realizadasMes = Array.isArray(consultasMes)
    ? consultasMes.filter((c) => c.status === "realizada")
    : [];
  const faturamento = realizadasMes.reduce((s, c) => s + Number(c.valorConsulta ?? 0), 0);
  const pacientesSet = new Set(
    Array.isArray(consultasMes) ? consultasMes.map((c: any) => c.pacienteId).filter(Boolean) : []
  );

  const sorted = Array.isArray(consultasHoje)
    ? [...consultasHoje].sort((a, b) =>
        new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()
      )
    : [];

  const kpis = [
    { label: "Consultas Hoje",    value: Array.isArray(consultasHoje) ? consultasHoje.length : 0, icon: Calendar,     color: "text-blue-500",   loading: loadingHoje },
    { label: "Realizadas no Mês", value: realizadasMes.length,                                    icon: CheckCircle2, color: "text-emerald-500",loading: loadingMes  },
    { label: "Faturamento",       value: fmt(faturamento),                                        icon: DollarSign,   color: "text-violet-500", loading: loadingMes  },
    { label: "Pacientes Ativos",  value: pacientesSet.size,                                       icon: Users,        color: "text-amber-500",  loading: loadingMes  },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Stethoscope className="h-6 w-6" /> Clínica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Consulta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
                {k.loading
                  ? <Skeleton className="h-7 w-20 mt-1" />
                  : <p className="text-xl font-bold mt-1">{k.value}</p>
                }
              </div>
              <k.icon className={`h-5 w-5 shrink-0 mt-0.5 ${k.color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* Agenda do dia */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Agenda de Hoje</CardTitle>
          <Link href="/clinic/agenda">
            <Button variant="ghost" size="sm">Ver agenda completa →</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loadingHoje ? (
            <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma consulta para hoje.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((c: any) => {
                const dt = c.dataHora ? new Date(c.dataHora) : null;
                return (
                  <div key={c.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-1 text-sm font-mono font-medium text-muted-foreground min-w-[48px]">
                      <Clock className="h-3.5 w-3.5" />
                      {dt ? format(dt, "HH:mm") : "—"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {c.paciente?.nome ?? c.pacienteNome ?? "Paciente"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        {c.tipoAtendimento === "telemedicina" && <Video className="h-3 w-3" />}
                        Dr(a). {c.medico?.nome ?? "—"}
                        {c.especialidade?.nome ? ` · ${c.especialidade.nome}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${STATUS_COLORS[c.status] ?? ""}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <NovaConsultaDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        tenantId={tenantId}
        onSuccess={() => { refetch(); setShowDialog(false); }}
      />
    </div>
  );
}
