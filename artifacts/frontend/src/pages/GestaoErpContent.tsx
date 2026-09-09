import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import ComissoesVendedor from "@/pages/ComissoesVendedor";
import Estoque from "@/pages/Estoque";
import { FINANCE_INTEGRATION_CATALOG, FINANCE_INTEGRATION_CATEGORIES } from "@/lib/financeIntegrationCatalog";
import { Activity, Banknote, Camera, CircleDollarSign, FileCheck2, Landmark, Loader2, Network, Plus, RefreshCw, ShieldCheck, TrendingUp, WalletCards } from "lucide-react";

type Title = { id:string; tipo:"receber"|"pagar"; categoria:string; descricao:string; pessoa?:string|null; valorOriginal:string; juros:string; multa:string; desconto:string; valorPago:string; vencimento:string; status:"pendente"|"pago"|"vencido"|"cancelado" };
type Summary = { receitas:number; custos:number; despesas:number; impostos:number; lucroLiquido:number; saldoRealizado:number; receberAberto:number; pagarAberto:number };
type Config = { asaas:boolean; nuvemFiscal:boolean; ambienteFiscal:string };
type Extrato = { id:string; status?:string|null; pagamentoId?:string|null };

const pct = (n:number) => Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
const share = (part:number,total:number) => total > 0 ? (part/total)*100 : 0;
const totalTitle = (t:Title) => Number(t.valorOriginal)+Number(t.juros)+Number(t.multa)-Number(t.desconto);

export default function GestaoErp() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const headers = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
  const [newOpen, setNewOpen] = useState(false);
  const [paying, setPaying] = useState<Title|null>(null);
  const initialTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") ?? "visao" : "visao";

  const { data: titles = [], isLoading } = useQuery<Title[]>({ queryKey:["erp",tenantId,"titles"], enabled:!!tenantId, queryFn:async()=>{ const r=await fetch(`/api/tenants/${tenantId}/erp/titulos`,{headers}); if(!r.ok) throw new Error("Falha ao carregar contas"); return r.json(); } });
  const { data: summary } = useQuery<Summary>({ queryKey:["erp",tenantId,"summary"], enabled:!!tenantId, queryFn:async()=>{ const r=await fetch(`/api/tenants/${tenantId}/erp/resumo`,{headers}); if(!r.ok) throw new Error("Falha ao carregar resumo"); return r.json(); } });
  const { data: config } = useQuery<Config>({ queryKey:["erp",tenantId,"config"], enabled:!!tenantId, queryFn:async()=>{ const r=await fetch(`/api/tenants/${tenantId}/erp/configuracao`,{headers}); if(!r.ok) throw new Error("Falha ao carregar integrações"); return r.json(); } });
  const { data: extratos = [] } = useQuery<Extrato[]>({ queryKey:["erp",tenantId,"extratos"], enabled:!!tenantId, queryFn:async()=>{ const r=await fetch(`/api/tenants/${tenantId}/erp/extratos`,{headers}); if(!r.ok) return []; return r.json(); } });

  const refresh = () => qc.invalidateQueries({ queryKey:["erp",tenantId] });
  const sync = useMutation({ mutationFn:async()=>{ const r=await fetch(`/api/tenants/${tenantId}/erp/sincronizar`,{method:"POST",headers}); const d=await r.json(); if(!r.ok) throw new Error(d.error||"Falha ao sincronizar"); return d; }, onSuccess:()=>{ toast({title:"Operação sincronizada"}); refresh(); }, onError:(e:any)=>toast({title:e.message||"Erro ao sincronizar",variant:"destructive"}) });

  async function post(path:string, body:Record<string,unknown>) { const r=await fetch(path,{method:"POST",headers,body:JSON.stringify(body)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||"Operação não concluída"); return d; }

  const analytics = useMemo(() => {
    const receita = Math.max(summary?.receitas ?? 0, 0);
    const costBase = receita || Math.max((summary?.custos??0)+(summary?.despesas??0)+(summary?.impostos??0),1);
    const margin = receita > 0 ? share(summary?.lucroLiquido ?? 0, receita) : 0;
    const cost = share(summary?.custos ?? 0, costBase);
    const expense = share(summary?.despesas ?? 0, costBase);
    const tax = share(summary?.impostos ?? 0, costBase);
    const receivable = titles.filter(t=>t.tipo==="receber" && t.status!=="cancelado");
    const overdue = receivable.filter(t=>t.status==="vencido");
    const paid = receivable.filter(t=>t.status==="pago");
    const onTime = share(paid.length, Math.max(receivable.length,1));
    const defaultRate = share(overdue.length, Math.max(receivable.length,1));
    const reconciled = extratos.filter(e=>e.status==="conciliado" || e.pagamentoId).length;
    const reconciliation = share(reconciled, Math.max(extratos.length,1));
    return { margin, cost, expense, tax, onTime, defaultRate, reconciliation };
  }, [summary,titles,extratos]);

  const connectedIds = useMemo(() => new Set([...(config?.asaas ? ["asaas"] : []), ...(config?.nuvemFiscal ? ["nuvem-fiscal"] : []), "inventory", "praca-ai", "public-api"]), [config]);
  const integrationCoverage = share(connectedIds.size, FINANCE_INTEGRATION_CATALOG.length);

  return <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5 overflow-x-hidden">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0"><h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-primary shrink-0"/>Financeiro + ERP Hub</h1><p className="text-sm text-muted-foreground">Operação financeira unificada, integrações, conciliação, contratos e inteligência.</p></div>
      <div className="flex gap-2 flex-wrap"><Button asChild variant="outline"><Link href="/erp/captura"><Camera className="h-4 w-4 mr-2"/>Capturar</Link></Button><Button variant="outline" onClick={()=>sync.mutate()} disabled={sync.isPending}>{sync.isPending?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<RefreshCw className="h-4 w-4 mr-2"/>}Sincronizar</Button><Button onClick={()=>setNewOpen(true)}><Plus className="h-4 w-4 mr-2"/>Novo lançamento</Button></div>
    </div>

    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Metric icon={TrendingUp} label="Margem operacional" value={pct(analytics.margin)} />
      <Metric icon={ShieldCheck} label="Recebimento em dia" value={pct(analytics.onTime)} />
      <Metric icon={Activity} label="Inadimplência" value={pct(analytics.defaultRate)} />
      <Metric icon={Network} label="Cobertura de integrações" value={pct(integrationCoverage)} />
    </div>

    <Tabs defaultValue={initialTab}>
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="visao">Visão geral</TabsTrigger><TabsTrigger value="contas">Receber/Pagar</TabsTrigger><TabsTrigger value="conciliacao">Conciliação</TabsTrigger><TabsTrigger value="dre">DRE %</TabsTrigger><TabsTrigger value="integracoes">ERP e Integrações</TabsTrigger><TabsTrigger value="comissoes">Comissões</TabsTrigger><TabsTrigger value="estoque">Estoque</TabsTrigger>
      </TabsList>

      <TabsContent value="visao" className="mt-4 grid lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Saúde financeira</CardTitle></CardHeader><CardContent className="space-y-4"><ProgressLine label="Margem" value={analytics.margin}/><ProgressLine label="Recebimento em dia" value={analytics.onTime}/><ProgressLine label="Conciliação automática/confirmada" value={analytics.reconciliation}/><ProgressLine label="Cobertura de integrações" value={integrationCoverage}/></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Sinais de atenção</CardTitle></CardHeader><CardContent className="space-y-3"><Signal label="Inadimplência" value={analytics.defaultRate} inverse/><Signal label="Custos sobre base operacional" value={analytics.cost} inverse/><Signal label="Despesas sobre base operacional" value={analytics.expense} inverse/><Signal label="Impostos sobre base operacional" value={analytics.tax} inverse/></CardContent></Card>
      </TabsContent>

      <TabsContent value="contas" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Contas a receber e pagar</CardTitle></CardHeader><CardContent className="p-0">{isLoading?<div className="py-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin"/></div>:<div className="overflow-x-auto"><table className="w-full text-sm min-w-[680px]"><thead><tr className="text-left border-b text-muted-foreground"><th className="p-3">Tipo</th><th>Descrição</th><th>Vencimento</th><th>Liquidado %</th><th>Status</th><th className="text-right pr-3">Ação</th></tr></thead><tbody>{titles.map(t=>{const coverage=share(Number(t.valorPago),Math.max(totalTitle(t),1));return <tr key={t.id} className="border-b last:border-0"><td className="p-3"><Badge variant="outline">{t.tipo==="receber"?"Receber":"Pagar"}</Badge></td><td><p className="font-medium">{t.descricao}</p><p className="text-xs text-muted-foreground">{t.pessoa||t.categoria}</p></td><td>{new Date(t.vencimento).toLocaleDateString("pt-BR")}</td><td className="font-semibold">{pct(Math.min(coverage,100))}</td><td><Badge variant={t.status==="vencido"?"destructive":"secondary"}>{t.status}</Badge></td><td className="text-right pr-3">{t.status!=="pago"&&t.status!=="cancelado"&&<Button size="sm" variant="outline" onClick={()=>setPaying(t)}>Dar baixa</Button>}</td></tr>})}</tbody></table>{!titles.length&&<p className="text-center text-muted-foreground py-10">Nenhum lançamento cadastrado.</p>}</div>}</CardContent></Card></TabsContent>

      <TabsContent value="conciliacao" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Conciliação</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid sm:grid-cols-3 gap-3"><MiniStat label="Conciliado" value={pct(analytics.reconciliation)}/><MiniStat label="Em revisão" value={pct(share(extratos.filter(e=>e.status!=="conciliado"&&!e.pagamentoId).length,Math.max(extratos.length,1)))}/><MiniStat label="Não identificado" value={pct(extratos.length?Math.max(0,100-analytics.reconciliation):0)}/></div><p className="text-sm text-muted-foreground">O motor cruza data, documento, cliente/fornecedor, origem, contrato, pedido, NF, Pix, boleto e histórico. Casos com baixa confiança permanecem para revisão humana.</p></CardContent></Card></TabsContent>

      <TabsContent value="dre" className="mt-4"><Card><CardHeader><CardTitle className="text-base">DRE gerencial em percentuais</CardTitle></CardHeader><CardContent className="space-y-4"><ProgressLine label="Margem operacional" value={analytics.margin}/><ProgressLine label="Custos" value={analytics.cost}/><ProgressLine label="Despesas" value={analytics.expense}/><ProgressLine label="Impostos" value={analytics.tax}/></CardContent></Card></TabsContent>

      <TabsContent value="integracoes" className="mt-4 space-y-4">
        <Card><CardContent className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap"><div><p className="text-sm text-muted-foreground">Cobertura do mapa de integrações</p><p className="text-3xl font-bold">{pct(integrationCoverage)}</p></div><div className="text-sm text-muted-foreground">Cada conector é classificado por categoria, autenticação, capacidades e direção de sincronização.</div></CardContent></Card>
        {FINANCE_INTEGRATION_CATEGORIES.map(category=><Card key={category}><CardHeader className="pb-2"><CardTitle className="text-sm">{category}</CardTitle></CardHeader><CardContent><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{FINANCE_INTEGRATION_CATALOG.filter(i=>i.category===category).map(i=>{const connected=connectedIds.has(i.id);return <div key={i.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{i.name}</p><Badge variant={connected?"default":"secondary"}>{connected?"Conectado":"Não configurado"}</Badge></div><p className="text-xs text-muted-foreground mt-2">{i.capabilities.join(" · ")}</p><div className="flex gap-2 mt-3 text-[11px] text-muted-foreground"><span>{i.auth}</span><span>•</span><span>{i.direction}</span></div></div>})}</div></CardContent></Card>)}
      </TabsContent>

      <TabsContent value="comissoes" className="mt-4"><ComissoesVendedor embedded /></TabsContent>
      <TabsContent value="estoque" className="mt-4 -mx-4 md:-mx-6"><Estoque /></TabsContent>
    </Tabs>

    <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent><DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await post(`/api/tenants/${tenantId}/erp/titulos`,{tipo:f.get("tipo"),categoria:f.get("categoria"),descricao:f.get("descricao"),pessoa:f.get("pessoa")||undefined,valorOriginal:f.get("valorOriginal"),vencimento:new Date(String(f.get("vencimento"))).toISOString()});setNewOpen(false);refresh();toast({title:"Lançamento criado"});}catch(err:any){toast({title:err.message,variant:"destructive"})}}}><div><Label>Tipo</Label><select name="tipo" className="w-full h-10 rounded-md border bg-background px-3"><option value="receber">Conta a receber</option><option value="pagar">Conta a pagar</option></select></div><div><Label>Categoria</Label><select name="categoria" className="w-full h-10 rounded-md border bg-background px-3"><option value="receita">Receita</option><option value="custo">Custo</option><option value="despesa">Despesa</option><option value="imposto">Imposto</option><option value="investimento">Investimento</option></select></div><div><Label>Descrição</Label><Input name="descricao" required/></div><div><Label>Cliente/fornecedor</Label><Input name="pessoa"/></div><div className="grid grid-cols-2 gap-3"><div><Label>Valor operacional</Label><Input name="valorOriginal" type="number" step="0.01" min="0" required/></div><div><Label>Vencimento</Label><Input name="vencimento" type="date" required/></div></div><Button type="submit" className="w-full">Salvar lançamento</Button></form></DialogContent></Dialog>

    <Dialog open={!!paying} onOpenChange={o=>!o&&setPaying(null)}><DialogContent><DialogHeader><DialogTitle>Dar baixa</DialogTitle></DialogHeader>{paying&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await post(`/api/tenants/${tenantId}/erp/titulos/${paying.id}/baixar`,{valor:f.get("valor"),forma:f.get("forma")||undefined,pagoEm:new Date().toISOString()});setPaying(null);refresh();toast({title:"Baixa registrada"});}catch(err:any){toast({title:err.message,variant:"destructive"})}}}><p className="text-sm text-muted-foreground">{paying.descricao}</p><div><Label>Valor da baixa</Label><Input name="valor" type="number" step="0.01" min="0.01" required/></div><div><Label>Forma</Label><Input name="forma" placeholder="Pix, boleto, cartão..."/></div><Button type="submit" className="w-full">Confirmar baixa</Button></form>}</DialogContent></Dialog>
  </div>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Activity;label:string;value:string}){return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4"/><span className="text-xs">{label}</span></div><p className="text-2xl font-bold mt-2">{value}</p></CardContent></Card>}
function ProgressLine({label,value}:{label:string;value:number}){const v=Math.max(0,Math.min(100,value));return <div><div className="flex justify-between text-sm mb-1"><span>{label}</span><strong>{pct(value)}</strong></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-foreground/70" style={{width:`${v}%`}}/></div></div>}
function Signal({label,value,inverse=false}:{label:string;value:number;inverse?:boolean}){return <div className="flex items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm">{label}</span><Badge variant={inverse&&value>20?"destructive":"secondary"}>{pct(value)}</Badge></div>}
function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold mt-1">{value}</p></div>}
