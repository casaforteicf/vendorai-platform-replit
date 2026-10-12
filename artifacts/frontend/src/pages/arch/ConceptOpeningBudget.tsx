import { useEffect, useRef, useState } from "react";
import type { DocumentationOpening } from "./conceptDocumentationWalls";
type Quote = { items: {id:string;descricao:string;quantidade:string;unidade:string;valorUnitario:string;valorTotal:string}[]; issues:string[];total:number;quoteToken:string;projectId:string|null;canApply:boolean };
export function ConceptOpeningBudget({conceptId,openings}:{conceptId?:string|null;openings:readonly DocumentationOpening[]}) {
 const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [confirmed,setConfirmed]=useState<{total:number;projectTotal:number}|null>(null);
 const generation=useRef(0);
 const requestLock=useRef<number|null>(null);
 useEffect(()=>{generation.current++;requestLock.current=null;setQuote(null);setConfirmed(null);setMessage("");setBusy(false);return ()=>{generation.current++;};},[conceptId,openings]);
 async function request(apply:boolean){
  if(!conceptId||requestLock.current!==null||busy||(apply&&!quote?.canApply))return;
  const turn=generation.current;requestLock.current=turn;setBusy(true);setConfirmed(null);setMessage("");
  try{
   const response=await fetch(`/api/arch/concept-projects/${encodeURIComponent(conceptId)}/opening-budget`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({apply,...(apply?{quoteToken:quote?.quoteToken}:{})})});
   const data=await response.json();
   if(turn!==generation.current)return;
   if(!data||typeof data!=="object")throw Error("Resposta do orçamento inválida.");
   if(!response.ok)throw Error(data.error||"Não foi possível consultar o orçamento.");
   if(apply){
    if(!quote||data.ok!==true||data.projectId!==quote.projectId||!Number.isInteger(data.synced)||data.synced!==quote.items.length||![data.total,data.projectTotal].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0)||Math.abs(data.total-quote.total)>0.00001)throw Error("Não foi possível confirmar a gravação. Consulte o orçamento antes de reenviar.");
    setConfirmed({total:data.total,projectTotal:data.projectTotal});setQuote(null);setMessage(`${data.synced} esquadria(s) sincronizada(s) com o orçamento.`);}
   else {if(!Array.isArray(data.items)||!data.items.every((item: Quote["items"][number])=>item&&typeof item.id==="string"&&typeof item.descricao==="string"&&typeof item.unidade==="string"&&[item.quantidade,item.valorUnitario,item.valorTotal].every(v=>typeof v==="string"&&/^\d+(\.\d+)?$/.test(v)&&Number.isFinite(Number(v)))&&Number(item.quantidade)>0)||!Array.isArray(data.issues)||!data.issues.every((issue:unknown)=>typeof issue==="string")||typeof data.quoteToken!=="string"||!data.quoteToken||typeof data.canApply!=="boolean"||(data.projectId!==null&&typeof data.projectId!=="string")||!Number.isFinite(data.total)||data.total<0||(data.canApply&&(!data.items.length||!data.projectId||data.issues.length)))throw Error("Resposta de preços inválida.");
    if(new Set(data.items.map((item:Quote["items"][number])=>item.id)).size!==data.items.length||Math.abs(data.items.reduce((sum:number,item:Quote["items"][number])=>sum+Math.round(Number(item.valorTotal)*100),0)/100-data.total)>0.00001)throw Error("Totais da consulta inconsistentes. Consulte novamente.");
    setQuote(data);}
  }catch(error){if(turn===generation.current){setQuote(null);setMessage(error instanceof Error?error.message:"Falha na consulta.");}}
  finally{if(turn===generation.current){requestLock.current=null;setBusy(false);}}
 }
 const money=(value:number)=>value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
 return <section aria-label="Orçamento das esquadrias" className="space-y-2 rounded border p-2">
  <h4 className="text-sm font-semibold">Preços e orçamento das esquadrias</h4>
  <p className="text-xs text-slate-500">Preços de venda do catálogo. O envio atualiza os itens deste projeto gerados por este fluxo, sem duplicá-los; itens manuais são preservados.</p>
  {!conceptId&&<p className="text-xs">Salve o projeto antes de consultar preços.</p>}
  <button type="button" disabled={!conceptId||busy||!openings.length} onClick={()=>void request(false)} className="rounded border px-3 py-2 text-xs disabled:opacity-50">{busy?"Processando…":"Consultar preços das esquadrias"}</button>
  {quote&&<><ul className="text-xs">{quote.items.map(item=><li key={item.id}>{item.descricao} · {item.quantidade} {item.unidade} · {money(Number(item.valorUnitario))} · total {money(Number(item.valorTotal))}</li>)}</ul><p className="text-xs">Subtotal dos itens com preço: {money(quote.total)}</p>{quote.issues.map((issue,i)=><p key={i} className="text-xs text-amber-600">{issue}</p>)}{!quote.projectId&&<p className="text-xs">Vincule a um Projeto Arqdor para enviar ao orçamento.</p>}<button type="button" disabled={busy||!quote.canApply} onClick={()=>void request(true)} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Confirmar envio ao orçamento</button></>}
  {confirmed&&<div className="text-xs"><p>Esquadrias sincronizadas: {money(confirmed.total)}</p><p>Total geral do orçamento: {money(confirmed.projectTotal)}</p></div>}
  {message&&<p role="status" className="text-xs">{message}</p>}
 </section>;
}
