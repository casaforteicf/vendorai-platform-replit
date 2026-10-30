import HotelModulesNav from "./HotelModulesNav";
import {useEffect,useState} from "react";
import {useAuth} from "@/contexts/AuthContext";
type Plan={id:string;name:string;currency:string;standard_amount:string;extra_guest_amount:string;active:boolean};
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
export default function HotelTarifas(){
 const {user,token}=useAuth(),tenantId=user?.tenantId;
 const [plans,setPlans]=useState<Plan[]>([]),[name,setName]=useState(""),[base,setBase]=useState(""),[extra,setExtra]=useState("0");
 const [planId,setPlanId]=useState(""),[start,setStart]=useState(today()),[end,setEnd]=useState(today()),[weekday,setWeekday]=useState(""),[special,setSpecial]=useState(""),[priority,setPriority]=useState(0);
 const [arrival,setArrival]=useState(today()),[departure,setDeparture]=useState(""),[guests,setGuests]=useState(2);
 const [quote,setQuote]=useState<{id:string;total_amount:string;nights:{date:string;amount:string}[]}|null>(null);
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const root=tenantId?`/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/tarifas`:"";
 async function api<T>(path:string,options?:RequestInit):Promise<T>{
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options?.body?{"Content-Type":"application/json"}:{}),...options?.headers}});
  const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error??`HTTP ${r.status}`);return data as T;
 }
 async function reload(){if(!tenantId||!token)return;try{setPlans(await api<Plan[]>(""));}catch(e){setMessage(String(e));}}
 useEffect(()=>{void reload();},[tenantId,token]);
 async function submit(path:string,method:"POST"|"PATCH",data:object,success:string){
  setBusy(true);setMessage("");try{await api(path,{method,body:JSON.stringify(data)});await reload();setMessage(success);}catch(e){setMessage(String(e));}finally{setBusy(false);}
 }
 const money=(v:string)=>Number(v.replace(",","."));
 return <main className="space-y-5 p-4 md:p-6">
  <HotelModulesNav />
  <header><h1 className="text-2xl font-semibold">Tarifas e diárias · Hotelaria</h1><p className="text-sm text-muted-foreground">Preços editáveis por hotel, período e dia da semana. Cotações não geram cobranças automaticamente.</p></header>
  {message&&<p role="status" className="rounded border p-3 text-sm">{message}</p>}
  <div className="grid gap-4 lg:grid-cols-2">
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void submit("","POST",{name:name.trim(),standardAmount:money(base),extraGuestAmount:money(extra)},"Plano tarifário criado.");}}>
    <h2 className="font-semibold">Novo plano tarifário</h2>
    <input required className="w-full rounded border p-2" placeholder="Ex.: Tarifa balcão" value={name} onChange={e=>setName(e.target.value)}/>
    <label className="block text-sm">Valor-base por noite (R$)<input required type="number" step=".01" min="0" className="w-full rounded border p-2" value={base} onChange={e=>setBase(e.target.value)}/></label>
    <label className="block text-sm">Adicional por hóspede/noite (R$)<input required type="number" step=".01" min="0" className="w-full rounded border p-2" value={extra} onChange={e=>setExtra(e.target.value)}/></label>
    <button disabled={busy} className="rounded border px-3 py-2">Criar plano</button>
   </form>
   <section className="space-y-2 rounded-lg border p-4"><h2 className="font-semibold">Planos cadastrados</h2>
    {!plans.length&&<p className="text-sm">Nenhuma tarifa cadastrada.</p>}
    {plans.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-2 text-sm">
     <div><strong>{p.name}</strong><p>Base: R$ {p.standard_amount} · Extra: R$ {p.extra_guest_amount}</p><p>{p.active?"Ativo":"Inativo"}</p></div>
     <div className="flex gap-2"><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>{const value=window.prompt("Novo valor-base",p.standard_amount);if(value!==null&&Number.isFinite(money(value))&&money(value)>=0)void submit("/"+p.id,"PATCH",{standardAmount:money(value)},"Tarifa atualizada.");}}>Editar valor</button>
     <button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>void submit("/"+p.id,"PATCH",{active:!p.active},"Status atualizado.")}>{p.active?"Desativar":"Ativar"}</button></div>
    </div>)}
   </section>
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();if(!planId||end<start){setMessage("Informe período e plano válidos.");return;}void submit("/"+planId+"/periodos","POST",{startDate:start,endDate:end,weekday:weekday===""?null:Number(weekday),amount:money(special),priority},"Período especial cadastrado.");}}>
    <h2 className="font-semibold">Preço especial por período</h2>
    <select required className="w-full rounded border p-2" value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">Plano tarifário</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <label className="block text-sm">Início<input type="date" required className="w-full rounded border p-2" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label className="block text-sm">Fim (inclusivo)<input type="date" required className="w-full rounded border p-2" min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label className="block text-sm">Dia da semana<select className="w-full rounded border p-2" value={weekday} onChange={e=>setWeekday(e.target.value)}><option value="">Todos os dias</option>{["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"].map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>
    <label className="block text-sm">Valor por noite (R$)<input required type="number" step=".01" min="0" className="w-full rounded border p-2" value={special} onChange={e=>setSpecial(e.target.value)}/></label>
    <label className="block text-sm">Prioridade<input type="number" min="-100" max="100" className="w-full rounded border p-2" value={priority} onChange={e=>setPriority(Number(e.target.value))}/></label>
    <button disabled={busy} className="rounded border px-3 py-2">Salvar período</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();if(!planId||!departure||departure<=arrival){setMessage("Informe uma estadia válida.");return;}setBusy(true);setQuote(null);void api<typeof quote>("/"+planId+"/cotacao",{method:"POST",body:JSON.stringify({arrivalDate:arrival,departureDate:departure,guestCount:guests})}).then(v=>{setQuote(v);setMessage("Cotação calculada, sem cobrança.");}).catch(err=>setMessage(String(err))).finally(()=>setBusy(false));}}>
    <h2 className="font-semibold">Simular diárias</h2>
    <p className="text-sm">Usa o plano selecionado à esquerda.</p>
    <label className="block text-sm">Entrada<input type="date" required className="w-full rounded border p-2" value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
    <label className="block text-sm">Saída<input type="date" required className="w-full rounded border p-2" min={arrival} value={departure} onChange={e=>setDeparture(e.target.value)}/></label>
    <label className="block text-sm">Hóspedes<input type="number" min="1" max="30" required className="w-full rounded border p-2" value={guests} onChange={e=>setGuests(Number(e.target.value))}/></label>
    <button disabled={busy||!planId} className="rounded border px-3 py-2">Calcular cotação</button>
    {quote&&<div className="space-y-1 rounded border p-3"><strong>Total: R$ {quote.total_amount}</strong>{quote.nights.map(n=><p key={n.date} className="text-sm">{n.date}: R$ {n.amount}</p>)}</div>}
   </form>
  </div>
 </main>;
}
