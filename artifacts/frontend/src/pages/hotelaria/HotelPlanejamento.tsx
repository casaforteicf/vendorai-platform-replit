import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Recipe = { id:string; title:string; status:string };
type Forecast = { id:string; service_date:string; meal_type:string; guest_count:number; staff_meals:number };
type Demand = { productId:string; unit:string; required:number };
type Summary = { start:string; end:string; forecasts:Forecast[]; demand:Demand[] };
const meals = [
  ["breakfast","Café da manhã"],
  ["morning_snack","Lanche da manhã"],
  ["lunch","Almoço"],
  ["afternoon_snack","Lanche da tarde"],
  ["dinner","Jantar"],
] as const;
function dateISO(d:Date) { return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function weekEnd(start:string) { const d=new Date(start+"T12:00:00");d.setDate(d.getDate()+6);return dateISO(d); }
export default function HotelPlanejamento() {
  const { user, token, isEffectiveAdmin }=useAuth();
  const tenantId=user?.tenantId;
  const [date,setDate]=useState(dateISO(new Date()));
  const [meal,setMeal]=useState<typeof meals[number][0]>("breakfast");
  const [guests,setGuests]=useState(0);
  const [staff,setStaff]=useState(0);
  const [recipes,setRecipes]=useState<Recipe[]>([]);
  const [chosen,setChosen]=useState("");
  const [portions,setPortions]=useState(0);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const base=tenantId?`/api/tenants/${encodeURIComponent(tenantId)}/hotelaria`:"";
  async function api<T>(path:string,opts?:RequestInit):Promise<T>{
    const response=await fetch(base+path,{...opts,headers:{Authorization:`Bearer ${token}`,...(opts?.body?{"Content-Type":"application/json"}:{}),...opts?.headers}});
    const body=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(body?.error??`HTTP ${response.status}`);
    return body as T;
  }
  async function reload() {
    if(!tenantId||!token)return;
    try{
      const [data,list]=await Promise.all([
        api<Summary>(`/refeicoes/consolidado?start=${encodeURIComponent(date)}&end=${encodeURIComponent(weekEnd(date))}`),
        api<Recipe[]>("/receitas")
      ]);
      setSummary(data);setRecipes(list.filter(r=>r.status==="approved"));
    }catch(e){setMessage(String(e));}
  }
  useEffect(()=>{void reload();},[tenantId,token,date]);
  async function save(){
    if(!isEffectiveAdmin||!chosen||guests<0||staff<0||portions<=0){setMessage("Selecione receita, porções e quantidades válidas.");return;}
    setBusy(true);setMessage("");
    try{
      await api("/refeicoes/previsoes",{method:"POST",body:JSON.stringify({
        serviceDate:date,mealType:meal,guestCount:guests,staffMeals:staff,
        recipeLines:[{recipeId:chosen,plannedPortions:portions}]
      })});
      await reload();setMessage("Previsão salva. Você pode consultar a demanda consolidada.");
    }catch(e){setMessage(String(e));}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
    <header><a href="/hotelaria/receitas" className="text-sm text-blue-700 hover:underline">← Voltar às fichas técnicas</a>
      <h1 className="mt-2 text-2xl font-semibold">Hotelaria · Planejamento semanal</h1>
      <p className="text-sm text-muted-foreground">Cinco refeições por dia. Demanda consolidada, sem baixar estoque nem gerar pedidos.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    <Card><CardHeader><CardTitle>Período de planejamento</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-3">
      <label className="text-sm">Início do período<Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
      <span className="text-sm text-muted-foreground">Até {date?weekEnd(date):"—"} (7 dias)</span>
      <Button variant="outline" onClick={()=>void reload()} disabled={busy}>Atualizar</Button>
    </CardContent></Card>
    {isEffectiveAdmin&&<Card><CardHeader><CardTitle>Registrar previsão de uma refeição</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Refeição<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={meal} onChange={e=>setMeal(e.target.value as typeof meal)}>
        {meals.map(([key,label])=><option value={key} key={key}>{label}</option>)}
      </select></label>
      <label className="text-sm">Receita aprovada<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={chosen} onChange={e=>setChosen(e.target.value)}>
        <option value="">Selecione uma receita</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
      </select></label>
      <label className="text-sm">Hóspedes previstos<Input type="number" min={0} value={guests} onChange={e=>setGuests(Number(e.target.value))}/></label>
      <label className="text-sm">Refeições de equipe<Input type="number" min={0} value={staff} onChange={e=>setStaff(Number(e.target.value))}/></label>
      <label className="text-sm">Porções da receita<Input type="number" min={1} value={portions} onChange={e=>setPortions(Number(e.target.value))}/></label>
      <div className="flex items-end"><Button onClick={()=>void save()} disabled={busy||!chosen||!tenantId}>Salvar previsão</Button></div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">O sistema permite uma previsão por data e refeição. Não será criada uma segunda previsão para o mesmo serviço.</p>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Refeições planejadas</CardTitle></CardHeader><CardContent className="space-y-2">
      {!summary?.forecasts.length&&<p className="text-sm text-muted-foreground">Nenhuma previsão registrada neste período.</p>}
      {summary?.forecasts.map(f=><div key={f.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
        <span>{String(f.service_date).slice(0,10)} · {meals.find(([k])=>k===f.meal_type)?.[1]??f.meal_type}</span>
        <span>{f.guest_count} hóspedes · {f.staff_meals} equipe</span>
      </div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Ingredientes consolidados (7 dias)</CardTitle></CardHeader><CardContent className="space-y-2">
      {!summary?.demand.length&&<p className="text-sm text-muted-foreground">Nenhuma demanda registrada.</p>}
      {summary?.demand.map(d=><div key={d.productId+":"+d.unit} className="flex justify-between gap-2 border-b py-2 text-sm">
        <span className="break-all">{d.productId}</span><strong>{Number(d.required.toFixed(3))} {d.unit}</strong>
      </div>)}
      <p className="text-xs text-muted-foreground">Demanda de ingredientes: estoque físico ainda não descontado. A comparação de saldos deve ser realizada uma única vez no período.</p>
    </CardContent></Card>
  </main>;
}
