import type { BillingStatus, InvoiceStatus } from "./billingTypes";

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

export function billingStatusLabel(status: BillingStatus) {
  const labels: Record<BillingStatus, string> = {
    active: "Ativo",
    attention: "Atenção",
    blocked: "Bloqueado",
    completed: "Concluído",
    pending: "Pendente",
  };
  return labels[status];
}

export function billingStatusClass(status: BillingStatus) {
  const classes: Record<BillingStatus, string> = {
    active: "bg-blue-50 text-blue-700",
    attention: "bg-amber-50 text-amber-700",
    blocked: "bg-rose-50 text-rose-700",
    completed: "bg-emerald-50 text-emerald-700",
    pending: "bg-slate-100 text-slate-600",
  };
  return classes[status];
}

export function invoiceStatusLabel(status: InvoiceStatus) {
  const labels: Record<InvoiceStatus, string> = {
    draft: "Rascunho",
    issued: "Emitida",
    paid: "Paga",
    overdue: "Vencida",
    cancelled: "Cancelada",
  };
  return labels[status];
}

export function invoiceStatusClass(status: InvoiceStatus) {
  const classes: Record<InvoiceStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    issued: "bg-blue-50 text-blue-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-rose-50 text-rose-700",
    cancelled: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}
