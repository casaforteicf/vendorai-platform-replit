import * as React from "react";
export type StrategicDecisionSummary={id:string;title:string;status:"review"|"approved"|"rejected"|"measured";outcome:string;source:string;updatedAt:string;impact:number;effort:number};
type Props={items:StrategicDecisionSummary[];ready:boolean;onOpen:(id:string)=>void};
const names={review:"Em análise",approved:"Aprovadas",rejected:"Descartadas",measured:"Resultados avaliados"};
export default function AtlasDecisionOverview({items,ready,onOpen}:Props){
 const [filter,setFilter]=React.useState<"all"|StrategicDecisionSummary["status"]>("all");
 const counts={review:0,approved:0,rejected:0,measured:0};
 for(const item of items)counts[item.status]++;
 const shown=items.filter(item=>filter==="all"||item.status===filter).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const outcomes=items.filter(i=>i.status==="measured"&&i.outcome.trim());
 return <section className="rounded-xl border border-slate-700 bg-[#16283b] p-4 space-y-3"><h3 className="text-lg font-semibold">Painel de decisões estratégicas</h3><p className="text-xs text-slate-300">Somente decisões registradas no Atlas. Contagens não representam campanhas executadas, vendas ou ROI.</p>
 <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{(Object.keys(counts) as Array<keyof typeof counts>).map(k=><button key={k} type="button" disabled={!ready} onClick={()=>setFilter(filter===k?"all":k)} className={"rounded-lg border p-3 text-left disabled:opacity-50 "+(filter===k?"border-emerald-400":"border-slate-600")}><span className="block text-xs text-slate-300">{names[k]}</span><strong className="text-2xl">{ready?counts[k]:"—"}</strong></button>)}</div>
 <div className="flex flex-wrap justify-between gap-2"><span className="text-xs text-slate-400">{filter==="all"?"Todas as decisões":names[filter]} · {shown.length} registros</span><button type="button" onClick={()=>setFilter("all")} className="text-xs text-emerald-300">Limpar filtro</button></div>
 <div className="space-y-2">{shown.slice(0,20).map(d=><button type="button" onClick={()=>onOpen(d.id)} key={d.id} className="block w-full rounded-lg border border-slate-600 p-3 text-left hover:border-emerald-400"><span className="block text-sm font-semibold">{d.title}</span><span className="text-xs text-slate-300">{names[d.status]} · impacto {d.impact}/5 · esforço {d.effort}/5</span>{d.status==="measured"&&<p className="mt-1 text-xs text-slate-300">Resultado registrado: {d.outcome}</p>}</button>)}{ready&&shown.length===0&&<p className="text-xs text-slate-400">Nenhuma decisão registrada para esse filtro.</p>}</div>
 {shown.length>20&&<p className="text-xs text-slate-400">Exibindo os 20 registros mais recentes.</p>}
 <p className="text-xs text-slate-400">Resultados documentados: {outcomes.length}. Fonte declarada não significa evidência verificada independentemente.</p>
 </section>;
}
