import {describe,it,expect,vi,beforeEach} from "vitest";
import request from "supertest";
import express from "express";
const {execute,select,insert} = vi.hoisted(()=>({execute:vi.fn(),select:vi.fn(),insert:vi.fn()}));
vi.mock("@workspace/db",()=>({
 db:{execute,select,insert},
 leadsTable:{id:"id",tenantId:"tenantId",excluidoEm:"excluidoEm",naoLeadTipo:"naoLeadTipo",nome:"nome"},
 activitiesTable:{id:"id",tenantId:"tenantId",leadId:"leadId",origemTemplateKey:"origemTemplateKey"}
}));
vi.mock("../middlewares/auth.js",()=>({requireRole:()=> (_req:any,_res:any,next:()=>void)=>next()}));
import router from "./admin_atlas_crm.js";
const app=express();app.use(express.json());app.use("/api",router);
const task={id:"task-01",title:"Contatar fornecedor",owner:"Equipe",priority:"high",dueDate:"2026-11-15",done:false};
const url="/api/admin/atlas/tasks/niche-01/task-01/link-crm";
const body={tenantId:"tenant-a",leadId:"lead-a"};
function selectRows(rows:unknown[]){
 const limit=vi.fn().mockResolvedValue(rows);
 const where=vi.fn().mockReturnValue({limit});
 const from=vi.fn().mockReturnValue({where});
 select.mockReturnValue({from});
}
describe("Atlas-to-CRM safety",()=>{
 beforeEach(()=>{vi.clearAllMocks();execute.mockResolvedValue({rows:[{content:{"niche-01":{tasksJson:JSON.stringify([task])}}}]});});
 it("rejects incomplete links before database access",async()=>{
  const res=await request(app).post(url).send({tenantId:"tenant-a"});
  expect(res.status).toBe(422);expect(execute).not.toHaveBeenCalled();
 });
 it("rejects unpublished Atlas tasks",async()=>{
  execute.mockResolvedValue({rows:[{content:{}}]});
  const res=await request(app).post(url).send(body);
  expect(res.status).toBe(404);expect(insert).not.toHaveBeenCalled();
 });
 it("blocks leads not found in the requested tenant",async()=>{
  selectRows([]);
  const res=await request(app).post(url).send(body);
  expect(res.status).toBe(422);expect(res.body.error).toBe("ATLAS_LEAD_TENANT_MISMATCH");expect(insert).not.toHaveBeenCalled();
 });
 it("reuses an already linked CRM activity",async()=>{
  const rows=[[{id:"lead-a"}],[{id:"activity-existing"}]];
  select.mockImplementation(()=>{const item=rows.shift()||[];return {from:()=>({where:()=>({limit:async()=>item})})}});
  const res=await request(app).post(url).send(body);
  expect(res.status).toBe(200);expect(res.body).toMatchObject({alreadyLinked:true,activityId:"activity-existing"});expect(insert).not.toHaveBeenCalled();
 });
 it("creates one CRM task after lead validation",async()=>{
  const rows=[[{id:"lead-a"}],[]];
  select.mockImplementation(()=>{const item=rows.shift()||[];return {from:()=>({where:()=>({limit:async()=>item})})}});
  const returning=vi.fn().mockResolvedValue([{id:"activity-new"}]);
  const values=vi.fn().mockReturnValue({returning});
  insert.mockReturnValue({values});
  const res=await request(app).post(url).send(body);
  expect(res.status).toBe(201);expect(res.body).toMatchObject({alreadyLinked:false,activityId:"activity-new"});
  expect(values).toHaveBeenCalledWith(expect.objectContaining({tenantId:"tenant-a",leadId:"lead-a",origem:"atlas"}));
 });
});
