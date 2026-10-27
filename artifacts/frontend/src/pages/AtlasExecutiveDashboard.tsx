import * as React from "react";
import { atlasPhaseOneStrategies } from "./atlasPhaseOneStrategies";

type PlanFields={owner?:string;planStatus?:string;dueDate?:string;actions?:string;actualResults?:string;goals?:string;tasksJson?:string};
type Props={
 overrides:Record<string,PlanFields>;
 strategyReady:boolean;
 operationsReady:boolean;
 operations:Array<{tenantId:string;tenantName:string;leads:number;deals:number;catalogItems:number}>;
 domainMetrics:Array<{key:string;label:string;status:string;total:number|null}>;
 onOpenNiche:(id:string)=>void;
 onOpenMap:()=>void;
};
const statusNames:Record<string,string>={draft:"Rascunho",approved:"Aprovado",in_progress:"Em execução",paused:"Pausado",completed:"Concluído"};
export default function AtlasExecutiveDashboard({overrides,strategyReady,operationsReady,operations,domainMetrics,onOpenNiche,onOpenMap}:Props){
 const [filter,setFilter]=React.useState("all");
 const today=new Date().toISOString().slice(0,10);
 const plans=atlasPhaseOneStrategies.map(s=>({...s,...(overrides[s.id]||{}),planStatus:overrides[s.id]?.planStatus||"draft"}));
 const taskStats=plans.reduce((acc,p)=>{try{const tasks=JSON.parse(p.tasksJson||"[]");if(Array.isArray(tasks))for(const task of tasks){acc.total++;if(task.done)acc.done++;else if(task.dueDate&&task.dueDate<today)acc.overdue++}}catch{}return acc},{total:0,done:0,overdue:0});
 const active=plans.filter(x=>x.planStatus==="in_progress");
 const completed=plans.filter(x=>x.planStatus==="completed");
 const overdue=plans.filter(x=>x.dueDate&&x.dueDate<today&&x.planStatus!=="completed");
 const selected=plans.filter(x=>filter==="all"||x.planStatus===filter||(filter==="overdue"&&x.dueDate&&x.dueDate<today&&x.planStatus!=="completed"));
 const cards=[
  {label:"Tarefas concluídas",value:strategyReady?taskStats.done+" / "+taskStats.total:"—",detail:"Conclusões registradas nos planos"},
  {label:"Tarefas atrasadas",value:strategyReady?taskStats.overdue:"—",detail:"Tarefas não concluídas após o prazo"},
  {label:"Segmentos mapeados",value:new Set(plans.map(p=>p.segment)).size,detail:"Planejamento da fase 1"},
  {label:"Nichos catalogados",value:plans.length,detail:"Estratégias-base propostas"},
  {label:"Planos em execução",value:strategyReady?active.length:"—",detail:strategyReady?"Situação informada pelos responsáveis":"Aguardando estratégias do servidor"},
  {label:"Planos concluídos",value:strategyReady?completed.length:"—",detail:strategyReady?"Registros declarados, não resultados auditados":"Aguardando estratégias do servidor"},
  {label:"Prazos vencidos",value:strategyReady?overdue.length:"—",detail:"Prazo informado e estado não concluído"},
 ];
 const operational=[["Leads",operations.reduce((sum,t)=>sum+t.leads,0)],["Negócios",operations.reduce((sum,t)=>sum+t.deals,0)],["Itens de catálogo",operations.reduce((sum,t)=>sum+t.catalogItems,0)]] as const;
 return <div className="space-y-5">
  <div className="rounded-xl border border-emerald-800 bg-[#16283b] p-4">
   <h2 className="text-xl font-semibold">Painel executivo · Atlas 360º</h2>
   <p className="mt-1 text-sm text-slate-300">Fase 1 — Construção civil e imóveis. Estratégias-base são propostas de planejamento, não campanhas lançadas.</p>
   <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(x=><div key={x.label} className="rounded-xl border border-slate-600 bg-[#20354a] p-3"><div className="text-xs text-slate-300">{x.label}</div><div className="mt-1 text-2xl font-bold">{x.value}</div><p className="mt-1 text-xs text-slate-400">{x.detail}</p></div>)}</div>
  </div>
  <section className="rounded-xl border border-slate-700 bg-[#16283b] p-4">
   <h3 className="font-semibold">Dados operacionais reais</h3>
   <p className="mt-1 text-xs text-slate-300">{operationsReady?"Indicadores agregados dos tenants retornados pelo PostgreSQL.":"Fonte operacional não confirmada; métricas indisponíveis, não equivalem a zero."}</p>
   <div className="mt-3 grid gap-3 sm:grid-cols-3">{operational.map(([label,value])=><div key={label} className="rounded-lg bg-[#20354a] p-3"><div className="text-xs text-slate-300">{label}</div><div className="text-xl font-semibold">{operationsReady?value:"Indisponível"}</div></div>)}</div>
   <div className="mt-3 grid gap-2 sm:grid-cols-3">{domainMetrics.map(d=><div key={d.key} className="rounded-lg border border-slate-600 p-2 text-sm"><b>{d.label}</b><p>{d.status==="ok"&&d.total!==null?d.total:"Fonte indisponível"}</p></div>)}</div>
  </section>
  <section className="rounded-xl border border-slate-700 bg-[#16283b] p-4">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Execução das estratégias</h3><p className="text-xs text-slate-400">Abra um nicho para editar responsável, prazo, ações e resultados.</p></div><select aria-label="Filtrar planos" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-slate-600 bg-[#0c1523] p-2 text-sm"><option value="all">Todos os nichos</option>{Object.entries(statusNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="overdue">Prazos vencidos</option></select></div>
   {!strategyReady&&<p className="mt-3 text-sm text-amber-200">Planejamentos personalizados ainda não carregados. Os itens abaixo mostram somente as estratégias-base.</p>}
   <div className="mt-3 max-h-[450px] space-y-2 overflow-y-auto">{selected.map(p=><button type="button" key={p.id} onClick={()=>onOpenNiche(p.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-[#20354a] px-3 py-3 text-left hover:border-emerald-500"><span className="min-w-0"><b className="block text-sm">{p.niche}</b><span className="block text-xs text-slate-400">{p.segment}</span><span className="block text-xs text-slate-300">{p.owner?"Responsável: "+p.owner:"Sem responsável definido"}{p.dueDate?" · Prazo: "+p.dueDate:""}</span></span><span className="text-xs text-emerald-300">{strategyReady?statusNames[p.planStatus]||"Não classificado":"Planejamento-base"}</span></button>)}{selected.length===0&&<p className="text-sm text-slate-400">Nenhum plano encontrado neste filtro.</p>}</div>
   <button type="button" onClick={onOpenMap} className="mt-4 rounded-lg border border-slate-600 px-3 py-2 text-sm">Explorar mapa de capacidades</button>
  </section>
 </div>;
}
