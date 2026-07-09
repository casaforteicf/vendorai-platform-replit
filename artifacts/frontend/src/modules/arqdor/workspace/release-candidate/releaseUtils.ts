import type { ChecklistStatus, ReleaseStatus, Severity } from "./releaseTypes";

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

export function releaseStatusLabel(status: ReleaseStatus) {
  const labels: Record<ReleaseStatus, string> = {
    ready: "Pronto",
    attention: "Atenção",
    blocked: "Bloqueado",
    pending: "Pendente",
  };
  return labels[status];
}

export function releaseStatusClass(status: ReleaseStatus) {
  const classes: Record<ReleaseStatus, string> = {
    ready: "bg-emerald-50 text-emerald-700",
    attention: "bg-amber-50 text-amber-700",
    blocked: "bg-rose-50 text-rose-700",
    pending: "bg-slate-100 text-slate-600",
  };
  return classes[status];
}

export function severityClass(severity: Severity) {
  const classes: Record<Severity, string> = {
    low: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-rose-50 text-rose-700",
    critical: "bg-red-100 text-red-800",
  };
  return classes[severity];
}

export function checklistStatusLabel(status: ChecklistStatus) {
  const labels: Record<ChecklistStatus, string> = {
    done: "Concluído",
    review: "Revisar",
    missing: "Faltante",
  };
  return labels[status];
}

export function checklistStatusClass(status: ChecklistStatus) {
  const classes: Record<ChecklistStatus, string> = {
    done: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    missing: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}
