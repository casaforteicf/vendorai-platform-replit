import { useCallback, useRef, useState } from "react";
import { createRenderCaptureCoordinator } from "./render-capture-coordinator";
import type { RenderSceneSnapshot } from "./render-scene-contract";
import type { GeometryTransfer } from "./render-geometry-export";
import type { DiffusePreviewOptions } from "./render-diffuse-preview";

/** Opt-in host bridge; no capture starts until requestCapture is explicitly invoked. */
export function useExperimentalRenderCapture(){
 const coordinator=useRef(createRenderCaptureCoordinator());
 const [renderCaptureToken,setRenderCaptureToken]=useState<number|undefined>();
 const [options,setOptions]=useState<DiffusePreviewOptions|null>(null);
 const [error,setError]=useState<string|null>(null);
 const requestCapture=useCallback(()=>{
  coordinator.current.cancel();
  setOptions(null);setError(null);
  const token=coordinator.current.begin().renderSceneSnapshotToken;
  setRenderCaptureToken(token);
 },[]);
 const finish=useCallback((token:number)=>{
  try{const value=coordinator.current.consume(token);if(value)setOptions(value);}
  catch(e){setError(e instanceof Error?e.message:String(e));setOptions(null);}
 },[]);
 const onRenderSceneSnapshot=useCallback((snapshot:RenderSceneSnapshot)=>{
  const token=coordinator.current.currentToken();
  if(token!==null&&coordinator.current.acceptSnapshot(token,snapshot))finish(token);
 },[finish]);
 const onRenderGeometryExport=useCallback((geometry:GeometryTransfer)=>{
  const token=coordinator.current.currentToken();
  if(token!==null&&coordinator.current.acceptGeometry(token,geometry))finish(token);
 },[finish]);
 const onRenderCaptureError=useCallback((message:string)=>{
  const token=coordinator.current.currentToken();
  if(token!==null)coordinator.current.fail(token,message);
  setError(message);setOptions(null);
 },[]);
 return {renderCaptureToken,onRenderSceneSnapshot,onRenderGeometryExport,onRenderCaptureError,
  requestCapture,options,error};
}
