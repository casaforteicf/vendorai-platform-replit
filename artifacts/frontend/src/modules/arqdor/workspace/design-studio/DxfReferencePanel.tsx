import React, {useMemo,useState} from "react";
import {parseDxfReference, type DxfPrimitive} from "../../shared/dxf-reference-import";
import {buildInitialImportDiagnostic} from "../../shared/universal-import-contract";

type DxfReferencePanelProps={onApply?:(payload:unknown)=>void};
const MAX_FILE_BYTES=5_000_000;
function coords(entity:DxfPrimitive):{x:number;y:number}[]{
  if(entity.kind==="line")return [{x:entity.x1,y:entity.y1},{x:entity.x2,y:entity.y2}];
  if(entity.kind==="polyline")return entity.points;
  const pts=[];const start=entity.kind==="arc"?entity.startDeg:0;
  const sweep=entity.kind==="arc"?((entity.endDeg-entity.startDeg+360)%360||360):360;
  for(let i=0;i<=48;i++){const rad=(start+sweep*i/48)*Math.PI/180;pts.push({x:entity.cx+Math.cos(rad)*entity.radius,y:entity.cy+Math.sin(rad)*entity.radius});}
  return pts;
}
function makeView(entities:DxfPrimitive[]){
  const pts=entities.flatMap(coords);if(!pts.length)return {minX:0,minY:0,width:100,height:100};
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const width=Math.max(maxX-minX,1),height=Math.max(maxY-minY,1);
  return {minX:minX-width*.05,minY:minY-height*.05,width:width*1.1,height:height*1.1};
}
export function DxfReferencePanel({onApply}:DxfReferencePanelProps){
  const [name,setName]=useState("");
  const [source,setSource]=useState("");
  const [error,setError]=useState("");
  const parsed=useMemo(()=>{if(!source)return null;try{return parseDxfReference(source);}catch(e){return e instanceof Error?e.message:String(e);}},[source]);
  const reference=parsed&&typeof parsed!=="string"?parsed:null;
  const view=useMemo(()=>makeView(reference?.entities??[]),[reference]);
  async function selectFile(file?:File){
    if(!file)return;
    setSource("");setError("");setName(file.name);
    if(!file.name.toLowerCase().endsWith(".dxf")){setError("Nesta visualização somente DXF ASCII é aceito. Outros formatos requerem conversores específicos.");return;}
    if(file.size>MAX_FILE_BYTES){setError("Arquivo acima do limite de 5 MB para pré-visualização.");return;}
    try{setSource(await file.text());}catch{setError("Não foi possível ler o arquivo.");}
  }
  return <section className="flex h-full flex-col gap-3 overflow-auto p-4" aria-label="Importar referência DXF">
    <h3 className="text-sm font-semibold text-slate-900">Importar referência CAD</h3>
    <p className="text-xs text-slate-600">DXF ASCII 2D — visualização preliminar. Não gera paredes, peças ou fabricação automaticamente.</p>
    <label className="flex cursor-pointer flex-col gap-1 rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-700">
      Escolher arquivo .dxf
      <input type="file" accept=".dxf" onChange={e=>void selectFile(e.currentTarget.files?.[0])} className="w-full text-xs"/>
    </label>
    {name&&<div className="break-all text-xs text-slate-600">{name}</div>}
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    {typeof parsed==="string"&&<p role="alert" className="text-xs text-red-700">{parsed}</p>}
    {reference&&<>
      <p className="text-xs text-slate-700">{reference.entities.length} entidades reconhecidas · Unidades: {reference.units}{reference.unitScaleToMm===null?" (calibração necessária)":""}</p>
      <svg aria-label="Pré-visualização do DXF" role="img" viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`} className="min-h-40 w-full rounded-lg border bg-white" preserveAspectRatio="xMidYMid meet">
        <g transform={`translate(0 ${2*view.minY+view.height}) scale(1 -1)`} stroke="#334155" strokeWidth={Math.max(view.width,view.height)/450} fill="none">
          {reference.entities.map((e,i)=>{
            const pts=coords(e);return <polyline key={i} points={pts.map(p=>`${p.x},${p.y}`).join(" ")} strokeLinejoin="round" strokeLinecap="round"/>;
          })}
        </g>
      </svg>
      {reference.warnings.map((warning,i)=><p key={i} className="text-xs text-amber-800">{warning}</p>)}
      <button type="button" disabled={!reference.entities.length} onClick={()=>onApply?.({kind:"arqdor-dxf-reference",fileName:name,diagnostic:buildInitialImportDiagnostic(name),reference})} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Adicionar referência ao projeto</button>
      <p className="text-xs text-slate-500">Este botão envia os dados ao Studio quando houver tratamento de referências configurado. Ainda não salva automaticamente no projeto.</p>
    </>}
  </section>;
}
