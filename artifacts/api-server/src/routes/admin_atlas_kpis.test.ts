import {describe,it,expect,vi} from "vitest";
vi.mock("@workspace/db",()=>({db:{execute:vi.fn(),transaction:vi.fn()}}));
vi.mock("../middlewares/auth.js",()=>({requireRole:()=>((_req:unknown,_res:unknown,next:()=>void)=>next())}));
import {validStrategicKpis} from "./admin_atlas_kpis.js";
const base={id:"kpi-test-001",decisionId:"construction",name:"Novas oportunidades",unit:"leads",direction:"up",baseline:10,target:20,actual:null,periodStart:"2026-10-01",periodEnd:"2026-10-31",source:"Cadastro manual",verified:false};
describe("Atlas strategic KPI validation",()=>{
 it("accepts a valid strategic indicator",()=>expect(validStrategicKpis([base])).toBe(true));
 it("accepts zero as a valid observed number",()=>expect(validStrategicKpis([{...base,actual:0}])).toBe(true));
 it("rejects duplicated ids",()=>expect(validStrategicKpis([base,base])).toBe(false));
 it("rejects invalid dates or inverted periods",()=>{
  expect(validStrategicKpis([{...base,periodStart:"2026-02-30"}])).toBe(false);
  expect(validStrategicKpis([{...base,periodStart:"2026-11-01"}])).toBe(false);
 });
 it("rejects undocumented verified records",()=>expect(validStrategicKpis([{...base,verified:true}])).toBe(false));
 it("rejects nonnumeric or overflowing amounts",()=>{
  expect(validStrategicKpis([{...base,target:Infinity}])).toBe(false);
  expect(validStrategicKpis([{...base,target:1e20}])).toBe(false);
 });
 it("rejects unknown fields",()=>expect(validStrategicKpis([{...base,tenantId:"other"}])).toBe(false));
});
