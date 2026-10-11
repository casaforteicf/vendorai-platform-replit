import {describe,expect,it} from "vitest";
import {generateCabinetDraft,type CabinetParameters} from "./parametric-cabinet-core";
const base:CabinetParameters={tenantId:"tenant-1",projectId:"project-1",roomId:"kitchen",furnitureId:"cabinet-01",
 widthMm:1200,heightMm:2400,depthMm:600,panelThicknessMm:18,shelfCount:3,doorCount:2,
 materialId:"mdf-18",backMaterialId:"mdf-6",backThicknessMm:6};
describe("parametric cabinet core",()=>{
 it("generates uniquely identified panels with calculated dimensions and quantities",()=>{
  const r=generateCabinetDraft(base);
  expect(r.parts).toHaveLength(7);
  expect(r.parts.find(x=>x.name==="Prateleira")).toMatchObject({quantity:3,lengthMm:1164,widthMm:594});
  expect(r.parts.find(x=>x.name==="Porta")).toMatchObject({quantity:2,widthMm:597,lengthMm:2396});
  expect(new Set(r.parts.map(x=>x.id)).size).toBe(r.parts.length);
  expect(r.productionReady).toBe(false);
 });
 it("recalculates when dimensions change without changing logical part IDs",()=>{
  const old=generateCabinetDraft(base);
  const newer=generateCabinetDraft({...base,widthMm:1500});
  expect(old.parts.map(x=>x.id)).toEqual(newer.parts.map(x=>x.id));
  expect(newer.parts.find(x=>x.name==="Prateleira")?.lengthMm).toBe(1464);
 });
 it("rejects impossible cabinet geometry",()=>{
  expect(()=>generateCabinetDraft({...base,widthMm:20})).toThrow();
  expect(()=>generateCabinetDraft({...base,depthMm:6})).toThrow();
  expect(()=>generateCabinetDraft({...base,shelfCount:51})).toThrow();
 });
 it("separates back panel material",()=>{
  const r=generateCabinetDraft(base);
  expect(r.parts.find(x=>x.name==="Fundo")?.materialId).toBe("mdf-6");
 });
});
