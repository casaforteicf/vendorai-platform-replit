import { expect,it } from "vitest";
import { documentationOpeningRows,documentationOpeningCsv } from "./conceptOpeningSchedule";
const walls=[{id:"w",floor:0,x1:0,y1:0,x2:4,y2:0}];
it("retains authored dimensions and flags inferred defaults",()=>{
 const rows=documentationOpeningRows(walls,[{id:"d",wallId:"w",floor:0,type:"door",offset:0.5,width:1,height:2.2,sillHeight:0},{id:"j",wallId:"w",floor:0,type:"window",offset:0.2}]);
 expect(rows[0]).toMatchObject({width:1,height:2.2,sill:0,status:"Informado",quantity:1});
 expect(rows[1]).toMatchObject({width:1.2,height:1.2,sill:0.9,status:"Dimensões padrão: conferir"});
});
it("keeps orphan and invalid entries visible for correction",()=>{
 expect(documentationOpeningRows([], [{id:"d",wallId:"missing",floor:0,type:"door",offset:0.5}])[0].status).toBe("Parede não encontrada");
 expect(documentationOpeningRows(walls,[{id:"d",wallId:"w",floor:0,type:"door",offset:2,width:NaN}])[0].status).toBe("Medidas inválidas");
});
it("escapes spreadsheet formulas and exports decimal commas without mutating the source",()=>{
 const openings=[{id:'=bad"id',wallId:"w",floor:0,type:"door" as const,offset:0.5,width:1,height:2.2,sillHeight:0}];
 const before=JSON.stringify(openings), csv=documentationOpeningCsv(walls,openings);
 expect(csv).toContain('"\'=bad""id"');expect(csv).toContain('"2,200"');expect(JSON.stringify(openings)).toBe(before);
 expect(documentationOpeningRows(walls,[])).toEqual([]);
});

it("flags wall length/height overflow and degenerate walls",()=>{
 const base={id:"d",wallId:"w",floor:0,type:"door" as const,offset:0.5,width:1,height:2.1,sillHeight:0};
 expect(documentationOpeningRows(walls,[{...base,offset:0}])[0].status).toBe("Vão ultrapassa a parede");
 expect(documentationOpeningRows(walls,[{...base,height:3}])[0].status).toBe("Vão ultrapassa a parede");
 expect(documentationOpeningRows([{...walls[0],x2:0}],[base])[0].status).toBe("Parede inválida");
});
it("detects collisions and duplicate IDs while allowing touching edges",()=>{
 const base={id:"d",wallId:"w",floor:0,type:"door" as const,offset:0.5,width:1,height:2.1,sillHeight:0};
 expect(documentationOpeningRows(walls,[base,{...base,id:"d2",offset:0.6}]).every(r=>r.status==="Vãos sobrepostos")).toBe(true);
 expect(documentationOpeningRows(walls,[base,{...base,id:"d2",offset:0.75}]).every(r=>r.status==="Informado")).toBe(true);
 expect(documentationOpeningRows(walls,[base,{...base}])[0].status).toBe("ID duplicado");
});

it("preserves authored specifications and exports them without guessing missing products",()=>{
 const opening={id:"d",wallId:"w",floor:0,type:"door" as const,offset:0.5,width:1,height:2.1,sillHeight:0,openingStyle:"sliding" as const,leafCount:2,manufacturer:"Fornecedor",frameProfile:"PVC",glassType:"Laminado",catalogProductId:"product-1"};
 const row=documentationOpeningRows(walls,[opening])[0];
 expect(row).toMatchObject({manufacturer:"Fornecedor",frameProfile:"PVC",glassType:"Laminado",catalogProductId:"product-1",leafCount:2,openingStyle:"sliding"});
 const csv=documentationOpeningCsv(walls,[opening]);
 expect(csv).toContain('"Produto vinculado"');expect(csv).toContain('"product-1"');
 expect(documentationOpeningRows(walls,[{...opening,manufacturer:undefined,catalogProductId:undefined,leafCount:0}])[0]).toMatchObject({manufacturer:"",catalogProductId:"",leafCount:null});
});
