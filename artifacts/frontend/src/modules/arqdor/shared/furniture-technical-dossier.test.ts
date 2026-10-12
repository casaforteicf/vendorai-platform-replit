import { describe, expect, it } from "vitest";
import { buildFurnitureTechnicalDossier } from "./furniture-technical-dossier";
import type { IdentifiedPanelPart } from "./furniture-part-labels";
import type { PanelMaterial } from "./furniture-engineering-core";
const m: PanelMaterial = {id:"mdf1",tenantId:"tenant",manufacturer:"Marca",line:"Linha",sku:"SKU-18",color:"Branco",thicknessMm:18,stockWidthMm:1850,stockLengthMm:2750,grain:"none"};
const p: IdentifiedPanelPart = {id:"p1",tenantId:"tenant",projectId:"projeto",furnitureId:"arm1",name:"Prateleira",roomId:"coz",roomName:"Cozinha",furnitureName:"Armário",revision:"01",quantity:2,widthMm:600,lengthMm:500,materialId:"mdf1",grainDirection:"none",edges:{},operations:[{id:"hole1",kind:"hole",face:"A",xMm:35,yMm:40,diameterMm:5,depthMm:10}]};
describe("structured technical dossier",()=>{
  it("relates each part to room, furniture, materials, drilling and labels",()=>{
    const dossier=buildFurnitureTechnicalDossier({tenantId:"tenant",projectId:"projeto",revision:"01",parts:[p],materials:[m]});
    expect(dossier.rooms[0].furniture[0].pieces[0]).toMatchObject({id:"p1",name:"Prateleira",quantity:2,material:{sku:"SKU-18"}});
    expect(dossier.rooms[0].furniture[0].pieces[0].operations[0].id).toBe("hole1");
    expect(dossier.labels).toHaveLength(2);
    expect(dossier.materials[0].partCount).toBe(2);
    expect(dossier.productionReady).toBe(false);
  });
  it("blocks incompatible revisions",()=>{
    const dossier=buildFurnitureTechnicalDossier({tenantId:"tenant",projectId:"projeto",revision:"02",parts:[p],materials:[m]});
    expect(dossier.status).toBe("blocked");
    expect(dossier.issues).toContainEqual(expect.objectContaining({partId:"p1",severity:"blocking"}));
  });
  it("flags pieces without manufacturing operations for review",()=>{
    const dossier=buildFurnitureTechnicalDossier({tenantId:"tenant",projectId:"projeto",revision:"01",parts:[{...p,operations:[]}],materials:[m]});
    expect(dossier.status).toBe("review-required");
    expect(dossier.issues.some(i=>i.description.includes("Sem operações"))).toBe(true);
  });
});