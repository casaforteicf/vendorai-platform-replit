import {describe,it,expect} from "vitest";
import {assessImportedScale,computeRevisionImpact,findEligibleOffcuts,assessQualityRelease} from "./furniture-revision-quality";
describe("revision, survey and production safeguards",()=>{
 it("flags conflicting imported scale and supports measured reference",()=>{
  expect(assessImportedScale({source:"DXF",rawLength:1000,declaredUnit:"mm",verifiedLengthMm:1000})).toMatchObject({scaleMm:1,confidence:"measured-reference",requiresApproval:false});
  expect(assessImportedScale({source:"DXF",rawLength:1000,declaredUnit:"m",verifiedLengthMm:1000})).toMatchObject({confidence:"needs-review",requiresApproval:true});
 });
 it("traces revision dependency graph transitively, including cycles",()=>{
  const r=computeRevisionImpact(["wall"],[{upstreamId:"wall",downstreamId:"cabinet",reason:"fit"},{upstreamId:"cabinet",downstreamId:"drawing",reason:"measure"},{upstreamId:"drawing",downstreamId:"wall",reason:"trace"}]);
  expect(r.invalidatedIds).toEqual(["cabinet","drawing"]);
 });
 it("filters private, unapproved and reserved offcuts",()=>{
  const r=findEligibleOffcuts({tenantId:"t",materialId:"M",widthMm:300,lengthMm:500,allowRotation:false,offcuts:[
   {id:"ok",tenantId:"t",materialId:"M",widthMm:400,lengthMm:600,reserved:false,qualityApproved:true},
   {id:"private",tenantId:"other",materialId:"M",widthMm:400,lengthMm:600,reserved:false,qualityApproved:true},
   {id:"reserved",tenantId:"t",materialId:"M",widthMm:400,lengthMm:600,reserved:true,qualityApproved:true}]});
  expect(r.map(x=>x.id)).toEqual(["ok"]);
  expect(r[0].status).toBe("candidate-only");
 });
 it("does not grant manufacturing permission, even when checks pass",()=>{
  const r=assessQualityRelease([{id:"q",partId:"p",revision:"R1",result:"pass",inspectorId:"u",recordedAt:"2026-10-10"}],"R1");
  expect(r.status).toBe("checks-recorded");
  expect(r.manufacturingApprovalGranted).toBe(false);
  expect(assessQualityRelease([{id:"q",partId:"p",revision:"R1",result:"fail"}],"R1").status).toBe("blocked");
 });
});