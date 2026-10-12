import {describe,it,expect} from "vitest";
import {buildFurnitureBusinessHandoff,exportFurnitureBomCsv} from "./furniture-business-handoff";
import type {PanelPart,PanelMaterial} from "./furniture-engineering-core";
const material:PanelMaterial={id:"M1",tenantId:"T1",manufacturer:"Fornecedor",line:"Linha",sku:"SKU",color:"Branco",thicknessMm:18,stockWidthMm:1850,stockLengthMm:2750,grain:"length"};
const part:PanelPart={id:"piece",tenantId:"T1",projectId:"P1",furnitureId:"F1",name:"Prateleira",quantity:2,widthMm:500,lengthMm:1000,materialId:"M1",grainDirection:"along-length",edges:{}};
describe("furniture business handoff",()=>{
 it("groups quantity by material and retains piece traceability",()=>{
  const r=buildFurnitureBusinessHandoff({tenantId:"T1",projectId:"P1",revision:"R1",parts:[part],materials:[material],context:{dealId:"deal-1"}});
  expect(r.lines[0]).toMatchObject({partCount:2,netAreaM2:1});
  expect(r.context.dealId).toBe("deal-1");
  expect(r.pieces[0].partId).toBe("piece");
  expect(r.validation.status).toBe("engineering-review-required");
 });
 it("refuses cross tenant sources and duplicate part identities",()=>{
  const input={tenantId:"T1",projectId:"P1",revision:"R1",parts:[part],materials:[material]};
  expect(()=>buildFurnitureBusinessHandoff({...input,parts:[{...part,tenantId:"T2"}]})).toThrow();
  expect(()=>buildFurnitureBusinessHandoff({...input,parts:[part,part]})).toThrow();
 });
 it("exports CSV preview with revision and protects against spreadsheet formula injection",()=>{
  const r=buildFurnitureBusinessHandoff({tenantId:"T1",projectId:"P1",revision:"R1",parts:[part],materials:[{...material,sku:"=DANGEROUS"}]});
  const csv=exportFurnitureBomCsv(r);
  expect(csv).toContain("R1");
  expect(csv).toContain("'=DANGEROUS");
  expect(csv).toContain("1.0000");
 });
});