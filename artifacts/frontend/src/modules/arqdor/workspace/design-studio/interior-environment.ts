/** Lote 13 — The interior editor always starts from an architectural environment context.
 * This is a client-side draft contract; storage and project linking must be supplied by workspace APIs.
 * All physical lengths in meters, same convention as Concept geometry.
 */
import type {InteriorObstacle} from "../../shared/furniture-obstacle-clashes";
export type InteriorSource="preproject"|"new-room"|"import";
export type InteriorWall={id:string;x1:number;y1:number;x2:number;y2:number;thicknessM:number;heightM:number};
export type InteriorEnvironment={
  source:InteriorSource;projectId:string|null;roomId:string;name:string;
  walls:InteriorWall[];obstacles?:InteriorObstacle[];sourceRevision?:string;sourceFileName?:string;
  persistStatus:"draft-only";
};
export type InteriorOpeningClearance={id:string;xMm:number;yMm:number;widthMm:number;depthMm:number};
const finitePositive=(n:number)=>Number.isFinite(n)&&n>0;
/** Clearances supplied by the architectural model must already be room-local and measured in millimeters. */
export function openingClearanceObstacles(openings:readonly InteriorOpeningClearance[]):InteriorObstacle[]{
 const ids=new Set<string>();
 return openings.map(opening=>{
  if(!opening||typeof opening.id!=="string"||!opening.id||ids.has(opening.id)||![opening.xMm,opening.yMm,opening.widthMm,opening.depthMm].every(Number.isFinite)||opening.widthMm<=0||opening.depthMm<=0)throw Error("Invalid architectural opening clearance");
  ids.add(opening.id);
  return {...opening,kind:"opening-clearance" as const};
 });
}

export function buildRectangularRoom(args:{name:string;widthM:number;depthM:number;heightM:number;thicknessM:number;projectId?:string|null}):InteriorEnvironment{
  if(!args.name.trim()||![args.widthM,args.depthM,args.heightM,args.thicknessM].every(finitePositive))throw Error("Ambiente ou medidas invalidas");
  if(args.widthM<=2*args.thicknessM||args.depthM<=2*args.thicknessM)throw Error("Paredes maiores que o ambiente");
  const p=[[0,0,args.widthM,0],[args.widthM,0,args.widthM,args.depthM],[args.widthM,args.depthM,0,args.depthM],[0,args.depthM,0,0]];
  return {source:"new-room",projectId:args.projectId??null,roomId:"draft-"+Date.now().toString(36),name:args.name,
    walls:p.map(([x1,y1,x2,y2],i)=>({id:"wall-"+(i+1),x1,y1,x2,y2,thicknessM:args.thicknessM,heightM:args.heightM})),persistStatus:"draft-only"};
}
export function fromPreProjectRoom(projectId:string,room:{id:string;nome?:string;name?:string;titulo?:string;largura?:number;profundidade?:number;altura?:number;widthM?:number;depthM?:number;heightM?:number;walls?:InteriorWall[];paredes?:InteriorWall[];openingClearances?:InteriorOpeningClearance[]},revision?:string):InteriorEnvironment{
  if(!projectId||!room.id)throw Error("Referencia de projeto ou ambiente ausente");
  const width=room.widthM??room.largura,depth=room.depthM??room.profundidade,height=room.heightM??room.altura;
  const valid=[width,depth,height].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0);
  const imported=room.walls??room.paredes;
  const measuredWalls=Array.isArray(imported)&&imported.length>=3&&imported.every(w=>w&&typeof w.id==="string"&&w.id.length>0&&[w.x1,w.y1,w.x2,w.y2,w.thicknessM,w.heightM].every(Number.isFinite)&&w.thicknessM>0&&w.heightM>0&&Math.hypot(w.x2-w.x1,w.y2-w.y1)>0)?imported.map(w=>({...w})):null;
  const walls:InteriorWall[]=measuredWalls??(valid?[
   {id:"preview-wall-1",x1:0,y1:0,x2:width!,y2:0,thicknessM:.14,heightM:height!},
   {id:"preview-wall-2",x1:width!,y1:0,x2:width!,y2:depth!,thicknessM:.14,heightM:height!},
   {id:"preview-wall-3",x1:width!,y1:depth!,x2:0,y2:depth!,thicknessM:.14,heightM:height!},
   {id:"preview-wall-4",x1:0,y1:depth!,x2:0,y2:0,thicknessM:.14,heightM:height!}
  ]:[]);
  return {source:"preproject",projectId,roomId:room.id,name:room.nome||room.name||room.titulo||"Ambiente",
    walls,obstacles:room.openingClearances?openingClearanceObstacles(room.openingClearances):undefined,sourceRevision:revision,persistStatus:"draft-only"};
}

/** Only allow furniture placement in rooms with a verified axis-aligned rectangular boundary.
 * Irregular BIM rooms must use the polygon-aware placement engine, not a bounding box.
 */
export function rectangularFurnitureRoomBounds(environment:InteriorEnvironment):{id:string;widthMm:number;depthMm:number}|null{
 const walls=environment.walls;
 if(walls.length!==4)return null;
 const xs=walls.flatMap(w=>[w.x1,w.x2]),ys=walls.flatMap(w=>[w.y1,w.y2]);
 if(![...xs,...ys].every(Number.isFinite))return null;
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 if(Math.abs(minX)>1e-6||Math.abs(minY)>1e-6||maxX<=0||maxY<=0)return null;
 const corners=new Set(["0,0",maxX+",0",maxX+","+maxY,"0,"+maxY]);
 const seen=new Set<string>();
 for(const wall of walls){
  const from=wall.x1+","+wall.y1,to=wall.x2+","+wall.y2;
  if(!corners.has(from)||!corners.has(to)||from===to||
    !(Math.abs(wall.x1-wall.x2)<1e-6||Math.abs(wall.y1-wall.y2)<1e-6))return null;
  const edge=[from,to].sort().join("|");
  if(seen.has(edge))return null;
  seen.add(edge);
 }
 if(seen.size!==4)return null;
 const expected=[["0,0",maxX+",0"],[maxX+",0",maxX+","+maxY],[maxX+","+maxY,"0,"+maxY],["0,"+maxY,"0,0"]].map(pair=>pair.sort().join("|"));
 if(expected.some(edge=>!seen.has(edge)))return null;
 return {id:environment.roomId,widthMm:Math.round(maxX*1000),depthMm:Math.round(maxY*1000)};
}
