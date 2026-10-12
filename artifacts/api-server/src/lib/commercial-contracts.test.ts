import {describe,it,expect} from "vitest";
import {consolidateProjectQuantities,matchCatalogCandidates,nextRevision,validatePaymentStages,verifyAttachmentScope} from "./commercial-contracts";
describe("LOTE 05 — contratos de integração",()=>{
 it("isola catálogo por tenant e evita textura como produto",()=>{
  const catalog=[
  {tenantId:"a",id:"1",kind:"product" as const,category:"porta",sku:"PVC1",unit:"un"},
  {tenantId:"b",id:"2",kind:"product" as const,category:"porta",sku:"PVC1",unit:"un"},
  {tenantId:"a",id:"3",kind:"texture" as const,category:"material",sku:"PVC1",unit:"un"}];
  expect(matchCatalogCandidates({tenantId:"a",sku:"PVC1",description:"Porta"},catalog).map(x=>x.entry.id)).toEqual(["1"]);
 });
 it("não permite quantidades de projetos diferentes",()=>{
  expect(()=>consolidateProjectQuantities([{tenantId:"t",projectId:"B",environmentId:"sala",phaseId:"1",sourceElementId:"p",unit:"m2",quantityMilli:1000}],"t","A")).toThrow();
 });
 it("mantém revisões de um único negócio",()=>{
  const base={id:"a",tenantId:"t",dealId:"d",revision:1,status:"draft" as const,lines:[],createdAt:"2026-10-10"};
  expect(nextRevision(base,[{...base,id:"b",revision:2}]).revision).toBe(3);
  expect(()=>nextRevision(base,[{...base,tenantId:"other"}])).toThrow();
 });
 it("exige conciliação de parcelas",()=>{
  expect(()=>validatePaymentStages(100,[{stageId:"1",amountCents:90,method:"pix"}])).toThrow();
  expect(validatePaymentStages(100,[{stageId:"1",amountCents:100,method:"pix"}]).totalCents).toBe(100);
 });
 it("impede anexo de outro negócio",()=>{
  const file={tenantId:"t",dealId:"d",leadId:"l",documentType:"invoice" as const,storageKey:"private/path",createdBy:"u",createdAt:"2026-10-10",source:"manual" as const};
  expect(()=>verifyAttachmentScope(file,{tenantId:"t",dealId:"outro",leadId:"l"})).toThrow();
 });
});
