import {describe,expect,it} from "vitest";
import {createPartnerInviteRepository} from "../lib/arqdor-partner-lot-repository";
const secret="integration-tests-only-secret-long-enough-to-sign-tokens";
function fakeDb(options:{allowLot?:boolean;allowInvite?:boolean}={}){
 const calls:{sql:string;values:unknown[]|undefined}[]=[];
 const db={query:async(sql:string,values?:unknown[])=>{
  calls.push({sql,values});
  if(sql.includes("SELECT 1 FROM arqdor_partner_lots"))return{rows:options.allowLot===false?[]:[{ok:1}]};
  if(sql.includes("SELECT i.id FROM arqdor_partner_lot_invites"))return{rows:options.allowInvite===false?[]:[{id:"stored"}]};
  return {rows:[],rowCount:1};
 }};
 return {db,calls};
}
describe("partner invite persistence contract",()=>{
 it("stores and checks signed invitation using tenant-scoped SQL",async()=>{
  const {db,calls}=fakeDb(),repo=createPartnerInviteRepository(db);
  const token=await repo.issue({tenantId:"tenant1",partnerId:"partner1",lotId:"lot1",revision:1,secret,nowSeconds:2000000000});
  expect(calls.some(c=>c.sql.includes("INSERT INTO arqdor_partner_lot_invites"))).toBe(true);
  await expect(repo.verify({token,secret,nowSeconds:2000000001})).resolves.toMatchObject({tenantId:"tenant1",lotId:"lot1",revision:1});
  expect(calls.at(-1)?.values?.[0]).toBe("tenant1");
 });
 it("rejects unavailable lots and revoked links",async()=>{
  const denied=createPartnerInviteRepository(fakeDb({allowLot:false}).db);
  await expect(denied.issue({tenantId:"t",partnerId:"p",lotId:"l",revision:1,secret,nowSeconds:2000000000})).rejects.toThrow();
  const issued=createPartnerInviteRepository(fakeDb().db);
  const token=await issued.issue({tenantId:"t",partnerId:"p",lotId:"l",revision:1,secret,nowSeconds:2000000000});
  await expect(createPartnerInviteRepository(fakeDb({allowInvite:false}).db).verify({token,secret,nowSeconds:2000000001})).rejects.toThrow();
 });
});