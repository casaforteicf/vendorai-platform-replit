import type { AdminStatus, TenantHealth } from "./tenantAdminTypes";

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

export function adminStatusLabel(status: AdminStatus) {
  const labels: Record<AdminStatus, string> = {
    active: "Ativo",
    attention: "Atenção",
    blocked: "Bloqueado",
    completed: "Concluído",
    pending: "Pendente",
  };
  return labels[status];
}

export function adminStatusClass(status: AdminStatus) {
  const classes: Record<AdminStatus, string> = {
    active: "bg-blue-50 text-blue-700",
    attention: "bg-amber-50 text-amber-700",
    blocked: "bg-rose-50 text-rose-700",
    completed: "bg-emerald-50 text-emerald-700",
    pending: "bg-slate-100 text-slate-600",
  };
  return classes[status];
}

export function healthClass(health: TenantHealth) {
  const classes: Record<TenantHealth, string> = {
    healthy: "bg-emerald-50 text-emerald-700",
    attention: "bg-amber-50 text-amber-700",
    risk: "bg-rose-50 text-rose-700",
    critical: "bg-red-100 text-red-800",
  };
  return classes[health];
}

export function riskClass(risk: "baixo" | "medio" | "alto") {
  const classes = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-amber-50 text-amber-700",
    alto: "bg-rose-50 text-rose-700",
  };
  return classes[risk];
}

export function severityClass(severity: "low" | "medium" | "high") {
  const classes = {
    low: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-rose-50 text-rose-700",
  };
  return classes[severity];
}
