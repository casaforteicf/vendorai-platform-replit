import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListAgendamentos,
  getListAgendamentosQueryKey,
  useCreateAgendamento,
  useUpdateAgendamento,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  checkAgendamentoDisponibilidade,
  Agendamento,
  AgendamentoTipo,
  AgendamentoStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Briefcase,
  Wrench,
  Eye,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isToday,
  isSameDay,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<
  AgendamentoTipo,
  { label: string; icon: React.ReactNode; color: string }
> = {
  reuniao:    { label: "Reunião",    icon: <Users className="h-3.5 w-3.5" />,     color: "text-blue-500" },
  visita:     { label: "Visita",     icon: <Eye className="h-3.5 w-3.5" />,       color: "text-emerald-500" },
  consulta:   { label: "Consulta",   icon: <Briefcase className="h-3.5 w-3.5" />, color: "text-violet-500" },
  instalacao: { label: "Instalação", icon: <Wrench className="h-3.5 w-3.5" />,    color: "text-amber-500" },
};

const STATUS_CONFIG: Record<
  AgendamentoStatus,
  { label: string; className: string }
> = {
  agendado:   { label: "Agendado",   className: "border-blue-300 text-blue-600 bg-blue-50" },
  confirmado: { label: "Confirmado", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  concluido:  { label: "Concluído",  className: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelado:  { label: "Cancelado",  className: "bg-red-100 text-red-600 border-red-200" },
  no_show:    { label: "No-show",    className: "border-amber-300 text-amber-600 bg-amber-50" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

function fromLocalDateTimeInput(local: string) {
  return new Date(local).toISOString();
}

// ─── Quick status actions ─────────────────────────────────────────────────────

function StatusActions({
  ag,
  onUpdate,
}: {
  ag: Agendamento;
  onUpdate: (id: string, status: AgendamentoStatus) => void;
}) {
  const done = ag.status === "concluido" || ag.status === "cancelado";
  if (done) return null;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {ag.status !== "confirmado" && (
        <button
          title="Confirmar"
          onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.confirmado); }}
          className="p-1.5 rounded hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-colors"
          data-testid={`confirm-${ag.id}`}
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}
      <button
        title="Concluir"
        onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.concluido); }}
        className="p-1.5 rounded hover:bg-slate-100 text-muted-foreground hover:text-slate-500 transition-colors"
        data-testid={`conclude-${ag.id}`}
      >
        <CheckCircle2 className="h-4 w-4 opacity-50" />
      </button>
      <button
        title="No-show"
        onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.no_show); }}
        className="p-1.5 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors"
        data-testid={`noshow-${ag.id}`}
      >
        <AlertTriangle className="h-4 w-4" />
      </button>
      <button
        title="Cancelar"
        onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.cancelado); }}
        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
        data-testid={`cancel-${ag.id}`}
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Agendamento row ──────────────────────────────────────────────────────────

function AgendamentoRow({
  ag,
  leadName,
  onUpdate,
}: {
  ag: Agendamento;
  leadName: string | undefined;
  onUpdate: (id: string, status: AgendamentoStatus) => void;
}) {
  const tipo = TIPO_CONFIG[ag.tipo];
  const statusCfg = STATUS_CONFIG[ag.status];
  const isDone = ag.status === "concluido" || ag.status === "cancelado";
  const colorBar = tipo.color.replace("text-", "bg-");

  return (
    <div
      data-testid={`ag-row-${ag.id}`}
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors ${isDone ? "opacity-50" : ""}`}
    >
      {/* Time */}
      <div className="w-11 shrink-0 text-center pt-0.5">
        <p className="text-xs font-bold text-foreground leading-tight">{formatHour(ag.dataHoraInicio)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatHour(ag.dataHoraFim)}</p>
      </div>

      {/* Color bar */}
      <div className={`w-0.5 self-stretch rounded-full shrink-0 ${colorBar}`} />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-semibold ${tipo.color}`}>
            {tipo.icon}
            {tipo.label}
          </span>
          <Badge className={`text-[10px] px-2 py-0 h-4 border font-medium ${statusCfg.className}`}>
            {statusCfg.label}
          </Badge>
        </div>
        <p className="text-sm font-medium leading-tight line-clamp-1">{ag.titulo}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {leadName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              {leadName}
            </span>
          )}
          {ag.local && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[160px]">{ag.local}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {Math.round(
              (parseISO(ag.dataHoraFim).getTime() - parseISO(ag.dataHoraInicio).getTime()) / 60000
            )} min
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <StatusActions ag={ag} onUpdate={onUpdate} />
    </div>
  );
}

// ─── Week day button ──────────────────────────────────────────────────────────

function WeekDayBtn({
  date,
  count,
  selected,
  onClick,
}: {
  date: Date;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  const today = isToday(date);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-2 px-1 rounded-lg transition-colors flex-1 min-w-0 ${
        selected
          ? "bg-primary text-primary-foreground"
          : today
          ? "bg-primary/10 text-primary"
          : "hover:bg-muted text-foreground"
      }`}
      data-testid={`week-day-${format(date, "yyyy-MM-dd")}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {format(date, "EEE", { locale: ptBR })}
      </span>
      <span className="text-sm font-bold leading-tight mt-0.5">{format(date, "d")}</span>
      {count > 0 && (
        <span
          className={`text-[9px] font-bold mt-1 rounded-full w-4 h-4 flex items-center justify-center ${
            selected ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  titulo: z.string().min(2, "Título obrigatório"),
  tipo: z.string().min(1),
  leadId: z.string().min(1, "Selecione um lead"),
  dataHoraInicio: z.string().min(1, "Obrigatório"),
  dataHoraFim: z.string().min(1, "Obrigatório"),
  local: z.string().optional().or(z.literal("")),
  responsavelId: z.string().optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});
type CreateForm = z.infer<typeof createSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Agenda() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<CreateForm | null>(null);
  const [conflictMsg, setConflictMsg] = useState("");

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const qKey = getListAgendamentosQueryKey(tenantId, {
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  });

  const { data: agendamentos = [], isLoading } = useListAgendamentos(
    tenantId,
    { from: weekStart.toISOString(), to: weekEnd.toISOString() },
    {
      query: {
        enabled: !!tenantId,
        queryKey: qKey,
      },
    }
  );

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantLeadsQueryKey(tenantId),
    },
  });

  const leadMap = new Map(leads.map((l) => [l.id, l.nome]));
  const createAg = useCreateAgendamento();
  const updateAg = useUpdateAgendamento();

  // Group + sort by day
  const byDay = new Map<string, Agendamento[]>();
  for (const ag of agendamentos) {
    const key = ag.dataHoraInicio.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(ag);
  }
  for (const [k, list] of byDay) {
    byDay.set(k, list.sort((a, b) => a.dataHoraInicio.localeCompare(b.dataHoraInicio)));
  }

  const selectedKey = format(selectedDay, "yyyy-MM-dd");
  const selectedAgs = byDay.get(selectedKey) ?? [];

  function countDay(d: Date) {
    return byDay.get(format(d, "yyyy-MM-dd"))?.length ?? 0;
  }

  // ── Status update ──

  function handleUpdate(id: string, status: AgendamentoStatus) {
    updateAg.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: "Status atualizado." });
          queryClient.invalidateQueries({ queryKey: qKey });
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      }
    );
  }

  // ── Create form ──

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      titulo: "",
      tipo: "reuniao",
      leadId: "",
      dataHoraInicio: format(selectedDay, "yyyy-MM-dd") + "T09:00",
      dataHoraFim: format(selectedDay, "yyyy-MM-dd") + "T10:00",
      local: "",
      responsavelId: "",
      observacoes: "",
    },
  });

  async function onSubmit(values: CreateForm) {
    // Availability check only when responsavelId is provided
    if (values.responsavelId) {
      try {
        const result = await checkAgendamentoDisponibilidade(tenantId, {
          responsavelId: values.responsavelId,
          from: fromLocalDateTimeInput(values.dataHoraInicio),
          to: fromLocalDateTimeInput(values.dataHoraFim),
        });
        if (!result.disponivel && result.conflitos.length > 0) {
          setConflictMsg(
            result.conflitos
              .map((c) => `• ${c.titulo} (${formatHour(c.dataHoraInicio)}–${formatHour(c.dataHoraFim)})`)
              .join("\n")
          );
          setPendingCreate(values);
          return;
        }
      } catch {
        toast({
          title: "Não foi possível verificar disponibilidade",
          description: "O agendamento será criado mesmo assim.",
        });
      }
    }
    doCreate(values);
  }

  function doCreate(values: CreateForm) {
    createAg.mutate(
      {
        data: {
          tenantId,
          titulo: values.titulo,
          tipo: values.tipo as AgendamentoTipo,
          leadId: values.leadId,
          dataHoraInicio: fromLocalDateTimeInput(values.dataHoraInicio),
          dataHoraFim: fromLocalDateTimeInput(values.dataHoraFim),
          local: values.local || undefined,
          responsavelId: values.responsavelId || undefined,
          observacoes: values.observacoes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Agendamento criado." });
          queryClient.invalidateQueries({ queryKey: qKey });
          setIsCreateOpen(false);
          setPendingCreate(null);
          form.reset();
        },
        onError: () => toast({ title: "Erro ao criar agendamento", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="flex flex-col space-y-5">
      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {agendamentos.length} agendamento{agendamentos.length !== 1 ? "s" : ""} esta semana
          </p>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(v) => {
            setIsCreateOpen(v);
            if (v) {
              form.reset({
                titulo: "",
                tipo: "reuniao",
                leadId: leads[0]?.id ?? "",
                dataHoraInicio: format(selectedDay, "yyyy-MM-dd") + "T09:00",
                dataHoraFim: format(selectedDay, "yyyy-MM-dd") + "T10:00",
                local: "",
                responsavelId: "",
                observacoes: "",
              });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-novo-agendamento">
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Agendamento</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="titulo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input data-testid="input-titulo" placeholder="Ex: Reunião de apresentação" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="tipo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tipo">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(Object.keys(TIPO_CONFIG) as AgendamentoTipo[]).map((v) => (
                              <SelectItem key={v} value={v}>
                                {TIPO_CONFIG[v].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="leadId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead *</FormLabel>
                        {leads.length > 0 ? (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-lead">
                                <SelectValue placeholder="Selecionar..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {leads.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <FormControl>
                            <Input data-testid="input-leadId" placeholder="ID do lead" {...field} />
                          </FormControl>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="dataHoraInicio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Início *</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" data-testid="input-inicio" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dataHoraFim"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fim *</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" data-testid="input-fim" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="local"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Local</FormLabel>
                      <FormControl>
                        <Input data-testid="input-local" placeholder="Endereço ou link de reunião" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsavelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Responsável{" "}
                        <span className="text-[11px] text-muted-foreground font-normal">
                          (ID — verifica disponibilidade)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input data-testid="input-responsavel" placeholder="UUID do responsável" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Input data-testid="input-obs" placeholder="Notas adicionais" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createAg.isPending}
                  data-testid="button-submit-agendamento"
                >
                  {createAg.isPending ? "Criando..." : "Criar Agendamento"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Week strip ── */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            data-testid="week-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold flex-1 text-center">
            {format(weekStart, "d 'de' MMM", { locale: ptBR })}
            {" – "}
            {format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            data-testid="week-next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1">
          {weekDays.map((d) => (
            <WeekDayBtn
              key={d.toISOString()}
              date={d}
              count={countDay(d)}
              selected={isSameDay(d, selectedDay)}
              onClick={() => setSelectedDay(d)}
            />
          ))}
        </div>
      </div>

      {/* ── Day list ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold capitalize">
            {isToday(selectedDay)
              ? "Hoje"
              : format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
          <span className="text-xs text-muted-foreground">
            — {selectedAgs.length} agendamento{selectedAgs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : selectedAgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Calendar className="h-10 w-10 opacity-20" />
            <p className="text-sm">Nenhum agendamento neste dia</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Criar agendamento
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedAgs.map((ag) => (
              <AgendamentoRow
                key={ag.id}
                ag={ag}
                leadName={leadMap.get(ag.leadId)}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Conflict dialog ── */}
      <AlertDialog open={!!pendingCreate} onOpenChange={(v) => { if (!v) setPendingCreate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Conflito de agenda detectado
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>O responsável já tem agendamentos neste horário:</p>
                <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap font-mono leading-relaxed">
                  {conflictMsg}
                </pre>
                <p className="text-muted-foreground">Deseja criar o agendamento mesmo assim?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCreate(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { if (pendingCreate) doCreate(pendingCreate); }}
              data-testid="button-confirm-conflict"
            >
              Criar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
