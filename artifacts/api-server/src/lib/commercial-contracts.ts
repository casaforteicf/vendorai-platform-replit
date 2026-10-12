/**
 * LOTE 05 — contratos comerciais tipados. Operações puras: sem banco e sem
 * alteração automática de catálogo, proposta, contrato ou execução.
 */
import { calculateBudget, type BudgetLine } from "./commercial-budget-core";

export type Vertical = "construction" | "windows" | "architecture" | "pool" | "retail" | "services" | "other";
export type CatalogEntry = {
 tenantId: string; id: string; kind: "product" | "material" | "texture" | "service";
 category: string; subcategory?: string; model?: string; variant?: string;
 sku?: string; widthMm?: number; heightMm?: number; color?: string; finish?: string;
 unit: string; technicalAttributes?: Record<string,string>;
};
export function matchCatalogCandidates(imported: {tenantId:string;sku?:string;description:string}, catalog:readonly CatalogEntry[]) {
 const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
 return catalog.filter(e=>e.tenantId===imported.tenantId && e.kind!=="texture")
 .map(entry=>({entry, match: imported.sku&&entry.sku&&norm(imported.sku)===norm(entry.sku) ? "sku" as const :
 (norm(entry.model??"")&&norm(entry.model??"")===norm(imported.description) ? "model" as const:null)}))
 .filter((e):e is {entry:CatalogEntry;match:"sku"|"model"}=>e.match!==null);
}
export type ProjectQuantity = {tenantId:string;projectId:string;environmentId:string;phaseId:string;sourceElementId:string;unit:string;quantityMilli:number};
export function consolidateProjectQuantities(rows:readonly ProjectQuantity[], tenantId:string, projectId:string) {
 const values=new Map<string,{environmentId:string;phaseId:string;unit:string;quantityMilli:number}>();
 for(const row of rows) {
  if(row.tenantId!==tenantId||row.projectId!==projectId) throw new Error("Origem de projeto/tenant incompatível");
  if(!Number.isSafeInteger(row.quantityMilli)||row.quantityMilli<0) throw new Error("Quantidade inválida");
  const key=JSON.stringify([row.environmentId,row.phaseId,row.unit]);
  const prev=values.get(key); const sum=(prev?.quantityMilli??0)+row.quantityMilli;
  if(!Number.isSafeInteger(sum)) throw new Error("Quantitativo excede limite seguro");
  values.set(key,{environmentId:row.environmentId,phaseId:row.phaseId,unit:row.unit,quantityMilli:sum});
 }
 return [...values.values()];
}
export type CommercialRevision = {
 id:string;tenantId:string;dealId:string;revision:number;status:"draft"|"sent"|"accepted"|"rejected";
 lines:readonly BudgetLine[];createdAt:string;parentId?:string;sourceFileSha256?:string;
};
export function nextRevision(base:CommercialRevision, revisions:readonly CommercialRevision[]) {
 if(revisions.some(r=>r.tenantId!==base.tenantId||r.dealId!==base.dealId)) throw new Error("Revisões de negócio/tenant distinto");
 return {revision:Math.max(base.revision,...revisions.map(r=>r.revision))+1,parentId:revisions.at(-1)?.id??base.id};
}
export function proposalSnapshot(revision:CommercialRevision) {
 const totals=calculateBudget(revision.lines);
 return {tenantId:revision.tenantId,dealId:revision.dealId,revisionId:revision.id,revisionLabel:"R"+revision.revision,
  totals,lines:revision.lines.map(line=>({...line})),snapshotAt:revision.createdAt};
}
export type PaymentStage = {stageId:string;dueOn?:string;amountCents:number;method:"pix"|"boleto"|"transfer"|"card"|"other"};
export function validatePaymentStages(totalCents:number, stages:readonly PaymentStage[]) {
 if(!Number.isSafeInteger(totalCents)||totalCents<0) throw new Error("Total inválido");
 if(stages.some(s=>!Number.isSafeInteger(s.amountCents)||s.amountCents<0)) throw new Error("Parcela inválida");
 const paid=stages.reduce((a,s)=>a+s.amountCents,0);
 if(!Number.isSafeInteger(paid)||paid!==totalCents) throw new Error("Parcelas não conciliam com total");
 return {totalCents,stages:[...stages]};
}
export type CommercialAttachment = {
 tenantId:string;dealId:string;leadId:string;documentType:"pdf_import"|"contract"|"pix"|"boleto"|"invoice"|"receipt"|"signature"|"other";
 storageKey:string;createdBy:string;createdAt:string;source:"import"|"generated"|"conversation"|"manual";
};
export function verifyAttachmentScope(attachment:CommercialAttachment, scope:{tenantId:string;dealId:string;leadId:string}) {
 if(!attachment.storageKey||!attachment.createdBy||attachment.tenantId!==scope.tenantId||
 attachment.dealId!==scope.dealId||attachment.leadId!==scope.leadId) throw new Error("Anexo inválido ou fora de escopo");
 return attachment;
}
