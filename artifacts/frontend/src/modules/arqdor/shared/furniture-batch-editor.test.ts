import {describe,it,expect} from "vitest";
import {editSelectedFurnitureParts,undoFurniturePartEdit} from "./furniture-batch-editor";
import type {PanelPart} from "./furniture-engineering-core";
const mk=(id:string):PanelPart=>({id,tenantId:"t",projectId:"p",furnitureId:"f",name:id,quantity:1,widthMm:500,lengthMm:600,materialId:"M1",grainDirection:"none",edges:{}});
describe("selected furniture part batch edit",()=>{
 it("edits only selected part and restores previous value",()=>{
  const parts=[mk("a"),mk("b")],change=editSelectedFurnitureParts({tenantId:"t",projectId:"p",parts,selectedIds:["a"],patch:{materialId:"M2"}});
  expect(change.parts[0].materialId).toBe("M2");expect(change.parts[1]).toBe(parts[1]);
  expect(undoFurniturePartEdit(change.parts,change)[0].materialId).toBe("M1");
 });
 it("supports per-edge banding then removing one edge",()=>{
  const edge={materialId:"edge-1",manufacturer:"M",sku:"S",color:"B",thicknessMm:1};
  const first=editSelectedFurnitureParts({tenantId:"t",projectId:"p",parts:[mk("a")],selectedIds:["a"],patch:{edges:{top:edge}}});
  expect(first.parts[0].edges.top?.sku).toBe("S");
  const second=editSelectedFurnitureParts({tenantId:"t",projectId:"p",parts:first.parts,selectedIds:["a"],patch:{edges:{top:null}}});
  expect(second.parts[0].edges.top).toBeUndefined();
 });
 it("rejects selection outside available scope",()=>{
  expect(()=>editSelectedFurnitureParts({tenantId:"t",projectId:"p",parts:[mk("a")],selectedIds:["x"],patch:{materialId:"M2"}})).toThrow();
 });
});