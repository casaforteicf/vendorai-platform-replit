import {buildInitialImportDiagnostic} from "./universal-import-contract";

/** Lote 13.79: DXF ASCII parser for geometry-reference entities.
 * Safe subset: LINE, CIRCLE, ARC, LWPOLYLINE in ENTITIES.
 * Not a DWG converter, not fabrication-grade and not an importer UI.
 */
export type DxfPrimitive =
 | {kind:"line";layer:string;x1:number;y1:number;x2:number;y2:number}
 | {kind:"circle";layer:string;cx:number;cy:number;radius:number}
 | {kind:"arc";layer:string;cx:number;cy:number;radius:number;startDeg:number;endDeg:number}
 | {kind:"polyline";layer:string;closed:boolean;points:{x:number;y:number}[]};
export type DxfReference = {
  source:"DXF";units:"mm"|"cm"|"m"|"in"|"ft"|"unknown";
  unitScaleToMm:number|null;
  entities:DxfPrimitive[];
  warnings:string[];
  readyForManufacturing:false;
};
const unitMap:Record<number,{units:DxfReference["units"];factor:number}> = {
  1:{units:"in",factor:25.4},2:{units:"ft",factor:304.8},
  4:{units:"mm",factor:1},5:{units:"cm",factor:10},6:{units:"m",factor:1000},
};
type Pair={code:number;value:string};
function number(value:string):number {
  const n=Number(value);
  if (!value.trim() || !Number.isFinite(n)) throw new Error("Invalid DXF numeric value");
  return n;
}
function required(pairs:Pair[],code:number):number {
  const p=pairs.find(p=>p.code===code);
  if (!p) throw new Error("Missing DXF group "+code);
  return number(p.value);
}
function optional(pairs:Pair[],code:number,otherwise:number):number {
  const p=pairs.find(p=>p.code===code);
  return p?number(p.value):otherwise;
}
function layer(pairs:Pair[]):string {return pairs.find(p=>p.code===8)?.value||"0";}
function parseEntity(kind:string,data:Pair[]):DxfPrimitive|null {
  const l=layer(data);
  if(kind==="LINE") return {kind:"line",layer:l,x1:required(data,10),y1:required(data,20),x2:required(data,11),y2:required(data,21)};
  if(kind==="CIRCLE") {const radius=required(data,40);if(radius<=0)throw Error("Invalid radius");return {kind:"circle",layer:l,cx:required(data,10),cy:required(data,20),radius};}
  if(kind==="ARC") {const radius=required(data,40);if(radius<=0)throw Error("Invalid radius");return {kind:"arc",layer:l,cx:required(data,10),cy:required(data,20),radius,startDeg:required(data,50),endDeg:required(data,51)};}
  if(kind==="LWPOLYLINE"){
    const xs=data.filter(p=>p.code===10).map(p=>number(p.value));
    const ys=data.filter(p=>p.code===20).map(p=>number(p.value));
    if(xs.length<2||xs.length!==ys.length)throw Error("Invalid polyline coordinates");
    if(data.some(p=>p.code===42&&number(p.value)!==0))return null; // Bulge arc not represented as straight segments
    return {kind:"polyline",layer:l,closed:(optional(data,70,0)&1)!==0,points:xs.map((x,i)=>({x,y:ys[i]}))};
  }
  return null;
}
export function parseDxfReference(content:string,opts:{maxBytes?:number;maxEntities?:number}={}):DxfReference {
  const maxBytes=opts.maxBytes??5_000_000,maxEntities=opts.maxEntities??50_000;
  if(typeof content!=="string" || content.length>maxBytes || content.includes("\0"))throw Error("DXF exceeds safe text limits or is binary");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxEntities)||maxEntities<1)throw Error("Invalid limits");
  const lines=content.replace(/\r/g,"").split("\n");
  if(lines.length%2===1&&lines.at(-1)==="")lines.pop();
  if(lines.length%2!==0)throw Error("Malformed DXF group pairs");
  const pairs:Pair[]=[];
  for(let i=0;i<lines.length;i+=2) {
    const group=lines[i].trim();
    if(!/^-?\d+$/.test(group))throw Error("Invalid DXF group code");
    pairs.push({code:Number(group),value:lines[i+1].trim()});
  }
  let section="",currentType="",data:Pair[]=[],entityCount=0,unitCode=0;
  const entities:DxfPrimitive[]=[],warnings:string[]=[];
  const flush=()=>{
    if(!currentType)return;
    entityCount++;if(entityCount>maxEntities)throw Error("DXF entity limit exceeded");
    try {const parsed=parseEntity(currentType,data);if(parsed)entities.push(parsed);else warnings.push("Unsupported or complex entity: "+currentType);}
    catch(e){warnings.push("Skipped invalid "+currentType+": "+String(e instanceof Error?e.message:e));}
    currentType="";data=[];
  };
  for(let i=0;i<pairs.length;i++){
    const p=pairs[i];
    if(p.code===0&&p.value==="SECTION") {flush();section=pairs[i+1]?.code===2?pairs[i+1].value:"";continue;}
    if(p.code===0&&p.value==="ENDSEC") {flush();section="";continue;}
    if(section==="HEADER"&&p.code===9&&p.value==="$INSUNITS"&&pairs[i+1]?.code===70) unitCode=number(pairs[i+1].value);
    if(section!=="ENTITIES")continue;
    if(p.code===0) {flush();if(!["ENDSEC","EOF"].includes(p.value))currentType=p.value;}
    else if(currentType)data.push(p);
  }
  flush();
  const unit=unitMap[unitCode];
  if(!unit)warnings.push("DXF units unknown or unitless; explicit calibration required");
  if(!entities.length)warnings.push("No supported 2D reference entities found");
  warnings.push("DXF is reference geometry only; fabrication and parametric objects require engineering reconstruction");
  return {source:"DXF",units:unit?.units??"unknown",unitScaleToMm:unit?.factor??null,entities,warnings,readyForManufacturing:false};
}
export function buildDxfImportPreview(name:string,text:string):{diagnostic:ReturnType<typeof buildInitialImportDiagnostic>;reference:DxfReference} {
  const diagnostic=buildInitialImportDiagnostic(name);
  if(diagnostic.format!=="dxf")throw Error("Expected a .dxf file");
  const reference=parseDxfReference(text);
  return {diagnostic,reference};
}
