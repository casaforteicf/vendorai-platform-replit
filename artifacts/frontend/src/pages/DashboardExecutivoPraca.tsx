import { useMemo,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle,ArrowRight,BarChart3,Clock3,DollarSign,Loader2,PackageCheck,RotateCcw,ShoppingCart,Truck } from "lucide-react";
import { Link } from "wouter";

type DashboardData={
 period:{from:string;to:string;days:number};generatedAt:string;
 orders:{pedidos:number;gmv_centavos:number;ticket_medio_centavos:number;entregues:number;falhas_entrega:number;cancelados:number;em_transito:number;taxa_sucesso_entrega:number};
 finance:{cobrancas:number;confirmado_centavos:number;recebido_centavos:number;taxa_operadora_centavos:number;pagamentos_risco:number;estornos:number};
 exceptions:{ativos:number;criticos:number;fora_sla:number;resolvidos:number;tempo_medio_resolucao_min:number};
 returns:{total:number;concluidas:number;divergencias:number};
 allocations:{beneficiary_type:string;liquidado_centavos:number;pendente_centavos:number}[];
 series:{dia:string;pedidos:number;gmv_centavos:number;entregues:number}[];
 statuses:{status:string;total:number}[];
 topProducts:{produto_id:string;nome_snapshot:string;quantidade:number;faturamento_centavos:number}[];
};
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(value)||0)/100);
const statusLabel:Record<string,string>={recebido:"Recebido",pagamento_pendente:"Pagamento pendente",pago:"Pago",em_separacao:"Em separação",pronto_coleta:"Pronto para coleta",coleta_agendada:"Coleta agendada",coletado:"Coletado",em_rota:"Em rota",entregue:"Entregue",falha_entrega:"Falha na entrega",cancelado:"Cancelado",devolucao_solicitada:"Devolução solicitada",devolvido:"Devolvido"};
const beneficiaryLabel:Record<string,string>={seller:"Vendedores",praca:"Comissão Praça.ai",courier:"Entregadores",provider:"Operadora de pagamento"};

export default function DashboardExecutivoPraca(){
 const {user,token}=useAuth(),tenantId=user?.tenantId??"";
 const now=new Date(),initialFrom=new Date(now);initialFrom.setDate(initialFrom.getDate()-29);
 const [from,setFrom]=useState(initialFrom.toISOString().slice(0,10)),[to,setTo]=useState(now.toISOString().slice(0,10));
 const headers=useMemo(()=>token?{Authorization:`Bearer ${token}`}:undefined,[token]);
 const query=useQuery<DashboardData>({queryKey:["praca-executive",tenantId,from,to],enabled:!!tenantId,
  queryFn:async()=>{const r=await fetch(`/api/tenants/${tenantId}/praca-executive-dashboard?from=${from}&to=${to}`,{headers});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha ao carregar painel.");return d;},
  refetchInterval:60000,
 });
 const data=query.data,maxGmv=Math.max(1,...(data?.series.map(x=>Number(x.gmv_centavos))??[1]));
 return <div className="p-4 md:p-6 space-y-5">
  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
   <div><div className="flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary"/><h1 className="text-2xl font-bold">Painel Executivo Praça.ai</h1></div><p className="text-sm text-muted-foreground mt-1">Vendas, pagamentos, splits, logística, devoluções e riscos sob gestão do Vendor.ai.</p></div>
   <div className="flex flex-wrap items-end gap-2"><div><small className="text-muted-foreground">De</small><Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><small className="text-muted-foreground">Até</small><Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div><Button variant="outline" asChild><Link href="/logistica-praca">Abrir operação <ArrowRight className="h-4 w-4 ml-2"/></Link></Button></div>
  </div>
  {query.isLoading?<div className="py-24 flex justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>:query.isError?<Card><CardContent className="py-10 text-center text-red-600">{(query.error as Error).message}</CardContent></Card>:data&&<>
   <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
    {[
     ["Vendas brutas",money(data.orders.gmv_centavos),data.orders.pedidos+" pedidos",ShoppingCart],
     ["Valor recebido",money(data.finance.recebido_centavos),money(data.finance.confirmado_centavos)+" confirmado",DollarSign],
     ["Entrega concluída",data.orders.taxa_sucesso_entrega+"%",data.orders.entregues+" entregues",PackageCheck],
     ["Exceções ativas",String(data.exceptions.ativos),data.exceptions.fora_sla+" fora do SLA",AlertTriangle],
    ].map(([label,value,detail,Icon]:any)=><Card key={label}><CardContent className="p-4"><div className="flex justify-between"><div><small className="text-muted-foreground">{label}</small><b className="block text-2xl mt-1">{value}</b><small>{detail}</small></div><Icon className="h-5 w-5 text-primary"/></div></CardContent></Card>)}
   </div>
   <div className="grid xl:grid-cols-3 gap-4">
    <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Evolução diária de vendas</CardTitle></CardHeader><CardContent><div className="h-52 flex items-end gap-1 border-b">
     {data.series.map(x=><div key={x.dia} className="flex-1 min-w-1 group relative" title={new Date(x.dia+"T12:00:00").toLocaleDateString("pt-BR")+" · "+money(x.gmv_centavos)}><div className="bg-primary/80 hover:bg-primary rounded-t" style={{height:Math.max(2,Number(x.gmv_centavos)/maxGmv*190)}}/><span className="hidden group-hover:block absolute bottom-full z-10 bg-popover border rounded p-1 text-xs whitespace-nowrap">{money(x.gmv_centavos)}</span></div>)}
    </div><div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{new Date(data.period.from+"T12:00:00").toLocaleDateString("pt-BR")}</span><span>{data.period.days} dias</span><span>{new Date(data.period.to+"T12:00:00").toLocaleDateString("pt-BR")}</span></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Saúde operacional</CardTitle></CardHeader><CardContent className="space-y-3">
     {[["Em trânsito",data.orders.em_transito,Truck],["Falhas de entrega",data.orders.falhas_entrega,AlertTriangle],["Pagamentos em risco",data.finance.pagamentos_risco,DollarSign],["Devoluções",data.returns.total,RotateCcw],["SLA médio de resolução",data.exceptions.tempo_medio_resolucao_min+" min",Clock3]].map(([label,value,Icon]:any)=><div key={label} className="flex items-center justify-between border-b pb-2"><span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4"/>{label}</span><b>{value}</b></div>)}
    </CardContent></Card>
   </div>
   <div className="grid lg:grid-cols-2 gap-4">
    <Card><CardHeader><CardTitle className="text-base">Destinação e rastreio financeiro</CardTitle></CardHeader><CardContent className="space-y-2">
     {data.allocations.map(x=><div key={x.beneficiary_type} className="rounded-lg border p-3"><div className="flex justify-between"><b>{beneficiaryLabel[x.beneficiary_type]||x.beneficiary_type}</b><Badge variant="outline">{money(x.liquidado_centavos)} liquidado</Badge></div><p className="text-sm text-muted-foreground mt-1">{money(x.pendente_centavos)} pendente ou bloqueado</p></div>)}
     {!data.allocations.length&&<p className="text-sm text-muted-foreground">Nenhuma distribuição financeira no período.</p>}
     <div className="grid grid-cols-2 gap-2 pt-2"><div className="border rounded p-2"><small>Taxa da operadora</small><b className="block">{money(data.finance.taxa_operadora_centavos)}</b></div><div className="border rounded p-2"><small>Estornos</small><b className="block">{data.finance.estornos}</b></div></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Pedidos por etapa</CardTitle></CardHeader><CardContent className="space-y-2">{data.statuses.map(x=><div key={x.status} className="flex items-center justify-between border-b pb-2"><span className="text-sm">{statusLabel[x.status]||x.status}</span><Badge variant="secondary">{x.total}</Badge></div>)}{!data.statuses.length&&<p className="text-sm text-muted-foreground">Nenhum pedido no período.</p>}</CardContent></Card>
   </div>
   <Card><CardHeader><CardTitle className="text-base">Produtos com maior faturamento</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Produto</th><th>Quantidade</th><th className="text-right">Faturamento</th></tr></thead><tbody>{data.topProducts.map(x=><tr key={x.produto_id} className="border-b"><td className="py-2 font-medium">{x.nome_snapshot}</td><td>{Number(x.quantidade).toLocaleString("pt-BR")}</td><td className="text-right">{money(x.faturamento_centavos)}</td></tr>)}</tbody></table>{!data.topProducts.length&&<p className="text-center text-sm text-muted-foreground py-6">Nenhum produto vendido no período.</p>}</div></CardContent></Card>
   <p className="text-xs text-muted-foreground text-right">Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}. Atualização automática a cada minuto.</p>
  </>}
 </div>;
}
