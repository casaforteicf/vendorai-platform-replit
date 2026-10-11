/** Lote 13.78–13.84: contract for universal project import.
 * Recognition does not imply decoding or industrial readiness.
 * Proprietary converters require licensed, verified adapters.
 */
export type ImportFormat = "skp"|"dwg"|"dxf"|"rvt"|"rfa"|"ifc"|"promob"|"3dm"|"step"|"iges"|"obj"|"fbx"|"glb"|"gltf"|"stl"|"pdf"|"image"|"unknown";
export type ImportCapability = "reference"|"geometry"|"semantic"|"parametric"|"manufacturing";
export type ImportAdapterStatus = "not-implemented"|"requires-authorized-converter"|"candidate-open-format";
export interface ImportFormatInfo {
  format: ImportFormat;
  extensions: readonly string[];
  family: "cad"|"bim"|"3d"|"promob"|"document"|"image"|"unknown";
  adapterStatus: ImportAdapterStatus;
  preferredInterchange?: string;
  caveat: string;
}
const formats: readonly ImportFormatInfo[] = [
  {format:"skp",extensions:["skp"],family:"3d",adapterStatus:"requires-authorized-converter",preferredInterchange:"glb",caveat:"Native SKP conversion requires a verified SketchUp SDK, plugin or export."},
  {format:"dwg",extensions:["dwg"],family:"cad",adapterStatus:"requires-authorized-converter",preferredInterchange:"dxf",caveat:"DWG requires a licensed/verified parser or conversion service."},
  {format:"dxf",extensions:["dxf"],family:"cad",adapterStatus:"candidate-open-format",caveat:"DXF entities/layers/units require a validated parser."},
  {format:"rvt",extensions:["rvt"],family:"bim",adapterStatus:"requires-authorized-converter",preferredInterchange:"ifc",caveat:"Native Revit requires authorized BIM converter/export."},
  {format:"rfa",extensions:["rfa"],family:"bim",adapterStatus:"requires-authorized-converter",preferredInterchange:"ifc",caveat:"Families require authorized export with semantics."},
  {format:"ifc",extensions:["ifc"],family:"bim",adapterStatus:"candidate-open-format",caveat:"IFC entities and property sets must be mapped explicitly."},
  {format:"promob",extensions:["promob"],family:"promob",adapterStatus:"requires-authorized-converter",preferredInterchange:"dxf",caveat:"Verify actual Promob file extensions and permitted export/API before native implementation."},
  {format:"3dm",extensions:["3dm"],family:"cad",adapterStatus:"candidate-open-format",caveat:"Requires validated 3DM parser."},
  {format:"step",extensions:["step","stp"],family:"cad",adapterStatus:"candidate-open-format",caveat:"Requires CAD solid conversion."},
  {format:"iges",extensions:["iges","igs"],family:"cad",adapterStatus:"candidate-open-format",caveat:"Requires NURBS surface conversion."},
  {format:"obj",extensions:["obj"],family:"3d",adapterStatus:"candidate-open-format",caveat:"Mesh geometry is not parametric joinery."},
  {format:"fbx",extensions:["fbx"],family:"3d",adapterStatus:"requires-authorized-converter",preferredInterchange:"glb",caveat:"FBX converter and material support require verification."},
  {format:"glb",extensions:["glb"],family:"3d",adapterStatus:"candidate-open-format",caveat:"Mesh and material reference only until validated reconstruction."},
  {format:"gltf",extensions:["gltf"],family:"3d",adapterStatus:"candidate-open-format",caveat:"External buffers and textures must be resolved safely."},
  {format:"stl",extensions:["stl"],family:"3d",adapterStatus:"candidate-open-format",caveat:"Triangle mesh has no inherent units or component semantics."},
  {format:"pdf",extensions:["pdf"],family:"document",adapterStatus:"candidate-open-format",caveat:"Drawings require scale and dimension verification."},
  {format:"image",extensions:["jpg","jpeg","png","webp","tif","tiff"],family:"image",adapterStatus:"candidate-open-format",caveat:"Images are visual reference unless calibrated."},
] as const;
export const importFormats: readonly ImportFormatInfo[] = formats;
export function inspectImportFileName(fileName: string): ImportFormatInfo {
  if (typeof fileName !== "string" || !fileName.trim()) throw new Error("File name required");
  const base = fileName.replace(/\\/g,"/").split("/").pop()!;
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return formats.find(f => f.extensions.includes(ext)) ?? {
    format:"unknown",extensions:[],family:"unknown",adapterStatus:"not-implemented",
    caveat:"Unsupported extension. Preserve source and request a supported exchange format.",
  };
}
export type ImportWarningCode = "UNSUPPORTED_FORMAT"|"CONVERTER_REQUIRED"|"UNITS_UNVERIFIED"|"GEOMETRY_NOT_DECODED"|"SEMANTICS_NOT_VERIFIED"|"MANUFACTURING_NOT_VERIFIED";
export type ImportDiagnostic = {
  fileName:string; format:ImportFormat; family:ImportFormatInfo["family"]; adapterStatus:ImportAdapterStatus;
  preferredInterchange?:string;
  capabilities: readonly ImportCapability[];
  warnings: readonly {code:ImportWarningCode;message:string}[];
  readyForManufacturing:false;
};
/** Metadata-only diagnostic: never claims successful parsing or reconstruction. */
export function buildInitialImportDiagnostic(fileName:string):ImportDiagnostic {
  const info=inspectImportFileName(fileName);
  return {
    fileName,format:info.format,family:info.family,adapterStatus:info.adapterStatus,
    preferredInterchange:info.preferredInterchange,capabilities:[],
    warnings:[
      ...(info.format==="unknown"?[{code:"UNSUPPORTED_FORMAT" as const,message:info.caveat}]:[]),
      ...(info.adapterStatus==="requires-authorized-converter"?[{code:"CONVERTER_REQUIRED" as const,message:info.caveat}]:[]),
      {code:"UNITS_UNVERIFIED",message:"Document units, axis and scale have not been verified."},
      {code:"GEOMETRY_NOT_DECODED",message:"No geometry has been decoded or imported."},
      {code:"SEMANTICS_NOT_VERIFIED",message:"Furniture, components, materials and identifiers have not been extracted."},
      {code:"MANUFACTURING_NOT_VERIFIED",message:"Technical detailing and fabrication remain blocked until validation."},
    ],readyForManufacturing:false,
  };
}
