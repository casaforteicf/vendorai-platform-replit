import {expect,it} from "vitest";
import {openingBudgetPlan,openingBudgetTotal,OpeningBudgetTotalError} from "./arch-opening-budget";
it("sums project totals in exact cents including zero and the database limit",()=>{
 expect(openingBudgetTotal([])).toBe("0.00");
 expect(openingBudgetTotal(["0.10","0.20","0","1.5"])).toBe("1.80");
 expect(openingBudgetTotal(["9999999999.98","0.01"])).toBe("9999999999.99");
});
it("rejects overflow even when individual budget items fit the database",()=>{
 expect(()=>openingBudgetTotal(["9999999999.99","0.01"])).toThrow(OpeningBudgetTotalError);
});
it("rejects missing, negative and malformed persisted budget totals",()=>{
 for(const invalid of [null,undefined,NaN,Infinity,100,"-1","1.005","1,00","1e2","","10000000000.00"])
  expect(()=>openingBudgetTotal(["10.00",invalid])).toThrow(OpeningBudgetTotalError);
});
const o={id:"j",catalogProductId:"p",width:1.2,height:1.5,sillHeight:0.9,type:"window"};
const p={id:"p",nome:"Janela",precoBase:"100.00",unidade:"m²"};
it("rejects ambiguous catalog IDs regardless of product order",()=>{
 for(const products of [[p,{...p,precoBase:"200"}],[{...p,precoBase:"200"},p]]){
  const plan=openingBudgetPlan("c",[o],products,0);
  expect(plan.items).toEqual([]);expect(plan.issues[0]).toContain("duplicado");
 }
 expect(openingBudgetPlan("c",[o],[p,{...p,id:"other"}],0).issues).toEqual([]);
});
it("never inserts or updates desired items from another concept",async()=>{
 const {openingBudgetMutations}=await import("./arch-opening-budget");
 const own=openingBudgetPlan("c",[o],[p],0).items;
 const foreign=openingBudgetPlan("other",[o],[p],0).items;
 const result=openingBudgetMutations([...own,...foreign],[...own,...foreign,{id:"manual"}],"c");
 expect(result.update).toEqual(own);expect(result.insert).toEqual([]);expect(result.remove).toEqual([]);
 expect(openingBudgetMutations(foreign,[],"c").insert).toEqual([]);
});
it("uses exact master product IDs and stable IDs across repeated budget sends",()=>{
 const first=openingBudgetPlan("c",[o],[p],0), second=openingBudgetPlan("c",[o],[p],0);
 expect(first).toEqual(second);expect(first.items[0]).toMatchObject({produtoId:"p",quantidade:"1.80",valorTotal:"180.00"});
});
it("uses active promotion and falls back after expiry",()=>{
 const product={...p,precoPromocional:"80",promocaoAtivaAte:"2026-10-12T00:00:00Z"};
 expect(openingBudgetPlan("c",[o],[product],0).total).toBe(144);
 expect(openingBudgetPlan("c",[o],[product],Date.parse("2026-10-13")).total).toBe(180);
});
it("does not invent price or quantity for missing data and incompatible units",()=>{
 for(const product of [{...p,precoBase:null},{...p,unidade:"kg"},{...p,precoBase:""}])expect(openingBudgetPlan("c",[o],[product],0).issues).toHaveLength(1);
 expect(openingBudgetPlan("c",[{...o,width:undefined}],[p],0).items).toEqual([]);
 expect(openingBudgetPlan("c",[o],[],0).issues).toHaveLength(1);
 expect(openingBudgetPlan("c",[o,o],[p],0).issues).toHaveLength(1);
});

it("updates repeated sends and removes only obsolete items owned by this source",async()=>{
 const {openingBudgetMutations}=await import("./arch-opening-budget");
 const items=openingBudgetPlan("c",[o],[p],0).items;
 const first=openingBudgetMutations(items,[],"c");expect(first.insert).toHaveLength(1);
 const second=openingBudgetMutations(items,[...items,{id:"manual"},{id:"arqdor-opening:other:old"},{id:"arqdor-opening:c:obsolete"}],"c");
 expect(second.insert).toHaveLength(0);expect(second.update).toHaveLength(1);expect(second.remove).toEqual(["arqdor-opening:c:obsolete"]);
});

it("rounds decimal prices half up and multiplies cents without floating point drift",()=>{
 const item=openingBudgetPlan("c",[o],[{...p,unidade:"un",precoBase:"1.005"}],0).items[0];
 expect(item.valorUnitario).toBe("1.01");expect(item.valorTotal).toBe("1.01");
 const area=openingBudgetPlan("c",[{...o,width:1,height:1.5}],[{...p,precoBase:"0.01"}],0).items[0];
 expect(area.valorTotal).toBe("0.02");
});
it("rejects overlapping opening geometry but accepts touching edges",async()=>{
 const {openingBudgetGeometryIssues}=await import("./arch-opening-budget");
 const walls=[{id:"w",floor:0,x1:0,y1:0,x2:4,y2:0}];
 const base={id:"d",wallId:"w",floor:0,offset:0.5,width:1,height:2.1,sillHeight:0};
 expect(openingBudgetGeometryIssues([base,{...base,id:"d2",offset:0.6}],walls)[0]).toContain("sobrepostos");
 expect(openingBudgetGeometryIssues([base,{...base,id:"d2",offset:0.75}],walls)).toEqual([]);
 expect(openingBudgetGeometryIssues([base],[])).toHaveLength(1);
 expect(openingBudgetGeometryIssues([{...base,offset:0}],walls)).toHaveLength(1);
});
