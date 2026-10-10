/** Lote 13.40: deterministic 2D placement and AABB collision detection.
 * Coordinates in millimeters, plan-view only. Does not replace 3D clash detection.
 */
export type FurnitureBounds={id:string;roomId:string;xMm:number;yMm:number;widthMm:number;depthMm:number;rotationDeg:0|90|180|270};
export type RoomBounds={id:string;widthMm:number;depthMm:number};
export type PlacementValidation={valid:boolean;reason:"ok"|"out-of-room"|"collision";collidingIds:string[];suggested?:FurnitureBounds};
function dimensions(p:FurnitureBounds){return p.rotationDeg===90||p.rotationDeg===270?{w:p.depthMm,d:p.widthMm}:{w:p.widthMm,d:p.depthMm};}
function valid(p:FurnitureBounds){return !!p.id&&!!p.roomId&&[p.xMm,p.yMm,p.widthMm,p.depthMm].every(Number.isFinite)&&p.widthMm>0&&p.depthMm>0;}
export function validateFurniturePlacement(room:RoomBounds, candidate:FurnitureBounds,existing:readonly FurnitureBounds[],clearanceMm=0):PlacementValidation{
 if(!valid(candidate)||candidate.roomId!==room.id||!Number.isFinite(room.widthMm)||!Number.isFinite(room.depthMm)||room.widthMm<=0||room.depthMm<=0||
 !Number.isFinite(clearanceMm)||clearanceMm<0)throw Error("Invalid geometry or room");
 const {w,d}=dimensions(candidate);
 if(candidate.xMm<0||candidate.yMm<0||candidate.xMm+w>room.widthMm||candidate.yMm+d>room.depthMm)
  return {valid:false,reason:"out-of-room",collidingIds:[]};
 const collisions=existing.filter(p=>{
  if(!valid(p))throw Error("Invalid existing furniture");
  if(p.roomId!==room.id||p.id===candidate.id)return false;
  const size=dimensions(p);
  return candidate.xMm<p.xMm+size.w+clearanceMm&&candidate.xMm+w+clearanceMm>p.xMm&&
   candidate.yMm<p.yMm+size.d+clearanceMm&&candidate.yMm+d+clearanceMm>p.yMm;
 }).map(p=>p.id);
 return {valid:collisions.length===0,reason:collisions.length?"collision":"ok",collidingIds:collisions};
}
export function moveFurnitureInRoom(args:{room:RoomBounds;items:readonly FurnitureBounds[];id:string;xMm:number;yMm:number;clearanceMm?:number}){
 const item=args.items.find(p=>p.id===args.id);
 if(!item)throw Error("Furniture not found");
 const candidate={...item,xMm:args.xMm,yMm:args.yMm};
 const validation=validateFurniturePlacement(args.room,candidate,args.items,args.clearanceMm);
 return {items:validation.valid?args.items.map(p=>p.id===item.id?candidate:p):[...args.items],validation};
}
