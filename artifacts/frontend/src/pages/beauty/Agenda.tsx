import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Plus, Clock, Scissors,
  CheckCircle2, XCircle, AlertCircle, User2,
} from "lucide-react";
import {
  format, addDays, startOfWeek, isSameDay, parseISO, addWeeks, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import NovoAgendamentoDialog from "./components/NovoAgendamentoDialog";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TIME_SLOTS: string[] = [];
for (let h = 8; h < 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const STATUS_COLORS: Record<string, string> = {
  agendado:  "bg-blue-100 text-blue-800 border-blue-300",
  confirmado:"bg-emerald-100 text-emerald-800 border-emerald-300",
  concluido: "bg-slate-100 text-slate-600 border-slate-300",
  cancelado: "bg-red-100 text-red-700 border-red-200 line-through opacity-60",
  faltou:    "bg-red-100 text-red-700 border-red-300",
};
const STATUS_LABELS: Record<string, string> = {
  agendado:  "Agendado",
  confirmado:"Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou:    "Faltou",
};
const STATUS_OPTIONS = ["agendado", "confirmado", "concluido", "cancelado", "faltou"];

export default function BeautyAgenda() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedAg, setSelectedAg] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState<{
    date: string; horario: string; profissionalId?: string;
  }>({ date: format(new Date(), "yyyy-MM-dd"), horario: "09:00" });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekIni = format(weekStart, "yyyy-MM-dd");
  const weekFim = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: agendamentos = [], isLoading: loadingAg, refetch } = useQuery<any[]>({
    queryKey: ["beauty-agendamentos-week", tenantId, weekIni, weekFim],
    queryFn: () =>
      fetch(
        `/api/tenants/${tenantId}/beauty/agendamentos?dataInicio=${weekIni}&dataFim=${weekFim}`,
        { headers: authHeaders() }
      ).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: profissionais = [] } = useQuery<any[]>({
    queryKey: ["beauty-profissionais", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/beauty/profissionais`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const agsArr = Array.isArray(agendamentos) ? agendamentos : [];
  const profsArr = Array.isArray(profissionais) ? profissionais.filter((p) => p.ativo !== false) : [];

  function getAgendamento(day: Date, slot: string, profId: string) {
    const dateStr = format(day, "yyyy-MM-dd");
    return agsArr.find(
      (a) =>
        a.data === dateStr &&
        a.horario?.slice(0, 5) === slot &&
        a.profissionalId === profId
    );
  }

  function handleCellClick(day: Date, slot: string, profId: string) {
    const ag = getAgendamento(day, slot, profId);
    if (ag) {
      setSelectedAg(ag);
      setSheetOpen(true);
    } else {
      setDialogDefaults({
        date: format(day, "yyyy-MM-dd"),
        horario: slot,
        profissionalId: profId,
      });
      setDialogOpen(true);
    }
  }

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/beauty/agendamentos/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["beauty-agendamentos-week"] });
      qc.invalidateQueries({ queryKey: ["beauty-agendamentos"] });
      setSelectedAg(updated);
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
            <Scissors className="h-5 w-5" /> Agenda
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => {
            setDialogDefaults({ date: format(today, "yyyy-MM-dd"), horario: "09:00" });
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" /> Novo
          </Button>
        </div>
      </div>

      {/* Empty state: no profissionais */}
      {!loadingAg && profsArr.length === 0 && (
        <div className="border rounded-lg p-10 text-center">
          <User2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">
            Cadastre profissionais para visualizar a grade.
          </p>
          <Button variant="outline" onClick={() => (window.location.href = `${import.meta.env.BASE_URL}beauty/profissionais`)}>
            Gerenciar Profissionais
          </Button>
        </div>
      )}

      {/* Grid */}
      {(profsArr.length > 0 || loadingAg) && (
        <div className="overflow-auto rounded-lg border bg-card">
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                <th className="border-b border-r p-2 text-left font-semibold text-muted-foreground w-16 min-w-[56px]">
                  Horário
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.toISOString()}
                    colSpan={profsArr.length || 1}
                    className={`border-b border-r p-2 text-center font-semibold ${
                      isSameDay(day, today)
                        ? "bg-primary/10 text-primary"
                        : "text-foreground"
                    }`}
                  >
                    <div>{format(day, "EEE", { locale: ptBR })}</div>
                    <div className={`text-base font-bold ${isSameDay(day, today) ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </div>
                  </th>
                ))}
              </tr>
              {profsArr.length > 1 && (
                <tr className="bg-muted/50">
                  <th className="border-b border-r" />
                  {weekDays.map((day) =>
                    profsArr.map((prof) => (
                      <th
                        key={`${day.toISOString()}-${prof.id}`}
                        className="border-b border-r p-1 text-center text-muted-foreground font-medium truncate max-w-[100px]"
                      >
                        {prof.nome?.split(" ")[0]}
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
                    profsArr.length === 0 ? (
                      <td
                        key={day.toISOString()}
                        className="border-r p-1 h-10 align-top"
                      />
                    ) : (
                      profsArr.map((prof) => {
                        const ag = getAgendamento(day, slot, prof.id);
                        return (
                          <td
                            key={`${day.toISOString()}-${prof.id}`}
                            className={`border-r p-1 h-10 align-top cursor-pointer transition-colors ${
                              ag ? "" : "hover:bg-primary/5"
                            }`}
                            onClick={() => handleCellClick(day, slot, prof.id)}
                          >
                            {loadingAg ? (
                              slot === "09:00" ? <Skeleton className="h-6 w-full" /> : null
                            ) : ag ? (
                              <div
                                className={`rounded px-1.5 py-1 border text-[10px] leading-tight ${
                                  STATUS_COLORS[ag.status] ?? "bg-blue-100 text-blue-800"
                                }`}
                              >
                                <div className="font-semibold truncate">{ag.clienteNome ?? "Cliente"}</div>
                                <div className="truncate opacity-80">{ag.servicoNome ?? ""}</div>
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
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded border ${STATUS_COLORS[k] ?? ""}`}>{v}</span>
        ))}
      </div>

      {/* Sheet de detalhes */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalhes do Agendamento</SheetTitle>
          </SheetHeader>
          {selectedAg && (
            <div className="mt-6 space-y-5">
              <div className="space-y-3">
                <DetailRow label="Cliente" value={selectedAg.clienteNome ?? "—"} />
                <DetailRow label="Serviço" value={selectedAg.servicoNome ?? "—"} />
                <DetailRow label="Profissional" value={selectedAg.profissionalNome ?? "—"} />
                <DetailRow
                  label="Data / Horário"
                  value={`${selectedAg.data ? format(parseISO(selectedAg.data), "dd/MM/yyyy", { locale: ptBR }) : "—"} às ${selectedAg.horario?.slice(0, 5) ?? "—"}`}
                />
                {selectedAg.duracaoMinutos && (
                  <DetailRow
                    label="Duração"
                    value={`${selectedAg.duracaoMinutos} min`}
                    icon={<Clock className="h-3.5 w-3.5" />}
                  />
                )}
                {selectedAg.valorServico && (
                  <DetailRow
                    label="Valor"
                    value={Number(selectedAg.valorServico).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  />
                )}
                {selectedAg.observacoes && (
                  <DetailRow label="Observações" value={selectedAg.observacoes} />
                )}
              </div>

              <div className="pt-4 border-t space-y-3">
                <p className="text-sm font-medium">Alterar status</p>
                <div className="grid grid-cols-1 gap-2">
                  {STATUS_OPTIONS.filter((s) => s !== selectedAg.status).map((s) => {
                    const icons: Record<string, React.ReactNode> = {
                      confirmado: <CheckCircle2 className="h-3.5 w-3.5" />,
                      concluido:  <CheckCircle2 className="h-3.5 w-3.5" />,
                      cancelado:  <XCircle className="h-3.5 w-3.5" />,
                      faltou:     <AlertCircle className="h-3.5 w-3.5" />,
                    };
                    return (
                      <Button
                        key={s}
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ id: selectedAg.id, status: s })}
                      >
                        {icons[s]}
                        Marcar como {STATUS_LABELS[s]}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <Badge
                  variant="outline"
                  className={`${STATUS_COLORS[selectedAg.status] ?? ""}`}
                >
                  Status atual: {STATUS_LABELS[selectedAg.status] ?? selectedAg.status}
                </Badge>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog novo agendamento */}
      <NovoAgendamentoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={tenantId}
        defaultDate={dialogDefaults.date}
        defaultHorario={dialogDefaults.horario}
        defaultProfissionalId={dialogDefaults.profissionalId}
        onSuccess={() => {
          refetch();
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

function DetailRow({
  label, value, icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium flex items-center gap-1.5">
        {icon} {value}
      </p>
    </div>
  );
}
