import {describe,expect,it} from "vitest";
import {buildFurnitureExecutionDraft} from "./furniture-execution-draft";
import {buildFurnitureBusinessHandoff} from "./furniture-business-handoff";
import type {PanelMaterial,PanelPart} from "./furniture-engineering-core";
const m:PanelMaterial={id:"M",tenantId:"T",manufacturer:"X",line:"L",sku:"SKU",color:"Branco",thicknessMm:18,stockWidthMm:1850,stockLengthMm:2750,grain:"none"};
const p:PanelPart={id:"P",tenantId:"T",projectId:"Project",furnitureId:"F",name:"Porta",quantity:4,widthMm:500,lengthMm:800,materialId:"M",grainDirection:"none",edges:{}};
const h=buildFurnitureBusinessHandoff({tenantId:"T",projectId:"Project",revision:"R3",parts:[p],materials:[m]});
describe("furniture execution draft",()=>{
 it("allocates partial quantities against original revision",()=>{
  const out=buildFurnitureExecutionDraft({handoff:h,executionBatchId:"batch-01",selection:[{partId:"P",requestedUnits:2}],alreadyAllocated:{P:1}});
  expect(out).toMatchObject({revision:"R3",status:"pending-engineering-and-approval"});
  expect(out.pieces[0]).toMatchObject({requestedUnits:2,totalUnits:4,remainingUnits:1});
  expect(out.materialDemand[0]).toMatchObject({units:2,netAreaM2:0.8});
 });
 it("rejects over-allocation and unlinked parts",()=>{
  expect(()=>buildFurnitureExecutionDraft({handoff:h,executionBatchId:"b",selection:[{partId:"P",requestedUnits:3}],alreadyAllocated:{P:2}})).toThrow();
  expect(()=>buildFurnitureExecutionDraft({handoff:h,executionBatchId:"b",selection:[{partId:"unknown",requestedUnits:1}]})).toThrow();
 });
 it("rejects empty batch",()=>{
  expect(()=>buildFurnitureExecutionDraft({handoff:h,executionBatchId:"b",selection:[]})).toThrow();
 });
});