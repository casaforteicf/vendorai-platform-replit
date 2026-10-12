import {describe,it,expect} from "vitest";
import {approveFurnitureCandidate,createCandidateFromSuggestion} from "./furniture-model-approval";
const input={id:"i1",tenantId:"t1",projectId:"p",name:"Balcão",source:"import" as const,confidence:.8,rights:"unknown" as const,ownerUserId:"u1"};
describe("imported model candidate rights",()=>{
 it("keeps new imported models in private drafts",()=>{
  const c=createCandidateFromSuggestion(input);
  expect(c).toMatchObject({state:"draft",scope:"personal"});
  expect(approveFurnitureCandidate(c,{actorUserId:"u1",tenantId:"t1",hasLibraryAdminPermission:false,explicitPublishApproval:false},"personal").state).toBe("approved-private");
 });
 it("blocks universal publishing unless redistribution and admin approval are confirmed",()=>{
  const c=createCandidateFromSuggestion(input);
  expect(()=>approveFurnitureCandidate(c,{actorUserId:"u1",tenantId:"t1",hasLibraryAdminPermission:true,explicitPublishApproval:true},"universal")).toThrow();
  const approved=approveFurnitureCandidate({...c,rights:"redistribution-authorized"},{actorUserId:"u1",tenantId:"t1",hasLibraryAdminPermission:true,explicitPublishApproval:true},"universal");
  expect(approved.state).toBe("published");
 });
 it("rejects unauthorized actor or tenant",()=>{
  const c=createCandidateFromSuggestion(input);
  expect(()=>approveFurnitureCandidate(c,{actorUserId:"outsider",tenantId:"t1",hasLibraryAdminPermission:false,explicitPublishApproval:false},"personal")).toThrow();
  expect(()=>approveFurnitureCandidate(c,{actorUserId:"u1",tenantId:"different",hasLibraryAdminPermission:true,explicitPublishApproval:true},"personal")).toThrow();
 });
});