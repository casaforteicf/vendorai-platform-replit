/** LOTE 05: reserva parcial e comparação de cotações por item. */
export type ExecutionItem = {itemId:string;approvedMilliQuantity:number;previouslyReleasedMilliQuantity:number;requestedMilliQuantity:number};
export function validatePartialExecution(items:readonly ExecutionItem[]) {
 if (!items.length) throw new Error("Selecione itens para execução");
 const seen=new Set<string>();
 for (const item of items) {
  if (!item.itemId || seen.has(item.itemId)) throw new Error("Item ausente ou duplicado");
  seen.add(item.itemId);
  for (const n of [item.approvedMilliQuantity,item.previouslyReleasedMilliQuantity,item.requestedMilliQuantity])
   if (!Number.isSafeInteger(n)||n<0) throw new Error("Quantidade inválida");
  if (item.requestedMilliQuantity===0 || item.previouslyReleasedMilliQuantity+item.requestedMilliQuantity>item.approvedMilliQuantity)
   throw new Error("Execução excede saldo autorizado");
 }
 return {items:items.map(item=>({...item,remainingMilliQuantity:item.approvedMilliQuantity-item.previouslyReleasedMilliQuantity-item.requestedMilliQuantity}))};
}
export type SupplierOffer={supplierId:string;itemId:string;priceCents:number;freightCents:number;deliveryDays:number;};
export function rankSupplierOffers(offers:readonly SupplierOffer[]) {
 const seen=new Set<string>();
 return offers.map(o=>{
  if (!o.supplierId||!o.itemId||seen.has(o.itemId+":"+o.supplierId)) throw new Error("Cotação repetida/inválida");
  seen.add(o.itemId+":"+o.supplierId);
  for(const n of [o.priceCents,o.freightCents,o.deliveryDays]) if(!Number.isSafeInteger(n)||n<0) throw new Error("Valor inválido");
  return {...o,totalCents:o.priceCents+o.freightCents};
 }).sort((a,b)=>a.itemId.localeCompare(b.itemId)||a.totalCents-b.totalCents||a.deliveryDays-b.deliveryDays||a.supplierId.localeCompare(b.supplierId));
}
export function calculateCommission(saleCents:number,basisPoints:number) {
 if(!Number.isSafeInteger(saleCents)||saleCents<0||!Number.isSafeInteger(basisPoints)||basisPoints<0||basisPoints>10000) throw new Error("Comissão inválida");
 return Math.round(saleCents*basisPoints/10000);
}
