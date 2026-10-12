import type { DocumentationWall, DocumentationOpening } from "./conceptDocumentationWalls";
/** Keep one row per authored opening and expose inferred dimensions explicitly. */
export function documentationOpeningRows(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[]) {
 return openings.map(opening => {
  const width=opening.width ?? (opening.type==="door"?0.9:1.2), height=opening.height ?? (opening.type==="door"?2.1:1.2), sill=opening.sillHeight ?? (opening.type==="door"?0:0.9);
  const wall=walls.find(w=>w.id===opening.wallId&&w.floor===opening.floor);
  const valid=Number.isInteger(opening.floor)&&opening.floor>=0&&[width,height,sill,opening.offset].every(Number.isFinite)&&width>0&&height>0&&sill>=0&&opening.offset>=0&&opening.offset<=1;
  const length=wall?Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1):0;
  const wallValid=wall&&[wall.x1,wall.y1,wall.x2,wall.y2,length].every(Number.isFinite)&&length>1e-9;
  const fits=wallValid&&opening.offset*length-width/2>=-1e-8&&opening.offset*length+width/2<=length+1e-8&&sill+height<=2.8+1e-8;
  const overlap=valid&&openings.some(other=>{
   if(other===opening||other.wallId!==opening.wallId||other.floor!==opening.floor)return false;
   const ow=other.width??(other.type==="door"?0.9:1.2),oh=other.height??(other.type==="door"?2.1:1.2),os=other.sillHeight??(other.type==="door"?0:0.9);
   if(![ow,oh,os,other.offset].every(Number.isFinite)||ow<=0||oh<=0||os<0||other.offset<0||other.offset>1)return false;
   return Math.abs(other.offset-opening.offset)*length<(ow+width)/2-1e-8&&Math.min(os+oh,sill+height)>Math.max(os,sill)+1e-8;
  });
  const duplicate=openings.filter(o=>o.id===opening.id).length>1;
  return {id:opening.id,wallId:opening.wallId,floor:opening.floor,type:opening.type,width,height,sill,quantity:1,manufacturer:opening.manufacturer??"",frameProfile:opening.frameProfile??"",glassType:opening.glassType??"",catalogProductId:opening.catalogProductId??"",leafCount:Number.isInteger(opening.leafCount)&&Number(opening.leafCount)>0?opening.leafCount:null,openingStyle:opening.openingStyle??"",status:!wall?"Parede não encontrada":!valid?"Medidas inválidas":!wallValid?"Parede inválida":!fits?"Vão ultrapassa a parede":duplicate?"ID duplicado":overlap?"Vãos sobrepostos":opening.width===undefined||opening.height===undefined||opening.sillHeight===undefined?"Dimensões padrão: conferir":"Informado"};
 });
}
export function documentationOpeningCsv(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[]) {
 const cell=(value: unknown)=>{const s=String(value);return '"'+(/^\s*[=+@-]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';};
 const number=(n:number)=>Number.isFinite(n)?n.toFixed(3).replace('.',','):"";
 return "\uFEFF"+[["ID","Parede","Pavimento (índice)","Tipo","Largura (m)","Altura (m)","Peitoril (m)","Quantidade","Abertura","Folhas","Perfil","Vidro","Fabricante","Produto vinculado","Conferência"],...documentationOpeningRows(walls,openings).map(r=>[r.id,r.wallId,r.floor,r.type==="door"?"Porta":"Janela",number(r.width),number(r.height),number(r.sill),r.quantity,r.openingStyle,r.leafCount??"",r.frameProfile,r.glassType,r.manufacturer,r.catalogProductId,r.status])].map(r=>r.map(cell).join(';')).join('\r\n');
}
