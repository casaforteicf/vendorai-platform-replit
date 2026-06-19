import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListAgendamentos,
  getListAgendamentosQueryKey,
  useCreateAgendamento,
  useUpdateAgendamento,
  useListTenantLeads,
  checkAgendamentoDisponibilidade,
  useListAgendas,
  getListAgendasQueryKey,
  useCreateAgenda,
  useUpdateAgenda,
  useDeleteAgenda,
  getAgendaGoogleAuthUrl,
  useDisconnectAgendaGoogle,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  Agendamento,
  AgendamentoTipo,
  AgendamentoStatus,
  Agenda,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Settings2,
  Trash2,
  Pencil,
  CalendarCheck,
  CalendarX,
  Loader2,
  Video,
  Copy,
  MoreVertical,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

const AGENDA_COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B",
  "#EF4444", "#EC4899", "#06B6D4", "#F97316",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

function fromLocalDateTimeInput(local: string) {
  // local is "YYYY-MM-DDTHH:mm" from <input type="datetime-local">
  // Preserve the wall-clock time; treat as UTC so the server stores exactly
  // what the user picked without browser-TZ shifts.
  const [date, time] = local.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}

// ─── Quick status actions — desktop inline ────────────────────────────────────

function StatusActionsDesktop({
  ag,
  onUpdate,
}: {
  ag: Agendamento;
  onUpdate: (id: string, status: AgendamentoStatus) => void;
}) {
  const done = ag.status === "concluido" || ag.status === "cancelado";
  if (done) return null;

  return (
    <div className="hidden md:flex items-center gap-0.5 shrink-0">
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

// ─── Quick status actions — mobile dropdown ───────────────────────────────────

function StatusActionsMobile({
  ag,
  onUpdate,
}: {
  ag: Agendamento;
  onUpdate: (id: string, status: AgendamentoStatus) => void;
}) {
  const done = ag.status === "concluido" || ag.status === "cancelado";
  if (done) return null;

  return (
    <div className="md:hidden shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {ag.status !== "confirmado" && (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.confirmado); }}
              data-testid={`confirm-${ag.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
              Confirmar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.concluido); }}
            data-testid={`conclude-${ag.id}`}
          >
            <CheckCircle2 className="h-4 w-4 mr-2 text-slate-500 opacity-60" />
            Concluir
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.no_show); }}
            data-testid={`noshow-${ag.id}`}
          >
            <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
            No-show
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => { e.stopPropagation(); onUpdate(ag.id, AgendamentoStatus.cancelado); }}
            data-testid={`cancel-${ag.id}`}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancelar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Agendamento card ─────────────────────────────────────────────────────────

function AgendamentoRow({
  ag,
  leadName,
  agendaColor,
  onUpdate,
}: {
  ag: Agendamento;
  leadName: string | undefined;
  agendaColor?: string;
  onUpdate: (id: string, status: AgendamentoStatus) => void;
}) {
  const tipo = TIPO_CONFIG[ag.tipo];
  const statusCfg = STATUS_CONFIG[ag.status];
  const isDone = ag.status === "concluido" || ag.status === "cancelado";
  const colorBar = agendaColor ?? "#3B82F6";

  return (
    <div
      data-testid={`ag-row-${ag.id}`}
      className={`flex items-start gap-3 px-3 py-3 md:px-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors ${isDone ? "opacity-50" : ""}`}
    >
      {/* Time column */}
      <div className="w-10 shrink-0 text-center pt-0.5">
        <p className="text-xs font-bold text-foreground leading-tight">{formatHour(ag.dataHoraInicio)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatHour(ag.dataHoraFim)}</p>
      </div>

      {/* Color bar */}
      <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: colorBar }} />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Title row */}
        <p className="text-sm font-semibold leading-tight">{ag.titulo}</p>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium ${tipo.color}`}>
            {tipo.icon}
            <span>{tipo.label}</span>
          </span>
          <Badge className={`text-[10px] px-1.5 py-0 h-4 border font-medium ${statusCfg.className}`}>
            {statusCfg.label}
          </Badge>
          {ag.googleEventId && (
            <span title="Sincronizado com Google Calendar">
              <CalendarCheck className="h-3 w-3 text-green-500" />
            </span>
          )}
          {ag.meetLink && (
            <span className="text-[10px] text-blue-600 flex items-center gap-0.5 font-medium">
              <Video className="h-3 w-3" />
              <span>Meet</span>
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {leadName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[200px] md:max-w-[280px]">{leadName}</span>
            </span>
          )}
          {ag.local && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[180px] md:max-w-[260px]">{ag.local}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {Math.round(
              (parseISO(ag.dataHoraFim).getTime() - parseISO(ag.dataHoraInicio).getTime()) / 60000
            )} min
          </span>
        </div>

        {/* Meet link */}
        {ag.meetLink && (
          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-border/50">
            <a
              href={ag.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium transition-colors"
            >
              <Video className="h-3 w-3 shrink-0" />
              Entrar no Google Meet
            </a>
            <button
              title="Copiar link"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(ag.meetLink!);
              }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-0.5"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <StatusActionsDesktop ag={ag} onUpdate={onUpdate} />
      <StatusActionsMobile ag={ag} onUpdate={onUpdate} />
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
      className={`flex flex-col items-center py-2 px-1 rounded-xl transition-colors flex-1 min-w-0 ${
        selected
          ? "bg-primary text-primary-foreground shadow-sm"
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

// ─── Agenda sidebar item (desktop) ────────────────────────────────────────────

function AgendaSidebarItem({
  agenda,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onConnectGoogle,
  onDisconnectGoogle,
  isGoogleLoading,
}: {
  agenda: Agenda;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  isGoogleLoading: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group transition-colors ${
        selected ? "bg-primary/10" : "hover:bg-muted"
      }`}
      onClick={onSelect}
      data-testid={`agenda-item-${agenda.id}`}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: agenda.cor }}
      />
      <span className={`flex-1 text-sm truncate ${selected ? "font-semibold text-primary" : ""}`}>
        {agenda.nome}
      </span>
      {agenda.googleCalendarId && (
        <span title={agenda.googleEmail ? `Google: ${agenda.googleEmail}` : "Google Calendar conectado"}>
          <CalendarCheck className="h-3 w-3 text-green-500 shrink-0" />
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-0.5 rounded hover:bg-muted-foreground/10 transition-opacity"
            onClick={(e) => e.stopPropagation()}
            data-testid={`agenda-settings-${agenda.id}`}
          >
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Renomear / cor
          </DropdownMenuItem>
          {agenda.googleCalendarId ? (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDisconnectGoogle(); }}
              disabled={isGoogleLoading}
            >
              <CalendarX className="h-3.5 w-3.5 mr-2 text-red-500" />
              Desconectar Google
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onConnectGoogle(); }}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              ) : (
                <CalendarCheck className="h-3.5 w-3.5 mr-2 text-green-600" />
              )}
              Conectar Google Calendar
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Excluir agenda
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Agenda chip (mobile horizontal filter) ───────────────────────────────────

function AgendaChip({
  label,
  color,
  selected,
  hasGoogle,
  onClick,
}: {
  label: string;
  color?: string;
  selected: boolean;
  hasGoogle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all shrink-0 ${
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border hover:border-primary/40"
      }`}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: selected ? "white" : color }}
        />
      )}
      {label}
      {hasGoogle && !selected && <CalendarCheck className="h-2.5 w-2.5 text-green-500 ml-0.5" />}
    </button>
  );
}

// ─── Form schemas ─────────────────────────────────────────────────────────────

const createFormSchema = z.object({
  titulo: z.string().min(1, "Título obrigatório"),
  tipo: z.string().min(1),
  leadId: z.string().min(1, "Lead obrigatório"),
  agendaId: z.string().optional(),
  dataHoraInicio: z.string().min(1),
  dataHoraFim: z.string().min(1),
  local: z.string().optional(),
  responsavelId: z.string().optional(),
  observacoes: z.string().optional(),
  gerarMeet: z.boolean().optional(),
});
type CreateForm = z.infer<typeof createFormSchema>;

const agendaFormSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  cor: z.string().min(1),
});
type AgendaForm = z.infer<typeof agendaFormSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const [selectedDay, setSelectedDay] = useState(new Date());
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null);

  // Agendamento create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<CreateForm | null>(null);
  const [conflictMsg, setConflictMsg] = useState("");

  // Agenda management dialogs
  const [isNewAgendaOpen, setIsNewAgendaOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Agenda | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agenda | null>(null);
  const [googleLoadingId, setGoogleLoadingId] = useState<string | null>(null);

  // Handle Google OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleConnected")) {
      toast({ title: "Google Calendar conectado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("googleError")) {
      const err = params.get("googleError");
      toast({
        title: "Não foi possível conectar ao Google Calendar",
        description: err === "access_denied" ? "Acesso negado." : "Tente novamente.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const qKey = getListAgendamentosQueryKey(tenantId, selectedAgendaId ? { agendaId: selectedAgendaId } : undefined);

  const { data: agendamentos = [], isLoading } = useListAgendamentos(
    tenantId,
    selectedAgendaId ? { agendaId: selectedAgendaId } : undefined
  );

  const { data: leads = [] } = useListTenantLeads(tenantId);
  const { data: agendas = [] } = useListAgendas(tenantId);
  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) },
  });

  const createAg = useCreateAgendamento();
  const updateAg = useUpdateAgendamento();
  const createAgendaMut = useCreateAgenda();
  const updateAgendaMut = useUpdateAgenda();
  const deleteAgendaMut = useDeleteAgenda();
  const disconnectGoogleMut = useDisconnectAgendaGoogle();

  const leadMap = new Map(leads.map((l) => [l.id, l.nome]));
  const agendaMap = new Map(agendas.map((a) => [a.id, a]));

  const selectedAgs = agendamentos.filter((a) =>
    isSameDay(parseISO(a.dataHoraInicio), selectedDay)
  );
  const countDay = (d: Date) =>
    agendamentos.filter((a) => isSameDay(parseISO(a.dataHoraInicio), d)).length;

  function handleUpdate(id: string, status: AgendamentoStatus) {
    updateAg.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: qKey });
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      }
    );
  }

  const form = useForm<CreateForm>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      titulo: "",
      tipo: "reuniao",
      leadId: "",
      agendaId: selectedAgendaId ?? "",
      dataHoraInicio: format(selectedDay, "yyyy-MM-dd") + "T09:00",
      dataHoraFim: format(selectedDay, "yyyy-MM-dd") + "T10:00",
      local: "",
      responsavelId: "",
      observacoes: "",
      gerarMeet: false,
    },
  });

  async function onSubmit(values: CreateForm) {
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
          agendaId: values.agendaId || undefined,
          dataHoraInicio: fromLocalDateTimeInput(values.dataHoraInicio),
          dataHoraFim: fromLocalDateTimeInput(values.dataHoraFim),
          local: values.local || undefined,
          responsavelId: values.responsavelId || undefined,
          observacoes: values.observacoes || undefined,
          gerarMeet: values.gerarMeet ?? false,
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
        onError: (err: unknown) => {
          const axiosErr = err as {
            response?: { data?: { error?: string; issues?: unknown[] }; status?: number };
            message?: string;
          };
          const msg = axiosErr.response?.data?.error ?? axiosErr.message;
          const status = axiosErr.response?.status;
          const issues = axiosErr.response?.data?.issues;
          const description = issues
            ? issues.map((i) => (typeof i === "string" ? i : (i as { message?: string }).message ?? JSON.stringify(i))).join("\n")
            : msg;
          toast({
            title: status === 422 ? "Dados inválidos" : "Erro ao criar agendamento",
            description: description || "Verifique os campos e tente novamente.",
            variant: "destructive",
          });
        },
      }
    );
  }

  const agendaForm = useForm<AgendaForm>({
    resolver: zodResolver(agendaFormSchema),
    defaultValues: { nome: "", cor: "#3B82F6" },
  });

  function openNewAgenda() {
    agendaForm.reset({ nome: "", cor: "#3B82F6" });
    setEditTarget(null);
    setIsNewAgendaOpen(true);
  }

  function openEditAgenda(a: Agenda) {
    agendaForm.reset({ nome: a.nome, cor: a.cor });
    setEditTarget(a);
    setIsNewAgendaOpen(true);
  }

  function onAgendaSubmit(values: AgendaForm) {
    if (editTarget) {
      updateAgendaMut.mutate(
        { id: editTarget.id, data: { nome: values.nome, cor: values.cor } },
        {
          onSuccess: () => {
            toast({ title: "Agenda atualizada." });
            queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) });
            setIsNewAgendaOpen(false);
            setEditTarget(null);
          },
          onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
        }
      );
    } else {
      createAgendaMut.mutate(
        { tenantId, data: { tenantId, nome: values.nome, cor: values.cor } },
        {
          onSuccess: () => {
            toast({ title: "Agenda criada." });
            queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) });
            setIsNewAgendaOpen(false);
          },
          onError: () => toast({ title: "Erro ao criar agenda", variant: "destructive" }),
        }
      );
    }
  }

  function confirmDeleteAgenda() {
    if (!deleteTarget) return;
    deleteAgendaMut.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Agenda excluída." });
          if (selectedAgendaId === deleteTarget.id) setSelectedAgendaId(null);
          queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) });
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
      }
    );
  }

  async function handleConnectGoogle(agenda: Agenda) {
    setGoogleLoadingId(agenda.id);
    try {
      const { url } = await getAgendaGoogleAuthUrl(agenda.id);
      window.location.href = url;
    } catch {
      toast({ title: "Erro ao obter URL do Google", variant: "destructive" });
    } finally {
      setGoogleLoadingId(null);
    }
  }

  function handleDisconnectGoogle(agenda: Agenda) {
    disconnectGoogleMut.mutate(
      { id: agenda.id },
      {
        onSuccess: () => {
          toast({ title: "Google Calendar desconectado." });
          queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) });
        },
        onError: () => toast({ title: "Erro ao desconectar", variant: "destructive" }),
      }
    );
  }

  // ── Create dialog trigger shared between header button and FAB ──────────────
  function openCreate() {
    const safeLeadId = leads && leads.length > 0 ? leads[0].id : "";
    const safeAgendaId = selectedAgendaId ?? (agendas && agendas.length > 0 ? agendas[0].id : "");
    form.reset({
      titulo: "",
      tipo: "reuniao",
      leadId: safeLeadId,
      agendaId: safeAgendaId,
      dataHoraInicio: format(selectedDay, "yyyy-MM-dd") + "T09:00",
      dataHoraFim: format(selectedDay, "yyyy-MM-dd") + "T10:00",
      local: "",
      responsavelId: "",
      observacoes: "",
      gerarMeet: false,
    });
    setIsCreateOpen(true);
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-5 h-full">

      {/* ── Agendas sidebar — desktop only ── */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agendas</span>
          <button
            onClick={openNewAgenda}
            className="p-0.5 rounded hover:bg-muted transition-colors"
            title="Nova agenda"
            data-testid="button-nova-agenda"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
            selectedAgendaId === null ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"
          }`}
          onClick={() => setSelectedAgendaId(null)}
          data-testid="agenda-filter-todas"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted-foreground/30" />
          <span className="text-sm">Todas</span>
        </div>

        {agendas.map((a) => (
          <AgendaSidebarItem
            key={a.id}
            agenda={a}
            selected={selectedAgendaId === a.id}
            onSelect={() => setSelectedAgendaId(a.id)}
            onEdit={() => openEditAgenda(a)}
            onDelete={() => setDeleteTarget(a)}
            onConnectGoogle={() => handleConnectGoogle(a)}
            onDisconnectGoogle={() => handleDisconnectGoogle(a)}
            isGoogleLoading={googleLoadingId === a.id}
          />
        ))}

        {agendas.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-2">
            Nenhuma agenda. Crie uma acima.
          </p>
        )}
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">
              {selectedAgendaId
                ? (agendaMap.get(selectedAgendaId)?.nome ?? "Agenda")
                : "Agenda"}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              {agendamentos.length} agendamento{agendamentos.length !== 1 ? "s" : ""} esta semana
            </p>
          </div>

          {/* Desktop: full button */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                className="hidden md:flex"
                onClick={openCreate}
                data-testid="button-novo-agendamento"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Agendamento</DialogTitle>
              </DialogHeader>
              <AgendamentoForm
                form={form}
                onSubmit={onSubmit}
                leads={leads}
                agendas={agendas}
                tenantUsers={tenantUsers}
                isPending={createAg.isPending}
              />
            </DialogContent>
          </Dialog>

          {/* Mobile: icon button */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="icon"
                className="md:hidden shrink-0 rounded-xl"
                onClick={openCreate}
                data-testid="button-novo-agendamento-mobile"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Agendamento</DialogTitle>
              </DialogHeader>
              <AgendamentoForm
                form={form}
                onSubmit={onSubmit}
                leads={leads}
                agendas={agendas}
                tenantUsers={tenantUsers}
                isPending={createAg.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Agenda filter chips — mobile only ── */}
        <div className="flex md:hidden gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          <AgendaChip
            label="Todas"
            selected={selectedAgendaId === null}
            onClick={() => setSelectedAgendaId(null)}
          />
          {agendas.map((a) => (
            <AgendaChip
              key={a.id}
              label={a.nome}
              color={a.cor}
              selected={selectedAgendaId === a.id}
              hasGoogle={!!a.googleCalendarId}
              onClick={() => setSelectedAgendaId(a.id)}
            />
          ))}
          <button
            onClick={openNewAgenda}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors shrink-0"
            data-testid="button-nova-agenda"
          >
            <Plus className="h-3 w-3" />
            Nova
          </button>
          {/* Mobile: conectar Google quando agenda selecionada não tem Google */}
          {selectedAgendaId && !agendaMap.get(selectedAgendaId)?.googleCalendarId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const a = agendaMap.get(selectedAgendaId);
                if (a) handleConnectGoogle(a);
              }}
              disabled={googleLoadingId === selectedAgendaId}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors shrink-0 disabled:opacity-50"
            >
              {googleLoadingId === selectedAgendaId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CalendarCheck className="h-3 w-3" />
              )}
              Conectar Google
            </button>
          )}
        </div>

        {/* ── Week strip ── */}
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setWeekStart((w) => subWeeks(w, 1))}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              data-testid="week-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs md:text-sm font-semibold flex-1 text-center">
              {format(weekStart, "d 'de' MMM", { locale: ptBR })}
              {" – "}
              {format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}
            </span>
            <button
              onClick={() => setWeekStart((w) => addWeeks(w, 1))}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              data-testid="week-next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1">
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
                <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : selectedAgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <Calendar className="h-10 w-10 opacity-20" />
              <p className="text-sm">Nenhum agendamento neste dia</p>
              <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
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
                  agendaColor={ag.agendaId ? agendaMap.get(ag.agendaId)?.cor : undefined}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          )}
        </div>
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

      {/* ── Create / Edit Agenda dialog ── */}
      <Dialog open={isNewAgendaOpen} onOpenChange={setIsNewAgendaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Agenda" : "Nova Agenda"}</DialogTitle>
          </DialogHeader>
          <Form {...agendaForm}>
            <form onSubmit={agendaForm.handleSubmit(onAgendaSubmit)} className="space-y-4">
              <FormField
                control={agendaForm.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Agenda Marcos" data-testid="input-agenda-nome" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={agendaForm.control}
                name="cor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor</FormLabel>
                    <div className="flex gap-2 flex-wrap">
                      {AGENDA_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => field.onChange(c)}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${
                            field.value === c ? "border-foreground scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: c }}
                          data-testid={`color-${c}`}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={createAgendaMut.isPending || updateAgendaMut.isPending}
                data-testid="button-submit-agenda"
              >
                {editTarget ? "Salvar" : "Criar Agenda"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Agenda confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agenda "{deleteTarget?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os agendamentos associados não serão excluídos, mas perderão a referência a esta agenda.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={confirmDeleteAgenda}
              disabled={deleteAgendaMut.isPending}
              data-testid="button-confirm-delete-agenda"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Agendamento form (shared between desktop + mobile dialogs) ───────────────

function AgendamentoForm({
  form,
  onSubmit,
  leads,
  agendas,
  tenantUsers,
  isPending,
}: {
  form: ReturnType<typeof useForm<CreateForm>>;
  onSubmit: (values: CreateForm) => void;
  leads: { id: string; nome: string }[];
  agendas: Agenda[];
  tenantUsers: { id: string; name: string }[];
  isPending: boolean;
}) {
  return (
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        {agendas.length > 0 && (
          <FormField
            control={form.control}
            name="agendaId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agenda</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-agenda">
                      <SelectValue placeholder="Selecionar agenda..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {agendas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: a.cor }}
                          />
                          {a.nome}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <FormLabel>Responsável</FormLabel>
              <FormControl>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ""}
                >
                  <SelectTrigger data-testid="select-responsavel">
                    <SelectValue placeholder="Selecionar responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

        {agendas.some((a) => a.googleCalendarId) && (
          <FormField
            control={form.control}
            name="gerarMeet"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between rounded-lg border border-border p-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium leading-tight">Gerar link Google Meet</p>
                      <p className="text-[11px] text-muted-foreground">
                        Cria reunião e envia o link para o cliente
                      </p>
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      data-testid="switch-gerar-meet"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
          data-testid="button-submit-agendamento"
        >
          {isPending ? "Criando..." : "Criar Agendamento"}
        </Button>
      </form>
    </Form>
  );
}
