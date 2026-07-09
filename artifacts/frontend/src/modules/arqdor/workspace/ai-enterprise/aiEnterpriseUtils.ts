import type { AgentStatus, AIAction, AIIntegration, AIGovernanceRule, AIWorkflowStep } from "./aiEnterpriseTypes";

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

export function statusLabel(status: AgentStatus) {
  const labels: Record<AgentStatus, string> = {
    active: "Ativo",
    training: "Treinando",
    warning: "Atenção",
    offline: "Offline",
  };
  return labels[status];
}

export function statusClass(status: AgentStatus) {
  const classes: Record<AgentStatus, string> = {
    active: "bg-emerald-50 text-emerald-700",
    training: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    offline: "bg-slate-100 text-slate-500",
  };
  return classes[status];
}

export function actionStatusClass(status: AIAction["status"]) {
  const classes: Record<AIAction["status"], string> = {
    sugerida: "bg-slate-100 text-slate-700",
    aprovacao: "bg-amber-50 text-amber-700",
    executando: "bg-blue-50 text-blue-700",
    concluida: "bg-emerald-50 text-emerald-700",
  };
  return classes[status];
}

export function priorityClass(priority: AIAction["priority"]) {
  const classes: Record<AIAction["priority"], string> = {
    baixa: "bg-slate-100 text-slate-600",
    media: "bg-blue-50 text-blue-700",
    alta: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}

export function workflowStatusClass(status: AIWorkflowStep["status"]) {
  const classes: Record<AIWorkflowStep["status"], string> = {
    complete: "bg-emerald-600 text-white",
    active: "bg-violet-600 text-white",
    blocked: "bg-rose-600 text-white",
    pending: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function integrationStatusClass(status: AIIntegration["status"]) {
  const classes: Record<AIIntegration["status"], string> = {
    connected: "bg-emerald-50 text-emerald-700",
    partial: "bg-amber-50 text-amber-700",
    missing: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function governanceModeClass(mode: AIGovernanceRule["mode"]) {
  const classes: Record<AIGovernanceRule["mode"], string> = {
    manual: "bg-slate-100 text-slate-700",
    assisted: "bg-violet-50 text-violet-700",
    autonomous: "bg-emerald-50 text-emerald-700",
  };
  return classes[mode];
}
