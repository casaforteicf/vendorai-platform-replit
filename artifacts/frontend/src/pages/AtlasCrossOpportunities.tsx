import * as React from "react";
import {atlasPhaseOneStrategies} from "./atlasPhaseOneStrategies";
type Stage={id:string;title:string;products:string[];services:string[];specialists:string[];next:string[];segments:string[]};
type Props={stage:Stage;stages:Stage[];onSelectStage:(id:string)=>void;onOpenNiche:(id:string)=>void};
export default function AtlasCrossOpportunities({stage,stages,onSelectStage,onOpenNiche}:Props){
 const [category,setCategory]=React.useState<"all"|"products"|"services">("all");
 const downstream=stages.filter(s=>stage.next.includes(s.id));
 const niches=atlasPhaseOneStrategies.filter(n=>stage.segments.includes(n.segment));
 const items=downstream.flatMap(target=>[
  ...(category!=="services"?target.products.map(name=>({name,kind:"Produto",target})):[]),
  ...(category!=="products"?target.services.map(name=>({name,kind:"Serviço",target})):[])
 ]);
 return <section className="mt-5 rounded-xl border border-emerald-800 bg-[#11283a] p-4">
  <h4 className="font-semibold">Oportunidades cruzadas na cadeia</h4>
  <p className="mt-1 text-xs text-slate-300">Potenciais ofertas nas próximas etapas de uma obra. Relações sugeridas pelo planejamento, sem demanda comprovada nem oportunidades criadas no CRM.</p>
  <div className="mt-3 flex flex-wrap gap-2">{(["all","products","services"] as const).map(k=><button type="button" key={k} onClick={()=>setCategory(k)} className={"rounded-lg border px-3 py-1.5 text-xs "+(category===k?"border-emerald-400 bg-[#1c5345]":"border-slate-600")}>{k==="all"?"Todos":k==="products"?"Produtos":"Serviços"}</button>)}</div>
  <div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item,i)=><button key={item.target.id+":"+item.kind+":"+i} type="button" onClick={()=>onSelectStage(item.target.id)} className="rounded-lg border border-slate-700 bg-[#20354a] p-3 text-left hover:border-emerald-500"><span className="text-xs text-emerald-300">{item.kind}</span><strong className="block text-sm">{item.name}</strong><span className="text-xs text-slate-400">Etapa: {item.target.title}</span></button>)}</div>
  {items.length===0&&<p className="mt-3 text-xs text-slate-400">Sem próximas etapas cadastradas. Consulte outros estágios para oportunidades relacionadas.</p>}
  <h5 className="mt-4 text-sm font-semibold">Nichos que podem oferecer soluções nesta etapa</h5>
  <div className="mt-2 flex flex-wrap gap-2">{niches.map(n=><button type="button" key={n.id} onClick={()=>onOpenNiche(n.id)} className="rounded-lg border border-slate-600 px-3 py-2 text-xs hover:border-emerald-500">{n.niche}</button>)}</div>
  <p className="mt-3 text-xs text-slate-400">Arqdor: identificar especificações · Praça.ai: localizar fornecedores e solicitar cotações · CRM: desenvolver relacionamentos. Integrações operacionais ainda não ativadas.</p>
 </section>;
}
