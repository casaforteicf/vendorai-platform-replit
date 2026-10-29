import * as React from "react";
import type {StrategicDecisionSummary} from "./AtlasDecisionOverview";

export function evidenceCoverage(items:StrategicDecisionSummary[]){
 const evaluated=items.filter(x=>x.status==="approved"||x.status==="measured");
 const measured=items.filter(x=>x.status==="measured");
 return {
  assessed:evaluated.length,
  withSource:evaluated.filter(x=>x.source.trim().length>0).length,
  measured:measured.length,
  withOutcome:measured.filter(x=>x.outcome.trim().length>0).length
 };
}
export default function AtlasEvidenceQuality({items,ready}:{items:StrategicDecisionSummary[];ready:boolean}){
 const c=React.useMemo(()=>evidenceCoverage(items),[items]);
 return <section className="rounded-xl border border-slate-700 bg-[#16283b] p-4 space-y-3">
  <h3 className="font-semibold">Qualidade das evidências</h3>
  <p className="text-xs text-slate-300">Cobertura documental das decisões salvas no Atlas; uma fonte declarada não significa informação verificada.</p>
  <div className="grid gap-2 sm:grid-cols-2">
   <div className="rounded-lg border border-slate-600 p-3"><p className="text-xs">Decisões com fonte declarada</p><strong className="text-2xl">{!ready?"—":c.assessed===0?"Sem base":c.withSource+"/"+c.assessed}</strong></div>
   <div className="rounded-lg border border-slate-600 p-3"><p className="text-xs">Resultados com descrição registrada</p><strong className="text-2xl">{!ready?"—":c.measured===0?"Sem base":c.withOutcome+"/"+c.measured}</strong></div>
  </div>
  <div className="rounded-lg border border-slate-600 p-3"><p className="text-sm font-semibold">Medição de desempenho ainda não habilitada</p><p className="mt-1 text-xs text-slate-300">Sem indicador numérico, meta, período, linha de base e fonte validada, o Atlas não apresenta crescimento, atingimento de metas ou retorno sobre investimento. Os resultados permanecem documentais.</p></div>
 </section>;
}
