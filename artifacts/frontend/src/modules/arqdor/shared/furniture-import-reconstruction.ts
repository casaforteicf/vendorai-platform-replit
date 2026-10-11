import {buildInitialImportDiagnostic,inspectImportFileName,type ImportFormat} from "./universal-import-contract";
/** Lote 13.81–13.84: import provenance and conservative reconstruction.
 * No proprietary decoder, geometry inference, manufacturing or automatic publishing.
 */
export type ImportProvenance={
 tenantId:string;projectId:string;sourceFileId:string;sourceHash:string;filename:string;
 adapterId:string;adapterVersion:string;coordinateSystem:string;
 rights:"unknown"|"private-only"|"redistribution-authorized";
};
export type ImportedObjectCandidate={
 sourceObjectId:string;kind:"room"|"wall"|"furniture"|"part"|"mesh"|"unknown";
 geometryRepresentation:"2d-reference"|"mesh"|"brep"|"parametric";
 sourceDimensionsMm?:{widthMm:number;heightMm:number;depthMm:number};
 measuredConfidence:number;materialRef?:string;parentSourceId?:string;
};
export type ReconstructionAssessment={
 format:ImportFormat;status:"reference-only"|"review-required";
 candidates:ImportedObjectCandidate[];warnings:string[];readyForManufacturing:false;
};
export function assessReconstruction(p:ImportProvenance,candidates:readonly ImportedObjectCandidate[]):ReconstructionAssessment{
 if(!p.tenantId||!p.projectId||!p.sourceFileId||!p.sourceHash||!p.filename||!p.adapterId||!p.adapterVersion||!p.coordinateSystem)throw Error("Incomplete import provenance");
 const info=inspectImportFileName(p.filename);
 const diagnostic=buildInitialImportDiagnostic(p.filename);
 if(candidates.length>10000)throw Error("Too many imported objects");
 const ids=new Set<string>(),warnings=[...diagnostic.warnings.map(w=>w.message)];
 for(const c of candidates){
  if(!c.sourceObjectId||ids.has(c.sourceObjectId)||!Number.isFinite(c.measuredConfidence)||c.measuredConfidence<0||c.measuredConfidence>1)throw Error("Invalid import candidate");
  ids.add(c.sourceObjectId);
  if(c.sourceDimensionsMm&&Object.values(c.sourceDimensionsMm).some(x=>!Number.isFinite(x)||x<=0))throw Error("Invalid source dimensions");
  if(c.measuredConfidence<.95||c.geometryRepresentation!=="parametric")warnings.push("Candidate "+c.sourceObjectId+" requires manual geometric review");
 }
 if(candidates.some(c=>c.parentSourceId&&!ids.has(c.parentSourceId)))warnings.push("Some source hierarchy references are unresolved");
 if(p.rights==="unknown")warnings.push("Source reuse and redistribution rights are unverified");
 if(info.adapterStatus==="requires-authorized-converter")warnings.push("Proprietary source requires an authorized validated converter");
 return {format:info.format,status:"review-required",candidates:[...candidates],warnings,readyForManufacturing:false};
}
export function planImportedLibraryUse(p:ImportProvenance,a:ReconstructionAssessment,options:{scope:"private"|"tenant"|"universal";explicitApproval:boolean;technicalReviewApproved:boolean}){
 if(a.readyForManufacturing!==false||!p.tenantId||!p.projectId)throw Error("Invalid review state");
 if(!options.explicitApproval)throw Error("Explicit approval required");
 if(options.scope==="universal"&&p.rights!=="redistribution-authorized")throw Error("Redistribution rights required");
 if(options.scope!=="private"&&p.rights==="unknown")throw Error("Rights verification required");
 if(!options.technicalReviewApproved&&options.scope!=="private")throw Error("Technical review required before shared library use");
 return {tenantId:p.tenantId,projectId:p.projectId,sourceFileId:p.sourceFileId,sourceHash:p.sourceHash,
  intendedScope:options.scope,status:"proposal-only" as const,manufacturingReady:false,
  note:"Not published; requires persisted authorization and final validation."};
}
export function recommendedInterchangeForPromob(filename:string,availableExports:readonly string[]){
 if(!filename||!availableExports.length)return {status:"manual-export-required" as const,chosen:null};
 const supported=["ifc","dxf","glb","obj","pdf"];
 const candidate=supported.find(ext=>availableExports.map(x=>x.toLowerCase().replace(/^\./,"")).includes(ext));
 return {status:candidate?"export-path-available" as const:"manual-export-required" as const,chosen:candidate??null};
}
