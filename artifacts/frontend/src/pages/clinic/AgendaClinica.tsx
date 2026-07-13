import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Plus, Clock, Stethoscope,
  CheckCircle2, XCircle, AlertCircle, Video, User2, FileText,
} from "lucide-react";
import {
  format, addDays, startOfWeek, isSameDay, parseISO, addWeeks, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "wouter";
import NovaConsultaDialog from "./components/NovaConsultaDialog";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const TIME_SLOTS: string[] = [];
for (let h = 7; h < 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const STATUS_COLORS: Record<string, string> = {
  agendada:  "bg-blue-100 text-blue-800 border-blue-300",
  confirmada:"bg-emerald-100 text-emerald-800 border-emerald-300",
  realizada: "bg-slate-100 text-slate-600 border-slate-300",
  cancelada: "bg-red-100 text-red-700 border-red-200 line-through opacity-60",
  faltou:    "bg-orange-100 text-orange-700 border-orange-300",
};
const STATUS_LABELS: Record<string, string> = {
  agendada:  "Agendada",
  confirmada:"Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  faltou:    "Faltou",
};
const STATUS_OPTIONS = ["agendada", "confirmada", "realizada", "cancelada", "faltou"];

export default function AgendaClinica() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedConsulta, setSelectedConsulta] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState<{
    date: string; horario: string; medicoId?: string;
  }>({ date: format(new Date(), "yyyy-MM-dd"), horario: "09:00" });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekIni = format(weekStart, "yyyy-MM-dd");
  const weekFim = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: consultas = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["clinic-consultas-week", tenantId, weekIni, weekFim],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/clinic/consultas?dataInicio=${weekIni}&dataFim=${weekFim}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: medicos = [] } = useQuery<any[]>({
    queryKey: ["clinic-medicos", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/clinic/medicos`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const consultasArr = Array.isArray(consultas) ? consultas : [];
  const medicosArr   = Array.isArray(medicos)   ? medicos.filter((m) => m.ativo !== false) : [];

  function getConsulta(day: Date, slot: string, medicoId: string) {
    const dateStr = format(day, "yyyy-MM-dd");
    return consultasArr.find((c) => {
      if (!c.dataHora) return false;
      const dt = new Date(c.dataHora);
      return (
        format(dt, "yyyy-MM-dd") === dateStr &&
        format(dt, "HH:mm") === slot &&
        c.medicoId === medicoId
      );
    });
  }

  function handleCellClick(day: Date, slot: string, medicoId: string) {
    const c = getConsulta(day, slot, medicoId);
    if (c) { setSelectedConsulta(c); setSheetOpen(true); }
    else {
      setDialogDefaults({ date: format(day, "yyyy-MM-dd"), horario: slot, medicoId });
      setDialogOpen(true);
    }
  }

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/clinic/consultas/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["clinic-consultas-week"] });
      qc.invalidateQueries({ queryKey: ["clinic-consultas"] });
      setSelectedConsulta(updated);
      toast({ title: "Status atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const today = new Date();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Stethoscope className="h-5 w-5" /> Agenda Clínica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(weekStart, "'Semana de' d 'de' MMM", { locale: ptBR })} —{" "}
            {format(addDays(weekStart, 6), "d 'de' MMM yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => {
            setDialogDefaults({ date: format(today, "yyyy-MM-dd"), horario: "09:00" });
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" /> Nova
          </Button>
        </div>
      </div>

      {/* Empty — no médicos */}
      {!isLoading && medicosArr.length === 0 && (
        <div className="border rounded-lg p-10 text-center">
          <User2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">
            Cadastre médicos para visualizar a grade.
          </p>
          <Button variant="outline" onClick={() => (window.location.href = `${import.meta.env.BASE_URL}clinic/medicos`)}>
            Gerenciar Médicos
          </Button>
        </div>
      )}

      {/* Grid */}
      {(medicosArr.length > 0 || isLoading) && (
        <div className="overflow-auto rounded-lg border bg-card">
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                <th className="border-b border-r p-2 text-left font-semibold text-muted-foreground w-16 min-w-[56px]">
                  Horário
                </th>
                {weekDays.map((day) => (
                  <th key={day.toISOString()} colSpan={medicosArr.length || 1}
                    className={`border-b border-r p-2 text-center font-semibold ${
                      isSameDay(day, today) ? "bg-primary/10 text-primary" : "text-foreground"
                    }`}
                  >
                    <div>{format(day, "EEE", { locale: ptBR })}</div>
                    <div className={`text-base font-bold ${isSameDay(day, today) ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </div>
                  </th>
                ))}
              </tr>
              {medicosArr.length > 1 && (
                <tr className="bg-muted/50">
                  <th className="border-b border-r" />
                  {weekDays.map((day) =>
                    medicosArr.map((m) => (
                      <th key={`${day.toISOString()}-${m.id}`}
                        className="border-b border-r p-1 text-center text-muted-foreground font-medium truncate max-w-[100px]">
                        Dr(a). {m.nome?.split(" ")[0]}
                      </th>
                    ))
                  )}
                </tr>
              )}
            </thead>
            <tbody>
              {TIME_SLOTS.map((slot) => (
                <tr key={slot} className="border-b hover:bg-muted/10">
                  <td className="border-r p-2 text-muted-foreground font-mono text-xs align-top whitespace-nowrap">
                    {slot}
                  </td>
                  {weekDays.map((day) =>
                    medicosArr.length === 0 ? (
                      <td key={day.toISOString()} className="border-r p-1 h-10 align-top" />
                    ) : (
                      medicosArr.map((m) => {
                        const c = getConsulta(day, slot, m.id);
                        return (
                          <td key={`${day.toISOString()}-${m.id}`}
                            className={`border-r p-1 h-10 align-top cursor-pointer transition-colors ${
                              c ? "" : "hover:bg-primary/5"
                            }`}
                            onClick={() => handleCellClick(day, slot, m.id)}
                          >
                            {isLoading ? (
                              slot === "09:00" ? <Skeleton className="h-6 w-full" /> : null
                            ) : c ? (
                              <div className={`rounded px-1.5 py-1 border text-[10px] leading-tight ${
                                STATUS_COLORS[c.status] ?? "bg-blue-100 text-blue-800"
                              }`}>
                                <div className="font-semibold truncate flex items-center gap-0.5">
                                  {c.tipoAtendimento === "telemedicina" && <Video className="h-2.5 w-2.5 shrink-0" />}
                                  {c.paciente?.nome ?? c.pacienteNome ?? "Paciente"}
                                </div>
                                <div className="truncate opacity-80">
                                  {c.especialidade?.nome ?? m.especialidade?.nome ?? ""}
                                </div>
                              </div>
                            ) : null}
                          </td>
                        );
                      })
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded border ${STATUS_COLORS[k] ?? ""}`}>{v}</span>
        ))}
      </div>

      {/* Sheet detalhes */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalhes da Consulta</SheetTitle>
          </SheetHeader>
          {selectedConsulta && (
            <div className="mt-6 space-y-5">
              <div className="space-y-3">
                <Row label="Paciente" value={selectedConsulta.paciente?.nome ?? selectedConsulta.pacienteNome ?? "—"} />
                <Row label="Médico" value={`Dr(a). ${selectedConsulta.medico?.nome ?? "—"}`} />
                <Row label="Especialidade" value={selectedConsulta.especialidade?.nome ?? "—"} />
                <Row
                  label="Data / Horário"
                  value={selectedConsulta.dataHora
                    ? format(new Date(selectedConsulta.dataHora), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : "—"}
                />
                <Row label="Tipo" value={selectedConsulta.tipoAtendimento === "telemedicina" ? "Telemedicina" : "Presencial"} />
                {selectedConsulta.convenio && <Row label="Convênio" value={selectedConsulta.convenio} />}
                {selectedConsulta.carteirinha && <Row label="Carteirinha" value={selectedConsulta.carteirinha} />}
              </div>

              {/* Link prontuário */}
              <div className="pt-3 border-t">
                <Link href={`/clinic/prontuario/${selectedConsulta.id}`}>
                  <Button variant="outline" size="sm" className="gap-2 w-full justify-start">
                    <FileText className="h-4 w-4" /> Ver / Editar Prontuário
                  </Button>
                </Link>
              </div>

              {/* Alterar status */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Alterar status</p>
                {STATUS_OPTIONS.filter((s) => s !== selectedConsulta.status).map((s) => {
                  const icons: Record<string, React.ReactNode> = {
                    confirmada: <CheckCircle2 className="h-3.5 w-3.5" />,
                    realizada:  <CheckCircle2 className="h-3.5 w-3.5" />,
                    cancelada:  <XCircle className="h-3.5 w-3.5" />,
                    faltou:     <AlertCircle className="h-3.5 w-3.5" />,
                  };
                  return (
                    <Button key={s} variant="outline" size="sm"
                      className="w-full justify-start gap-2"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: selectedConsulta.id, status: s })}
                    >
                      {icons[s]}
                      Marcar como {STATUS_LABELS[s]}
                    </Button>
                  );
                })}
              </div>

              <Badge variant="outline" className={STATUS_COLORS[selectedConsulta.status] ?? ""}>
                Status atual: {STATUS_LABELS[selectedConsulta.status] ?? selectedConsulta.status}
              </Badge>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NovaConsultaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={tenantId}
        defaultDate={dialogDefaults.date}
        defaultHorario={dialogDefaults.horario}
        defaultMedicoId={dialogDefaults.medicoId}
        onSuccess={() => { refetch(); setDialogOpen(false); }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
