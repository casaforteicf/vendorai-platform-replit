/** LOTE 05: núcleo neutro para precificação e composição. Sem acesso a banco. */
export type CommercialKind = "product" | "service" | "package" | "composition";
export type Inclusion = "included" | "excluded" | "optional";
export type BudgetLine = {
 id: string; kind: CommercialKind; description: string; sku?: string; unit: string;
 quantity: number; unitPriceCents: number; discountCents?: number;
 inclusion?: Inclusion; environmentId?: string; phaseId?: string; sourceItemId?: string;
};
export type CompositionInput = { id: string; quantity: number; packageQuantity: number; packagePriceCents: number; lossPercent?: number };
const nonnegative = (n: number, name: string) => { if (!Number.isSafeInteger(n) || n < 0) throw new Error(name + " inválido"); };
export function lineTotalCents(line: BudgetLine): number {
 nonnegative(line.quantity, "Quantidade em milésimos"); nonnegative(line.unitPriceCents,"Preço");
 const gross = Math.round(line.quantity * line.unitPriceCents / 1000);
 const discount = line.discountCents ?? 0; nonnegative(discount,"Desconto");
 if (!Number.isSafeInteger(gross) || discount > gross) throw new Error("Total/desconto inválido");
 return gross - discount;
}
export function calculateBudget(lines: readonly BudgetLine[]) {
 const ids = new Set<string>(); let includedCents=0, optionalCents=0;
 for (const line of lines) {
  if (!line.id || ids.has(line.id)) throw new Error("Item duplicado");
  ids.add(line.id);
  const total = lineTotalCents(line);
  if (line.inclusion === "excluded") continue;
  if (line.inclusion === "optional") optionalCents += total;
  else includedCents += total;
 }
 if (!Number.isSafeInteger(includedCents) || !Number.isSafeInteger(optionalCents) ||
     !Number.isSafeInteger(includedCents + optionalCents)) throw new Error("Total excede limite seguro");
 return { includedCents, optionalCents, totalWithOptionalCents: includedCents + optionalCents };
}
export function compositionPackages(input: CompositionInput) {
 for (const [name,v] of Object.entries({quantity:input.quantity,packageQuantity:input.packageQuantity,packagePriceCents:input.packagePriceCents})) nonnegative(v,name);
 if (input.packageQuantity === 0) throw new Error("Embalagem não pode ser zero");
 const loss = input.lossPercent ?? 0;
 if (!Number.isFinite(loss) || loss < 0 || loss >= 100) throw new Error("Perda inválida");
 const effectiveQuantity = Math.ceil(input.quantity / (1 - loss / 100));
 const packages = Math.ceil(effectiveQuantity / input.packageQuantity);
 const costCents = packages * input.packagePriceCents;
 if (!Number.isSafeInteger(costCents)) throw new Error("Custo excede limite seguro");
 return {effectiveQuantity,packages,costCents};
}
export function marginReport(revenueCents:number,costCents:number) {
 nonnegative(revenueCents,"Receita");nonnegative(costCents,"Custo");
 return {revenueCents,costCents,profitCents:revenueCents-costCents,marginPercent:revenueCents ? ((revenueCents-costCents)/revenueCents)*100 : null};
}
