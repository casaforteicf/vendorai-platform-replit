import type { Priority, ProductionStatus } from "./productionTypes";

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

export function statusClass(status: ProductionStatus) {
  const classes: Record<ProductionStatus, string> = {
    especificado: "bg-slate-100 text-slate-700",
    orcado: "bg-blue-50 text-blue-700",
    comprado: "bg-amber-50 text-amber-700",
    producao: "bg-violet-50 text-violet-700",
    montagem: "bg-indigo-50 text-indigo-700",
    qualidade: "bg-orange-50 text-orange-700",
    expedicao: "bg-cyan-50 text-cyan-700",
    instalacao: "bg-emerald-50 text-emerald-700",
    finalizado: "bg-emerald-100 text-emerald-800",
  };
  return classes[status];
}

export function priorityClass(priority: Priority) {
  const classes: Record<Priority, string> = {
    baixa: "bg-slate-100 text-slate-700",
    media: "bg-blue-50 text-blue-700",
    alta: "bg-amber-50 text-amber-700",
    critica: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}
