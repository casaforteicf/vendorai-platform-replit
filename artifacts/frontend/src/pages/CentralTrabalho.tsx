import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListInventoryItems,
  useListDeals,
  useListProdutosCatalogo,
  useListTenantLeads,
  useCreateLead,
  useCreateDeal,
  useUpdateDeal,
} from "@workspace/api-client-react";
import type { DealEtapa } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  MessageSquareText,
  PackageCheck,
  Search,
  ShoppingBag,
  BadgePercent,
  ExternalLink,
  Plus,
  Truck,
  UserRound,
} from "lucide-react";

const STEPS = ["Cliente", "Produtos", "Revisão", "Venda", "Entrega"] as const;

function money(value: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export default function CentralTrabalho() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const request = { headers: { Authorization: `Bearer ${token}` } };
  const enabled = !!tenantId && !!token;
  const { data: leads = [], isLoading: loadingLeads, refetch: refetchLeads } = useListTenantLeads(tenantId, { request, query: { enabled } });
  const { data: products = [], isLoading: loadingProducts } = useListProdutosCatalogo(tenantId, { request, query: { enabled } });
  const { data: inventory = [], isLoading: loadingInventory } = useListInventoryItems(tenantId, { request, query: { enabled } });
  const { data: deals = [] } = useListDeals(tenantId, undefined, { request, query: { enabled } });
  const createDeal = useCreateDeal({ request });
  const createLead = useCreateLead({ request });
  const updateDeal = useUpdateDeal({ request });

  const [step, setStep] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [dealId, setDealId] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [discountPending, setDiscountPending] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({ nome: "", telefone: "", email: "", empresa: "", objetivo: "" });
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const stockByProduct = useMemo(() => new Map(inventory.map((item) => [item.produtoId, item])), [inventory]);
  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLocaleLowerCase("pt-BR");
    return leads.filter((lead) => !query || [lead.nome, lead.empresa, lead.telefone, lead.email].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query))).slice(0, 40);
  }, [leadSearch, leads]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => {
      const stock = stockByProduct.get(product.id);
      const available = !stock || Number(stock.quantidadeAtual) > 0;
      const matches = !query || [product.nome, product.sku, product.categoriaNome].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
      return product.ativo && available && matches;
    }).slice(0, 60);
  }, [productSearch, products, stockByProduct]);
  const selectedProducts = products.filter((product) => selectedProductIds.includes(product.id));
  const total = selectedProducts.reduce((sum, product) => sum + Number(product.precoBase || 0), 0);
  const leadQuery = selectedLead ? `leadId=${encodeURIComponent(selectedLead.id)}` : "";
  const productQuery = selectedProductIds.length ? `&productIds=${encodeURIComponent(selectedProductIds.join(","))}` : "";
  const dealQuery = dealId ? `&dealId=${encodeURIComponent(dealId)}` : "";

  async function selectLead(id: string, forceNewDeal = false) {
    const lead = leads.find((item) => item.id === id);
    if (!lead) return;
    const existing = forceNewDeal ? undefined : deals.find((deal) => deal.leadId === id && !["ganho", "perdido", "entregue"].includes(deal.etapa));
    try {
      const activeDeal = existing ?? await createDeal.mutateAsync({ data: {
        tenantId,
        leadId: id,
        titulo: `Atendimento - ${lead.nome}`,
        etapa: "novo",
      } });
      setDealId(activeDeal.id);
    } catch {
      toast({ title: "Não foi possível iniciar a venda", description: "Tente selecionar o cliente novamente.", variant: "destructive" });
      return;
    }
    setSelectedLeadId(id);
    setSelectedProductIds([]);
    setProductSearch("");
    setStep(1);
  }

  useEffect(() => {
    if (deepLinkHandled || !leads.length) return;
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get("leadId");
    if (!leadId || !leads.some((lead) => lead.id === leadId)) return;
    setDeepLinkHandled(true);
    void selectLead(leadId, params.get("newDeal") === "1");
    window.history.replaceState({}, "", `${window.location.pathname}`);
  }, [deepLinkHandled, leads]);

  async function submitNewLead() {
    if (!newLead.nome.trim()) return;
    try {
      const created = await createLead.mutateAsync({ data: {
        tenantId, nome: newLead.nome.trim(), telefone: newLead.telefone.trim() || null,
        email: newLead.email.trim() || null, empresa: newLead.empresa.trim() || null,
        objetivo: newLead.objetivo.trim() || null,
      } });
      const activeDeal = await createDeal.mutateAsync({ data: {
        tenantId, leadId: created.id,
        titulo: created.empresa ? `${created.empresa} — ${created.nome}` : `Atendimento - ${created.nome}`,
        etapa: "novo",
      } });
      await refetchLeads();
      setSelectedLeadId(created.id);
      setDealId(activeDeal.id);
      setSelectedProductIds([]);
      setProductSearch("");
      setStep(1);
      setNewLeadOpen(false);
      setNewLead({ nome: "", telefone: "", email: "", empresa: "", objetivo: "" });
      toast({ title: "Lead criado", description: "O atendimento avançou para a seleção de produtos." });
    } catch (error) {
      toast({ title: "Não foi possível criar o lead", description: error instanceof Error ? error.message : "Revise os dados e tente novamente.", variant: "destructive" });
    }
  }

  async function advance(nextStep: number, etapa: DealEtapa) {
    if (!dealId) return;
    try {
      await updateDeal.mutateAsync({ id: dealId, data: { etapa, valor: total || undefined } });
      setStep(nextStep);
      toast({ title: "Pipeline atualizada", description: `O card avançou para ${etapa.replaceAll("_", " ")}.` });
    } catch (error) {
      toast({ title: "Não foi possível avançar o card", description: error instanceof Error ? error.message : "A etapa da venda não foi alterada.", variant: "destructive" });
    }
  }

  async function submitDiscount(requestManagement: boolean) {
    if (!dealId || !discountReason.trim()) return;
    setDiscountPending(true);
    try {
      const response = await fetch(`/api/deals/${dealId}/commercial-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ discountPercent: Number(discountPercent), reason: discountReason, requestManagement }),
      });
      const body = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar a análise comercial");
      setDiscountOpen(false);
      setDiscountReason("");
      toast({ title: body.status === "applied" ? "Desconto aplicado" : "Enviado para a gerência", description: "A decisão e a justificativa foram registradas na jornada do lead." });
    } catch (error) {
      toast({ title: "Análise comercial não registrada", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setDiscountPending(false);
    }
  }

  function toggleProduct(id: string) {
    setSelectedProductIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function restart() {
    setStep(0);
    setSelectedLeadId(null);
    setSelectedProductIds([]);
    setDealId(null);
    setLeadSearch("");
    setProductSearch("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="vendor-page-header">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><ClipboardCheck className="h-4 w-4" /> Operação guiada</div>
          <h1 className="vendor-page-title">Central de Trabalho</h1>
          <p className="vendor-page-description">Conduza o atendimento na ordem certa, do cliente até a entrega.</p>
        </div>
        {selectedLead && <Button variant="outline" size="sm" onClick={restart}>Iniciar novo atendimento</Button>}
      </header>

      <nav aria-label="Etapas da venda" className="grid grid-cols-5 gap-1 rounded-2xl border bg-card p-2 shadow-sm sm:gap-2">
        {STEPS.map((label, index) => {
          const complete = index < step;
          const active = index === step;
          const unlocked = index <= step;
          return (
            <button key={label} type="button" disabled={!unlocked} onClick={() => unlocked && setStep(index)} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition sm:flex-row sm:justify-center sm:px-3 ${active ? "bg-primary text-primary-foreground shadow-sm" : complete ? "bg-primary/8 text-primary" : "text-muted-foreground"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-white/20" : complete ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
              <span className="truncate text-[11px] font-semibold sm:text-sm">{label}</span>
            </button>
          );
        })}
      </nav>

      {step === 0 && (
        <Card>
          <CardContent className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><UserRound className="h-5 w-5 text-primary" /> Quem será atendido?</h2><p className="mt-1 text-sm text-muted-foreground">Busque e selecione o cliente para começar. A próxima etapa abrirá automaticamente.</p></div><Button onClick={() => setNewLeadOpen(true)}><Plus className="h-4 w-4" /> Novo lead</Button></div>
            <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input autoFocus value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Nome, empresa, telefone ou e-mail..." className="h-11 pl-9" /></div>
            <ScrollArea className="h-[min(52vh,480px)]">
              <div className="grid gap-2 pr-3 sm:grid-cols-2">
                {loadingLeads ? <p className="text-sm text-muted-foreground">Carregando clientes...</p> : filteredLeads.map((lead) => (
                  <button key={lead.id} type="button" onClick={() => selectLead(lead.id)} className="flex items-center gap-3 rounded-xl border p-4 text-left transition hover:border-primary/35 hover:bg-primary/5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{lead.nome.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{lead.nome}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{lead.empresa || lead.telefone || lead.email || "Sem contato informado"}</span></span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {step === 1 && selectedLead && (
        <Card>
          <CardContent className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div><Badge variant="secondary" className="mb-2">Cliente: {selectedLead.nome}</Badge><h2 className="flex items-center gap-2 text-xl font-semibold"><PackageCheck className="h-5 w-5 text-primary" /> Buscar produtos no estoque</h2><p className="mt-1 text-sm text-muted-foreground">Somente produtos ativos e disponíveis são exibidos.</p></div>
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> Trocar cliente</Button>
            </div>
            <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Busque por produto, SKU ou categoria..." className="h-11 pl-9" /></div>
            <ScrollArea className="h-[min(48vh,430px)]">
              <div className="grid gap-3 pr-3 sm:grid-cols-2 lg:grid-cols-3">
                {loadingProducts || loadingInventory ? <p className="text-sm text-muted-foreground">Consultando estoque...</p> : filteredProducts.map((product) => {
                  const selected = selectedProductIds.includes(product.id);
                  const stock = stockByProduct.get(product.id);
                  return <button key={product.id} type="button" onClick={() => toggleProduct(product.id)} className={`relative rounded-xl border p-4 text-left transition ${selected ? "border-primary bg-primary/7 ring-1 ring-primary/20" : "hover:border-primary/30 hover:bg-muted/35"}`}>
                    {selected && <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span>}
                    <p className="pr-8 text-sm font-semibold">{product.nome}</p><p className="mt-1 text-xs text-muted-foreground">{product.categoriaNome || product.sku || "Produto"}</p>
                    <div className="mt-4 flex items-end justify-between gap-2"><strong>{money(product.precoBase)}</strong><Badge variant={stock && Number(stock.quantidadeAtual) <= Number(stock.quantidadeMinima) ? "destructive" : "outline"}>{stock ? `${stock.quantidadeAtual} ${stock.unidade}` : "Sob consulta"}</Badge></div>
                  </button>;
                })}
              </div>
            </ScrollArea>
            <div className="mt-5 flex items-center justify-between border-t pt-5"><span className="text-sm text-muted-foreground">{selectedProducts.length} item(ns) selecionado(s)</span><Button disabled={!selectedProducts.length || updateDeal.isPending} onClick={() => advance(2, "qualificado")}>Revisar pedido <ArrowRight className="h-4 w-4" /></Button></div>
          </CardContent>
        </Card>
      )}

      {step === 2 && selectedLead && (
        <Card><CardContent className="p-5 sm:p-7"><div className="mb-5"><Badge variant="secondary" className="mb-2">{selectedLead.nome}</Badge><h2 className="text-xl font-semibold">Revisar itens da venda</h2><p className="mt-1 text-sm text-muted-foreground">Confirme os produtos antes de gerar o orçamento.</p></div><div className="divide-y rounded-xl border">{selectedProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{product.nome}</p><p className="text-xs text-muted-foreground">1 {product.unidade}</p></div><strong>{money(product.precoBase)}</strong></div>)}</div><div className="mt-5 flex items-center justify-between rounded-xl bg-muted/55 p-4"><span className="text-sm text-muted-foreground">Total estimado</span><strong className="text-2xl">{money(total)}</strong></div><div className="mt-5 flex justify-between"><Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Alterar produtos</Button><Button disabled={updateDeal.isPending} onClick={() => advance(3, "proposta")}>Continuar venda <ArrowRight className="h-4 w-4" /></Button></div></CardContent></Card>
      )}

      {step === 3 && selectedLead && (
        <Card><CardContent className="p-5 sm:p-7"><div className="mb-6"><Badge variant="secondary" className="mb-2">{selectedLead.nome} · {money(total)}</Badge><h2 className="text-xl font-semibold">Formalizar e acompanhar a venda</h2><p className="mt-1 text-sm text-muted-foreground">Orçamento, negociação, descontos e aprovações permanecem no mesmo card.</p></div><div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-muted/20 p-5"><ShoppingBag className="mb-4 h-7 w-7 text-primary" /><h3 className="font-semibold">1. Criar orçamento</h3><p className="mb-4 mt-1 text-sm text-muted-foreground">Cliente, itens e o mesmo negócio seguem preenchidos.</p><Button asChild className="w-full"><Link href={`/propostas?${leadQuery}${productQuery}${dealQuery}&new=1`}>Abrir orçamento <ArrowRight className="h-4 w-4" /></Link></Button></div><div className="rounded-2xl border bg-muted/20 p-5"><CheckCircle2 className="mb-4 h-7 w-7 text-primary" /><h3 className="font-semibold">2. Acompanhar negociação</h3><p className="mb-4 mt-1 text-sm text-muted-foreground">O card avança e toda movimentação entra no histórico do lead.</p><Button variant="outline" className="w-full" disabled={updateDeal.isPending} onClick={() => advance(3, "negociacao")}>Iniciar negociação</Button></div><div className="rounded-2xl border bg-muted/20 p-5"><BadgePercent className="mb-4 h-7 w-7 text-primary" /><h3 className="font-semibold">3. Condição comercial</h3><p className="mb-4 mt-1 text-sm text-muted-foreground">Aplique desconto autorizado ou envie para análise da gerência.</p><Button variant="outline" className="w-full" onClick={() => setDiscountOpen(true)}>Analisar desconto</Button></div></div><div className="mt-5 flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Voltar</Button><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/leads/${selectedLead.id}`}><ExternalLink className="h-4 w-4" /> Abrir negócio e jornada</Link></Button><Button disabled={updateDeal.isPending} onClick={() => advance(4, "ganho")}>Venda confirmada <ArrowRight className="h-4 w-4" /></Button></div></div></CardContent></Card>
      )}

      {step === 4 && selectedLead && (
        <Card><CardContent className="p-5 sm:p-7"><div className="mb-6"><Badge className="mb-2 bg-emerald-600 hover:bg-emerald-600">Venda confirmada</Badge><h2 className="text-xl font-semibold">Concluir atendimento</h2><p className="mt-1 text-sm text-muted-foreground">Organize a entrega e mantenha o cliente informado.</p></div><div className="grid gap-3 sm:grid-cols-3"><Button asChild variant="outline" className="h-24 flex-col gap-2"><Link href={`/entregas?${leadQuery}`}><Truck className="h-5 w-5 text-primary" />Agendar entrega</Link></Button><Button asChild variant="outline" className="h-24 flex-col gap-2"><Link href={`/agenda?${leadQuery}`}><CalendarPlus className="h-5 w-5 text-primary" />Agendar acompanhamento</Link></Button><Button asChild variant="outline" className="h-24 flex-col gap-2"><Link href={`/conversations?${leadQuery}`}><MessageSquareText className="h-5 w-5 text-primary" />Enviar mensagem</Link></Button></div><Button className="mt-6 w-full" onClick={restart}>Finalizar e iniciar outro atendimento</Button></CardContent></Card>
      )}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}><DialogContent><DialogHeader><DialogTitle>Condição comercial</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="discount-percent">Desconto (%)</Label><Input id="discount-percent" type="number" min="0" max="100" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="discount-reason">Justificativa</Label><Textarea id="discount-reason" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Explique a condição negociada, concorrência, volume ou motivo da exceção..." /></div><p className="text-xs text-muted-foreground">Até 10% pode ser aplicado diretamente. Percentuais maiores seguem automaticamente para aprovação gerencial.</p></div><DialogFooter className="gap-2 sm:gap-0"><Button variant="outline" disabled={discountPending || !discountReason.trim()} onClick={() => submitDiscount(true)}>Enviar para gerência</Button><Button disabled={discountPending || !discountReason.trim()} onClick={() => submitDiscount(false)}>Aplicar condição</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Criar novo lead</DialogTitle></DialogHeader><div className="grid gap-4"><div className="space-y-2"><Label htmlFor="new-lead-name">Nome *</Label><Input id="new-lead-name" autoFocus value={newLead.nome} onChange={(event) => setNewLead((current) => ({ ...current, nome: event.target.value }))} placeholder="Nome completo" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-lead-phone">Telefone</Label><Input id="new-lead-phone" inputMode="tel" value={newLead.telefone} onChange={(event) => setNewLead((current) => ({ ...current, telefone: event.target.value }))} placeholder="+55 11 99999-9999" /></div><div className="space-y-2"><Label htmlFor="new-lead-email">E-mail</Label><Input id="new-lead-email" inputMode="email" value={newLead.email} onChange={(event) => setNewLead((current) => ({ ...current, email: event.target.value }))} placeholder="email@empresa.com" /></div></div><div className="space-y-2"><Label htmlFor="new-lead-company">Empresa</Label><Input id="new-lead-company" value={newLead.empresa} onChange={(event) => setNewLead((current) => ({ ...current, empresa: event.target.value }))} placeholder="Nome da empresa" /></div><div className="space-y-2"><Label htmlFor="new-lead-goal">Objetivo</Label><Textarea id="new-lead-goal" value={newLead.objetivo} onChange={(event) => setNewLead((current) => ({ ...current, objetivo: event.target.value }))} placeholder="O que o cliente precisa?" /></div></div><DialogFooter><Button variant="outline" onClick={() => setNewLeadOpen(false)}>Cancelar</Button><Button disabled={!newLead.nome.trim() || createLead.isPending || createDeal.isPending} onClick={submitNewLead}>{createLead.isPending || createDeal.isPending ? "Salvando..." : "Salvar e continuar"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
