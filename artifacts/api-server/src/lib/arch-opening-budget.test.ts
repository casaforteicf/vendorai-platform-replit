import {expect,it} from "vitest";
import {openingBudgetPlan} from "./arch-opening-budget";
const o={id:"j",catalogProductId:"p",width:1.2,height:1.5,sillHeight:0.9,type:"window"};
const p={id:"p",nome:"Janela",precoBase:"100.00",unidade:"m²"};
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
