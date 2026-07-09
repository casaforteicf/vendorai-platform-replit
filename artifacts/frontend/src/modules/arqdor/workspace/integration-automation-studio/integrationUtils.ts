import type { AutomationStatus, IntegrationStatus, Severity } from "./integrationTypes";

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

export function integrationStatusLabel(status: IntegrationStatus) {
  const labels: Record<IntegrationStatus, string> = {
    connected: "Conectado",
    attention: "Atenção",
    pending: "Pendente",
    failed: "Falhou",
    disabled: "Desativado",
  };
  return labels[status];
}

export function integrationStatusClass(status: IntegrationStatus) {
  const classes: Record<IntegrationStatus, string> = {
    connected: "bg-emerald-50 text-emerald-700",
    attention: "bg-amber-50 text-amber-700",
    pending: "bg-slate-100 text-slate-600",
    failed: "bg-rose-50 text-rose-700",
    disabled: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function automationStatusLabel(status: AutomationStatus) {
  const labels: Record<AutomationStatus, string> = {
    active: "Ativa",
    draft: "Rascunho",
    paused: "Pausada",
    failed: "Falhou",
  };
  return labels[status];
}

export function automationStatusClass(status: AutomationStatus) {
  const classes: Record<AutomationStatus, string> = {
    active: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-600",
    paused: "bg-amber-50 text-amber-700",
    failed: "bg-rose-50 text-rose-700",
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
