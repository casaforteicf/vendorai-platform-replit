import { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  CalendarDays,
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
  Bell,
  BellRing,
  CircleAlert,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isToday,
  isSameDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const TIPO_CONFIG: Record<AgendamentoTipo, { label: string; icon: React.ReactNode; color: string }> = {
  reuniao: { label: "Reunião", icon: <Users className="h-3.5 w-3.5" />, color: "text-blue-500" },
  visita: { label: "Visita", icon: <Eye className="h-3.5 w-3.5" />, color: "text-emerald-500" },
  consulta: { label: "Consulta", icon: <Briefcase className="h-3.5 w-3.5" />, color: "text-violet-500" },
  instalacao: { label: "Instalação", icon: <Wrench className="h-3.5 w-3.5" />, color: "text-amber-500" },
};

const STATUS_CONFIG: Record<AgendamentoStatus, { label: string; className: string }> = {
  agendado: { label: "Agendado", className: "border-blue-300 text-blue-600 bg-blue-50" },
  confirmado: { label: "Confirmado", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  concluido: { label: "Concluído", className: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-600 border-red-200" },
  no_show: { label: "No-show", className: "border-amber-300 text-amber-600 bg-amber-50" },
};

const AGENDA_COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#F97316"];
const TIMELINE_START = 7;
const TIMELINE_END = 22;
const HOUR_HEIGHT = 64;
const TIMELINE_HOURS = Array.from({ length: TIMELINE_END - TIMELINE_START }, (_, i) => TIMELINE_START + i);

function formatHour(iso: string) { return format(parseISO(iso), "HH:mm"); }

function fromLocalDateTimeInput(local: string) {
  const [date, time] = local.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}

function toInputValue(date: Date) { return format(date, "yyyy-MM-dd'T'HH:mm"); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function minutesFromTimelineStart(iso: string) { const d = parseISO(iso); return (d.getHours() - TIMELINE_START) * 60 + d.getMinutes(); }
function isOpenStatus(status: AgendamentoStatus) { return status === "agendado" || status === "confirmado"; }

function eventStyle(ag: Agendamento) {
  const start = minutesFromTimelineStart(ag.dataHoraInicio);
  const end = minutesFromTimelineStart(ag.dataHoraFim);
  const top = clamp(start, 0, (TIMELINE_END - TIMELINE_START) * 60) / 60 * HOUR_HEIGHT;
  const duration = Math.max(30, end - start);
  const height = Math.max(36, duration / 60 * HOUR_HEIGHT - 4);
  return { top, height };
}

function AgendaSidebarItem({ agenda, selected, onSelect, onEdit, onDelete, onConnectGoogle, onDisconnectGoogle, isGoogleLoading }: {
  agenda: Agenda; selected: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void;
  onConnectGoogle: () => void; onDisconnectGoogle: () => void; isGoogleLoading: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${selected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`} onClick={onSelect}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: agenda.cor }} />
      <span className={`flex-1 text-sm truncate ${selected ? "font-semibold" : ""}`}>{agenda.nome}</span>
      {agenda.googleCalendarId && <CalendarCheck className="h-3.5 w-3.5 text-green-500" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 rounded-md hover:bg-muted-foreground/10" onClick={(e) => e.stopPropagation()} aria-label={`Configurar ${agenda.nome}`}>
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-2" />Renomear / cor</DropdownMenuItem>
          {agenda.googleCalendarId ? (
            <DropdownMenuItem onClick={onDisconnectGoogle} disabled={isGoogleLoading}><CalendarX className="h-3.5 w-3.5 mr-2 text-red-500" />Desconectar Google</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onConnectGoogle} disabled={isGoogleLoading}>
              {isGoogleLoading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5 mr-2 text-green-600" />}
              Conectar Google Calendar
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir agenda</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AgendaChip({ label, color, selected, hasGoogle, onClick }: { label: string; color?: string; selected: boolean; hasGoogle?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all shrink-0 ${selected ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
      {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selected ? "white" : color }} />}
      {label}{hasGoogle && !selected && <CalendarCheck className="h-2.5 w-2.5 text-green-500" />}
    </button>
  );
}

type CalendarView = "day" | "week" | "month";
function ViewPicker({ view, onChange }: { view: CalendarView; onChange: (v: CalendarView) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-muted/40 p-0.5">
      {[["day", "Dia"], ["week", "Semana"], ["month", "Mês"]].map(([value, label]) => (
        <button key={value} onClick={() => onChange(value as CalendarView)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
      ))}
    </div>
  );
}

function TimelineEvent({ ag, leadName, color, compact, hasAlert, onOpen }: { ag: Agendamento; leadName?: string; color: string; compact?: boolean; hasAlert?: boolean; onOpen: (ag: Agendamento) => void }) {
  const statusCfg = STATUS_CONFIG[ag.status];
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpen(ag); }} className="absolute left-1 right-1 rounded-lg border bg-card shadow-sm text-left overflow-hidden hover:shadow-md hover:-translate-y-px transition-all z-10" style={{ ...eventStyle(ag), borderLeftWidth: 4, borderLeftColor: color }}>
      <div className={`px-2 py-1.5 ${compact ? "space-y-0" : "space-y-1"}`}>
        <div className="flex items-start justify-between gap-1"><span className="text-[11px] font-semibold truncate">{ag.titulo}</span>{hasAlert && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}</div>
        <div className="text-[10px] text-muted-foreground">{formatHour(ag.dataHoraInicio)}–{formatHour(ag.dataHoraFim)}</div>
        {!compact && <>{leadName && <div className="text-[10px] truncate">{leadName}</div>}<Badge className={`h-4 px-1.5 py-0 text-[9px] border ${statusCfg.className}`}>{statusCfg.label}</Badge></>}
      </div>
    </button>
  );
}

function DayTimeline({ day, events, leadMap, agendaMap, alertIds, onCreateAt, onOpen }: {
  day: Date; events: Agendamento[]; leadMap: Map<string, string>; agendaMap: Map<string, Agenda>; alertIds: Set<string>; onCreateAt: (date: Date, hour: number) => void; onOpen: (ag: Agendamento) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div><p className="text-sm font-semibold capitalize">{isToday(day) ? "Hoje" : format(day, "EEEE", { locale: ptBR })}</p><p className="text-xs text-muted-foreground">{format(day, "d 'de' MMMM yyyy", { locale: ptBR })}</p></div>
        <span className="text-xs text-muted-foreground">{events.length} compromisso{events.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="max-h-[640px] overflow-y-auto">
        <div className="relative grid grid-cols-[64px_1fr]" style={{ minHeight: TIMELINE_HOURS.length * HOUR_HEIGHT }}>
          <div className="border-r bg-muted/15">{TIMELINE_HOURS.map((hour) => <div key={hour} className="h-16 border-b px-2 pt-1 text-[10px] text-muted-foreground text-right">{String(hour).padStart(2, "0")}:00</div>)}</div>
          <div className="relative">
            {TIMELINE_HOURS.map((hour) => <button key={hour} type="button" onClick={() => onCreateAt(day, hour)} className="block h-16 w-full border-b hover:bg-primary/[0.035] text-left transition-colors" title={`Criar agendamento às ${hour}:00`} />)}
            {events.map((ag) => <TimelineEvent key={ag.id} ag={ag} leadName={leadMap.get(ag.leadId)} color={ag.agendaId ? agendaMap.get(ag.agendaId)?.cor ?? "#3B82F6" : "#3B82F6"} hasAlert={alertIds.has(ag.id)} onOpen={onOpen} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekTimeline({ weekDays, selectedDay, events, leadMap, agendaMap, alertIds, onSelectDay, onCreateAt, onOpen }: {
  weekDays: Date[]; selectedDay: Date; events: Agendamento[]; leadMap: Map<string, string>; agendaMap: Map<string, Agenda>; alertIds: Set<string>; onSelectDay: (d: Date) => void; onCreateAt: (date: Date, hour: number) => void; onOpen: (ag: Agendamento) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden"><div className="overflow-x-auto"><div className="min-w-[980px]">
      <div className="grid grid-cols-[64px_repeat(7,minmax(128px,1fr))] border-b bg-card sticky top-0 z-20"><div className="border-r" />
        {weekDays.map((day) => { const dayEvents = events.filter((ag) => isSameDay(parseISO(ag.dataHoraInicio), day)); const active = isSameDay(day, selectedDay); return (
          <button key={day.toISOString()} onClick={() => onSelectDay(day)} className={`py-2.5 border-r last:border-r-0 transition-colors ${active ? "bg-primary/8" : "hover:bg-muted/40"}`}>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</div>
            <div className={`mx-auto mt-1 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isToday(day) ? "bg-primary text-primary-foreground" : active ? "bg-primary/10 text-primary" : ""}`}>{format(day, "d")}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">{dayEvents.length || "—"}</div>
          </button> ); })}
      </div>
      <div className="grid grid-cols-[64px_repeat(7,minmax(128px,1fr))]" style={{ minHeight: TIMELINE_HOURS.length * HOUR_HEIGHT }}>
        <div className="border-r bg-muted/15">{TIMELINE_HOURS.map((hour) => <div key={hour} className="h-16 border-b px-2 pt-1 text-[10px] text-muted-foreground text-right">{String(hour).padStart(2, "0")}:00</div>)}</div>
        {weekDays.map((day) => { const dayEvents = events.filter((ag) => isSameDay(parseISO(ag.dataHoraInicio), day)); return (
          <div key={day.toISOString()} className="relative border-r last:border-r-0">
            {TIMELINE_HOURS.map((hour) => <button key={hour} type="button" onClick={() => onCreateAt(day, hour)} className="block h-16 w-full border-b hover:bg-primary/[0.035] transition-colors" title={`Criar agendamento às ${hour}:00`} />)}
            {dayEvents.map((ag) => <TimelineEvent key={ag.id} ag={ag} leadName={leadMap.get(ag.leadId)} color={ag.agendaId ? agendaMap.get(ag.agendaId)?.cor ?? "#3B82F6" : "#3B82F6"} compact hasAlert={alertIds.has(ag.id)} onOpen={onOpen} />)}
          </div> ); })}
      </div>
    </div></div></div>
  );
}

function MonthCalendar({ month, selectedDay, events, agendaMap, onSelectDay, onOpen }: { month: Date; selectedDay: Date; events: Agendamento[]; agendaMap: Map<string, Agenda>; onSelectDay: (d: Date) => void; onOpen: (ag: Agendamento) => void }) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 }); const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 }); const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  return (
    <div className="rounded-2xl border bg-card overflow-hidden"><div className="grid grid-cols-7 border-b bg-muted/20">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="py-2 text-center text-[10px] uppercase font-semibold text-muted-foreground">{d}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((day) => { const dayEvents = events.filter((ag) => isSameDay(parseISO(ag.dataHoraInicio), day)).sort((a, b) => parseISO(a.dataHoraInicio).getTime() - parseISO(b.dataHoraInicio).getTime()); return (
        <div key={day.toISOString()} className={`min-h-[112px] p-1.5 border-r border-b last:border-r-0 ${!isSameMonth(day, month) ? "bg-muted/15 text-muted-foreground" : ""}`}>
          <button className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center mb-1 ${isToday(day) ? "bg-primary text-primary-foreground" : isSameDay(day, selectedDay) ? "bg-primary/10 text-primary" : "hover:bg-muted"}`} onClick={() => onSelectDay(day)}>{format(day, "d")}</button>
          <div className="space-y-1">{dayEvents.slice(0, 3).map((ag) => { const color = ag.agendaId ? agendaMap.get(ag.agendaId)?.cor ?? "#3B82F6" : "#3B82F6"; return <button key={ag.id} onClick={() => onOpen(ag)} className="w-full text-left px-1.5 py-1 rounded-md border bg-background hover:bg-muted/50 transition-colors" style={{ borderLeftWidth: 3, borderLeftColor: color }}><div className="text-[9px] text-muted-foreground">{formatHour(ag.dataHoraInicio)}</div><div className="text-[10px] font-medium truncate">{ag.titulo}</div></button>; })}{dayEvents.length > 3 && <button onClick={() => onSelectDay(day)} className="text-[9px] text-primary font-medium px-1">+ {dayEvents.length - 3} mais</button>}</div>
        </div> ); })}</div>
    </div>
  );
}

type AlertKind = "conflict" | "unconfirmed" | "upcoming" | "overdue";
type AgendaAlert = { id: string; kind: AlertKind; ag: Agendamento; title: string; description: string };

const createFormSchema = z.object({
  titulo: z.string().min(1, "Título obrigatório"), tipo: z.string().min(1), leadId: z.string().min(1, "Lead obrigatório"), agendaId: z.string().optional(), dataHoraInicio: z.string().min(1), dataHoraFim: z.string().min(1), local: z.string().optional(), responsavelId: z.string().optional(), observacoes: z.string().optional(), gerarMeet: z.boolean().optional(),
}).refine((data) => new Date(data.dataHoraInicio) > new Date(), { message: "Não é possível agendar para uma data/horário no passado.", path: ["dataHoraInicio"] }).refine((data) => new Date(data.dataHoraFim) > new Date(data.dataHoraInicio), { message: "O horário final deve ser posterior ao início.", path: ["dataHoraFim"] });
type CreateForm = z.infer<typeof createFormSchema>;
const agendaFormSchema = z.object({ nome: z.string().min(1, "Nome obrigatório"), cor: z.string().min(1) });
type AgendaForm = z.infer<typeof agendaFormSchema>;

export default function AgendaPage() {
  const { user } = useAuth(); const tenantId = user?.tenantId ?? ""; const queryClient = useQueryClient(); const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState(new Date()); const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 })); const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 }); const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date())); const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null); const [view, setView] = useState<CalendarView>(() => typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week");
  const [isCreateOpen, setIsCreateOpen] = useState(false); const [pendingCreate, setPendingCreate] = useState<CreateForm | null>(null); const [conflictMsg, setConflictMsg] = useState(""); const [isAlertsOpen, setIsAlertsOpen] = useState(false); const [attentionFocus, setAttentionFocus] = useState<AlertKind | null>(null); const [selectedEvent, setSelectedEvent] = useState<Agendamento | null>(null);
  const [isNewAgendaOpen, setIsNewAgendaOpen] = useState(false); const [editTarget, setEditTarget] = useState<Agenda | null>(null); const [deleteTarget, setDeleteTarget] = useState<Agenda | null>(null); const [googleLoadingId, setGoogleLoadingId] = useState<string | null>(null);

  useEffect(() => { const params = new URLSearchParams(window.location.search); if (params.get("googleConnected")) { toast({ title: "Google Calendar conectado com sucesso!" }); queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) }); window.history.replaceState({}, "", window.location.pathname); } if (params.get("googleError")) { toast({ title: "Não foi possível conectar ao Google Calendar", description: params.get("googleError") === "access_denied" ? "Acesso negado." : "Tente novamente.", variant: "destructive" }); window.history.replaceState({}, "", window.location.pathname); } }, [queryClient, tenantId, toast]);

  const qKey = getListAgendamentosQueryKey(tenantId, selectedAgendaId ? { agendaId: selectedAgendaId } : undefined);
  const { data: agendamentos = [], isLoading } = useListAgendamentos(tenantId, selectedAgendaId ? { agendaId: selectedAgendaId } : undefined);
  const { data: leads = [] } = useListTenantLeads(tenantId); const { data: agendas = [] } = useListAgendas(tenantId); const { data: tenantUsers = [] } = useListTenantUsers(tenantId, { query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) } });
  const createAg = useCreateAgendamento(); const updateAg = useUpdateAgendamento(); const createAgendaMut = useCreateAgenda(); const updateAgendaMut = useUpdateAgenda(); const deleteAgendaMut = useDeleteAgenda(); const disconnectGoogleMut = useDisconnectAgendaGoogle();
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l.nome])), [leads]); const agendaMap = useMemo(() => new Map(agendas.map((a) => [a.id, a])), [agendas]);
  const todayAgs = useMemo(() => agendamentos.filter((ag) => isSameDay(parseISO(ag.dataHoraInicio), new Date())), [agendamentos]);
  const weekAgs = useMemo(() => { const from = weekStart.getTime(); const to = weekEnd.getTime(); return agendamentos.filter((ag) => { const ts = parseISO(ag.dataHoraInicio).getTime(); return ts >= from && ts <= to; }); }, [agendamentos, weekStart, weekEnd]);
  const selectedDayAgs = useMemo(() => agendamentos.filter((ag) => isSameDay(parseISO(ag.dataHoraInicio), selectedDay)).sort((a, b) => parseISO(a.dataHoraInicio).getTime() - parseISO(b.dataHoraInicio).getTime()), [agendamentos, selectedDay]);
  const conflictIds = useMemo(() => { const ids = new Set<string>(); const open = agendamentos.filter((ag) => isOpenStatus(ag.status) && ag.responsavelId); for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) { const a = open[i]; const b = open[j]; if (a.responsavelId !== b.responsavelId) continue; const aStart = parseISO(a.dataHoraInicio).getTime(), aEnd = parseISO(a.dataHoraFim).getTime(), bStart = parseISO(b.dataHoraInicio).getTime(), bEnd = parseISO(b.dataHoraFim).getTime(); if (aStart < bEnd && bStart < aEnd) { ids.add(a.id); ids.add(b.id); } } return ids; }, [agendamentos]);
  const alerts = useMemo<AgendaAlert[]>(() => { const now = Date.now(); const out: AgendaAlert[] = []; for (const ag of agendamentos) { if (!isOpenStatus(ag.status)) continue; const start = parseISO(ag.dataHoraInicio).getTime(); const end = parseISO(ag.dataHoraFim).getTime(); const inHours = (start - now) / 3600000; if (conflictIds.has(ag.id)) out.push({ id: `conflict-${ag.id}`, kind: "conflict", ag, title: "Conflito de horário", description: `${ag.titulo} possui sobreposição para o mesmo responsável.` }); if (end < now) { out.push({ id: `overdue-${ag.id}`, kind: "overdue", ag, title: "Compromisso sem desfecho", description: `${ag.titulo} já terminou e ainda está como ${STATUS_CONFIG[ag.status].label.toLowerCase()}.` }); continue; } if (ag.status === "agendado" && inHours > 0 && inHours <= 24) out.push({ id: `unconfirmed-${ag.id}`, kind: "unconfirmed", ag, title: "Aguardando confirmação", description: `${ag.titulo} acontece ${inHours <= 2 ? "em menos de 2h" : "nas próximas 24h"}.` }); else if (inHours > 0 && inHours <= 2) out.push({ id: `upcoming-${ag.id}`, kind: "upcoming", ag, title: "Compromisso próximo", description: `${ag.titulo} começa às ${formatHour(ag.dataHoraInicio)}.` }); } const priority: Record<AlertKind, number> = { conflict: 0, overdue: 1, unconfirmed: 2, upcoming: 3 }; out.sort((a, b) => priority[a.kind] - priority[b.kind]); return out; }, [agendamentos, conflictIds]);
  const alertIds = useMemo(() => new Set(alerts.map((a) => a.ag.id)), [alerts]); const pendingConfirmations = agendamentos.filter((ag) => ag.status === "agendado" && parseISO(ag.dataHoraInicio).getTime() > Date.now()).length;
  const visibleAlerts = useMemo(() => attentionFocus ? alerts.filter((alert) => alert.kind === attentionFocus) : alerts, [alerts, attentionFocus]);

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("focus") !== "overdue") return;
    const overdueAlerts = alerts.filter((alert) => alert.kind === "overdue");
    if (overdueAlerts.length === 1) {
      setSelectedEvent(overdueAlerts[0].ag);
    } else {
      setAttentionFocus("overdue");
      setIsAlertsOpen(true);
    }
    params.delete("focus");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [alerts, isLoading]);

  const form = useForm<CreateForm>({ resolver: zodResolver(createFormSchema), defaultValues: { titulo: "", tipo: "reuniao", leadId: "", agendaId: selectedAgendaId ?? "", dataHoraInicio: toInputValue(new Date(Date.now() + 3600000)), dataHoraFim: toInputValue(new Date(Date.now() + 7200000)), local: "", responsavelId: "", observacoes: "", gerarMeet: false } });
  useEffect(() => { const leadId = new URLSearchParams(window.location.search).get("leadId"); if (!leadId || !leads.some((lead) => lead.id === leadId)) return; form.setValue("leadId", leadId); openCreateAt(new Date(), Math.max(new Date().getHours() + 1, 9), leadId); window.history.replaceState({}, "", window.location.pathname); }, [leads]);
  function goToday() { const now = new Date(); setSelectedDay(now); setWeekStart(startOfWeek(now, { weekStartsOn: 1 })); setCurrentMonth(startOfMonth(now)); }
  function navigateWeek(direction: -1 | 1) { const next = direction === 1 ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1); setWeekStart(next); setSelectedDay(next); }
  function handleUpdate(id: string, status: AgendamentoStatus) { updateAg.mutate({ id, data: { status } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: qKey }); setSelectedEvent((current) => current?.id === id ? { ...current, status } : current); toast({ title: `Agendamento marcado como ${STATUS_CONFIG[status].label.toLowerCase()}.` }); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) }); }
  function openCreateAt(date: Date, hour = 9, forcedLeadId?: string) { const candidate = new Date(date); candidate.setHours(hour, 0, 0, 0); if (candidate.getTime() <= Date.now()) { const now = new Date(); if (isSameDay(candidate, now)) candidate.setHours(now.getHours() + 1, 0, 0, 0); else { toast({ title: "Horário no passado", description: "Escolha um horário futuro para criar o agendamento.", variant: "destructive" }); return; } } const end = new Date(candidate.getTime() + 3600000); const safeLeadId = forcedLeadId ?? (leads.length > 0 ? leads[0].id : ""); const safeAgendaId = selectedAgendaId ?? (agendas.length > 0 ? agendas[0].id : ""); form.reset({ titulo: "", tipo: "reuniao", leadId: safeLeadId, agendaId: safeAgendaId, dataHoraInicio: toInputValue(candidate), dataHoraFim: toInputValue(end), local: "", responsavelId: "", observacoes: "", gerarMeet: false }); setSelectedDay(candidate); setIsCreateOpen(true); }
  async function onSubmit(values: CreateForm) { if (values.responsavelId) { try { const result = await checkAgendamentoDisponibilidade(tenantId, { responsavelId: values.responsavelId, from: fromLocalDateTimeInput(values.dataHoraInicio), to: fromLocalDateTimeInput(values.dataHoraFim) }); if (!result.disponivel && result.conflitos.length > 0) { setConflictMsg(result.conflitos.map((c) => `• ${c.titulo} (${formatHour(c.dataHoraInicio)}–${formatHour(c.dataHoraFim)})`).join("\n")); setPendingCreate(values); return; } } catch { toast({ title: "Não foi possível verificar disponibilidade", description: "Você ainda pode criar o agendamento." }); } } doCreate(values); }
  function doCreate(values: CreateForm) { createAg.mutate({ data: { tenantId, titulo: values.titulo, tipo: values.tipo as AgendamentoTipo, leadId: values.leadId, agendaId: values.agendaId || undefined, dataHoraInicio: fromLocalDateTimeInput(values.dataHoraInicio), dataHoraFim: fromLocalDateTimeInput(values.dataHoraFim), local: values.local || undefined, responsavelId: values.responsavelId || undefined, observacoes: values.observacoes || undefined, gerarMeet: values.gerarMeet ?? false } }, { onSuccess: () => { toast({ title: "Agendamento criado", description: "Ele já aparece na agenda e seguirá os lembretes configurados do sistema." }); queryClient.invalidateQueries({ queryKey: qKey }); setIsCreateOpen(false); setPendingCreate(null); }, onError: (err: unknown) => { const axiosErr = err as { response?: { data?: { error?: string; issues?: unknown[] }; status?: number }; message?: string }; const msg = axiosErr.response?.data?.error ?? axiosErr.message; const status = axiosErr.response?.status; const issues = axiosErr.response?.data?.issues; const description = issues ? issues.map((i) => typeof i === "string" ? i : (i as { message?: string }).message ?? JSON.stringify(i)).join("\n") : msg; toast({ title: status === 422 ? "Dados inválidos" : "Erro ao criar agendamento", description: description || "Verifique os campos e tente novamente.", variant: "destructive" }); } }); }

  const agendaForm = useForm<AgendaForm>({ resolver: zodResolver(agendaFormSchema), defaultValues: { nome: "", cor: "#3B82F6" } });
  function openNewAgenda() { agendaForm.reset({ nome: "", cor: "#3B82F6" }); setEditTarget(null); setIsNewAgendaOpen(true); }
  function openEditAgenda(a: Agenda) { agendaForm.reset({ nome: a.nome, cor: a.cor }); setEditTarget(a); setIsNewAgendaOpen(true); }
  function onAgendaSubmit(values: AgendaForm) { if (editTarget) updateAgendaMut.mutate({ id: editTarget.id, data: { nome: values.nome, cor: values.cor } }, { onSuccess: () => { toast({ title: "Agenda atualizada." }); queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) }); setIsNewAgendaOpen(false); setEditTarget(null); }, onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }) }); else createAgendaMut.mutate({ tenantId, data: { tenantId, nome: values.nome, cor: values.cor } }, { onSuccess: () => { toast({ title: "Agenda criada." }); queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) }); setIsNewAgendaOpen(false); }, onError: () => toast({ title: "Erro ao criar agenda", variant: "destructive" }) }); }
  function confirmDeleteAgenda() { if (!deleteTarget) return; deleteAgendaMut.mutate({ id: deleteTarget.id }, { onSuccess: () => { toast({ title: "Agenda excluída." }); if (selectedAgendaId === deleteTarget.id) setSelectedAgendaId(null); queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) }); setDeleteTarget(null); }, onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }) }); }
  async function handleConnectGoogle(agenda: Agenda) { setGoogleLoadingId(agenda.id); try { const { url } = await getAgendaGoogleAuthUrl(agenda.id); window.location.href = url; } catch { toast({ title: "Erro ao obter URL do Google", variant: "destructive" }); } finally { setGoogleLoadingId(null); } }
  function handleDisconnectGoogle(agenda: Agenda) { disconnectGoogleMut.mutate({ id: agenda.id }, { onSuccess: () => { toast({ title: "Google Calendar desconectado." }); queryClient.invalidateQueries({ queryKey: getListAgendasQueryKey(tenantId) }); }, onError: () => toast({ title: "Erro ao desconectar", variant: "destructive" }) }); }
  const alertIcon = (kind: AlertKind) => kind === "conflict" ? <CircleAlert className="h-4 w-4 text-red-500" /> : kind === "overdue" ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : kind === "unconfirmed" ? <BellRing className="h-4 w-4 text-amber-500" /> : <Clock className="h-4 w-4 text-blue-500" />;

  return (
    <div className="vendor-product-page vendor-agenda-page flex h-full min-h-0 flex-col gap-4 md:flex-row md:gap-5">
      <aside className="hidden md:flex w-52 shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between mb-1 px-1"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agendas</span><button onClick={openNewAgenda} className="p-1 rounded-md hover:bg-muted" title="Nova agenda"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></button></div>
        <button className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${selectedAgendaId === null ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`} onClick={() => setSelectedAgendaId(null)}><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" /><span className="text-sm">Todas</span></button>
        {agendas.map((a) => <AgendaSidebarItem key={a.id} agenda={a} selected={selectedAgendaId === a.id} onSelect={() => setSelectedAgendaId(a.id)} onEdit={() => openEditAgenda(a)} onDelete={() => setDeleteTarget(a)} onConnectGoogle={() => handleConnectGoogle(a)} onDisconnectGoogle={() => handleDisconnectGoogle(a)} isGoogleLoading={googleLoadingId === a.id} />)}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0"><h1 className="vendor-product-title truncate">{selectedAgendaId ? agendaMap.get(selectedAgendaId)?.nome ?? "Agenda" : "Agenda"}</h1><p className="vendor-product-subtitle mt-1">Organize compromissos, visitas, reuniões e atendimentos.</p></div>
          <div className="flex items-center gap-2 flex-wrap justify-end"><Button variant="outline" size="sm" onClick={goToday}>Hoje</Button><ViewPicker view={view} onChange={setView} /><Button onClick={() => openCreateAt(selectedDay, 9)} className="hidden md:flex"><Plus className="h-4 w-4 mr-2" />Novo Agendamento</Button><Button onClick={() => openCreateAt(selectedDay, 9)} size="icon" className="md:hidden"><Plus className="h-4 w-4" /></Button></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button onClick={() => { goToday(); setView("day"); }} className="rounded-xl border bg-card px-3 py-2.5 text-left hover:border-primary/30 transition-colors"><div className="text-[11px] text-muted-foreground">Hoje</div><div className="text-xl font-bold mt-0.5">{todayAgs.length}</div></button>
          <button onClick={() => setView("week")} className="rounded-xl border bg-card px-3 py-2.5 text-left hover:border-primary/30 transition-colors"><div className="text-[11px] text-muted-foreground">Esta semana</div><div className="text-xl font-bold mt-0.5">{weekAgs.length}</div></button>
          <button onClick={() => setIsAlertsOpen(true)} className={`col-span-2 md:col-span-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${alerts.length > 0 ? "bg-amber-50/70 border-amber-200 hover:border-amber-300" : "bg-card hover:border-primary/30"}`}><div className="text-[11px] text-muted-foreground">Atenção da agenda</div><div className="mt-0.5 flex items-center gap-2"><div className="text-xl font-bold">{alerts.length}</div><span className="text-xs text-muted-foreground">{pendingConfirmations} a confirmar</span>{alerts.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}</div></button>
        </div>

        <div className="flex md:hidden gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"><AgendaChip label="Todas" selected={selectedAgendaId === null} onClick={() => setSelectedAgendaId(null)} />{agendas.map((a) => <AgendaChip key={a.id} label={a.nome} color={a.cor} selected={selectedAgendaId === a.id} hasGoogle={!!a.googleCalendarId} onClick={() => setSelectedAgendaId(a.id)} />)}<button onClick={openNewAgenda} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border border-dashed text-muted-foreground shrink-0"><Plus className="h-3 w-3" />Nova</button></div>

        {view === "day" && <><div className="flex items-center justify-between rounded-xl border bg-card px-2 py-1.5"><button onClick={() => setSelectedDay((d) => subDays(d, 1))} className="p-2 rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button><button onClick={goToday} className="text-center px-4 py-1 rounded-lg hover:bg-muted"><div className="text-sm font-semibold capitalize">{isToday(selectedDay) ? "Hoje" : format(selectedDay, "EEEE", { locale: ptBR })}</div><div className="text-xs text-muted-foreground">{format(selectedDay, "d 'de' MMMM yyyy", { locale: ptBR })}</div></button><button onClick={() => setSelectedDay((d) => addDays(d, 1))} className="p-2 rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4" /></button></div>{isLoading ? <div className="h-96 rounded-2xl bg-muted animate-pulse" /> : <DayTimeline day={selectedDay} events={selectedDayAgs} leadMap={leadMap} agendaMap={agendaMap} alertIds={alertIds} onCreateAt={openCreateAt} onOpen={setSelectedEvent} />}</>}

        {view === "week" && <><div className="flex items-center justify-between rounded-xl border bg-card px-2 py-1.5"><button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button><div className="text-center"><div className="text-sm font-semibold">{format(weekStart, "d 'de' MMM", { locale: ptBR })} – {format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}</div><div className="text-[11px] text-muted-foreground">{weekAgs.length} compromisso{weekAgs.length !== 1 ? "s" : ""} na semana</div></div><button onClick={() => navigateWeek(1)} className="p-2 rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4" /></button></div>{isLoading ? <div className="h-96 rounded-2xl bg-muted animate-pulse" /> : <WeekTimeline weekDays={weekDays} selectedDay={selectedDay} events={weekAgs} leadMap={leadMap} agendaMap={agendaMap} alertIds={alertIds} onSelectDay={setSelectedDay} onCreateAt={openCreateAt} onOpen={setSelectedEvent} />}</>}

        {view === "month" && <><div className="flex items-center justify-between rounded-xl border bg-card px-2 py-1.5"><button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="p-2 rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button><div className="text-sm font-semibold capitalize">{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</div><button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4" /></button></div><MonthCalendar month={currentMonth} selectedDay={selectedDay} events={agendamentos} agendaMap={agendaMap} onSelectDay={(d) => { setSelectedDay(d); setWeekStart(startOfWeek(d, { weekStartsOn: 1 })); setView("day"); }} onOpen={setSelectedEvent} /></>}

        {!isLoading && agendamentos.length === 0 && <div className="rounded-2xl border border-dashed bg-card p-8 flex flex-col items-center text-center"><CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-3" /><h3 className="font-semibold">Sua agenda ainda está vazia</h3><p className="text-sm text-muted-foreground mt-1 max-w-md">Clique em um horário do calendário ou crie o primeiro compromisso.</p><Button className="mt-4" onClick={() => openCreateAt(new Date(), Math.max(new Date().getHours() + 1, 9))}><Plus className="h-4 w-4 mr-2" />Criar agendamento</Button></div>}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo Agendamento</DialogTitle></DialogHeader><AgendamentoForm form={form} onSubmit={onSubmit} leads={leads} agendas={agendas} tenantUsers={tenantUsers} isPending={createAg.isPending} /></DialogContent></Dialog>

      <Sheet open={isAlertsOpen} onOpenChange={(open) => { setIsAlertsOpen(open); if (!open) setAttentionFocus(null); }}><SheetContent className="w-full sm:max-w-md overflow-y-auto"><SheetHeader><SheetTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" />{attentionFocus === "overdue" ? "Atividades vencidas" : "Avisos da Agenda"}</SheetTitle></SheetHeader><div className="mt-5 space-y-3"><div className="rounded-xl border bg-muted/20 p-3"><div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" />Regras ativas</div><p className="text-xs text-muted-foreground mt-1 leading-relaxed">A tela destaca conflitos, compromissos sem confirmação, horários próximos e agendamentos sem desfecho. Os lembretes automáticos já configurados no sistema continuam funcionando em paralelo.</p></div>{visibleAlerts.length === 0 ? <div className="py-12 text-center"><CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500/60" /><p className="font-medium mt-3">Tudo em ordem</p><p className="text-sm text-muted-foreground mt-1">Nenhum aviso operacional neste momento.</p></div> : visibleAlerts.map((alert) => <button key={alert.id} onClick={() => { setSelectedEvent(alert.ag); setIsAlertsOpen(false); setAttentionFocus(null); }} className="w-full rounded-xl border bg-card p-3 text-left hover:border-primary/30 hover:shadow-sm transition-all"><div className="flex items-start gap-3"><div className="mt-0.5">{alertIcon(alert.kind)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{alert.title}</p><span className="text-[10px] text-muted-foreground">{formatHour(alert.ag.dataHoraInicio)}</span></div><p className="text-xs text-muted-foreground mt-1">{alert.description}</p><p className="text-xs font-medium mt-2 truncate">{leadMap.get(alert.ag.leadId) ?? "Cliente"}</p></div></div></button>)}</div></SheetContent></Sheet>

      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}><SheetContent className="w-full sm:max-w-md overflow-y-auto">{selectedEvent && <><SheetHeader><SheetTitle>{selectedEvent.titulo}</SheetTitle></SheetHeader><div className="mt-5 space-y-4"><div className="flex items-center gap-2 flex-wrap"><Badge className={`border ${STATUS_CONFIG[selectedEvent.status].className}`}>{STATUS_CONFIG[selectedEvent.status].label}</Badge><span className={`text-xs font-medium flex items-center gap-1 ${TIPO_CONFIG[selectedEvent.tipo].color}`}>{TIPO_CONFIG[selectedEvent.tipo].icon}{TIPO_CONFIG[selectedEvent.tipo].label}</span>{alertIds.has(selectedEvent.id) && <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50"><AlertTriangle className="h-3 w-3 mr-1" />Requer atenção</Badge>}</div><div className="rounded-xl border divide-y"><div className="p-3 flex items-start gap-3"><Calendar className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Data e horário</p><p className="text-sm font-medium capitalize">{format(parseISO(selectedEvent.dataHoraInicio), "EEEE, d 'de' MMMM", { locale: ptBR })}</p><p className="text-sm">{formatHour(selectedEvent.dataHoraInicio)}–{formatHour(selectedEvent.dataHoraFim)}</p></div></div><div className="p-3 flex items-start gap-3"><User className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Cliente / lead</p><p className="text-sm font-medium">{leadMap.get(selectedEvent.leadId) ?? "Cliente"}</p></div></div>{selectedEvent.local && <div className="p-3 flex items-start gap-3"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Local</p><p className="text-sm">{selectedEvent.local}</p></div></div>}{selectedEvent.observacoes && <div className="p-3"><p className="text-xs text-muted-foreground">Observações</p><p className="text-sm mt-1 whitespace-pre-wrap">{selectedEvent.observacoes}</p></div>}</div>{selectedEvent.meetLink && <div className="flex gap-2"><Button asChild className="flex-1"><a href={selectedEvent.meetLink} target="_blank" rel="noopener noreferrer"><Video className="h-4 w-4 mr-2" />Entrar no Meet</a></Button><Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(selectedEvent.meetLink!); toast({ title: "Link copiado." }); }}><Copy className="h-4 w-4" /></Button></div>}<div className="rounded-xl border p-3"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ações rápidas</p><div className="flex items-center gap-2 flex-wrap">{selectedEvent.status !== "confirmado" && isOpenStatus(selectedEvent.status) && <Button size="sm" variant="outline" onClick={() => handleUpdate(selectedEvent.id, AgendamentoStatus.confirmado)}><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirmar</Button>}{isOpenStatus(selectedEvent.status) && <><Button size="sm" variant="outline" onClick={() => handleUpdate(selectedEvent.id, AgendamentoStatus.concluido)}>Concluir</Button><Button size="sm" variant="outline" onClick={() => handleUpdate(selectedEvent.id, AgendamentoStatus.no_show)}>No-show</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => handleUpdate(selectedEvent.id, AgendamentoStatus.cancelado)}>Cancelar</Button></>}</div></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => { window.location.href = "/conversations"; }}><MessageCircle className="h-4 w-4 mr-2" />Conversas</Button><Button variant="outline" onClick={() => { window.location.href = "/leads"; }}><User className="h-4 w-4 mr-2" />Abrir CRM</Button></div></div></>}</SheetContent></Sheet>

      <AlertDialog open={!!pendingCreate} onOpenChange={(v) => { if (!v) setPendingCreate(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle className="h-5 w-5" />Conflito de agenda detectado</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3 text-sm"><p>O responsável já tem agendamentos neste horário:</p><pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap font-mono leading-relaxed">{conflictMsg}</pre><p className="text-muted-foreground">Deseja criar o agendamento mesmo assim?</p></div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setPendingCreate(null)}>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { if (pendingCreate) doCreate(pendingCreate); }}>Criar mesmo assim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Dialog open={isNewAgendaOpen} onOpenChange={setIsNewAgendaOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{editTarget ? "Editar Agenda" : "Nova Agenda"}</DialogTitle></DialogHeader><Form {...agendaForm}><form onSubmit={agendaForm.handleSubmit(onAgendaSubmit)} className="space-y-4"><FormField control={agendaForm.control} name="nome" render={({ field }) => <FormItem><FormLabel>Nome *</FormLabel><FormControl><Input placeholder="Ex: Agenda Marcos" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={agendaForm.control} name="cor" render={({ field }) => <FormItem><FormLabel>Cor</FormLabel><div className="flex gap-2 flex-wrap">{AGENDA_COLORS.map((c) => <button key={c} type="button" onClick={() => field.onChange(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${field.value === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />)}</div></FormItem>} /><Button type="submit" className="w-full" disabled={createAgendaMut.isPending || updateAgendaMut.isPending}>{editTarget ? "Salvar" : "Criar Agenda"}</Button></form></Form></DialogContent></Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir agenda "{deleteTarget?.nome}"?</AlertDialogTitle><AlertDialogDescription>Os agendamentos associados não serão excluídos, mas perderão a referência a esta agenda. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={confirmDeleteAgenda} disabled={deleteAgendaMut.isPending}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function AgendamentoForm({ form, onSubmit, leads, agendas, tenantUsers, isPending }: { form: ReturnType<typeof useForm<CreateForm>>; onSubmit: (values: CreateForm) => void; leads: { id: string; nome: string }[]; agendas: Agenda[]; tenantUsers: { id: string; name: string }[]; isPending: boolean }) {
  return (
    <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FormField control={form.control} name="titulo" render={({ field }) => <FormItem><FormLabel>Título *</FormLabel><FormControl><Input placeholder="Ex: Reunião de apresentação" {...field} /></FormControl><FormMessage /></FormItem>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><FormField control={form.control} name="tipo" render={({ field }) => <FormItem><FormLabel>Tipo *</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{(Object.keys(TIPO_CONFIG) as AgendamentoTipo[]).map((v) => <SelectItem key={v} value={v}>{TIPO_CONFIG[v].label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} /><FormField control={form.control} name="leadId" render={({ field }) => <FormItem><FormLabel>Cliente / lead *</FormLabel>{leads.length > 0 ? <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger></FormControl><SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent></Select> : <FormControl><Input placeholder="ID do lead" {...field} /></FormControl>}<FormMessage /></FormItem>} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{agendas.length > 0 && <FormField control={form.control} name="agendaId" render={({ field }) => <FormItem><FormLabel>Agenda</FormLabel><Select onValueChange={field.onChange} value={field.value ?? ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecionar agenda..." /></SelectTrigger></FormControl><SelectContent>{agendas.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select></FormItem>} />}<FormField control={form.control} name="responsavelId" render={({ field }) => <FormItem><FormLabel>Responsável</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger></FormControl><SelectContent>{tenantUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></FormItem>} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><FormField control={form.control} name="dataHoraInicio" render={({ field }) => <FormItem><FormLabel>Início *</FormLabel><FormControl><Input type="datetime-local" min={new Date().toISOString().slice(0, 16)} {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="dataHoraFim" render={({ field }) => <FormItem><FormLabel>Fim *</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} /></div>
      <FormField control={form.control} name="local" render={({ field }) => <FormItem><FormLabel>Local</FormLabel><FormControl><Input placeholder="Endereço ou link de reunião" {...field} /></FormControl></FormItem>} />
      <FormField control={form.control} name="observacoes" render={({ field }) => <FormItem><FormLabel>Observações</FormLabel><FormControl><Input placeholder="Notas adicionais" {...field} /></FormControl></FormItem>} />
      {agendas.some((a) => a.googleCalendarId) && <FormField control={form.control} name="gerarMeet" render={({ field }) => <FormItem><div className="flex items-center justify-between rounded-xl border p-3 gap-3"><div className="flex items-center gap-2"><Video className="h-4 w-4 text-blue-500" /><div><p className="text-sm font-medium leading-tight">Gerar link Google Meet</p><p className="text-[11px] text-muted-foreground">Cria a reunião vinculada ao calendário conectado.</p></div></div><FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl></div></FormItem>} />}
      <div className="rounded-xl border bg-muted/20 p-3"><div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /><p className="text-sm font-medium">Avisos do agendamento</p></div><p className="text-xs text-muted-foreground mt-1 leading-relaxed">O compromisso entra nos avisos operacionais da Agenda. Conflitos, falta de confirmação, proximidade do horário e compromissos sem desfecho serão destacados automaticamente.</p></div>
      <Button type="submit" className="w-full" disabled={isPending}>{isPending ? "Criando..." : "Criar Agendamento"}</Button>
    </form></Form>
  );
}
