import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock3, Loader2, MapPin, MessageCircle, Package, Send, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Interaction = { remetente_tipo:string; canal:string; mensagem:string; created_at:string };
type Leg = { ordem:number;tipo:string;origem_tipo:string;destino_tipo:string;status:string;iniciado_em?:string;concluido_em?:string;updated_at:string };
type Transfer = { status:string;saida_confirmada_em?:string;entrada_confirmada_em?:string;updated_at:string };
type Tracking = {
  order:{ id:string;status:string;cliente_nome:string;updated_at:string;modelo_logistico?:"direto"|"redespacho";ponto_redespacho_nome?:string;rota_status?:string;sequencia?:number;parada_status?:string;motivo_falha_descricao?:string };
  interactions:Interaction[];legs:Leg[];transfers:Transfer[];
};

const labels:Record<string,string> = {
  pronto_coleta:"Preparando coleta",coleta_agendada:"Coleta agendada",coletado:"Coletado",
  em_rota:"Saiu para entrega",entregue:"Entregue",falha_entrega:"Entrega não concluída",
};
const steps=["pronto_coleta","coleta_agendada","coletado","em_rota","entregue"];

export default function AcompanharEntrega() {
  const { token = "" } = useParams<{token:string}>();
  const qc=useQueryClient();
  const [text,setText]=useState("");
  const query=useQuery<Tracking>({
    queryKey:["public-delivery",token],enabled:!!token,
    refetchInterval:30000,
    queryFn:async()=>{const r=await fetch(`/api/public/praca-delivery/${token}`);const d=await r.json();if(!r.ok)throw new Error(d.error);return d;},
  });
  const send=useMutation({
    mutationFn:async()=>{const r=await fetch(`/api/public/praca-delivery/${token}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mensagem:text})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;},
    onSuccess:()=>{setText("");qc.invalidateQueries({queryKey:["public-delivery",token]});},
  });
  const sendError=send.error instanceof Error?send.error.message:null;
  function submit(e:FormEvent){e.preventDefault();if(text.trim())send.mutate();}
  if(query.isLoading)return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin"/></div>;
  if(query.error||!query.data)return <div className="min-h-screen grid place-items-center p-6"><Card><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto text-amber-600"/><p className="mt-3">Não foi possível abrir este rastreamento.</p></CardContent></Card></div>;

  const {order,interactions,legs=[],transfers=[]}=query.data;
  const transfer=transfers[transfers.length-1];
  const current=Math.max(0,steps.indexOf(order.status));
  const failed=order.status==="falha_entrega";
  return <main className="min-h-screen bg-slate-50 p-4 md:p-8">
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="flex items-center justify-between"><div><p className="font-bold text-xl">Praça.ai</p><p className="text-sm text-muted-foreground">Entrega acompanhada pelo Vendor.ai</p></div><Package className="text-primary"/></header>
      <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Pedido {order.id.slice(0,8)}</CardTitle><p className="text-sm text-muted-foreground mt-1">Olá, {order.cliente_nome}</p></div><Badge className={failed?"bg-red-100 text-red-700":"bg-blue-100 text-blue-700"}>{labels[order.status]??order.status}</Badge></div></CardHeader>
        <CardContent>
          {failed?<div className="rounded-lg border border-red-200 bg-red-50 p-4"><div className="flex gap-2 font-semibold text-red-800"><AlertTriangle/>Entrega não concluída</div><p className="text-sm text-red-700 mt-2">{order.motivo_falha_descricao||"A equipe está verificando uma nova tentativa."}</p></div>:
          <div className="grid grid-cols-5 gap-1">{steps.map((step,index)=>{const done=index<=current;const Icon=index===4?CheckCircle2:index>=3?Truck:index===2?MapPin:Clock3;return <div key={step} className="text-center"><div className={`mx-auto h-9 w-9 rounded-full grid place-items-center ${done?"bg-primary text-primary-foreground":"bg-slate-200 text-slate-500"}`}><Icon className="h-4 w-4"/></div><p className="text-[10px] mt-2 hidden sm:block">{labels[step]}</p></div>;})}</div>}
          <p className="text-xs text-muted-foreground mt-5">Atualizado em {new Date(order.updated_at).toLocaleString("pt-BR")}. Esta página atualiza automaticamente.</p>
        </CardContent>
      </Card>
      {order.modelo_logistico==="redespacho"&&<Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-5 w-5"/>Coleta com redespacho</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">A entrega é feita por dois entregadores. A troca de custódia é confirmada pelo QR Code no ponto {order.ponto_redespacho_nome||"de redespacho"}.</p>
        <div className="space-y-2">{[
          {label:"Coleta no vendedor",done:!!legs[0]&&["em_execucao","aguardando_transferencia","concluido"].includes(legs[0].status)},
          {label:"Entregue no ponto de redespacho",done:!!transfer?.saida_confirmada_em},
          {label:"Recebido pelo entregador da última milha",done:!!transfer?.entrada_confirmada_em},
          {label:"Em direção ao cliente",done:!!legs[1]&&["aceito","em_execucao","concluido"].includes(legs[1].status)},
          {label:"Entrega concluída",done:order.status==="entregue"},
        ].map((item,index)=><div key={item.label} className="flex items-center gap-3"><div className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${item.done?"bg-emerald-600 text-white":"bg-slate-200 text-slate-500"}`}>{item.done?<CheckCircle2 className="h-4 w-4"/>:index+1}</div><span className={item.done?"font-medium":"text-muted-foreground"}>{item.label}</span></div>)}</div>
        {transfer?.status==="aguardando_recebimento"&&<p className="rounded-lg bg-amber-50 text-amber-800 p-3 text-sm">O volume chegou ao redespacho e aguarda a leitura de recebimento pelo próximo entregador.</p>}
      </CardContent></Card>}
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageCircle className="h-5 w-5"/>Falar sobre a entrega</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="max-h-72 overflow-y-auto space-y-2">{interactions.map((item,index)=><div key={index} className={`rounded-lg p-3 text-sm ${item.remetente_tipo==="cliente"?"ml-8 bg-primary text-primary-foreground":"mr-8 bg-slate-100"}`}><p>{item.mensagem}</p><p className="text-[10px] opacity-70 mt-1">{new Date(item.created_at).toLocaleString("pt-BR")}</p></div>)}{!interactions.length&&<p className="text-sm text-muted-foreground text-center py-5">Nenhuma mensagem ainda.</p>}</div>
        <form onSubmit={submit} className="space-y-2"><Textarea value={text} onChange={e=>setText(e.target.value)} maxLength={4000} placeholder="Escreva sua mensagem para a equipe de entrega…"/><Button className="w-full" disabled={send.isPending||!text.trim()}>{send.isPending?<Loader2 className="animate-spin h-4 w-4 mr-2"/>:{sendError&&<p className="text-xs text-red-600">{sendError}</p>}<Send className="h-4 w-4 mr-2"/>}Enviar mensagem</Button>{send.error&&<p className="text-sm text-red-600">{(send.error as Error).message}</p>}</form>
      </CardContent></Card>
    </div>
  </main>;
}
