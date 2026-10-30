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
type Receipt = {id:string;received_quantity:string;product_id:string;unit:string;order_id:string;stock_post_id:string|null};
type OrderLine = {id:string;request_id:string;status:string;line_id:string;product_id:string;unit:string;ordered_quantity:string;received_quantity:string};
type Supplier = {id:string;nome:string;ativo:boolean};
type Quote = {id:string;supplier_name:string;status:string;total_amount:string|null;delivery_days:number|null;payment_terms:string|null};
type QuoteComparison = {suppliers:Quote[];items:{product_id:string;unit:string;quantity_suggested:string}[]};
type PurchaseRequest = {id:string;location_id:string;period_start:string;period_end:string;status:string};
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
  const [menuName,setMenuName]=useState("");
  const [menuImport,setMenuImport]=useState("");
  const [pdfPreview,setPdfPreview]=useState("");
  const [summary,setSummary]=useState<Summary|null>(null);
  const [locations,setLocations]=useState<StockLocation[]>([]);
  const [requests,setRequests]=useState<PurchaseRequest[]>([]);
  const [orders,setOrders]=useState<OrderLine[]>([]);
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [selectedSuppliers,setSelectedSuppliers]=useState<string[]>([]);
  const [viewRequest,setViewRequest]=useState("");
  const [comparison,setComparison]=useState<QuoteComparison|null>(null);
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
      const [data,list,catalog,stockLocations,purchases,supplierList,orderList,receiptList]=await Promise.all([
        api<Summary>(`/refeicoes/consolidado?start=${encodeURIComponent(date)}&end=${encodeURIComponent(weekEnd(date))}${locationId?`&locationId=${encodeURIComponent(locationId)}`:""}`),
        api<Recipe[]>("/receitas"),
        fetch(`/api/tenants/${encodeURIComponent(tenantId)}/produtos-catalogo`,{headers:{Authorization:`Bearer ${token}`}}).then(async response=>{if(!response.ok)throw new Error("Falha ao consultar catálogo");return response.json() as Promise<Product[]>;}),
        api<StockLocation[]>("/estoque/locais"),
        isEffectiveAdmin ? api<PurchaseRequest[]>("/compras/semanais") : Promise.resolve([]),
        isEffectiveAdmin ? fetch(`/api/tenants/${encodeURIComponent(tenantId)}/fornecedores`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json() as Promise<Supplier[]>:Promise.reject(new Error("Falha no cadastro de fornecedores"))) : Promise.resolve([]),
        isEffectiveAdmin ? api<OrderLine[]>("/compras/pedidos") : Promise.resolve([]),
        isEffectiveAdmin ? api<Receipt[]>("/compras/recebimentos") : Promise.resolve([])
      ]);
      setSummary(data);setRecipes(list.filter(r=>r.status==="approved"));setProducts(catalog);setLocations(stockLocations.filter(l=>l.active));setRequests(purchases);setSuppliers(supplierList.filter(p=>p.ativo));setOrders(orderList);setReceipts(receiptList);
    }catch(e){setMessage(String(e));}
  }
  useEffect(()=>{void reload();},[tenantId,token,date,locationId]);
  async function loadPdf(file:File) {
    if(file.size>5_000_000 || file.size===0){setMessage("PDF inválido ou maior que 5 MB.");return;}
    setBusy(true);setMessage("");
    try {
      const base64=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error("Falha na leitura"));
        reader.onload=()=>resolve(String(reader.result).split(",")[1]??"");
        reader.readAsDataURL(file);
      });
      const result=await api<{text:string;pages:number}>("/cardapios/importar-pdf",{
        method:"POST",body:JSON.stringify({base64})
      });
      setPdfPreview(result.text);
      setMenuName(file.name.replace(/\\.pdf$/i,"").slice(0,120));
      setMessage("PDF lido. Confira o texto e vincule manualmente as receitas aprovadas antes de salvar.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  function importMenu() {
    try {
      const raw:unknown=JSON.parse(menuImport);
      if(!raw || typeof raw!=="object" || Array.isArray(raw))throw new Error("Formato inválido");
      const menu=raw as Record<string,unknown>;
      if(typeof menu.name!=="string" || !Array.isArray(menu.recipes))throw new Error("Informe name e recipes");
      if(menu.recipes.length===0 || menu.recipes.length>100)throw new Error("Informe entre 1 e 100 receitas");
      const parsed:PlannedRecipe[]=menu.recipes.map((item:unknown)=>{
        if(!item || typeof item!=="object" || Array.isArray(item))throw new Error("Receita inválida");
        const row=item as Record<string,unknown>;
        const matching=recipes.find(r=>r.id===row.recipeId && r.status==="approved");
        if(!matching || !Number.isInteger(row.plannedPortions) || (row.plannedPortions as number)<=0)
          throw new Error("Receita não aprovada ou porções inválidas: "+String(row.recipeId));
        return {recipeId:matching.id,plannedPortions:row.plannedPortions as number};
      });
      if(new Set(parsed.map(r=>r.recipeId)).size!==parsed.length)throw new Error("Receitas duplicadas");
      setMenuName(menu.name.slice(0,120));setRecipeLines(parsed);
      setMessage("Cardápio importado para edição. Salve a previsão para registrar as receitas.");
    }catch(e){setMessage("Não foi possível importar: "+String(e));}
  }
  function clearMenu(){
    setMenuName("");setRecipeLines([{recipeId:"",plannedPortions:1}]);setMenuImport("");
    setMessage("Novo cardápio iniciado. Selecione as receitas aprovadas.");
  }
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
  async function purchaseAction(id:string|null,decision?:"reviewed"|"dismissed") {
    if(!isEffectiveAdmin)return;
    setBusy(true);setMessage("");
    try {
      if(id && decision) {
        await api("/compras/semanais/"+encodeURIComponent(id)+"/revisar",{method:"POST",body:JSON.stringify({decision})});
      } else {
        if(!locationId||!summary?.complete||!summary.shortages?.length)throw new Error("Concilie o estoque antes de solicitar.");
        await api("/compras/semanais",{method:"POST",body:JSON.stringify({start:date,end:weekEnd(date),locationId})});
      }
      await reload();setMessage("Registro atualizado, sem emissão de pedido.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function openComparison(id:string) {
    setBusy(true);setMessage("");
    try {
      const data=await api<QuoteComparison>("/compras/semanais/"+encodeURIComponent(id)+"/cotacoes");
      setViewRequest(id);setComparison(data);
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function postReceipt(eventId:string) {
    if(!window.confirm("Conferiu o recebimento? Confirmar entrada física no estoque do hotel?"))return;
    setBusy(true);setMessage("");
    try {
      await api("/compras/recebimentos/"+encodeURIComponent(eventId)+"/entrada-estoque",{method:"POST"});
      await reload();setMessage("Recebimento lançado no estoque.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function orderAction(orderId:string,kind:"emitir"|"receber",line?:OrderLine) {
    const quantity=kind==="receber"?Number(window.prompt("Quantidade recebida na unidade exibida:")):0;
    if(kind==="receber"&&(!line||!Number.isFinite(quantity)||quantity<=0)){setMessage("Quantidade inválida.");return;}
    if(!window.confirm(kind==="emitir"?"Confirmar emissão interna do pedido?":"Registrar recebimento físico conferido (sem entrada automática no estoque)?"))return;
    setBusy(true);setMessage("");
    try{
      await api("/compras/pedidos/"+encodeURIComponent(orderId)+"/"+kind,{
        method:"POST",...(kind==="receber"?{body:JSON.stringify({lineId:line!.line_id,quantity})}:{})
      });
      await reload();setMessage("Pedido atualizado. A entrada no estoque continua pendente de conciliação.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function createOrder(requestId:string) {
    if(!window.confirm("Criar pedido de compra interno com o fornecedor aprovado?"))return;
    setBusy(true);setMessage("");
    try{
      await api("/compras/semanais/"+encodeURIComponent(requestId)+"/pedido",{method:"POST"});
      setMessage("Pedido interno criado. Confira os itens antes de emitir.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function approveQuote(quoteId:string) {
    if(!viewRequest||!window.confirm("Aprovar este fornecedor para a solicitação semanal? Isso ainda não emite o pedido."))return;
    setBusy(true);setMessage("");
    try {
      await api("/compras/semanais/"+encodeURIComponent(viewRequest)+"/adjudicar",{
        method:"POST",body:JSON.stringify({quoteId})
      });
      await openComparison(viewRequest);
      setMessage("Fornecedor aprovado. Pedido de compra ainda não emitido.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function recordQuote(id:string) {
    const totalAmount=Number(window.prompt("Valor total da proposta (R$):"));
    const deliveryDays=Number(window.prompt("Prazo de entrega em dias:"));
    const paymentTerms=window.prompt("Condições de pagamento:");
    if(!Number.isFinite(totalAmount)||totalAmount<=0||!Number.isInteger(deliveryDays)||deliveryDays<0||!paymentTerms?.trim()) {
      setMessage("Valor, prazo ou condições inválidos.");return;
    }
    setBusy(true);
    try {
      await api("/cotacoes/"+encodeURIComponent(id)+"/resposta",{method:"POST",body:JSON.stringify({totalAmount,deliveryDays,paymentTerms:paymentTerms.trim()})});
      if(viewRequest)await openComparison(viewRequest);
      setMessage("Proposta registrada; pedido não emitido.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function sendQuote(id:string,channel:"email"|"whatsapp") {
    if(!window.confirm("Confirmar envio real da solicitação de cotação ao fornecedor por "+channel+"?"))return;
    setBusy(true);setMessage("");
    try {
      await api("/cotacoes/"+encodeURIComponent(id)+"/enviar",{
        method:"POST",body:JSON.stringify({channel})
      });
      if(viewRequest)await openComparison(viewRequest);
      setMessage("Envio solicitado ao provedor e confirmado pela API.");
    }catch(e){setMessage("Não foi possível confirmar o envio: "+String(e));}
    finally{setBusy(false);}
  }
  async function assignSuppliers() {
    if(!viewRequest||!selectedSuppliers.length)return;
    setBusy(true);setMessage("");
    try {
      await api("/compras/semanais/"+encodeURIComponent(viewRequest)+"/fornecedores",{
        method:"POST",body:JSON.stringify({supplierIds:selectedSuppliers})
      });
      await openComparison(viewRequest);
      setMessage("Fornecedores selecionados. Convites ainda não enviados.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
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
      <div className="sm:col-span-2 space-y-3 rounded-lg border p-3">
        <h3 className="font-medium">Cardápio: criar ou importar</h3>
        <label className="block text-sm">Nome do cardápio<Input maxLength={120} value={menuName} onChange={e=>setMenuName(e.target.value)} placeholder="Ex.: Café da manhã de sábado" /></label>
        <Button variant="outline" type="button" onClick={clearMenu}>Criar novo cardápio</Button>
        <label className="block text-sm">Importar cardápio em PDF
          <Input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void loadPdf(file);}} />
        </label>
        {pdfPreview&&<div className="space-y-2">
          <p className="text-sm font-medium">Prévia do texto extraído — conferência obrigatória</p>
          <textarea readOnly className="w-full rounded-md border bg-background p-2 text-sm" rows={8} value={pdfPreview} />
          <p className="text-xs text-muted-foreground">O PDF não cadastra receitas ou ingredientes automaticamente. Vincule abaixo as fichas técnicas existentes. PDFs digitalizados sem texto ainda exigem OCR.</p>
        </div>}
        <label className="block text-sm">Selecionar arquivo de cardápio (.json)
          <Input type="file" accept=".json,application/json" onChange={async e=>{
            const file=e.target.files?.[0];if(!file)return;
            if(file.size>1024*1024){setMessage("Arquivo muito grande (limite de 1 MB).");return;}
            setMenuImport(await file.text());
            setMessage("Arquivo carregado. Clique em Importar e conferir receitas.");
          }}/>
        </label>
        <label className="block text-sm">Importar cardápio JSON<textarea rows={4} className="mt-1 w-full rounded-md border bg-background p-2 font-mono text-xs" value={menuImport} onChange={e=>setMenuImport(e.target.value)} placeholder={'{"name":"Café do hotel","recipes":[{"recipeId":"UUID da ficha aprovada","plannedPortions":50}]}'} /></label>
        <Button variant="outline" type="button" onClick={importMenu} disabled={!menuImport.trim()}>Importar e conferir receitas</Button>
        <p className="text-xs text-muted-foreground">A importação usa fichas técnicas já aprovadas no catálogo deste hotel. Ingredientes e quantidades vêm dessas fichas; a solicitação de compra só pode ser gerada após salvar o planejamento e conciliar o estoque.</p>
      </div>
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
    {isEffectiveAdmin&&<Card><CardHeader><CardTitle>Entradas de estoque pendentes</CardTitle></CardHeader><CardContent className="space-y-2">
      {!receipts.length&&<p className="text-sm text-muted-foreground">Nenhum recebimento registrado.</p>}
      {receipts.map(r=><div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm" key={r.id}>
        <span>{products.find(p=>p.id===r.product_id)?.nome??r.product_id}: {r.received_quantity} {r.unit}</span>
        {r.stock_post_id?<span>Entrada registrada</span>:<Button variant="outline" size="sm" disabled={busy} onClick={()=>void postReceipt(r.id)}>Lançar no estoque</Button>}
      </div>)}
    </CardContent></Card>}
    {isEffectiveAdmin&&<Card><CardHeader><CardTitle>Pedidos internos e recebimentos</CardTitle></CardHeader><CardContent className="space-y-3">
      {!orders.length&&<p className="text-sm text-muted-foreground">Nenhum pedido interno gerado.</p>}
      {orders.map(line=><div key={line.line_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
        <div><strong>{products.find(p=>p.id===line.product_id)?.nome??line.product_id}</strong>
          <p>{line.received_quantity} / {line.ordered_quantity} {line.unit} · {line.status}</p>
        </div>
        {line.status==="draft"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void orderAction(line.id,"emitir")}>Emitir pedido interno</Button>}
        {(line.status==="issued"||line.status==="partially_received")&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void orderAction(line.id,"receber",line)}>Registrar recebimento</Button>}
      </div>)}
      <p className="text-xs text-muted-foreground">Recebimento registrado para conferência; nenhuma entrada automática no saldo físico.</p>
    </CardContent></Card>}
    {isEffectiveAdmin&&<Card><CardHeader><CardTitle>Solicitações semanais de compra</CardTitle></CardHeader><CardContent className="space-y-3">
      <Button disabled={busy||!locationId||!summary?.complete||!summary.shortages?.length} onClick={()=>void purchaseAction(null)}>Gerar rascunho da semana</Button>
      {!requests.length&&<p className="text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>}
      {requests.map(request=><div key={request.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
        <div><strong>{String(request.period_start).slice(0,10)} a {String(request.period_end).slice(0,10)}</strong>
        <p>Status: {request.status} · Local: {locations.find(l=>l.id===request.location_id)?.name??request.location_id}</p></div>
        <Button variant="outline" disabled={busy} onClick={()=>void openComparison(request.id)}>Itens e cotações</Button>
        {request.status==="reviewed"&&<Button variant="outline" disabled={busy} onClick={()=>void createOrder(request.id)}>Criar pedido interno</Button>}
        {request.status==="draft"&&<div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={()=>void purchaseAction(request.id,"reviewed")}>Revisada</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void purchaseAction(request.id,"dismissed")}>Descartar</Button>
        </div>}
      </div>)}
      {viewRequest&&comparison&&<div className="space-y-3 rounded-lg border p-3">
        <h3 className="font-semibold">Comparativo de fornecedores</h3>
        {comparison.items.map(item=><p className="text-sm" key={item.product_id+item.unit}>{products.find(p=>p.id===item.product_id)?.nome??item.product_id}: {item.quantity_suggested} {item.unit}</p>)}
        {comparison.suppliers.map(q=><div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm" key={q.id}>
          <span>{q.supplier_name} · {q.status} · {q.total_amount??"Sem valor"} · {q.delivery_days??"—"} dias</span>
          {q.status==="responded"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void approveQuote(q.id)}>Aprovar fornecedor</Button>}
          {q.status==="invited"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void recordQuote(q.id)}>Registrar proposta</Button>}
          {q.status==="selected"&&<div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={()=>void sendQuote(q.id,"email")}>Enviar e-mail</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={()=>void sendQuote(q.id,"whatsapp")}>Enviar WhatsApp</Button>
          </div>}
        </div>)}
        <p className="text-xs text-muted-foreground">Os valores só são exibidos se houver cotação registrada. Nenhum convite foi enviado automaticamente.</p>
        {requests.find(p=>p.id===viewRequest)?.status==="reviewed"&&<div className="space-y-2">
          <h4 className="font-medium">Selecionar fornecedores para consulta</h4>
          {suppliers.map(p=><label className="flex gap-2 text-sm" key={p.id}><input type="checkbox" checked={selectedSuppliers.includes(p.id)} onChange={e=>setSelectedSuppliers(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>{p.nome}</label>)}
          <Button disabled={busy||!selectedSuppliers.length} onClick={()=>void assignSuppliers()}>Vincular fornecedores (sem disparo)</Button>
        </div>}
      </div>}
      <p className="text-xs text-muted-foreground">Revisão não gera pedido de compra nem movimenta estoque.</p>
    </CardContent></Card>}
  </main>;
}
