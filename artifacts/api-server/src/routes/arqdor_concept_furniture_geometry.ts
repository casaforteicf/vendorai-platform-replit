/** Conservative single-room Concept publisher. Never asserts validity for multi-room adjacency. */
type ConceptRoom={id:string;x:number;y:number;width:number;depth:number};
type ConceptWall={id:string;floor:number;x1:number;y1:number;x2:number;y2:number;thickness?:number};
type ConceptOpening={id:string;wallId:string;floor:number;type:"door"|"window";offset:number;width?:number};
type Zone={id:string;xMm:number;yMm:number;widthMm:number;depthMm:number};
export function conceptRoomFurnitureGeometry(room:ConceptRoom,walls:readonly ConceptWall[],openings:readonly ConceptOpening[]){
 const {x,y,width,depth}=room;
 if(![x,y,width,depth].every(Number.isFinite)||width<=0||depth<=0||width>500||depth>500)throw Error("Ambiente inválido");
 const w=Math.round(width*1000),d=Math.round(depth*1000);
 if(w<=0||d<=0)throw Error("Dimensão não representável");
 const zones:Zone[]=[];
 const wallMap=new Map<string,ConceptWall>();
 const openingIds=new Set<string>();
 const eps=0.001;
 for(const wall of walls){
  if(!wall.id||wallMap.has(wall.id)||![wall.x1,wall.x2,wall.y1,wall.y2].every(Number.isFinite))throw Error("Parede inválida");
  if(!Number.isInteger(wall.floor)||wall.floor<0)throw Error("Pavimento inválido");
  const vertical=Math.abs(wall.x1-wall.x2)<eps,horizontal=Math.abs(wall.y1-wall.y2)<eps;
  if(!horizontal&&!vertical)throw Error("Paredes oblíquas exigem BIM completo");
  if(Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1)<eps)throw Error("Parede sem comprimento");
  const left=Math.min(wall.x1,wall.x2),right=Math.max(wall.x1,wall.x2),top=Math.min(wall.y1,wall.y2),bottom=Math.max(wall.y1,wall.y2);
  const thickness=wall.thickness??0.15;
  if(!Number.isFinite(thickness)||thickness<=0||thickness>1)throw Error("Espessura inválida");
  // Refuse partial or unassociated walls rather than silently missing an obstruction.
  if(left<x-eps||right>x+width+eps||top<y-eps||bottom>y+depth+eps)throw Error("Parede fora do ambiente");
  const tx=Math.max(0,Math.round((left-x-thickness/2)*1000)),ty=Math.max(0,Math.round((top-y-thickness/2)*1000));
  const rx=Math.min(w,Math.round((right-x+thickness/2)*1000)),by=Math.min(d,Math.round((bottom-y+thickness/2)*1000));
  if(rx<=tx||by<=ty)throw Error("Parede fora da área útil");
  zones.push({id:"wall:"+wall.id,xMm:tx,yMm:ty,widthMm:rx-tx,depthMm:by-ty});
  wallMap.set(wall.id,wall);
 }
 for(const opening of openings){
  const wall=wallMap.get(opening.wallId),openingWidth=opening.width;
  if(!wall||!opening.id||openingIds.has(opening.id)||!["door","window"].includes(opening.type)||opening.floor!==wall.floor||!Number.isFinite(opening.offset)||typeof openingWidth!=="number"||!Number.isFinite(openingWidth)||opening.offset<0||openingWidth<=0)throw Error("Abertura incompleta");
  const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,len=Math.hypot(dx,dy);
  if(opening.offset+openingWidth>len+eps)throw Error("Abertura ultrapassa parede");
  openingIds.add(opening.id);
  const ax=wall.x1+dx/len*opening.offset-x,ay=wall.y1+dy/len*opening.offset-y;
  const bx=wall.x1+dx/len*(opening.offset+openingWidth)-x,by=wall.y1+dy/len*(opening.offset+openingWidth)-y;
  // Door side/hinge uncertainty: reserve both sides for the full leaf sweep.
  const clearance=opening.type==="door"?openingWidth:0.3;
  const minX=Math.max(0,Math.round((Math.min(ax,bx)-clearance)*1000));
  const minY=Math.max(0,Math.round((Math.min(ay,by)-clearance)*1000));
  const maxX=Math.min(w,Math.round((Math.max(ax,bx)+clearance)*1000));
  const maxY=Math.min(d,Math.round((Math.max(ay,by)+clearance)*1000));
  if(maxX>minX&&maxY>minY)zones.push({id:"opening:"+opening.id,xMm:minX,yMm:minY,widthMm:maxX-minX,depthMm:maxY-minY});
 }
 return {outline:[{xMm:0,yMm:0},{xMm:w,yMm:0},{xMm:w,yMm:d},{xMm:0,yMm:d}],exclusions:zones};
}
