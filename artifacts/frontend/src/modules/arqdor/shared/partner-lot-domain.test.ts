import {describe,expect,it} from "vitest";
import {buildPreProjectLotOrigin,validatePartnerLot,type PartnerLotDraft} from "./partner-lot-domain";
const lot:PartnerLotDraft={tenantId:"tenant-A",partnerId:"parceiro",developmentId:"condominio",lotId:"lote-12",block:"B",lotNumber:"12",name:"Lote 12",revision:1,
 coordinates:[{xM:0,yM:0},{xM:20,yM:0},{xM:20,yM:25},{xM:0,yM:25}],
 surveySource:"Levantamento cadastrado",surveyDate:"2026-10-01",crs:"local-meter-grid",status:"available"};
describe("partner lot technical model",()=>{
 it("validates parcel polygon and preserves traceable revision",()=>{
  const v=validatePartnerLot(lot,"2026-10-10T13:00:00Z");
  expect(v.geometry).toMatchObject({areaM2:500,perimeterM:90});
  expect(v.versionKey).toBe("lote-12:1");
  expect(v.verification).toBe("geometry-validated-survey-unverified");
 });
 it("rejects crossing boundaries",()=>{
  expect(()=>validatePartnerLot({...lot,coordinates:[{xM:0,yM:0},{xM:20,yM:20},{xM:0,yM:20},{xM:20,yM:0}]},"2026-10-10")).toThrow();
 });
 it("anchors preproject to lot version and blocks tenant mismatch",()=>{
  const v=validatePartnerLot(lot,"2026-10-10");
  const o=buildPreProjectLotOrigin(v,"project-1","tenant-A");
  expect(o).toMatchObject({lotId:"lote-12",lotRevision:1,projectId:"project-1"});
  expect(()=>buildPreProjectLotOrigin(v,"project-2","tenant-B")).toThrow();
 });
 it("rejects nonphysical or unbounded polygons",()=>{
  expect(()=>validatePartnerLot({...lot,coordinates:[{xM:0,yM:0},{xM:1,yM:0},{xM:2,yM:0}]},"2026-10-10")).toThrow();
  expect(()=>validatePartnerLot({...lot,coordinates:[{xM:0,yM:0},{xM:Infinity,yM:0},{xM:1,yM:1}]},"2026-10-10")).toThrow();
 });
});