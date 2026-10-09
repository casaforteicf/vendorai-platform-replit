/** Compare BIM wall identifiers before applying changes to hosted MEP points. */
export type WallSnapshot = { id:string; floor:number; x1:number; y1:number; x2:number; y2:number; thickness?:number };
export type HostedMepPoint = { id:string; hostElementId:string|null; floorId:string };
export type HostImpact = { nodeId:string; hostElementId:string; reason:"removed"|"modified"|"floor_changed" };
const sameGeometry=(a:WallSnapshot,b:WallSnapshot)=>a.floor===b.floor && a.x1===b.x1 && a.y1===b.y1 && a.x2===b.x2 && a.y2===b.y2 && a.thickness===b.thickness;
/** Fail closed: never move hosted coordinates from a model change without reviewing anchors. */
export function inspectMepWallImpact(before:readonly WallSnapshot[],after:readonly WallSnapshot[],points:readonly HostedMepPoint[]):HostImpact[]{
 const old=new Map(before.map(w=>[w.id,w])), next=new Map(after.map(w=>[w.id,w]));
 return points.flatMap(point=>{
  if(!point.hostElementId)return [];
  const prev=old.get(point.hostElementId),now=next.get(point.hostElementId);
  if(!prev) return []; // only evaluate hosts belonging to baseline model
  if(!now)return [{nodeId:point.id,hostElementId:point.hostElementId,reason:"removed" as const}];
  if(prev.floor!==now.floor)return [{nodeId:point.id,hostElementId:point.hostElementId,reason:"floor_changed" as const}];
  if(!sameGeometry(prev,now))return [{nodeId:point.id,hostElementId:point.hostElementId,reason:"modified" as const}];
  return [];
 });
}
