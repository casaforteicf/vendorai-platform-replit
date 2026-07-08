import type { SpecObject, SpecStatus } from "./specificationTypes";

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

export function statusLabel(status: SpecStatus) {
  const map: Record<SpecStatus, string> = {
    selecionado: "Selecionado",
    especificado: "Especificado",
    orcado: "Orçado",
    comprado: "Comprado",
    produzido: "Produzido",
    entregue: "Entregue",
    instalado: "Instalado",
  };
  return map[status];
}

export function statusIndex(status: SpecStatus) {
  return ["selecionado", "especificado", "orcado", "comprado", "produzido", "entregue", "instalado"].indexOf(status);
}

export function statusBadgeClass(status: SpecObject["status"]) {
  const classes: Record<SpecObject["status"], string> = {
    selecionado: "bg-slate-100 text-slate-700",
    especificado: "bg-violet-50 text-violet-700",
    orcado: "bg-blue-50 text-blue-700",
    comprado: "bg-amber-50 text-amber-700",
    produzido: "bg-indigo-50 text-indigo-700",
    entregue: "bg-emerald-50 text-emerald-700",
    instalado: "bg-emerald-100 text-emerald-800",
  };
  return classes[status];
}
