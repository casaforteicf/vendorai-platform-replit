import type { BudgetItem } from './budgetTypes';
export function getProjects(arqState:any):any[]{ const list=arqState?.projects||arqState?.projetos||arqState?.allProjects||[]; return Array.isArray(list)?list:[]; }
export function getProject(arqState:any){ const projects=getProjects(arqState); return arqState?.currentProject||arqState?.selectedProject||arqState?.project||projects?.[0]||null; }
export function projectTitle(project:any):string{ return project?.titulo||project?.title||project?.name||'Projeto ARQDOR'; }
export function clientName(project:any):string{ return project?.clienteNome||project?.clientName||'Cliente'; }
export function currency(value:number):string{ return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
export function subtotal(item:BudgetItem):number{ return item.quantity*(item.materialCost+item.laborCost); }
export function marginValue(item:BudgetItem):number{ return subtotal(item)*(item.marginPercent/100); }
export function taxValue(item:BudgetItem):number{ return (subtotal(item)+marginValue(item))*(item.taxPercent/100); }
export function total(item:BudgetItem):number{ return subtotal(item)+marginValue(item)+taxValue(item); }
export function statusClass(status:BudgetItem['status']){ return ({estimado:'bg-slate-100 text-slate-700',cotado:'bg-blue-50 text-blue-700',aprovado:'bg-emerald-50 text-emerald-700',comprado:'bg-amber-50 text-amber-700',revisao:'bg-violet-50 text-violet-700'} as const)[status]; }
