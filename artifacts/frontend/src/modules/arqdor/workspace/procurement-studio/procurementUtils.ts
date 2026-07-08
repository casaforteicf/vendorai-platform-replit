import type { RequestPriority, RequestStatus } from "./procurementTypes";

export function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

export function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

export function projectTitle(project: any): string {
  return project?.titulo || project?.title || project?.name || "Projeto ARQDOR";
}

export function clientName(project: any): string {
  return project?.clienteNome || project?.clientName || "Cliente";
}

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

export function statusClass(status: RequestStatus) {
  const classes: Record<RequestStatus, string> = {
    draft: "bg-slate-100 text-slate-700",
    pending: "bg-amber-50 text-amber-700",
    quoted: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-50 text-emerald-700",
    ordered: "bg-violet-50 text-violet-700",
    received: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function priorityClass(priority: RequestPriority) {
  const classes: Record<RequestPriority, string> = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}
