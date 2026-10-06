import React, { useCallback, useEffect, useMemo, useState } from "react";

type Supplier={id:string;nome:string;contato?:string|null;telefone?:string|null;email?:string|null;categorias?:string[];disciplinas?:string[];prazo_medio_dias?:number|null};
type Package={id:string;code:string;title:string;category?:string|null;discipline?:string|null;version:number;status:string;budget_id?:string|null;sale_total_snapshot?:number|null;sale_source?:string|null;proposal_revision?:string|null;commercial_proposal_id?:string|null;arch_proposal_id?:string|null;technical_documents_snapshot?:any[];documents?:any[]};
type Item={package_id:string;compra_id:string;descricao:string;ambiente?:string|null;quantidade:number;unidade:string;valor_total:number;valor_venda_snapshot:number;custo_estimado_snapshot:number;custo_confirmado?:number|null;cotacao_desatualizada:boolean;escopo_versao:number};
type Invitation={id:string;package_id:string;supplier_id?:string|null;supplier_name:string;status:string;total_value?:number|null;freight_value:number;tax_value:number;discount_value:number;payment_terms?:string|null;validity_date?:string|null;lead_time_days?:number|null;public_token:string;sent_at?:string|null;responded_at?:string|null;response_documents?:any[];supplier_email?:string|null;supplier_phone?:string|null;access_mode?:"registered"|"guest"|"converted";converted_tenant_id?:string|null};
type SupplierStat={supplier_key:string;total_orders:number;selected_orders:number;delivered_orders:number;on_time_orders:number;avg_lead_time_days?:number|null;avg_confirmed_value?:number|null};
type Bundle={obra:any;packages:Package[];items:Item[];invitations:Invitation[];quoteItems:any[];suppliers:Supplier[];supplierStats?:SupplierStat[]};

function token(){return localStorage.getItem("vendorai_token")??""}
async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const r=await fetch(path,{...init,headers:{...(init?.body?{"Content-Type":"application/json"}:{}),...(token()?{Authorization:`Bearer ${token()}`}:{}),...(init?.headers??{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error((d as any)?.error||`Erro ${r.status}`);
  return d as T;
}
function n(v:any){const x=Number(v??0);return Number.isFinite(x)?x:0}
function money(v:number){return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function projectMeta(arqState:any){const p=arqState?.currentProject??arqState?.selectedProject??arqState?.project??{};return{id:String(arqState?.projectId||p?.id||""),name:String(p?.titulo||p?.title||p?.name||"Projeto ARQDOR"),clientName:p?.clienteNome||p?.clientName||null,budget:p?.orcamentoTotal||null,status:p?.status||null}}
function compatible(s:Supplier,p:Package){
  const cats=(Array.isArray(s.categorias)?s.categorias:[]).map(x=>String(x).toLowerCase());
  const discs=(Array.isArray(s.disciplinas)?s.disciplinas:[]).map(x=>String(x).toLowerCase());
  if(!cats.length&&!discs.length)return true;
  return cats.includes(String(p.category||"").toLowerCase())||discs.includes(String(p.discipline||"").toLowerCase());
}
function statusLabel(v:string){return({draft:"Rascunho",sent:"Enviada",viewed:"Visualizada",responded:"Respondida",accepted:"Selecionada",rejected:"Não selecionada",failed:"Falha",partial:"Com respostas",completed:"Concluída"} as Record<string,string>)[v]||v}
function badge(v:string){if(["accepted","completed"].includes(v))return"bg-emerald-100 text-emerald-800";if(v==="responded")return"bg-blue-100 text-blue-800";if(v==="failed")return"bg-rose-100 text-rose-800";if(["sent","viewed","partial"].includes(v))return"bg-violet-100 text-violet-800";return"bg-slate-100 text-slate-700"}

export default function SupplierRfqWorkspace({arqState,onNavigate}:{arqState:any;onNavigate?:(m:string)=>void}){
  const meta=useMemo(()=>projectMeta(arqState),[arqState]);
  const [obraId,setObraId]=useState("");
  const [budgetId,setBudgetId]=useState("");
  const [bundle,setBundle]=useState<Bundle|null>(null);
  const [selectedPackageId,setSelectedPackageId]=useState("");
  const [selectedSuppliers,setSelectedSuppliers]=useState<string[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [revisionSaleTotal,setRevisionSaleTotal]=useState<number|"" >("");
  const [success,setSuccess]=useState<string|null>(null);
  const [guestName,setGuestName]=useState("");
  const [guestEmail,setGuestEmail]=useState("");
  const [guestPhone,setGuestPhone]=useState("");

  const load=useCallback(async()=>{
    if(!meta.id)return;
    setError(null);
    try{
      const [budget,ensured]=await Promise.all([
        api<any>(`/api/arch/orcamento?projectId=${encodeURIComponent(meta.id)}`),
        api<any>("/api/arch/construction/ensure",{method:"POST",body:JSON.stringify({projectId:meta.id,name:meta.name,clientName:meta.clientName,budget:meta.budget,status:meta.status})})
      ]);
      const oid=String(ensured?.obra?.id||""); setObraId(oid);
      const bid=String(budget?.budget?.id||budget?.id||""); setBudgetId(bid);
      if(oid){
        const data=await api<Bundle>(`/api/arch/procurement-rfq/${oid}`);
        setBundle(data); setSelectedPackageId(cur=>cur&&data.packages.some(p=>p.id===cur)?cur:data.packages[0]?.id||"");
      }
    }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar cotações.")}
  },[meta.id,meta.name,meta.clientName,meta.budget,meta.status]);

  useEffect(()=>{void load()},[load]);

  const selectedPackage=bundle?.packages.find(p=>p.id===selectedPackageId)||null;
  const items=(bundle?.items||[]).filter(i=>i.package_id===selectedPackageId);
  const invitations=(bundle?.invitations||[]).filter(i=>i.package_id===selectedPackageId);
  const suppliers=(bundle?.suppliers||[]).filter(s=>selectedPackage?compatible(s,selectedPackage):true);
  const hasSaleValue=selectedPackage?.sale_total_snapshot!=null&&n(selectedPackage.sale_total_snapshot)>0;
  const saleValue=hasSaleValue?n(selectedPackage?.sale_total_snapshot):0;
  const estimatedCost=items.reduce((sum,i)=>sum+n(i.custo_estimado_snapshot),0);
  const confirmedCost=items.reduce((sum,i)=>sum+n(i.custo_confirmado),0);
  const stale=items.filter(i=>i.cotacao_desatualizada).length;
  const respondedInvitations=invitations.filter(inv=>["responded","accepted"].includes(inv.status)&&inv.total_value!=null);
  const bestPrice=respondedInvitations.length?Math.min(...respondedInvitations.map(inv=>n(inv.total_value))):null;
  const leadTimes=respondedInvitations.map(inv=>inv.lead_time_days).filter((v):v is number=>v!=null&&Number.isFinite(Number(v))).map(Number);
  const bestLeadTime=leadTimes.length?Math.min(...leadTimes):null;
  const highestQuote=invitations.reduce((max,inv)=>Math.max(max,n(inv.total_value)),0);
  const plannedMarginPct=hasSaleValue&&saleValue>0?(saleValue-estimatedCost)/saleValue:0;
  const suggestedSale=highestQuote>0&&plannedMarginPct<1?highestQuote/Math.max(0.01,1-plannedMarginPct):saleValue;

  async function generate(){
    if(!obraId||!budgetId)return;
    setBusy("generate");setError(null);
    try{await api(`/api/arch/procurement-rfq/${obraId}/from-budget`,{method:"POST",body:JSON.stringify({budgetId})});await load()}
    catch(e){setError(e instanceof Error?e.message:"Falha ao gerar cotações.")}
    finally{setBusy(null)}
  }
  async function classifySupplier(supplier: Supplier){
    if(!selectedPackage)return;
    const category=String(selectedPackage.category||selectedPackage.discipline||"").trim().toLowerCase();
    if(!category)return;
    setBusy(`scope-${supplier.id}`);setError(null);
    try{
      const categories=Array.from(new Set([...(Array.isArray(supplier.categorias)?supplier.categorias:[]),category]));
      const disciplines=Array.from(new Set([...(Array.isArray(supplier.disciplinas)?supplier.disciplinas:[]),String(selectedPackage.discipline||category).toLowerCase()]));
      await api(`/api/arch/procurement-rfq/suppliers/${supplier.id}/scope`,{method:"PATCH",body:JSON.stringify({categories,disciplines,regions:[],brands:[],leadTimeDays:supplier.prazo_medio_dias??null})});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Falha ao classificar fornecedor.")}
    finally{setBusy(null)}
  }

  async function invite(){
    if(!selectedPackage||!selectedSuppliers.length)return;
    setBusy("invite");setError(null);
    try{
      await api(`/api/arch/procurement-rfq/${obraId}/packages/${selectedPackage.id}/invitations`,{method:"POST",body:JSON.stringify({supplierIds:selectedSuppliers})});
      setSelectedSuppliers([]);await load();
    }catch(e){setError(e instanceof Error?e.message:"Falha ao enviar cotações.")}
    finally{setBusy(null)}
  }
  async function inviteGuest(){
    if(!selectedPackage||!guestName.trim()||(!guestEmail.trim()&&!guestPhone.trim()))return;
    setBusy("guest-invite");setError(null);setSuccess(null);
    try{
      const result=await api<any>(`/api/arch/procurement-rfq/${obraId}/packages/${selectedPackage.id}/guest-invitations`,{
        method:"POST",
        body:JSON.stringify({name:guestName.trim(),email:guestEmail.trim(),phone:guestPhone.trim()})
      });
      setSuccess(result.duplicate?"Esse fornecedor já havia recebido esta cotação. Link mantido.":"Convite enviado. O fornecedor pode responder sem criar conta.");
      setGuestName("");setGuestEmail("");setGuestPhone("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Falha ao convidar fornecedor.")}
    finally{setBusy(null)}
  }

  async function createCommercialRevision(){
    if(!selectedPackage||revisionSaleTotal===""||n(revisionSaleTotal)<=0)return;
    setBusy("revision");setError(null);setSuccess(null);
    try{
      const result=await api<any>(`/api/arch/procurement-rfq/${obraId}/packages/${selectedPackage.id}/commercial-revision`,{method:"POST",body:JSON.stringify({saleTotal:n(revisionSaleTotal)})});
      setSuccess(`Revisão ${result.revisionNumero||result.revisionLabel||""} criada como rascunho. Pacote: ${money(n(result.packageSaleTotal))} • projeto: ${money(n(result.projectSaleTotal))}. A proposta anterior foi preservada.`);
      setRevisionSaleTotal("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Falha ao criar revisão comercial.")}
    finally{setBusy(null)}
  }

  async function select(invitationId:string){
    if(!selectedPackage)return;
    setBusy(invitationId);setError(null);
    try{await api(`/api/arch/procurement-rfq/${obraId}/packages/${selectedPackage.id}/select/${invitationId}`,{method:"POST",body:"{}"});await load()}
    catch(e){setError(e instanceof Error?e.message:"Falha ao selecionar fornecedor.")}
    finally{setBusy(null)}
  }

  if(!meta.id)return <div className="rounded-3xl border bg-white p-6 text-sm text-slate-600">Selecione um projeto para abrir as cotações.</div>;

  return <div className="space-y-5">
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-violet-600">Cotação de fornecedores</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Especificação → fornecedores → custo real → proposta</h1>
        <p className="mt-1 text-sm text-slate-500">{meta.name} • cada fornecedor recebe somente os itens compatíveis com seu escopo.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>onNavigate?.("real-budget")} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold">Voltar ao orçamento</button>
          <button disabled={!budgetId||busy==="generate"} onClick={()=>void generate()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy==="generate"?"Preparando...":"Gerar cotações do orçamento"}</button>
        </div>
      </div>
    </header>

    {error?<div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>:null}{success?<div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>:null}

    <div className="grid gap-4 md:grid-cols-4">
      <Metric label="Preço de venda" value={hasSaleValue?money(saleValue):"Não definido"} hint={selectedPackage?.proposal_revision?`Referência ${selectedPackage.proposal_revision}`:"Defina no orçamento/proposta"}/>
      <Metric label="Custo estimado" value={money(estimatedCost)} hint="Referência antes das respostas"/>
      <Metric label="Custo confirmado" value={money(confirmedCost)} hint="Após escolha do fornecedor"/>
      <Metric label="Escopo alterado" value={String(stale)} hint={stale?"Exige nova cotação":"Nenhuma cotação desatualizada"}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="px-2 pb-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pacotes por especialidade</p><p className="mt-1 text-sm text-slate-500">Gerados automaticamente a partir do orçamento.</p></div>
        <div className="space-y-2">{(bundle?.packages||[]).map(p=>{
          const count=(bundle?.items||[]).filter(i=>i.package_id===p.id).length;
          const responses=(bundle?.invitations||[]).filter(i=>i.package_id===p.id&&["responded","accepted"].includes(i.status)).length;
          return <button key={p.id} onClick={()=>{setSelectedPackageId(p.id);setSelectedSuppliers([])}} className={`w-full rounded-2xl border p-4 text-left transition ${selectedPackageId===p.id?"border-violet-300 bg-violet-50":"border-slate-100 hover:border-slate-200"}`}>
            <div className="flex items-start justify-between gap-2"><div><p className="font-semibold capitalize text-slate-950">{p.category||p.discipline||p.title}</p><p className="mt-1 text-xs text-slate-500">{p.code} • R{p.version}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge(p.status)}`}>{statusLabel(p.status)}</span></div>
            <p className="mt-3 text-xs text-slate-500">{count} itens • {responses} respostas{p.proposal_revision?` • ${p.proposal_revision}`:""}</p>
          </button>})}
          {!(bundle?.packages||[]).length?<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Ainda não há pacotes. Clique em “Gerar cotações do orçamento”.</div>:null}
        </div>
      </section>

      <div className="space-y-5">
        {selectedPackage?<><section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Escopo congelado</p><h2 className="mt-1 text-xl font-semibold capitalize">{selectedPackage.category||selectedPackage.title}</h2><p className="mt-1 text-sm text-slate-500">O fornecedor não vê nenhuma outra categoria do projeto.</p><p className="mt-2 text-xs font-semibold text-slate-600">{selectedPackage.proposal_revision?`Proposta/revisão: ${selectedPackage.proposal_revision} • `:""}{hasSaleValue?`Venda do pacote: ${money(saleValue)}`:"Preço comercial ainda não definido"} • {(selectedPackage.technical_documents_snapshot||selectedPackage.documents||[]).length} arquivo(s) técnico(s)</p></div>
          {stale?<span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800">{stale} item(ns) alterado(s) após cotação</span>:null}</div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th className="py-3">Item</th><th>Ambiente</th><th>Qtd.</th><th>Venda prevista</th><th>Custo confirmado</th><th>Versão</th></tr></thead><tbody>
            {items.map(i=><tr key={i.compra_id} className="border-b border-slate-100"><td className="py-3 font-semibold">{i.descricao}</td><td>{i.ambiente||"—"}</td><td>{n(i.quantidade)} {i.unidade}</td><td>{n(i.valor_venda_snapshot)>0?money(n(i.valor_venda_snapshot)):"—"}</td><td>{i.custo_confirmado!=null?money(n(i.custo_confirmado)):"—"}</td><td>{i.cotacao_desatualizada?<span className="font-bold text-amber-700">R{i.escopo_versao} • recotar</span>:`R${i.escopo_versao}`}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Fornecedores compatíveis</p><h2 className="mt-1 text-xl font-semibold">Enviar para vários fornecedores</h2><p className="mt-1 text-sm text-slate-500">A lista respeita categoria/disciplina cadastrada. Fornecedor sem escopo definido permanece disponível até ser classificado.</p></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{suppliers.map(s=><label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 p-4 hover:border-violet-200">
            <input type="checkbox" className="mt-1" checked={selectedSuppliers.includes(s.id)} onChange={e=>setSelectedSuppliers(cur=>e.target.checked?[...cur,s.id]:cur.filter(x=>x!==s.id))}/>
            <div className="flex-1"><p className="font-semibold">{s.nome}</p><p className="text-xs text-slate-500">{s.email||s.telefone||"Será gerado link manual"}{s.prazo_medio_dias?` • prazo médio ${s.prazo_medio_dias} dias`:""}</p>{(()=>{const st=(bundle?.supplierStats||[]).find(x=>x.supplier_key===s.nome.toLowerCase());if(!st)return null;const punctual=st.delivered_orders>0?Math.round((st.on_time_orders/st.delivered_orders)*100):null;return <p className="mt-1 text-[11px] text-slate-400">{st.total_orders} histórico(s){punctual!=null?` • ${punctual}% no prazo`:""}{st.avg_lead_time_days!=null?` • média ${Number(st.avg_lead_time_days).toFixed(0)} dias`:""}</p>})()}
              {!(s.categorias?.length||s.disciplinas?.length)&&selectedPackage?<button type="button" disabled={busy===`scope-${s.id}`} onClick={(e)=>{e.preventDefault();e.stopPropagation();void classifySupplier(s)}} className="mt-2 text-[11px] font-bold text-violet-700 hover:underline">{busy===`scope-${s.id}`?"Salvando...":`Vincular a ${selectedPackage.category||selectedPackage.discipline}`}</button>:null}
            </div>
          </label>)}</div>
          <button disabled={!selectedSuppliers.length||busy==="invite"} onClick={()=>void invite()} className="mt-4 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy==="invite"?"Enviando...":`Enviar cotação para ${selectedSuppliers.length} fornecedor(es)`}</button>
          <div className="my-5 border-t border-slate-100"/>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Fornecedor ainda não cadastrado</p><p className="mt-1 text-sm text-slate-500">O arquiteto pode enviar a cotação apenas com nome e telefone ou e-mail. O fornecedor responde pelo link sem precisar criar conta.</p></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">Nome<input value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder="Fornecedor / empresa" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"/></label>
            <label className="text-xs font-semibold text-slate-600">E-mail<input type="email" value={guestEmail} onChange={e=>setGuestEmail(e.target.value)} placeholder="fornecedor@empresa.com" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"/></label>
            <label className="text-xs font-semibold text-slate-600">Telefone / WhatsApp<input value={guestPhone} onChange={e=>setGuestPhone(e.target.value)} placeholder="+55 49 ..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"/></label>
          </div>
          <button type="button" disabled={busy==="guest-invite"||!guestName.trim()||(!guestEmail.trim()&&!guestPhone.trim())} onClick={()=>void inviteGuest()} className="mt-3 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy==="guest-invite"?"Enviando...":"Enviar cotação para fornecedor externo"}</button>
        </section>

        <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Mapa de cotação</p><h2 className="mt-1 text-xl font-semibold">Custo, prazo e margem</h2></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th className="py-3">Fornecedor</th><th>Status</th><th>Total cotado</th><th>Prazo</th><th>Condição</th><th>Margem sobre venda</th><th></th></tr></thead><tbody>
            {invitations.map(inv=>{const cost=n(inv.total_value);const margin=hasSaleValue?saleValue-cost:null;const marginPct=hasSaleValue&&margin!=null?(margin/saleValue)*100:null;const isBestPrice=inv.total_value!=null&&bestPrice!=null&&cost===bestPrice;const isBestLead=inv.lead_time_days!=null&&bestLeadTime!=null&&Number(inv.lead_time_days)===bestLeadTime;return <tr key={inv.id} className="border-b border-slate-100"><td className="py-3 font-semibold">{inv.supplier_name}<div className="mt-1 flex flex-wrap gap-1">{isBestPrice?<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Melhor preço</span>:null}{isBestLead?<span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">Melhor prazo</span>:null}</div><div className="text-[11px] font-normal text-slate-400">{(inv.response_documents||[]).length} anexo(s) • {inv.access_mode==="converted"?"cliente Vendor.ai":inv.access_mode==="guest"?"convidado externo":"cadastrado"}</div></td><td><span className={`rounded-full px-2 py-1 text-xs font-bold ${badge(inv.status)}`}>{statusLabel(inv.status)}</span></td><td>{inv.total_value!=null?money(cost):"aguardando"}</td><td>{inv.lead_time_days!=null?`${inv.lead_time_days} dias`:"—"}</td><td>{inv.payment_terms||"—"}</td><td>{inv.total_value!=null&&margin!=null?<span className={margin>=0?"font-semibold text-emerald-700":"font-semibold text-rose-700"}>{money(margin)} • {marginPct?.toFixed(1)}%</span>:"—"}</td><td>{inv.status==="responded"?<button disabled={busy===inv.id} onClick={()=>void select(inv.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">{busy===inv.id?"Salvando...":"Selecionar"}</button>:null}</td></tr>})}
            {!invitations.length?<tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum fornecedor convidado para este pacote.</td></tr>:null}
          </tbody></table></div>
          {hasSaleValue&&invitations.some(i=>i.total_value!=null&&n(i.total_value)>saleValue)?<div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Atenção:</strong> existe cotação acima do preço de venda deste pacote. A proposta atual não será alterada automaticamente.
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1"><span className="block text-[11px] font-bold uppercase">Novo preço de venda deste pacote</span><input type="number" min={0} step="0.01" value={revisionSaleTotal} onFocus={()=>{if(revisionSaleTotal==="")setRevisionSaleTotal(Number(suggestedSale.toFixed(2)))}} onChange={e=>setRevisionSaleTotal(e.target.value===""?"":Number(e.target.value))} placeholder={suggestedSale>0?`Sugestão: ${money(suggestedSale)}`:"Informe o novo valor"} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"/></label><button type="button" disabled={busy==="revision"||revisionSaleTotal===""||!selectedPackage.commercial_proposal_id} onClick={()=>void createCommercialRevision()} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy==="revision"?"Criando...":"Criar revisão comercial"}</button></div>
            {!selectedPackage.commercial_proposal_id?<p className="mt-2 text-xs">Ainda não existe proposta comercial vinculada. Defina o preço no orçamento e gere a proposta antes de criar a revisão.</p>:null}</div>:null}{!hasSaleValue?<div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><strong>Margem indisponível:</strong> defina o preço de venda no orçamento ou vincule uma proposta comercial. O custo cotado continua disponível normalmente.</div>:null}
        </section>

        {invitations.some(inv=>["responded","accepted"].includes(inv.status))?<section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Comparativo item a item</p><h2 className="mt-1 text-xl font-semibold">Preço, marca e divergências por fornecedor</h2></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th className="py-3">Fornecedor</th><th>Item</th><th>Qtd.</th><th>Valor unit.</th><th>Total</th><th>Marca/modelo</th><th>Observação</th></tr></thead><tbody>
            {(bundle?.quoteItems||[]).filter((qi:any)=>invitations.some(inv=>inv.id===qi.invitation_id)).map((qi:any)=>{const inv=invitations.find(x=>x.id===qi.invitation_id);const item=items.find(x=>x.compra_id===qi.compra_id);return <tr key={qi.id} className="border-b border-slate-100"><td className="py-3 font-semibold">{inv?.supplier_name||"—"}</td><td>{item?.descricao||qi.compra_id}</td><td>{n(qi.quantity)} {qi.unit||item?.unidade||"un"}</td><td>{money(n(qi.unit_value))}</td><td>{money(n(qi.total_value))}</td><td>{qi.brand_model||"—"}</td><td>{qi.notes||"—"}</td></tr>})}
          </tbody></table></div>
        </section>:null}
        </>:<section className="rounded-[34px] border bg-white p-8 text-center text-slate-500">Selecione um pacote de cotação.</section>}
      </div>
    </div>
  </div>
}
function Metric({label,value,hint}:{label:string;value:string;hint:string}){return <div className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>}
