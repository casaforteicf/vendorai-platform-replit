import { describe, expect, it } from "vitest";
import { calculateBudget, type BudgetLine } from "./commercial-budget-core.js";
const line=(id:string,inclusion:"included"|"optional",unitPriceCents:number):BudgetLine=>({
 id,kind:"service",description:"Test",unit:"un",quantity:1000,unitPriceCents,inclusion,
});
describe("commercial budget safe integer bounds",()=>{
 it("rejects overflow from summing valid included and optional totals",()=>{
   const half=Math.floor(Number.MAX_SAFE_INTEGER/2)+1;
   expect(()=>calculateBudget([line("a","included",half),line("b","optional",half)]))
     .toThrow("Total excede limite seguro");
 });
 it("preserves ordinary included and optional values separately",()=>{
   expect(calculateBudget([line("a","included",1200),line("b","optional",300)]))
    .toEqual({includedCents:1200,optionalCents:300,totalWithOptionalCents:1500});
 });
});
