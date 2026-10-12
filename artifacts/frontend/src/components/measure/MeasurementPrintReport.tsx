type ReportItem = {
 id:string; descricao:string; status:string;
 larguraOriginal?:number|null; alturaOriginal?:number|null;
 larguraConferida?:number|null; alturaConferida?:number|null;
 diferencaLargura?:number|null; diferencaAltura?:number|null;
 conferidoPor?:string|null; conferidoEm?:string|null;
 fotos?:string[];
 divergenceResolution?: {reason:string;approvedBy:string;approvedAt:string}|null;
};
export default function MeasurementPrintReport({name,revision,toleranceMm,status,items}:{
 name:string;revision:number;toleranceMm:number;status:string;items:ReportItem[];
}) {
 return <section className="hidden print:block space-y-3 text-sm">
  <h2 className="text-xl font-semibold">Relatório técnico de conferência — {name}</h2>
  <p>Revisão R{revision} · Tolerância ±{toleranceMm} mm · Status {status}</p>
  {status !== "concluido" && <p className="font-bold">RELATÓRIO PARCIAL — NÃO LIBERA FABRICAÇÃO</p>}
  {items.map((item,index)=><div key={item.id} className="break-inside-avoid border-b py-2">
   <h3 className="font-semibold">{index+1}. {item.descricao}</h3>
   <p>Situação: {item.status} · Projetado: {item.larguraOriginal ?? "—"} × {item.alturaOriginal ?? "—"} mm</p>
   <p>Conferido: {item.larguraConferida ?? "—"} × {item.alturaConferida ?? "—"} mm</p>
   <p>Diferença: largura {item.diferencaLargura ?? "—"} mm; altura {item.diferencaAltura ?? "—"} mm</p>
   <p>Conferente: {item.conferidoPor ?? "não identificado"} · Data: {item.conferidoEm ?? "—"}</p>
   <p>Fotografias vinculadas: {item.fotos?.length ?? 0} (originais permanecem privados na Biblioteca)</p>
   {item.divergenceResolution && <p>Resolução: {item.divergenceResolution.reason} · Aprovador: {item.divergenceResolution.approvedBy} · Data: {item.divergenceResolution.approvedAt}</p>}
  </div>)}
  <p>Este relatório não substitui assinatura e aceite técnico formal.</p>
 </section>;
}
