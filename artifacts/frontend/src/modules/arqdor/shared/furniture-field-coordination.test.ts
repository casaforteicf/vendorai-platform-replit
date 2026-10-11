import {describe,it,expect} from "vitest";
import {checkAsBuilt,inspectSupplierDependencies,checkRectangularClearances,selectConstructionRule} from "./furniture-field-coordination";
describe("field coordination",()=>{
 it("flags measured deviations above tolerance",()=>{
  expect(checkAsBuilt([{objectId:"sink",dimension:"width",designMm:1200,measuredMm:1190,toleranceMm:5,measuredAt:"2026-10-10",measuredBy:"tech",photoRefs:[]}])[0]).toMatchObject({deltaMm:-10,withinTolerance:false,requiresReview:true});
 });
 it("detects supplier cycles and unresolved interfaces",()=>{
  expect(inspectSupplierDependencies([{id:"a",upstreamId:"stone",downstreamId:"cabinet",interfaceName:"support",confirmed:false}]).unconfirmedInterfaces).toEqual(["a"]);
  expect(()=>inspectSupplierDependencies([{id:"a",upstreamId:"stone",downstreamId:"cabinet",interfaceName:"support",confirmed:true},{id:"b",upstreamId:"cabinet",downstreamId:"stone",interfaceName:"measure",confirmed:false}])).toThrow();
 });
 it("checks 3D rectangular envelopes without claiming exact solid interference",()=>{
  const a={id:"a",xMm:0,yMm:0,zMm:0,widthMm:1000,depthMm:500,heightMm:800};
  expect(checkRectangularClearances(a,{...a,id:"b",xMm:500})).toMatchObject({collision:true,status:"bounding-box-reference"});
  expect(checkRectangularClearances(a,{...a,id:"b",xMm:1020},30)).toMatchObject({collision:false,clearanceConcern:true});
 });
 it("prioritizes manufacturer-specific versioned rules for same tenant",()=>{
  const r=selectConstructionRule([{id:"generic",tenantId:"t",revision:1,effectiveFrom:"2026-01-01",minimumClearanceMm:10},{id:"specific",tenantId:"t",manufacturerId:"M",revision:2,effectiveFrom:"2026-01-02",minimumClearanceMm:15}],"t","M","2026-10-10");
  expect(r?.id).toBe("specific");
  expect(selectConstructionRule([],"t","M","2026-10-10")).toBeNull();
 });
});