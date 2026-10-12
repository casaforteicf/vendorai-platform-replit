type ReportItem = {
 id:string; descricao:string; status:string;
 larguraOriginal?:number|null; alturaOriginal?:number|null;
 larguraConferida?:number|null; alturaConferida?:number|null;
 diferencaLargura?:number|null; diferencaAltura?:number|null;
 conferidoPor?:string|null; conferidoEm?:string|null;
 fotos?:string[];
 divergenceResolution?: {reason:string;approvedBy:string;approvedAt:string}|null;
};
export default function MeasurementPrintReport({name,revision,toleranceMm,status,items,photoAccess,acceptance}:{
 name:string;revision:number;toleranceMm:number;status:string;items:ReportItem[];photoAccess?:Record<string,Array<{storageUrl:string;accessUrl:string}>>;acceptance?:{signerName:string;acceptedAt:string;signerUserId:string;technicalNote?:string|null}|null;
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
   <p>Fotografias vinculadas: {item.fotos?.length ?? 0}</p>
   {(item.fotos ?? []).map((storageUrl, photoIndex) => {
     const url = photoAccess?.[item.id]?.find(photo => photo.storageUrl === storageUrl)?.accessUrl;
     return <div key={storageUrl} className="mt-2 break-inside-avoid">
       {url ? <img src={url} alt={`Fotografia ${photoIndex + 1} do item ${index + 1}`} className="max-h-52 max-w-full object-contain" /> : <p>Fotografia {photoIndex + 1}: acesso temporário indisponível. Consulte a mídia privada no checklist.</p>}
     </div>;
   })}
   {item.divergenceResolution && <p>Resolução: {item.divergenceResolution.reason} · Aprovador: {item.divergenceResolution.approvedBy} · Data: {item.divergenceResolution.approvedAt}</p>}
  </div>)}
  {acceptance && <div className="border-t pt-3"><p className="font-semibold">Declaração de aceite técnico autenticado</p><p>Responsável: {acceptance.signerName} · Registro: {acceptance.acceptedAt} · Usuário: {acceptance.signerUserId}</p><p>{acceptance.technicalNote ?? "Sem observações adicionais."}</p></div>}
  <p>Este registro autenticado não equivale a assinatura digital certificada nem substitui aprovações legais aplicáveis.</p>
 </section>;
}
