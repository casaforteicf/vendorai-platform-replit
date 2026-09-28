import { describe, expect, it } from "vitest";
import { parseIfcMetadata } from "../lib/arqdor-ifc-metadata.js";

describe("Arqdor IFC metadata parser", () => {
  it("lê schema, projeto, pavimento e principais entidades BIM", () => {
    const ifc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('sample.ifc','2026-09-28T10:00:00',('Arqdor'),('VendorAI'),'Arqdor','Arqdor','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('gid',$,'Casa Teste',$,$,$,$,$,$);
#2=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#3=IFCBUILDINGSTOREY('s1',$,'Térreo',$,$,$,$,$,.ELEMENT.,0.);
#4=IFCWALL('w1',$,'Parede 1',$,$,$,$,$,$);
#5=IFCDOOR('d1',$,'Porta 1',$,$,$,$,$,$);
#6=IFCWINDOW('j1',$,'Janela 1',$,$,$,$,$,$);
#7=IFCSLAB('l1',$,'Laje',$,$,$,$,$,.FLOOR.);
#8=IFCSPACE('sp1',$,'Sala',$,$,$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

    const metadata = parseIfcMetadata(ifc);
    expect(metadata.schema).toBe("IFC4");
    expect(metadata.projectName).toBe("Casa Teste");
    expect(metadata.unit).toBe("mm");
    expect(metadata.storeys).toHaveLength(1);
    expect(metadata.storeys[0]?.name).toBe("Térreo");
    expect(metadata.counts).toMatchObject({
      walls: 1,
      doors: 1,
      windows: 1,
      slabs: 1,
      spaces: 1,
    });
  });

  it("rejeita arquivo que não é IFC STEP", () => {
    expect(() => parseIfcMetadata("not an ifc")).toThrow(/IFC STEP/);
  });
});
