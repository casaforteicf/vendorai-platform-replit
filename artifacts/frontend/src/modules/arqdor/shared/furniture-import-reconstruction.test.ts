import {describe,it,expect} from "vitest";
import {assessReconstruction,planImportedLibraryUse,recommendedInterchangeForPromob,type ImportProvenance} from "./furniture-import-reconstruction";
const p:ImportProvenance={tenantId:"tenant",projectId:"project",sourceFileId:"source",sourceHash:"sha256:abc",filename:"layout.glb",adapterId:"preview",adapterVersion:"0.1",coordinateSystem:"local-mm",rights:"private-only"};
describe("furniture import reconstruction safeguards",()=>{
 it("never calls meshes manufacturing-ready",()=>{
  const a=assessReconstruction(p,[{sourceObjectId:"mesh-1",kind:"furniture",geometryRepresentation:"mesh",measuredConfidence:.9}]);
  expect(a).toMatchObject({format:"glb",status:"review-required",readyForManufacturing:false});
  expect(a.warnings.some(x=>x.includes("manual geometric review"))).toBe(true);
 });
 it("requires rights and review before sharing a model",()=>{
  const a=assessReconstruction(p,[]);
  expect(()=>planImportedLibraryUse(p,a,{scope:"universal",explicitApproval:true,technicalReviewApproved:true})).toThrow();
  expect(()=>planImportedLibraryUse(p,a,{scope:"tenant",explicitApproval:true,technicalReviewApproved:false})).toThrow();
  expect(planImportedLibraryUse(p,a,{scope:"private",explicitApproval:true,technicalReviewApproved:false}).status).toBe("proposal-only");
 });
 it("chooses supported exchange route without claiming a Promob decoder",()=>{
  expect(recommendedInterchangeForPromob("project.promob",["DXF","PDF"])).toMatchObject({status:"export-path-available",chosen:"dxf"});
  expect(recommendedInterchangeForPromob("project.promob",["PRJ"])).toMatchObject({status:"manual-export-required",chosen:null});
 });
 it("rejects candidate identity collisions",()=>{
  const c={sourceObjectId:"x",kind:"mesh" as const,geometryRepresentation:"mesh" as const,measuredConfidence:.5};
  expect(()=>assessReconstruction(p,[c,c])).toThrow();
 });
});