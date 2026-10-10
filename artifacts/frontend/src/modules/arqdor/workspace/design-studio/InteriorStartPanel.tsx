import React,{useState} from "react";
import {buildRectangularRoom,fromPreProjectRoom,type InteriorEnvironment} from "./interior-environment";
type Room={id:string;nome?:string;name?:string;titulo?:string};
export function InteriorStartPanel({projectId,rooms,onStart,onImport}:{
  projectId:string|null;rooms:Room[];onStart:(environment:InteriorEnvironment)=>void;onImport:()=>void;
}){
  const [tab,setTab]=useState<"preproject"|"new-room"|"import">("preproject");
  const [room,setRoom]=useState(rooms[0]?.id??"");
  const [name,setName]=useState("Novo ambiente");
  const [w,setW]=useState(4),[d,setD]=useState(3),[h,setH]=useState(2.7),[t,setT]=useState(0.14);
  const [error,setError]=useState("");
  function start(){
    try{
      if(tab==="preproject"){
        const selected=rooms.find(r=>r.id===room);
        if(!selected||!projectId)throw Error("Selecione um ambiente vinculado ao Pré-Projeto.");
        onStart(fromPreProjectRoom(projectId,selected));
      }else if(tab==="new-room")onStart(buildRectangularRoom({name,widthM:w,depthM:d,heightM:h,thicknessM:t,projectId}));
      else onImport();
      setError("");
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  return <section className="mx-auto w-full max-w-xl rounded-3xl bg-white p-6 text-slate-900 shadow-sm" aria-label="Iniciar projeto de interiores">
    <h2 className="text-xl font-semibold">Começar projeto de interiores</h2>
    <p className="mt-2 text-sm text-slate-600">Escolha um ambiente do Pré-Projeto, desenhe um novo ou importe uma referência.</p>
    <div className="mt-4 flex flex-wrap gap-2">{([
      ["preproject","Do Pré-Projeto"],["new-room","Novo ambiente"],["import","Importar arquivo"]
    ] as const).map(([key,label])=><button type="button" key={key} onClick={()=>setTab(key)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${tab===key?"bg-violet-700 text-white":"bg-slate-100"}`}>{label}</button>)}</div>
    {tab==="preproject"&&<div className="mt-4 space-y-2">
      <label htmlFor="interior-room" className="text-xs font-medium">Ambiente do projeto</label>
      <select id="interior-room" className="w-full rounded-lg border p-2 text-sm" value={room} onChange={e=>setRoom(e.target.value)}>
        <option value="">Selecione</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.nome||r.name||r.titulo||r.id}</option>)}
      </select>
      {rooms.length===0&&<p className="text-xs text-amber-700">Nenhum ambiente disponível. Use Novo ambiente ou importe um arquivo.</p>}
      <p className="text-xs text-slate-600">O vínculo ao ambiente é criado como rascunho. A geometria de paredes precisa ser conectada ao modelo arquitetônico do projeto.</p>
    </div>}
    {tab==="new-room"&&<div className="mt-4 space-y-3">
      <label className="block text-xs">Nome do ambiente<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={name} onChange={e=>setName(e.target.value)}/></label>
      <div className="grid grid-cols-2 gap-3">{([
        ["Largura (m)",w,setW],["Profundidade (m)",d,setD],["Pé-direito (m)",h,setH],["Parede (m)",t,setT]
      ] as const).map(([label,value,setter])=><label key={label} className="text-xs">{label}<input type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-lg border p-2 text-sm" value={value} onChange={e=>setter(Number(e.target.value))}/></label>)}</div>
      <p className="text-xs text-slate-600">Cria quatro paredes retas editáveis no rascunho. Portas e janelas virão na integração de geometria.</p>
    </div>}
    {tab==="import"&&<p className="mt-4 text-sm text-slate-600">Abre o painel de importação CAD disponível no Studio. Outros conversores continuam em desenvolvimento.</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <button type="button" onClick={start} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">{tab==="import"?"Abrir importação":"Começar interiores"}</button>
  </section>;
}
