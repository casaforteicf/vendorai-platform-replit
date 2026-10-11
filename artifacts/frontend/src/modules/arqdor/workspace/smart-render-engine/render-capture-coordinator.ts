import type { RenderSceneSnapshot } from "./render-scene-contract";
import type { GeometryTransfer } from "./render-geometry-export";
import type { DiffusePreviewOptions } from "./render-diffuse-preview";
import { buildExperimentalRenderOptions } from "./render-scene-adapter";

/** Pair callbacks from one explicit capture request. Results from older requests cannot replace newer ones. */
export function createRenderCaptureCoordinator() {
 let nextToken = 0;
 let active: { token:number; snapshot?:RenderSceneSnapshot; geometry?:GeometryTransfer; error?:string } | null = null;
 const begin = () => {
   const token=++nextToken;
   active={token};
   return {renderSceneSnapshotToken:token,renderGeometryExportToken:token};
 };
 const acceptSnapshot=(token:number,snapshot:RenderSceneSnapshot)=>{
   if(!active||active.token!==token)return false;
   active.snapshot=snapshot;
   return true;
 };
 const acceptGeometry=(token:number,geometry:GeometryTransfer)=>{
   if(!active||active.token!==token)return false;
   active.geometry=geometry;
   return true;
 };
 const fail=(token:number,message:string)=>{
   if(!active||active.token!==token)return false;
   active.error=message||"Falha na captura";
   return true;
 };
 const consume=(token:number):DiffusePreviewOptions|null=>{
   if(!active||active.token!==token)return null;
   if(active.error)throw Error(active.error);
   if(!active.snapshot||!active.geometry)return null;
   const {snapshot,geometry}=active;
   active=null;
   return buildExperimentalRenderOptions({snapshot,geometry});
 };
 const cancel=()=>{active=null;};
 return {begin,acceptSnapshot,acceptGeometry,fail,consume,cancel};
}
