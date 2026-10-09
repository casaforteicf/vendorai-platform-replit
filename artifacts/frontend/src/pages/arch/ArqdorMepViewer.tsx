/**
 * Minimal read-only 2D / 3D MEP graph visualization.
 * Expects the server-side MEP project ID (arqdor_workspace_projects.id);
 * never substitute an arch concept project ID without verified mapping.
 */
import { useEffect, useMemo, useState } from "react";
type Node = {id:string;network_id:string;x_mm:number;y_mm:number;z_mm:number;kind:string;floor_id:string};
type Segment = {id:string;from_node_id:string;to_node_id:string;network_id:string};
type Payload = { nodes:Node[]; segments:Segment[] };
export function ArqdorMepViewer({workspaceProjectId}:{workspaceProjectId:string}) {
  const [data,setData]=useState<Payload|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [mode,setMode]=useState<"2d"|"3d">("2d");
  useEffect(()=>{
    const controller=new AbortController();
    setData(null);setError(null);
    fetch(`/api/arch/projects/${encodeURIComponent(workspaceProjectId)}/mep`,{credentials:"include",signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error("Não foi possível consultar instalações");return r.json() as Promise<Payload>;})
      .then(setData).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e));});
    return ()=>controller.abort();
  },[workspaceProjectId]);
  const nodes=useMemo(()=>new Map((data?.nodes??[]).map(n=>[n.id,n])),[data]);
  const pts=data?.nodes??[];
  const xs=pts.map(n=>n.x_mm),ys=pts.map(n=>n.y_mm),zs=pts.map(n=>n.z_mm);
  const minX=Math.min(0,...xs),minY=Math.min(0,...ys),minZ=Math.min(0,...zs);
  const maxX=Math.max(1000,...xs),maxY=Math.max(1000,...ys),maxZ=Math.max(1000,...zs);
  function project(n:Node):[number,number]{
    const x=(n.x_mm-minX)/Math.max(1,maxX-minX)*520+20;
    const y=(n.y_mm-minY)/Math.max(1,maxY-minY)*320+20;
    if(mode==="2d")return [x,360-y];
    const z=(n.z_mm-minZ)/Math.max(1,maxZ-minZ)*100;
    return [x+z*.55,360-y-z*.75];
  }
  return <section aria-label="Visualização de instalações" className="rounded-xl border p-3">
    <header className="flex items-center justify-between gap-2 pb-2">
      <strong>Instalações — pontos e redes</strong>
      <div className="flex gap-2">
        <button type="button" aria-pressed={mode==="2d"} onClick={()=>setMode("2d")}>2D</button>
        <button type="button" aria-pressed={mode==="3d"} onClick={()=>setMode("3d")}>3D esquemático</button>
      </div>
    </header>
    {error&&<p role="alert">{error}</p>}
    {!data&&!error&&<p>Carregando instalações…</p>}
    {data&&<svg viewBox="0 0 640 380" role="img" aria-label="Esquema de pontos e ligações MEP" className="w-full bg-slate-50">
      {data.segments.map(s=>{const a=nodes.get(s.from_node_id),b=nodes.get(s.to_node_id);if(!a||!b)return null;const p=project(a),q=project(b);return <line key={s.id} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#2563eb" strokeWidth="3"/>;})}
      {pts.map(n=>{const p=project(n);return <g key={n.id}><circle cx={p[0]} cy={p[1]} r="5" fill="#059669"/><title>{n.kind} · {n.floor_id} · {n.id}</title></g>;})}
    </svg>}
    <p className="text-xs text-slate-500">Vista esquemática sem geometria de paredes, sem escala técnica e sem compatibilização BIM. 3D é projeção ilustrativa, não modelo de engenharia.</p>
  </section>;
}
