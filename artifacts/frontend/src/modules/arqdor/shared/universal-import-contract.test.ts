import {describe,expect,it} from "vitest";
import {buildInitialImportDiagnostic,inspectImportFileName,importFormats} from "./universal-import-contract";
describe("universal project import preflight",()=>{
  it("recognizes uppercase compound file path and SketchUp without claiming conversion",()=>{
    expect(inspectImportFileName("C:\\Projetos\\Casa.SKP").format).toBe("skp");
    const result=buildInitialImportDiagnostic("Casa.SKP");
    expect(result.adapterStatus).toBe("requires-authorized-converter");
    expect(result.capabilities).toEqual([]);
    expect(result.readyForManufacturing).toBe(false);
  });
  it("marks RVT and Promob native as requiring verified converters",()=>{
    for(const file of ["casa.rvt","cozinha.promob"]) {
      const r=buildInitialImportDiagnostic(file);
      expect(r.warnings.some(w=>w.code==="CONVERTER_REQUIRED")).toBe(true);
    }
  });
  it("recognizes open interchange candidates without claiming decoded geometry",()=>{
    for(const file of ["obra.ifc","corte.DXF","item.GLB","tampo.step"]) {
      const r=buildInitialImportDiagnostic(file);
      expect(r.adapterStatus).toBe("candidate-open-format");
      expect(r.warnings.some(w=>w.code==="GEOMETRY_NOT_DECODED")).toBe(true);
    }
  });
  it("handles unknown extensions safely",()=>{
    const r=buildInitialImportDiagnostic("item.custom");
    expect(r.format).toBe("unknown");
    expect(r.warnings[0].code).toBe("UNSUPPORTED_FORMAT");
  });
  it("supports aliased format extensions and rejects empty names",()=>{
    expect(inspectImportFileName("peca.STP").format).toBe("step");
    expect(inspectImportFileName("projeto.jpeg").format).toBe("image");
    expect(()=>inspectImportFileName(" ")).toThrow();
    expect(new Set(importFormats.map(f=>f.format)).size).toBe(importFormats.length);
  });
});
