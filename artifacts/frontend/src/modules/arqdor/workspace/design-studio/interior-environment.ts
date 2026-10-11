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
const finitePositive=(n:number)=>Number.isFinite(n)&&n>0;
export function buildRectangularRoom(args:{name:string;widthM:number;depthM:number;heightM:number;thicknessM:number;projectId?:string|null}):InteriorEnvironment{
  if(!args.name.trim()||![args.widthM,args.depthM,args.heightM,args.thicknessM].every(finitePositive))throw Error("Ambiente ou medidas invalidas");
  if(args.widthM<=2*args.thicknessM||args.depthM<=2*args.thicknessM)throw Error("Paredes maiores que o ambiente");
  const p=[[0,0,args.widthM,0],[args.widthM,0,args.widthM,args.depthM],[args.widthM,args.depthM,0,args.depthM],[0,args.depthM,0,0]];
  return {source:"new-room",projectId:args.projectId??null,roomId:"draft-"+Date.now().toString(36),name:args.name,
    walls:p.map(([x1,y1,x2,y2],i)=>({id:"wall-"+(i+1),x1,y1,x2,y2,thicknessM:args.thicknessM,heightM:args.heightM})),persistStatus:"draft-only"};
}
export function fromPreProjectRoom(projectId:string,room:{id:string;nome?:string;name?:string;titulo?:string;largura?:number;profundidade?:number;altura?:number;widthM?:number;depthM?:number;heightM?:number},revision?:string):InteriorEnvironment{
  if(!projectId||!room.id)throw Error("Referencia de projeto ou ambiente ausente");
  const width=room.widthM??room.largura,depth=room.depthM??room.profundidade,height=room.heightM??room.altura;
  const valid=[width,depth,height].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0);
  const walls:InteriorWall[]=valid?[
   {id:"preview-wall-1",x1:0,y1:0,x2:width!,y2:0,thicknessM:.14,heightM:height!},
   {id:"preview-wall-2",x1:width!,y1:0,x2:width!,y2:depth!,thicknessM:.14,heightM:height!},
   {id:"preview-wall-3",x1:width!,y1:depth!,x2:0,y2:depth!,thicknessM:.14,heightM:height!},
   {id:"preview-wall-4",x1:0,y1:depth!,x2:0,y2:0,thicknessM:.14,heightM:height!}
  ]:[];
  return {source:"preproject",projectId,roomId:room.id,name:room.nome||room.name||room.titulo||"Ambiente",
    walls,sourceRevision:revision,persistStatus:"draft-only"};
}
