/** LOTE 05: reconciliação pré-importação; nunca altera os dados originais. */
export type ImportedLine = {description:string;unit:string;quantityText:string;unitPriceText:string;totalText:string;sku?:string;};
export type OriginalBudget = {
 tenantId:string; sourceFileName:string; sourceSha256:string; budgetNumber?:string;
 customerDocument?:string; issueDate?:string; originalTotalText:string; lines:ImportedLine[];
 unrecognizedFields:Record<string,unknown>;
};
export type ReviewedBudget = {original:OriginalBudget;confirmedBy:string;confirmedAt:string; divergenceAcknowledged:boolean};
export function parseBrazilianMoney(text:string):number|null {
 const value=text.trim().replace(/^R\$\s*/,"").replace(/\s/g,"");
 if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(value)) return null;
 const cents=Number(value.replace(/\./g,"").replace(",",""));
 return Number.isSafeInteger(cents) ? cents : null;
}
export function reviewImport(original:OriginalBudget) {
 if (!original.tenantId || !original.sourceSha256 || !original.sourceFileName) throw new Error("Origem obrigatória");
 const originalCents=parseBrazilianMoney(original.originalTotalText);
 const itemCents=original.lines.map(l=>parseBrazilianMoney(l.totalText));
 const mappedSum=itemCents.every(v=>v!==null) ? (itemCents as number[]).reduce((a,b)=>a+b,0) : null;
 const divergenceCents=originalCents!==null && mappedSum!==null ? originalCents-mappedSum:null;
 return {originalCents,mappedSum,divergenceCents,
  requiresReview:originalCents===null||mappedSum===null||divergenceCents!==0,
  unmapped:original.unrecognizedFields, originalLines:original.lines};
}
export function confirmImport(reviewed:ReviewedBudget) {
 if (!reviewed.confirmedBy || !reviewed.confirmedAt) throw new Error("Confirmação com autor/data obrigatória");
 const analysis=reviewImport(reviewed.original);
 if (analysis.requiresReview&&!reviewed.divergenceAcknowledged) throw new Error("Divergência requer confirmação explícita");
 return { ...reviewed, analysis, preserveOriginal:true as const };
}
export function likelySameImport(a:OriginalBudget,b:OriginalBudget):boolean {
 if (a.tenantId!==b.tenantId) return false;
 if (a.sourceSha256===b.sourceSha256) return true;
 return Boolean(a.budgetNumber&&b.budgetNumber&&a.budgetNumber===b.budgetNumber&&
 a.customerDocument&&a.customerDocument===b.customerDocument&&
 a.issueDate&&a.issueDate===b.issueDate&&a.originalTotalText===b.originalTotalText);
}
