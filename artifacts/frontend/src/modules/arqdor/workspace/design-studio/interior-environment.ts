/** Lote 13 — The interior editor always starts from an architectural environment context.
 * This is a client-side draft contract; storage and project linking must be supplied by workspace APIs.
 * All physical lengths in meters, same convention as Concept geometry.
 */
export type InteriorSource="preproject"|"new-room"|"import";
export type InteriorWall={id:string;x1:number;y1:number;x2:number;y2:number;thicknessM:number;heightM:number};
export type InteriorEnvironment={
  source:InteriorSource;projectId:string|null;roomId:string;name:string;
  walls:InteriorWall[];sourceRevision?:string;sourceFileName?:string;
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
export function fromPreProjectRoom(projectId:string,room:{id:string;nome?:string;name?:string;titulo?:string},revision?:string):InteriorEnvironment{
  if(!projectId||!room.id)throw Error("Referencia de projeto ou ambiente ausente");
  return {source:"preproject",projectId,roomId:room.id,name:room.nome||room.name||room.titulo||"Ambiente",
    walls:[],sourceRevision:revision,persistStatus:"draft-only"};
}
