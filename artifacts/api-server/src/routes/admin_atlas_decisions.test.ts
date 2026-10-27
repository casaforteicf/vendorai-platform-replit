import {describe,it,expect,vi} from "vitest";
vi.mock("@workspace/db",()=>({db:{execute:vi.fn(),transaction:vi.fn()}}));
vi.mock("../middlewares/auth.js",()=>({requireRole:()=>((_req:unknown,_res:unknown,next:()=>void)=>next())}));
import {validStrategicDecisions} from "./admin_atlas_decisions.js";
const base={impact:4,effort:2,source:"Ata comercial 2026-10-26",status:"review",outcome:"",updatedAt:"2026-10-26T12:00:00.000Z"};
describe("Atlas strategic decision validation",()=>{
 it("accepts an ordinary review",()=>expect(validStrategicDecisions({ownership:base})).toBe(true));
 it("rejects impact and effort outside 1-5",()=>{expect(validStrategicDecisions({ownership:{...base,impact:6}})).toBe(false);expect(validStrategicDecisions({ownership:{...base,effort:0}})).toBe(false)});
 it("rejects approval without source",()=>expect(validStrategicDecisions({ownership:{...base,status:"approved",source:"   "}})).toBe(false));
 it("rejects measured status without outcome",()=>expect(validStrategicDecisions({ownership:{...base,status:"measured"}})).toBe(false));
 it("allows measured status with source and outcome",()=>expect(validStrategicDecisions({ownership:{...base,status:"measured",outcome:"Variação observada de conversão, a verificar"}})).toBe(true));
 it("rejects unknown fields and malformed ids",()=>{expect(validStrategicDecisions({ownership:{...base,unknown:true}})).toBe(false);expect(validStrategicDecisions({"wrong/id":base})).toBe(false)});
 it("rejects oversized source and outcomes",()=>{expect(validStrategicDecisions({ownership:{...base,source:"x".repeat(3001)}})).toBe(false);expect(validStrategicDecisions({ownership:{...base,outcome:"x".repeat(5001)}})).toBe(false)});
});
