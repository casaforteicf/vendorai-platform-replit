import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useListProdutosCatalogo, useListTenantLeads } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CalendarPlus,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  MessageSquareText,
  PackageCheck,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  Warehouse,
} from "lucide-react";

function money(value: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export default function CentralTrabalho() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const request = { headers: { Authorization: `Bearer ${token}` } };
  const { data: leads = [], isLoading: loadingLeads } = useListTenantLeads(tenantId, { request, query: { enabled: !!tenantId && !!token } });
  const { data: products = [], isLoading: loadingProducts } = useListProdutosCatalogo(tenantId, { request, query: { enabled: !!tenantId && !!token } });
  const [leadSearch, setLeadSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLocaleLowerCase("pt-BR");
    return leads
      .filter((lead) => !query || [lead.nome, lead.empresa, lead.telefone, lead.email].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query)))
      .slice(0, 30);
  }, [leadSearch, leads]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => product.ativo && (!query || [product.nome, product.sku, product.categoriaNome].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query)))).slice(0, 40);
  }, [productSearch, products]);
  const selectedProducts = products.filter((product) => selectedProductIds.includes(product.id));
  const total = selectedProducts.reduce((sum, product) => sum + Number(product.precoBase || 0), 0);

  function toggleProduct(id: string) {
    setSelectedProductIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const leadQuery = selectedLead ? `?leadId=${encodeURIComponent(selectedLead.id)}` : "";

  return (
    <div className="space-y-6">
      <header className="vendor-page-header">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><ClipboardCheck className="h-4 w-4" /> Operação do usuário</div>
          <h1 className="vendor-page-title">Central de Trabalho</h1>
          <p className="vendor-page-description">Atenda o cliente, selecione produtos e conduza os próximos passos em uma única tela.</p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Atendimento ativo</Badge>
      </header>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <Card className="overflow-hidden xl:sticky xl:top-6 xl:h-[calc(100vh-7rem)]">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-primary" /> Cliente do atendimento</CardTitle>
            <div className="relative pt-2"><Search className="absolute left-3 top-[1.15rem] h-4 w-4 text-muted-foreground" /><Input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Buscar cliente..." className="pl-9" /></div>
          </CardHeader>
          <ScrollArea className="h-[calc(100%-8.5rem)]">
            <CardContent className="space-y-2 pt-4">
              {loadingLeads ? <p className="text-sm text-muted-foreground">Carregando clientes...</p> : filteredLeads.map((lead) => (
                <button key={lead.id} type="button" onClick={() => setSelectedLeadId(lead.id)} className={`w-full rounded-xl border p-3 text-left transition-all ${selectedLeadId === lead.id ? "border-primary/30 bg-primary/8 shadow-sm" : "border-transparent hover:bg-muted/65"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{lead.nome}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{lead.empresa || lead.telefone || lead.email || "Sem contato informado"}</p>
                </button>
              ))}
            </CardContent>
          </ScrollArea>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><CardTitle className="text-lg">{selectedLead ? selectedLead.nome : "Selecione um cliente"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selectedLead ? selectedLead.empresa || selectedLead.telefone || "Atendimento em andamento" : "A operação será vinculada ao cadastro escolhido."}</p></div>
                {selectedLead && <Button asChild variant="outline" size="sm"><Link href={`/leads/${selectedLead.id}`}>Ver cadastro</Link></Button>}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2"><Link href={`/conversations${leadQuery}`}><MessageSquareText className="h-5 w-5 text-primary" />Enviar mensagem</Link></Button>
              <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2"><Link href={`/agenda${leadQuery}`}><CalendarPlus className="h-5 w-5 text-primary" />Agendar ação</Link></Button>
              <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2"><Link href={`/entregas${leadQuery}`}><Truck className="h-5 w-5 text-primary" />Agendar entrega</Link></Button>
              <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-2"><Link href="/estoque"><Warehouse className="h-5 w-5 text-primary" />Consultar estoque</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><ShoppingBag className="h-4 w-4 text-primary" /> Produtos e serviços</CardTitle><p className="mt-1 text-sm text-muted-foreground">Adicione itens à operação atual.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar produto ou SKU..." className="pl-9" /></div></div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {loadingProducts ? <p className="text-sm text-muted-foreground">Carregando catálogo...</p> : filteredProducts.map((product) => {
                  const selected = selectedProductIds.includes(product.id);
                  return <button key={product.id} type="button" onClick={() => toggleProduct(product.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${selected ? "border-primary/35 bg-primary/7" : "border-border/70 hover:border-primary/20 hover:bg-muted/40"}`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><PackageCheck className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.nome}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{product.categoriaNome || product.sku || product.unidade}</p></div>
                    <span className="text-sm font-semibold">{money(product.precoBase)}</span>
                  </button>;
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader className="border-b border-border/60"><CardTitle className="flex items-center gap-2 text-base"><CircleDollarSign className="h-4 w-4 text-primary" /> Resumo da operação</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="space-y-3">{selectedProducts.length === 0 ? <div className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">Nenhum item adicionado.</div> : selectedProducts.map((product) => <div key={product.id} className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{product.nome}</p><p className="text-xs text-muted-foreground">1 {product.unidade}</p></div><span className="shrink-0 text-sm font-medium">{money(product.precoBase)}</span></div>)}</div>
            <div className="border-t border-border/70 pt-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total estimado</span><strong className="text-xl tracking-tight">{money(total)}</strong></div></div>
            {selectedLead && selectedProducts.length > 0 ? <Button asChild className="w-full"><Link href={`/propostas${leadQuery}`}><ShoppingBag className="h-4 w-4" />Criar orçamento</Link></Button> : <Button className="w-full" disabled><ShoppingBag className="h-4 w-4" />Criar orçamento</Button>}
            {selectedLead ? <Button asChild variant="outline" className="w-full"><Link href={`/deals${leadQuery}`}>Abrir negociação</Link></Button> : <Button variant="outline" className="w-full" disabled>Abrir negociação</Button>}
            <p className="text-center text-xs leading-relaxed text-muted-foreground">Cliente, itens e próximos passos permanecem vinculados ao mesmo atendimento.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
