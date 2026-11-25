import { describe, expect, it, vi } from "vitest";
import { requestGlobalCustomerEnrollment } from "./customer-global-enrollment";
function makeDb(existing: Record<string,unknown>[]=[],recent: Record<string,unknown>[]=[]){
  const queries:string[]=[];
  const query=vi.fn(async (sql:string) => {
    queries.push(sql);
    if(sql.includes("SELECT id::text AS id")) return {rows:existing,rowCount:existing.length};
    if(sql.includes("SELECT id FROM public.customer_global_email_verifications")) return {rows:recent,rowCount:recent.length};
    return {rows:[],rowCount:1};
  });
  const release=vi.fn();
  return {db:{connect:async()=>({query,release})},queries,query,release};
}
describe("global customer enrollment flow (disabled HTTP)",()=>{
 it("does not disclose registered account or send again",async()=>{
   const x=makeDb([{id:"00000000-0000-4000-8000-000000000001",status:"active"}]);
   const deliver=vi.fn();
   expect(await requestGlobalCustomerEnrollment({email:"X@Example.com",displayName:"X",db:x.db,deliver})).toBe("accepted");
   expect(deliver).not.toHaveBeenCalled();
   expect(x.queries.at(-1)).toBe("COMMIT");
 });
 it("serializes by email and observes resend cooldown",async()=>{
   const x=makeDb([{id:"00000000-0000-4000-8000-000000000001",status:"pending"}],[{id:"existing"}]);
   const deliver=vi.fn();
   expect(await requestGlobalCustomerEnrollment({email:"x@example.com",displayName:"X",db:x.db,deliver})).toBe("accepted");
   expect(x.queries.some(s=>s.includes("pg_advisory_xact_lock"))).toBe(true);
   expect(deliver).not.toHaveBeenCalled();
 });
 it("creates a pending identity and sends only after commit",async()=>{
   const x=makeDb();const deliver=vi.fn().mockResolvedValue(true);
   expect(await requestGlobalCustomerEnrollment({email:"x@example.com",displayName:"X",db:x.db,deliver})).toBe("accepted");
   expect(x.queries).toContain("COMMIT");
   expect(deliver.mock.calls[0][0]).toBe("x@example.com");
   expect(deliver.mock.calls[0][1]).toMatch(/^[0-9a-f]{64}$/);
   expect(x.release).toHaveBeenCalledOnce();
 });
 it("reports delivery failure without claiming email sent",async()=>{
   const x=makeDb();const deliver=vi.fn().mockResolvedValue(false);
   expect(await requestGlobalCustomerEnrollment({email:"x@example.com",displayName:"X",db:x.db,deliver})).toBe("delivery_failed");
 });
});
