import type { DocumentationWall, DocumentationOpening } from "./conceptDocumentationWalls";
/** Keep one row per authored opening and expose inferred dimensions explicitly. */
export function documentationOpeningRows(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[]) {
 return openings.map(opening => {
  const width=opening.width ?? (opening.type==="door"?0.9:1.2), height=opening.height ?? (opening.type==="door"?2.1:1.2), sill=opening.sillHeight ?? (opening.type==="door"?0:0.9);
  const wall=walls.find(w=>w.id===opening.wallId&&w.floor===opening.floor);
  const valid=[width,height,sill,opening.offset].every(Number.isFinite)&&width>0&&height>0&&sill>=0&&opening.offset>=0&&opening.offset<=1;
  return {id:opening.id,wallId:opening.wallId,floor:opening.floor,type:opening.type,width,height,sill,quantity:1,status:!wall?"Parede não encontrada":!valid?"Medidas inválidas":opening.width===undefined||opening.height===undefined||opening.sillHeight===undefined?"Dimensões padrão: conferir":"Informado"};
 });
}
export function documentationOpeningCsv(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[]) {
 const cell=(value: unknown)=>{const s=String(value);return '"'+(/^\s*[=+@-]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};
 const number=(n:number)=>Number.isFinite(n)?n.toFixed(3).replace('.',','):"";
 return "\uFEFF"+[["ID","Parede","Pavimento (índice)","Tipo","Largura (m)","Altura (m)","Peitoril (m)","Quantidade","Conferência"],...documentationOpeningRows(walls,openings).map(r=>[r.id,r.wallId,r.floor,r.type==="door"?"Porta":"Janela",number(r.width),number(r.height),number(r.sill),r.quantity,r.status])].map(r=>r.map(cell).join(';')).join('\r\n');
}
