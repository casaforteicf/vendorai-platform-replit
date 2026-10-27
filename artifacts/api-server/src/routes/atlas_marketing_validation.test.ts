import {describe,it,expect} from "vitest";
import {isValidMarketingPayload,isValidPlanDate} from "./atlas_marketing_validation.js";
describe("Atlas marketing plan validation",()=>{
 it("accepts new and edited marketing plans",()=>{
  expect(isValidMarketingPayload({revision:0,strategies:{"niche-01":{icp:"Construtoras",planStatus:"draft",dueDate:"2026-10-31"}}})).toBe(true);
  expect(isValidMarketingPayload({revision:3,strategies:{"niche-01":{owner:"Equipe",actions:"Ligar para leads",actualResults:"10 contatos"}}})).toBe(true);
 });
 it("rejects malformed payloads",()=>{
  for(const v of [null,[],{}, {revision:-1,strategies:{}},{revision:0,strategies:[]},{revision:0,strategies:{"other":{icp:"x"}}},{revision:0,strategies:{"niche-01":{unsafe:"x"}}},{revision:0,strategies:{"niche-01":{planStatus:"injected"}}},{revision:0,strategies:{"niche-01":{owner:"x".repeat(8001)}}}])expect(isValidMarketingPayload(v)).toBe(false);
 });
 it("accepts true calendar dates and rejects rollover dates",()=>{
  expect(isValidPlanDate("2028-02-29")).toBe(true);
  for(const d of ["2027-02-29","2026-02-30","2026-13-01","2026-1-02","never"])expect(isValidPlanDate(d)).toBe(false);
 });
});
