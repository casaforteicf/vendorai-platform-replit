import {describe,it,expect} from "vitest";
import {buildDxfImportPreview,parseDxfReference} from "./dxf-reference-import";
const dxf=(entities:string,units=4)=>[
"0","SECTION","2","HEADER","9","$INSUNITS","70",String(units),"0","ENDSEC",
"0","SECTION","2","ENTITIES",...entities.split("|"),"0","ENDSEC","0","EOF"
].join("\n");
describe("DXF ASCII reference importer",()=>{
 it("parses lines and circles in millimeters with layer identity",()=>{
  const source=dxf("0|LINE|8|CAMADA|10|0|20|1|11|100|21|50|0|CIRCLE|8|FUROS|10|10|20|20|40|5");
  const r=buildDxfImportPreview("planta.DXF",source);
  expect(r.reference.entities).toHaveLength(2);
  expect(r.reference.entities[0]).toMatchObject({kind:"line",layer:"CAMADA",x2:100});
  expect(r.reference.entities[1]).toMatchObject({kind:"circle",radius:5});
  expect(r.reference.unitScaleToMm).toBe(1);
  expect(r.reference.readyForManufacturing).toBe(false);
 });
 it("parses polyline and exposes explicit scale for inches",()=>{
  const r=parseDxfReference(dxf("0|LWPOLYLINE|8|CONTORNO|70|1|10|0|20|0|10|10|20|20",1));
  expect(r.entities[0]).toMatchObject({kind:"polyline",closed:true,points:[{x:0,y:0},{x:10,y:20}]});
  expect(r.unitScaleToMm).toBe(25.4);
 });
 it("does not flatten curved bulges incorrectly",()=>{
  const r=parseDxfReference(dxf("0|LWPOLYLINE|10|0|20|0|10|10|20|0|42|1"));
  expect(r.entities).toHaveLength(0);
  expect(r.warnings.some(w=>w.includes("complex"))).toBe(true);
 });
 it("rejects oversized or malformed data",()=>{
  expect(()=>parseDxfReference("0\nLINE\n10")).toThrow();
  expect(()=>parseDxfReference("0\nEOF",{maxBytes:2})).toThrow();
 });
 it("flags unknown units instead of guessing",()=>{
  const r=parseDxfReference(dxf("0|LINE|10|0|20|0|11|100|21|1",0));
  expect(r.units).toBe("unknown");
  expect(r.warnings.some(w=>w.includes("calibration"))).toBe(true);
 });
});