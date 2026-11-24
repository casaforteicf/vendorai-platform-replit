import type { ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-card p-4 shadow-sm ${className}`}>{children}</section>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-medium text-muted-foreground ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="rounded border border-red-300 px-2 py-1 text-xs font-medium hover:bg-red-100">Tentar de novo</button>}
    </div>
  );
}

const PRIORITY: Record<string, { label: string; className: string }> = {
  low: { label: "Baixa", className: "bg-slate-100 text-slate-700" },
  normal: { label: "Média", className: "bg-sky-100 text-sky-800" },
  high: { label: "Alta", className: "bg-amber-100 text-amber-900" },
  urgent: { label: "Urgente", className: "bg-red-100 text-red-800" },
};

const STATUS: Record<string, { label: string; className: string }> = {
  open: { label: "Aberto", className: "bg-sky-100 text-sky-800" },
  in_progress: { label: "Em andamento", className: "bg-indigo-100 text-indigo-800" },
  waiting: { label: "Aguardando", className: "bg-amber-100 text-amber-900" },
  done: { label: "Concluído", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelado", className: "bg-slate-100 text-slate-600" },
};

export function PriorityBadge({ value }: { value: string }) {
  const item = PRIORITY[value] ?? PRIORITY.normal;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.className}`}>{item.label}</span>;
}

export function StatusBadge({ value }: { value: string }) {
  const item = STATUS[value] ?? STATUS.open;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.className}`}>{item.label}</span>;
}

export function DueBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-muted-foreground">Sem prazo</span>;
  const days = Math.ceil((Date.parse(`${date.slice(0, 10)}T12:00:00`) - Date.now()) / 86_400_000);
  const late = days < 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${late ? "bg-red-100 text-red-800" : days <= 2 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
      {late ? <AlertTriangle className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
      {late ? `Atrasado ${Math.abs(days)}d` : days === 0 ? "Vence hoje" : `Vence em ${days}d`}
    </span>
  );
}

export function CheckItem({ checked }: { checked: boolean }) {
  return checked ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Stat({ label, value, tone = "default", hint }: { label: string; value: number | string; tone?: "default" | "warn" | "danger" | "good"; hint?: string }) {
  const colors = {
    default: "text-foreground",
    warn: "text-amber-700",
    danger: "text-red-700",
    good: "text-emerald-700",
  };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
