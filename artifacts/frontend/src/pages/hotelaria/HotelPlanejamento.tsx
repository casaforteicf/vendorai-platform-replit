import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Recipe = { id:string; title:string; status:string };
type Product = {id:string; nome:string; sku?:string|null};
type PlannedRecipe = {recipeId:string; plannedPortions:number};
type Forecast = { id:string; service_date:string; meal_type:string; guest_count:number; staff_meals:number };
type Demand = { productId:string; unit:string; required:number };
type StockLocation = {id:string; name:string; active:boolean};
type Shortage = {productId:string;unit:string;required:number;available:number|null;suggested:number|null;status:string};
type Summary = { start:string; end:string; forecasts:Forecast[]; demand:Demand[]; shortages?:Shortage[]|null; complete?:boolean };
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
  const [products,setProducts]=useState<Product[]>([]);
  const [recipeLines,setRecipeLines]=useState<PlannedRecipe[]>([{recipeId:"",plannedPortions:1}]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [locations,setLocations]=useState<StockLocation[]>([]);
  const [locationId,setLocationId]=useState("");
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
      const [data,list,catalog,stockLocations]=await Promise.all([
        api<Summary>(`/refeicoes/consolidado?start=${encodeURIComponent(date)}&end=${encodeURIComponent(weekEnd(date))}${locationId?`&locationId=${encodeURIComponent(locationId)}`:""}`),
        api<Recipe[]>("/receitas"),
        fetch(`/api/tenants/${encodeURIComponent(tenantId)}/produtos-catalogo`,{headers:{Authorization:`Bearer ${token}`}}).then(async response=>{if(!response.ok)throw new Error("Falha ao consultar catálogo");return response.json() as Promise<Product[]>;}),
        api<StockLocation[]>("/estoque/locais")
      ]);
      setSummary(data);setRecipes(list.filter(r=>r.status==="approved"));setProducts(catalog);setLocations(stockLocations.filter(l=>l.active));
    }catch(e){setMessage(String(e));}
  }
  useEffect(()=>{void reload();},[tenantId,token,date,locationId]);
  async function save(){
    if(!isEffectiveAdmin||!Number.isInteger(guests)||guests<0||!Number.isInteger(staff)||staff<0||recipeLines.some(line=>!line.recipeId||!Number.isInteger(line.plannedPortions)||line.plannedPortions<=0)||new Set(recipeLines.map(line=>line.recipeId)).size!==recipeLines.length){setMessage("Selecione receitas distintas com porções e quantidades válidas.");return;}
    setBusy(true);setMessage("");
    try{
      await api("/refeicoes/previsoes",{method:"POST",body:JSON.stringify({
        serviceDate:date,mealType:meal,guestCount:guests,staffMeals:staff,
        recipeLines
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
      <label className="text-sm">Estoque para comparar
        <select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={locationId} onChange={e=>setLocationId(e.target.value)}>
          <option value="">Sem desconto de estoque</option>
          {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <Button variant="outline" onClick={()=>void reload()} disabled={busy}>Atualizar</Button>
    </CardContent></Card>
    {isEffectiveAdmin&&<Card><CardHeader><CardTitle>Registrar previsão de uma refeição</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Refeição<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={meal} onChange={e=>setMeal(e.target.value as typeof meal)}>
        {meals.map(([key,label])=><option value={key} key={key}>{label}</option>)}
      </select></label>

      <label className="text-sm">Hóspedes previstos<Input type="number" min={0} value={guests} onChange={e=>setGuests(Number(e.target.value))}/></label>
      <label className="text-sm">Refeições de equipe<Input type="number" min={0} value={staff} onChange={e=>setStaff(Number(e.target.value))}/></label>
      <div className="sm:col-span-2 space-y-3"><p className="text-sm font-medium">Receitas para esta refeição</p>
        {recipeLines.map((line,index)=><div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px_auto]">
          <label className="text-sm">Receita aprovada<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={line.recipeId} onChange={e=>setRecipeLines(prev=>prev.map((v,i)=>i===index?{...v,recipeId:e.target.value}:v))}>
            <option value="">Selecione</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
          </select></label>
          <label className="text-sm">Porções<Input type="number" min={1} value={line.plannedPortions} onChange={e=>setRecipeLines(prev=>prev.map((v,i)=>i===index?{...v,plannedPortions:Number(e.target.value)}:v))}/></label>
          <div className="flex items-end"><Button variant="outline" type="button" disabled={recipeLines.length===1} onClick={()=>setRecipeLines(prev=>prev.filter((_,i)=>i!==index))}>Remover</Button></div>
        </div>)}
        <Button type="button" variant="outline" disabled={recipeLines.length>=100} onClick={()=>setRecipeLines(prev=>[...prev,{recipeId:"",plannedPortions:1}])}>Adicionar receita</Button>
      </div>
      <div className="sm:col-span-2"><Button onClick={()=>void save()} disabled={busy||!tenantId}>Salvar previsão</Button></div>
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
        <span>{products.find(p=>p.id===d.productId)?.nome??"Produto não encontrado no catálogo"} <span className="text-xs text-muted-foreground">{products.find(p=>p.id===d.productId)?.sku??""}</span></span><strong>{Number(d.required.toFixed(3))} {d.unit}</strong>
      </div>)}
      {summary?.shortages && <div className="space-y-2 border-t pt-3">
        <h3 className="font-medium">Faltas de estoque do período</h3>
        {summary.shortages.map(line=><div key={line.productId+":"+line.unit} className="flex flex-wrap justify-between gap-2 text-sm">
          <span>{products.find(p=>p.id===line.productId)?.nome??"Produto não identificado"}</span>
          <span>{line.status==="ready"?`Disponível: ${line.available} · Comprar: ${line.suggested} ${line.unit}`:`Conciliação necessária: ${line.status}`}</span>
        </div>)}
        {!summary.complete&&<p role="status" className="text-sm text-amber-700">Há itens não conciliados; nenhuma solicitação de compra deve ser emitida.</p>}
      </div>}
      <p className="text-xs text-muted-foreground">A demanda semanal é consolidada antes de comparar o estoque de um único local. Nenhum pedido é emitido nesta tela.</p>
    </CardContent></Card>
  </main>;
}
