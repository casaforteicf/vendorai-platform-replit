import * as React from "react";
type CrmLead={id:string;label:string};
type Props={nicheId:string;tasksJson?:string;operations:Array<{tenantId:string;tenantName:string}>;ready:boolean};
export default function AtlasCrmTaskBridge({nicheId,tasksJson,operations,ready}:Props){
 const [tenant,setTenant]=React.useState("");
 const [lead,setLead]=React.useState("");
 const [leads,setLeads]=React.useState<CrmLead[]>([]);
 const [message,setMessage]=React.useState("");
 const [busy,setBusy]=React.useState(false);
 React.useEffect(()=>{setLead("");setLeads([]);if(!tenant)return;let active=true;const token=localStorage.getItem("vendorai_token");fetch("/api/admin/atlas/crm-leads/"+encodeURIComponent(tenant),{headers:{Authorization:"Bearer "+token},cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(data=>{if(!active)return;setLeads(Array.isArray(data.items)?data.items:[]);setMessage("Selecione um lead do tenant.")}).catch(e=>{if(active)setMessage("Não foi possível carregar leads: "+String(e))});return()=>{active=false}},[tenant]);
 React.useEffect(()=>{setTenant("");setLead("");setMessage("")},[nicheId]);
 let tasks:Array<{id:string;title:string;done:boolean}>=[];
 try{const parsed=JSON.parse(tasksJson||"[]");if(Array.isArray(parsed))tasks=parsed.filter(t=>typeof t.id==="string"&&typeof t.title==="string")}catch{}
 const send=async(taskId:string)=>{if(!tenant||!lead||busy)return;setBusy(true);setMessage("Vinculando a tarefa ao CRM...");try{
  const token=localStorage.getItem("vendorai_token");
  const r=await fetch("/api/admin/atlas/tasks/"+encodeURIComponent(nicheId)+"/"+encodeURIComponent(taskId)+"/link-crm",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({tenantId:tenant,leadId:lead})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||"HTTP "+r.status);
  setMessage(body.alreadyLinked?"A atividade já estava vinculada ao CRM.":"Atividade criada no CRM. ID: "+body.activityId);
 }catch(e){setMessage("Falha na vinculação: "+String(e))}finally{setBusy(false)}};
 return <section className="mt-4 rounded-xl border border-slate-600 p-3"><h4 className="font-semibold">Vincular tarefas ao CRM</h4><p className="mt-1 text-xs text-slate-300">O CRM exige um lead e um tenant. A vinculação é explícita; não há envio automático.</p>
 <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs">Empresa<select value={tenant} onChange={e=>{setTenant(e.target.value);setMessage("")}} className="mt-1 w-full rounded-lg border border-slate-600 bg-[#0c1523] p-2"><option value="">Selecione o tenant</option>{operations.map(t=><option value={t.tenantId} key={t.tenantId}>{t.tenantName}</option>)}</select></label>
 <label className="text-xs">Lead<select value={lead} onChange={e=>setLead(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-[#0c1523] p-2"><option value="">Selecione o lead</option>{leads.map(t=><option value={t.id} key={t.id}>{t.label||t.id}</option>)}</select></label></div>
 <div className="mt-3 space-y-2">{tasks.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#20354a] p-2 text-xs"><span>{t.title}</span><button type="button" disabled={!ready||!tenant||!lead||busy} onClick={()=>void send(t.id)} className="rounded border border-emerald-500 px-2 py-1 disabled:opacity-40">Criar atividade no CRM</button></div>)}{tasks.length===0&&<p className="text-xs text-slate-400">Salve tarefas no planejamento antes de vinculá-las.</p>}</div>
 <p role="status" className="mt-3 text-xs text-slate-300">{message}</p></section>;
}
