import React from "react";
import type {PlacedCabinet} from "../../shared/placed-cabinet-draft";
import {buildCabinet3DBoxes,projectAxonometric} from "../../shared/furniture-preview-3d";
export function FurnitureAxonometricPreview({items}:{items:readonly PlacedCabinet[]}){
 const boxes=buildCabinet3DBoxes(items);
 const polygon=(pts:number[][])=>pts.map(([x,y,z])=>{const p=projectAxonometric(x,y,z);return p.x+","+p.y;}).join(" ");
 return <section className="rounded-xl border bg-white p-3"><h4 className="text-sm font-semibold">Vista tridimensional esquemática</h4><p className="text-xs">Projeção axonométrica, não substitui motor 3D.</p><svg viewBox="-500 -3000 7000 5500" className="w-full rounded bg-slate-50" style={{height:250}} role="img" aria-label="Prévia axonométrica dos móveis">{boxes.map(b=><g key={b.id} stroke="#475569" strokeWidth="10"><polygon fill="#ddd6fe" points={polygon([[b.xMm,b.yMm,b.heightMm],[b.xMm+b.widthMm,b.yMm,b.heightMm],[b.xMm+b.widthMm,b.yMm+b.depthMm,b.heightMm],[b.xMm,b.yMm+b.depthMm,b.heightMm]])}/><polygon fill="#a5b4fc" points={polygon([[b.xMm+b.widthMm,b.yMm,0],[b.xMm+b.widthMm,b.yMm+b.depthMm,0],[b.xMm+b.widthMm,b.yMm+b.depthMm,b.heightMm],[b.xMm+b.widthMm,b.yMm,b.heightMm]])}/><polygon fill="#c4b5fd" points={polygon([[b.xMm,b.yMm+b.depthMm,0],[b.xMm+b.widthMm,b.yMm+b.depthMm,0],[b.xMm+b.widthMm,b.yMm+b.depthMm,b.heightMm],[b.xMm,b.yMm+b.depthMm,b.heightMm]])}/></g>)}</svg></section>;
}
