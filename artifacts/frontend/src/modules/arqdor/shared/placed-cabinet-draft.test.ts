import {describe,it,expect} from "vitest";
import {generateCabinetDraft} from "./parametric-cabinet-core";
import {insertCabinetDraft,repositionPlacedCabinet,removePlacedCabinet} from "./placed-cabinet-draft";
const p={tenantId:"tenant",projectId:"project",roomId:"room",furnitureId:"cabinet",widthMm:1200,heightMm:2200,depthMm:600,panelThicknessMm:18,shelfCount:2,doorCount:2,materialId:"mdf",backThicknessMm:6,backMaterialId:"back"};
const draft=generateCabinetDraft(p);
const ctx={tenantId:"tenant",projectId:"project",room:{id:"room",widthMm:4000,depthMm:3000},draft,id:"first",xMm:100,yMm:100,existing:[]};
describe("C03 cabinet geometry and parts association",()=>{
 it("links positioned furniture identity to generated parts",()=>{
  const r=insertCabinetDraft(ctx);
  expect(r[0].bounds.widthMm).toBe(1200);
  expect(r[0].parts.find(p=>p.name==="Porta")?.quantity).toBe(2);
  expect(r[0].status).toBe("local-draft");
 });
 it("rejects collisions and duplicate identity",()=>{
  const a=insertCabinetDraft(ctx);
  expect(()=>insertCabinetDraft({...ctx,id:"second",xMm:200,existing:a})).toThrow();
  expect(()=>insertCabinetDraft({...ctx,existing:a})).toThrow();
 });
 it("rejects cross tenant or project dimensions",()=>{
  expect(()=>insertCabinetDraft({...ctx,tenantId:"other"})).toThrow();
  expect(()=>insertCabinetDraft({...ctx,room:{id:"other",widthMm:4000,depthMm:3000}})).toThrow();
 });
 it("moves an existing cabinet without modifying part identity and supports removal",()=>{
  const existing=insertCabinetDraft(ctx);
  const moved=repositionPlacedCabinet({room:ctx.room,items:existing,id:"first",xMm:1400,yMm:200});
  expect(moved[0].bounds.xMm).toBe(1400);
  expect(moved[0].parts).toBe(existing[0].parts);
  expect(existing[0].bounds.xMm).toBe(100);
  expect(removePlacedCabinet(moved,"first")).toEqual([]);
 });
 it("rejects moves outside the room or into another cabinet",()=>{
  const existing=insertCabinetDraft(ctx);
  expect(()=>repositionPlacedCabinet({room:ctx.room,items:existing,id:"first",xMm:3900,yMm:0})).toThrow();
  const second=insertCabinetDraft({...ctx,id:"second",xMm:1800,existing});
  expect(()=>repositionPlacedCabinet({room:ctx.room,items:second,id:"first",xMm:1850,yMm:100})).toThrow();
 });
});