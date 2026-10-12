import { describe, expect, it } from "vitest";
import { buildPartLabels, validatePartDrilling, type IdentifiedPanelPart } from "./furniture-part-labels";
import type { PanelMaterial } from "./furniture-engineering-core";
const material: PanelMaterial = {
  id:"m1",tenantId:"t1",manufacturer:"Marca",line:"Linha",sku:"MDF18BR",
  color:"Branco",thicknessMm:18,stockWidthMm:1850,stockLengthMm:2750,grain:"none",
};
const sample: IdentifiedPanelPart = {
  id:"p004",tenantId:"t1",projectId:"projeto1",furnitureId:"movel1",parentItemId:"vao2",
  name:"Prateleira superior",roomId:"amb1",roomName:"Cozinha",furnitureName:"Armário aéreo",
  revision:"02",quantity:2,widthMm:800,lengthMm:450,materialId:"m1",
  grainDirection:"none",edges:{bottom:{materialId:"f1",manufacturer:"Fitas",sku:"FB",color:"Branco",thicknessMm:1}},
  operations:[{id:"furo1",kind:"hole",face:"A",xMm:37,yMm:96,diameterMm:5,depthMm:12,hardwareSku:"SUP5"}],
};
describe("Arqdor part labels",()=>{
  it("creates a unique label per physical piece with traceable associations",()=>{
    const labels=buildPartLabels({tenantId:"t1",projectId:"projeto1",parts:[sample],materials:[material]});
    expect(labels).toHaveLength(2);
    expect(labels[0].code).not.toBe(labels[1].code);
    expect(labels[0]).toMatchObject({room:"Cozinha",furniture:"Armário aéreo",piece:"Prateleira superior",operationCount:1,sku:"MDF18BR"});
    expect(JSON.parse(labels[1].qrPayload)).toMatchObject({partId:"p004",instance:2,revision:"02"});
  });
  it("rejects tenant mixup",()=>{
    expect(()=>buildPartLabels({tenantId:"t2",projectId:"projeto1",parts:[sample],materials:[material]})).toThrow(/outside tenant/);
  });
  it("flags out of bounds drillings",()=>{
    expect(validatePartDrilling({...sample,operations:[{id:"bad",kind:"hole",face:"A",xMm:900,yMm:100,depthMm:10}]})).toContain("Operation bad is outside panel bounds");
  });
  it("does not produce labels with out of bounds holes",()=>{
    expect(()=>buildPartLabels({tenantId:"t1",projectId:"projeto1",parts:[{...sample,operations:[{id:"bad",kind:"hole",face:"A",xMm:900,yMm:100,depthMm:10}]}],materials:[material]})).toThrow(/Invalid operations/);
  });
});