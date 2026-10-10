import {describe,expect,it} from "vitest";
import {instantiateCabinetTemplate,type CabinetTemplate} from "./furniture-template-instancing";
const t:CabinetTemplate={id:"standard",scope:"tenant",tenantId:"tenantA",name:"Armário",revision:1,category:"tall",defaultMaterialId:"mdf18",defaultBackMaterialId:"mdf6",parameters:{widthMm:900,heightMm:2200,depthMm:600,panelThicknessMm:18,backThicknessMm:6,shelfCount:4,doorCount:2}};
describe("cabinet templates",()=>{
 it("instantiates with project scope and override without mutating library template",()=>{
  const p=instantiateCabinetTemplate(t,{tenantId:"tenantA",projectId:"p",roomId:"r",furnitureId:"f",overrides:{widthMm:1200}});
  expect(p).toMatchObject({tenantId:"tenantA",projectId:"p",widthMm:1200});
  expect(t.parameters.widthMm).toBe(900);
 });
 it("rejects cross tenant private template",()=>{
  expect(()=>instantiateCabinetTemplate(t,{tenantId:"tenantB",projectId:"p",roomId:"r",furnitureId:"f"})).toThrow();
 });
});