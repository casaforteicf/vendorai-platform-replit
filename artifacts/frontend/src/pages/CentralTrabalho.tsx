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
  useCreateProposta,
  useUpdateProposta,
  useListPropostas,
  useUpdatePropostaStatus,
  getListTenantLeadsQueryKey,
  getListProdutosCatalogoQueryKey,
  getListInventoryItemsQueryKey,
  getListDealsQueryKey,
  getListPropostasQueryKey,
} from "@workspace/api-client-react";
import type { DealEtapa, PropostaStatus } from "@workspace/api-client-react";
import {
  calculateItemsSubtotal,
  dealStageToWorkStep,
  fromProposalItems,
  nextProposalStatusAction,
  toProposalItems,
  type WorkCenterItem,
} from "@/lib/workCenterSales";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  MessageSquareText,
  Minus,
  PackageCheck,
  Search,
  ShoppingBag,
  BadgePercent,
  ExternalLink,
  Plus,
  CreditCard,
  Truck,
  Trash2,
  FilePlus2,
  UserRound,
} from "lucide-react";

const STEPS = ["Cliente", "Produtos", "Revisão", "Venda", "Entrega"] as const;

function money(value: string | number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

export default function CentralTrabalho() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const request = { headers: { Authorization: `Bearer ${token}` } };
  const enabled = !!tenantId && !!token;
  const {
    data: leads = [],
    isLoading: loadingLeads,
    refetch: refetchLeads,
  } = useListTenantLeads(tenantId, undefined, {
    request,
    query: { enabled, queryKey: getListTenantLeadsQueryKey(tenantId) },
  });
  const { data: products = [], isLoading: loadingProducts } =
    useListProdutosCatalogo(tenantId, {
      request,
      query: { enabled, queryKey: getListProdutosCatalogoQueryKey(tenantId) },
    });
  const { data: inventory = [], isLoading: loadingInventory } =
    useListInventoryItems(tenantId, {
      request,
      query: { enabled, queryKey: getListInventoryItemsQueryKey(tenantId) },
    });
  const { data: deals = [], refetch: refetchDeals } = useListDeals(
    tenantId,
    undefined,
    { request, query: { enabled, queryKey: getListDealsQueryKey(tenantId) } },
  );
  const createDeal = useCreateDeal({ request });
  const createLead = useCreateLead({ request });
  const updateDeal = useUpdateDeal({ request });
  const createProposta = useCreateProposta({ request });
  const updateProposta = useUpdateProposta({ request });
  const updatePropostaStatus = useUpdatePropostaStatus({ request });

  const [step, setStep] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [salesItems, setSalesItems] = useState<WorkCenterItem[]>([]);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItem, setCustomItem] = useState({
    name: "",
    sku: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
  });
  const [dealId, setDealId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [hydratedProposalId, setHydratedProposalId] = useState<string | null>(
    null,
  );
  const [paymentMethod, setPaymentMethod] = useState<
    | "pix"
    | "boleto"
    | "cartao_credito"
    | "cartao_debito"
    | "transferencia"
    | "dinheiro"
    | "a_combinar"
  >("pix");
  const [paymentCondition, setPaymentCondition] = useState("À vista");
  const [deliveryMode, setDeliveryMode] = useState("entrega");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryValue, setDeliveryValue] = useState("0");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [reviewNotes, setReviewNotes] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [discountPending, setDiscountPending] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    nome: "",
    telefone: "",
    email: "",
    empresa: "",
    objetivo: "",
  });
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const currentDeal = deals.find((deal) => deal.id === dealId) ?? null;
  const { data: dealProposals = [], refetch: refetchProposals } =
    useListPropostas(tenantId, dealId ? { dealId } : undefined, {
      request,
      query: {
        enabled: enabled && !!dealId,
        queryKey: getListPropostasQueryKey(
          tenantId,
          dealId ? { dealId } : undefined,
        ),
      },
    });
  const currentProposal =
    dealProposals.find((proposal) => proposal.id === proposalId) ??
    dealProposals[0] ??
    null;
  const proposalAction = nextProposalStatusAction(currentProposal?.status);
  const stockByProduct = useMemo(
    () => new Map(inventory.map((item) => [item.produtoId, item])),
    [inventory],
  );
  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLocaleLowerCase("pt-BR");
    return leads
      .filter(
        (lead) =>
          !query ||
          [lead.nome, lead.empresa, lead.telefone, lead.email].some((value) =>
            value?.toLocaleLowerCase("pt-BR").includes(query),
          ),
      )
      .slice(0, 40);
  }, [leadSearch, leads]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("pt-BR");
    return products
      .filter((product) => {
        const stock = stockByProduct.get(product.id);
        const available = !stock || Number(stock.quantidadeAtual) > 0;
        const matches =
          !query ||
          [product.nome, product.sku, product.categoriaNome].some((value) =>
            value?.toLocaleLowerCase("pt-BR").includes(query),
          );
        return product.ativo && available && matches;
      })
      .slice(0, 60);
  }, [productSearch, products, stockByProduct]);
  const subtotal = calculateItemsSubtotal(salesItems);
  const discountValue = Math.min(
    subtotal,
    Math.max(0, Number(orderDiscount) || 0),
  );
  const total = Math.max(
    0,
    subtotal - discountValue + Math.max(0, Number(deliveryValue) || 0),
  );
  const leadQuery = selectedLead
    ? `leadId=${encodeURIComponent(selectedLead.id)}`
    : "";
  const catalogProductIds = salesItems.flatMap((item) =>
    item.productId ? [item.productId] : [],
  );
  const productQuery = catalogProductIds.length
    ? `&productIds=${encodeURIComponent(catalogProductIds.join(","))}`
    : "";
  const dealQuery = dealId ? `&dealId=${encodeURIComponent(dealId)}` : "";

  async function selectLead(id: string, forceNewDeal = false) {
    const lead = leads.find((item) => item.id === id);
    if (!lead) return;
    const existing = forceNewDeal
      ? undefined
      : deals.find(
          (deal) =>
            deal.leadId === id &&
            !["ganho", "perdido", "entregue"].includes(deal.etapa),
        );
    try {
      const activeDeal =
        existing ??
        (await createDeal.mutateAsync({
          data: {
            tenantId,
            leadId: id,
            titulo: `Atendimento - ${lead.nome}`,
            etapa: "novo",
          },
        }));
      setDealId(activeDeal.id);
      setStep(dealStageToWorkStep(activeDeal.etapa));
      await refetchDeals();
    } catch {
      toast({
        title: "Não foi possível iniciar a venda",
        description: "Tente selecionar o cliente novamente.",
        variant: "destructive",
      });
      return;
    }
    setSelectedLeadId(id);
    setSalesItems([]);
    setProposalId(null);
    setHydratedProposalId(null);
    setProductSearch("");
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
      const created = await createLead.mutateAsync({
        data: {
          tenantId,
          nome: newLead.nome.trim(),
          telefone: newLead.telefone.trim() || null,
          email: newLead.email.trim() || null,
          empresa: newLead.empresa.trim() || null,
          objetivo: newLead.objetivo.trim() || null,
        },
      });
      const activeDeal = await createDeal.mutateAsync({
        data: {
          tenantId,
          leadId: created.id,
          titulo: created.empresa
            ? `${created.empresa} — ${created.nome}`
            : `Atendimento - ${created.nome}`,
          etapa: "novo",
        },
      });
      await Promise.all([refetchLeads(), refetchDeals()]);
      setSelectedLeadId(created.id);
      setDealId(activeDeal.id);
      setSalesItems([]);
      setProposalId(null);
      setProductSearch("");
      setStep(1);
      setNewLeadOpen(false);
      setNewLead({
        nome: "",
        telefone: "",
        email: "",
        empresa: "",
        objetivo: "",
      });
      toast({
        title: "Lead criado",
        description: "O atendimento avançou para a seleção de produtos.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível criar o lead",
        description:
          error instanceof Error
            ? error.message
            : "Revise os dados e tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function advance(nextStep: number, etapa: DealEtapa) {
    if (!dealId) return;
    try {
      await updateDeal.mutateAsync({
        id: dealId,
        data: { etapa, valor: total || undefined },
      });
      await refetchDeals();
      setStep(nextStep);
      toast({
        title: "Pipeline atualizada",
        description: `O card avançou para ${etapa.replaceAll("_", " ")}.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível avançar o card",
        description:
          error instanceof Error
            ? error.message
            : "A etapa da venda não foi alterada.",
        variant: "destructive",
      });
    }
  }

  useEffect(() => {
    if (!currentProposal || hydratedProposalId === currentProposal.id) return;
    setProposalId(currentProposal.id);
    setSalesItems(fromProposalItems(currentProposal.itens));
    setPaymentMethod(currentProposal.formaPagamento ?? "a_combinar");
    setPaymentCondition(currentProposal.condPagamento ?? "A combinar");
    setReviewNotes(currentProposal.observacoes ?? "");
    setHydratedProposalId(currentProposal.id);
  }, [currentProposal, hydratedProposalId]);

  async function transitionProposal(status: PropostaStatus) {
    if (!currentProposal) return;
    try {
      await updatePropostaStatus.mutateAsync({
        id: currentProposal.id,
        data: { status },
      });
      await Promise.all([refetchProposals(), refetchDeals()]);
      if (status === "aceita") setStep(4);
      toast({
        title: status === "aceita" ? "Venda confirmada" : "Proposta atualizada",
        description:
          "O card do negócio foi sincronizado automaticamente com esta execução.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar a proposta",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }
  async function submitDiscount(requestManagement: boolean) {
    if (!dealId || !discountReason.trim()) return;
    setDiscountPending(true);
    try {
      const response = await fetch(`/api/deals/${dealId}/commercial-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          discountPercent: Number(discountPercent),
          reason: discountReason,
          requestManagement,
        }),
      });
      const body = (await response.json()) as {
        status?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          body.error || "Não foi possível registrar a análise comercial",
        );
      setDiscountOpen(false);
      setDiscountReason("");
      toast({
        title:
          body.status === "applied"
            ? "Desconto aplicado"
            : "Enviado para a gerência",
        description:
          "A decisão e a justificativa foram registradas na jornada do lead.",
      });
    } catch (error) {
      toast({
        title: "Análise comercial não registrada",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDiscountPending(false);
    }
  }

  function toggleProduct(id: string) {
    setSalesItems((current) => {
      const itemId = `catalog:${id}`;
      if (current.some((item) => item.id === itemId))
        return current.filter((item) => item.id !== itemId);
      const product = products.find((item) => item.id === id);
      if (!product) return current;
      return [
        ...current,
        {
          id: itemId,
          source: "catalog",
          productId: product.id,
          name: product.nome,
          sku: product.sku || undefined,
          description: product.categoriaNome || undefined,
          quantity: 1,
          unitPrice: Number(product.precoBase || 0),
        },
      ];
    });
  }

  function addCustomItem() {
    if (!customItem.name.trim()) return;
    setSalesItems((current) => [
      ...current,
      {
        id: `custom:${Date.now()}`,
        source: "custom",
        name: customItem.name.trim(),
        sku: customItem.sku.trim() || undefined,
        description: customItem.description.trim() || undefined,
        quantity: Math.max(1, Number(customItem.quantity) || 1),
        unitPrice: Math.max(0, Number(customItem.unitPrice) || 0),
      },
    ]);
    setCustomItem({
      name: "",
      sku: "",
      description: "",
      quantity: "1",
      unitPrice: "0",
    });
    setCustomItemOpen(false);
  }

  function updateSalesItem(
    id: string,
    field: "quantity" | "unitPrice",
    value: number,
  ) {
    setSalesItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: Math.max(field === "quantity" ? 1 : 0, value || 0),
            }
          : item,
      ),
    );
  }
  async function saveOrderReview() {
    if (!dealId || !selectedLead || !salesItems.length) return;
    if (deliveryMode === "entrega" && !deliveryDate) {
      toast({
        title: "Informe a data prevista",
        description: "A entrega precisa ter uma previsão antes de continuar.",
        variant: "destructive",
      });
      return;
    }
    const data = {
      leadId: selectedLead.id,
      dealId,
      titulo: `Pedido - ${selectedLead.nome}`,
      itens: toProposalItems(salesItems),
      valorTotal: total,
      status: currentProposal?.status ?? ("rascunho" as const),
      formaPagamento: paymentMethod,
      condPagamento: paymentCondition.trim() || "A combinar",
      prazoEntrega: deliveryDate
        ? `Prevista para ${new Date(`${deliveryDate}T12:00:00`).toLocaleDateString("pt-BR")}`
        : deliveryMode === "retirada"
          ? "Retirada pelo cliente"
          : "A combinar",
      observacoes: [
        `Modalidade: ${deliveryMode === "entrega" ? "Entrega" : "Retirada"}`,
        `Frete: ${money(deliveryValue)}`,
        `Desconto: ${money(discountValue)}`,
        reviewNotes.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    };
    try {
      if (proposalId)
        await updateProposta.mutateAsync({ id: proposalId, data });
      else {
        const proposal = await createProposta.mutateAsync({
          data: { tenantId, ...data },
        });
        setProposalId(proposal.id);
      }
      await updateDeal.mutateAsync({
        id: dealId,
        data: { etapa: "proposta", valor: total },
      });
      await Promise.all([refetchDeals(), refetchProposals()]);
      setStep(3);
      toast({
        title: "Revisão salva",
        description:
          "Itens, valores, pagamento e entrega foram vinculados ao negócio.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar a revisão",
        description:
          error instanceof Error
            ? error.message
            : "Revise os dados e tente novamente.",
        variant: "destructive",
      });
    }
  }

  function restart() {
    setStep(0);
    setSelectedLeadId(null);
    setSalesItems([]);
    setDealId(null);
    setProposalId(null);
    setLeadSearch("");
    setProductSearch("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="vendor-page-header">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <ClipboardCheck className="h-4 w-4" /> Operação guiada
          </div>
          <h1 className="vendor-page-title">Central de Trabalho</h1>
          <p className="vendor-page-description">
            Conduza o atendimento na ordem certa, do cliente até a entrega.
          </p>
        </div>
        {selectedLead && (
          <Button variant="outline" size="sm" onClick={restart}>
            Iniciar novo atendimento
          </Button>
        )}
      </header>

      <nav
        aria-label="Etapas da venda"
        className="grid grid-cols-5 gap-1 rounded-2xl border bg-card p-2 shadow-sm sm:gap-2"
      >
        {STEPS.map((label, index) => {
          const complete = index < step;
          const active = index === step;
          const unlocked = index <= step;
          return (
            <button
              key={label}
              type="button"
              disabled={!unlocked}
              onClick={() => unlocked && setStep(index)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition sm:flex-row sm:justify-center sm:px-3 ${active ? "bg-primary text-primary-foreground shadow-sm" : complete ? "bg-primary/8 text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-white/20" : complete ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="truncate text-[11px] font-semibold sm:text-sm">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {selectedLead && dealId && (
        <section
          className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-4"
          aria-label="Contexto do negócio"
        >
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="truncate font-semibold">{selectedLead.nome}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Negócio</p>
            <p className="truncate font-semibold">
              {currentDeal?.titulo || `Atendimento #${dealId.slice(0, 8)}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pipeline</p>
            <Badge variant="outline" className="mt-1 capitalize">
              {(currentDeal?.etapa || "em atualização").replaceAll("_", " ")}
            </Badge>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-muted-foreground">Valor em execução</p>
            <p className="font-bold">
              {money(total || currentDeal?.valor || 0)}
            </p>
          </div>
        </section>
      )}

      {step === 0 && (
        <Card>
          <CardContent className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <UserRound className="h-5 w-5 text-primary" /> Quem será
                  atendido?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Busque e selecione o cliente para começar. A próxima etapa
                  abrirá automaticamente.
                </p>
              </div>
              <Button onClick={() => setNewLeadOpen(true)}>
                <Plus className="h-4 w-4" /> Novo lead
              </Button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={leadSearch}
                onChange={(event) => setLeadSearch(event.target.value)}
                placeholder="Nome, empresa, telefone ou e-mail..."
                className="h-11 pl-9"
              />
            </div>
            <ScrollArea className="h-[min(52vh,480px)]">
              <div className="grid gap-2 pr-3 sm:grid-cols-2">
                {loadingLeads ? (
                  <p className="text-sm text-muted-foreground">
                    Carregando clientes...
                  </p>
                ) : (
                  filteredLeads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => selectLead(lead.id)}
                      className="flex items-center gap-3 rounded-xl border p-4 text-left transition hover:border-primary/35 hover:bg-primary/5"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {lead.nome.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {lead.nome}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {lead.empresa ||
                            lead.telefone ||
                            lead.email ||
                            "Sem contato informado"}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {step === 1 && selectedLead && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardContent className="p-5 sm:p-7">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge variant="secondary" className="mb-2">
                    Cliente: {selectedLead.nome}
                  </Badge>
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <PackageCheck className="h-5 w-5 text-primary" /> Compor
                    solução
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Selecione produtos do catálogo ou inclua serviços e itens
                    sob medida.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCustomItemOpen(true)}
                  >
                    <FilePlus2 className="h-4 w-4" /> Item personalizado
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" /> Trocar cliente
                  </Button>
                </div>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Busque no catálogo por produto, SKU ou categoria..."
                  className="h-11 pl-9"
                />
              </div>
              <ScrollArea className="h-[min(48vh,430px)]">
                <div className="grid gap-3 pr-3 sm:grid-cols-2 lg:grid-cols-3">
                  {loadingProducts || loadingInventory ? (
                    <p className="text-sm text-muted-foreground">
                      Consultando estoque...
                    </p>
                  ) : (
                    filteredProducts.map((product) => {
                      const selected = salesItems.some(
                        (item) => item.productId === product.id,
                      );
                      const stock = stockByProduct.get(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => toggleProduct(product.id)}
                          className={`relative rounded-xl border p-4 text-left transition ${selected ? "border-primary bg-primary/7 ring-1 ring-primary/20" : "hover:border-primary/30 hover:bg-muted/35"}`}
                        >
                          {selected && (
                            <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                          <p className="pr-8 text-sm font-semibold">
                            {product.nome}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {product.categoriaNome || product.sku || "Produto"}
                          </p>
                          <div className="mt-4 flex items-end justify-between gap-2">
                            <strong>{money(product.precoBase)}</strong>
                            <Badge
                              variant={
                                stock &&
                                Number(stock.quantidadeAtual) <=
                                  Number(stock.quantidadeMinima)
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {stock
                                ? `${stock.quantidadeAtual} ${stock.unidade}`
                                : "Sob consulta"}
                            </Badge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="h-fit xl:sticky xl:top-5">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">Itens da oportunidade</p>
                  <p className="text-xs text-muted-foreground">
                    Catálogo + personalizados
                  </p>
                </div>
                <Badge>{salesItems.length}</Badge>
              </div>
              <div className="space-y-2">
                {salesItems.length ? (
                  salesItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 rounded-xl border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {item.source === "catalog"
                              ? "Catálogo"
                              : "Personalizado"}
                          </Badge>
                        </div>
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {money(item.unitPrice)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Remover ${item.name}`}
                        onClick={() =>
                          setSalesItems((current) =>
                            current.filter(
                              (currentItem) => currentItem.id !== item.id,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                    Adicione um produto ou item personalizado.
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={!salesItems.length || updateDeal.isPending}
                onClick={() => advance(2, "qualificado")}
              >
                Revisar proposta <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      {step === 2 && selectedLead && (
        <Card>
          <CardContent className="p-5 sm:p-7">
            <div className="mb-6">
              <Badge variant="secondary" className="mb-2">
                {selectedLead.nome}
              </Badge>
              <h2 className="text-xl font-semibold">
                Revisão completa do pedido
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajuste itens, valores, pagamento e entrega antes de gerar a
                proposta.
              </p>
            </div>

            <div className="space-y-3">
              {salesItems.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-[1fr_150px_170px_auto_auto] sm:items-end"
                >
                  <div>
                    <div className="mb-1">
                      <Badge variant="outline" className="text-[10px]">
                        {item.source === "catalog"
                          ? "Catálogo"
                          : "Personalizado"}
                      </Badge>
                    </div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.sku || item.description || "Item da proposta"}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor={`quantity-${item.id}`}>Quantidade</Label>
                    <div className="mt-1 flex items-center rounded-lg border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          updateSalesItem(
                            item.id,
                            "quantity",
                            item.quantity - 1,
                          )
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        id={`quantity-${item.id}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) =>
                          updateSalesItem(
                            item.id,
                            "quantity",
                            Number(event.target.value),
                          )
                        }
                        className="border-0 text-center shadow-none"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          updateSalesItem(
                            item.id,
                            "quantity",
                            item.quantity + 1,
                          )
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`price-${item.id}`}>Valor unitário</Label>
                    <Input
                      id={`price-${item.id}`}
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateSalesItem(
                          item.id,
                          "unitPrice",
                          Number(event.target.value),
                        )
                      }
                    />
                  </div>
                  <div className="text-right">
                    <Label className="text-xs text-muted-foreground">
                      Total
                    </Label>
                    <p className="mt-2 font-bold">
                      {money(item.quantity * item.unitPrice)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${item.name}`}
                    onClick={() =>
                      setSalesItems((current) =>
                        current.filter(
                          (currentItem) => currentItem.id !== item.id,
                        ),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-5 rounded-2xl border bg-muted/15 p-5 lg:grid-cols-2">
              <section className="space-y-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <CreditCard className="h-5 w-5 text-primary" /> Condição de
                  pagamento
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="payment-method">Forma</Label>
                    <select
                      id="payment-method"
                      value={paymentMethod}
                      onChange={(event) =>
                        setPaymentMethod(
                          event.target.value as typeof paymentMethod,
                        )
                      }
                      className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="pix">Pix</option>
                      <option value="boleto">Boleto</option>
                      <option value="cartao_credito">Cartão de crédito</option>
                      <option value="cartao_debito">Cartão de débito</option>
                      <option value="transferencia">Transferência</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="a_combinar">A combinar</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="payment-condition">Condição</Label>
                    <Input
                      id="payment-condition"
                      className="mt-1"
                      value={paymentCondition}
                      onChange={(event) =>
                        setPaymentCondition(event.target.value)
                      }
                      placeholder="À vista, 30/60/90, 3 parcelas..."
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="order-discount">Desconto em R$</Label>
                    <Input
                      id="order-discount"
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      value={orderDiscount}
                      onChange={(event) => setOrderDiscount(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery-value">Entrega em R$</Label>
                    <Input
                      id="delivery-value"
                      className="mt-1"
                      type="number"
                      min="0"
                      step="0.01"
                      value={deliveryValue}
                      onChange={(event) => setDeliveryValue(event.target.value)}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Truck className="h-5 w-5 text-primary" /> Entrega
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="delivery-mode">Modalidade</Label>
                    <select
                      id="delivery-mode"
                      value={deliveryMode}
                      onChange={(event) => setDeliveryMode(event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="entrega">Entrega no endereço</option>
                      <option value="retirada">Retirada pelo cliente</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="delivery-date">
                      Data prevista {deliveryMode === "entrega" ? "*" : ""}
                    </Label>
                    <div className="relative mt-1">
                      <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="delivery-date"
                        type="date"
                        value={deliveryDate}
                        onChange={(event) =>
                          setDeliveryDate(event.target.value)
                        }
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="review-notes">Observações do pedido</Label>
                  <Textarea
                    id="review-notes"
                    className="mt-1"
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="Endereço, referência, horário, negociação ou instruções especiais..."
                  />
                </div>
              </section>
            </div>

            <div className="mt-5 grid gap-2 rounded-2xl bg-muted/55 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <strong>{money(subtotal)}</strong>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Desconto</p>
                <strong className="text-emerald-700">
                  - {money(discountValue)}
                </strong>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entrega</p>
                <strong>{money(deliveryValue)}</strong>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">Total revisado</p>
                <strong className="text-2xl">{money(total)}</strong>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Alterar produtos
              </Button>
              <Button
                disabled={
                  updateDeal.isPending ||
                  createProposta.isPending ||
                  updateProposta.isPending
                }
                onClick={saveOrderReview}
              >
                {createProposta.isPending || updateProposta.isPending
                  ? "Salvando revisão..."
                  : "Salvar e continuar"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && selectedLead && (
        <Card>
          <CardContent className="p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge variant="secondary" className="mb-2">
                  {selectedLead.nome} · {money(total)}
                </Badge>
                <h2 className="text-xl font-semibold">
                  Formalizar e acompanhar a venda
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A proposta e o card da pipeline avançam juntos, sem sair da
                  Central.
                </p>
              </div>
              {currentProposal && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    Proposta {currentProposal.numero || "em elaboração"}
                  </p>
                  <Badge className="mt-1 capitalize">
                    {currentProposal.status}
                  </Badge>
                </div>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-muted/20 p-5">
                <ShoppingBag className="mb-4 h-7 w-7 text-primary" />
                <h3 className="font-semibold">Proposta comercial</h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">
                  Edite itens e condições aqui ou abra o documento completo.
                </p>
                <div className="grid gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Editar proposta
                  </Button>
                  <Button asChild variant="ghost">
                    <Link
                      href={`/propostas?${leadQuery}${productQuery}${dealQuery}`}
                    >
                      <ExternalLink className="h-4 w-4" /> Ver documento
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-5">
                <CheckCircle2 className="mb-4 h-7 w-7 text-primary" />
                <h3 className="font-semibold">Próxima ação</h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">
                  Atualize o status real. A pipeline será movimentada
                  automaticamente.
                </p>
                {proposalAction ? (
                  <Button
                    className="w-full"
                    disabled={updatePropostaStatus.isPending}
                    onClick={() => transitionProposal(proposalAction.status)}
                  >
                    {proposalAction.label}
                  </Button>
                ) : (
                  <Badge variant="secondary" className="mt-2 capitalize">
                    {currentProposal?.status || "Salve a proposta"}
                  </Badge>
                )}
              </div>
              <div className="rounded-2xl border bg-muted/20 p-5">
                <BadgePercent className="mb-4 h-7 w-7 text-primary" />
                <h3 className="font-semibold">Condição comercial</h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">
                  Aplique desconto autorizado ou envie para análise da gerência.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDiscountOpen(true)}
                >
                  Analisar desconto
                </Button>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button asChild variant="outline">
                <Link href={`/leads/${selectedLead.id}`}>
                  <ExternalLink className="h-4 w-4" /> Abrir jornada do negócio
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {step === 4 && selectedLead && (
        <Card>
          <CardContent className="p-5 sm:p-7">
            <div className="mb-6">
              <Badge className="mb-2 bg-emerald-600 hover:bg-emerald-600">
                Venda confirmada
              </Badge>
              <h2 className="text-xl font-semibold">Concluir atendimento</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Organize a entrega e mantenha o cliente informado.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Button asChild variant="outline" className="h-24 flex-col gap-2">
                <Link href={`/entregas?${leadQuery}`}>
                  <Truck className="h-5 w-5 text-primary" />
                  Agendar entrega
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-24 flex-col gap-2">
                <Link href={`/agenda?${leadQuery}`}>
                  <CalendarPlus className="h-5 w-5 text-primary" />
                  Agendar acompanhamento
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-24 flex-col gap-2">
                <Link href={`/conversations?${leadQuery}`}>
                  <MessageSquareText className="h-5 w-5 text-primary" />
                  Enviar mensagem
                </Link>
              </Button>
            </div>
            <Button className="mt-6 w-full" onClick={restart}>
              Finalizar e iniciar outro atendimento
            </Button>
          </CardContent>
        </Card>
      )}
      <Dialog open={customItemOpen} onOpenChange={setCustomItemOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar item personalizado</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="custom-item-name">Produto ou serviço *</Label>
              <Input
                id="custom-item-name"
                autoFocus
                value={customItem.name}
                onChange={(event) =>
                  setCustomItem((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: instalação especial, recorte sob medida..."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="custom-item-sku">Código</Label>
                <Input
                  id="custom-item-sku"
                  value={customItem.sku}
                  onChange={(event) =>
                    setCustomItem((current) => ({
                      ...current,
                      sku: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-item-quantity">Quantidade</Label>
                <Input
                  id="custom-item-quantity"
                  type="number"
                  min="1"
                  value={customItem.quantity}
                  onChange={(event) =>
                    setCustomItem((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-item-price">Valor unitário</Label>
                <Input
                  id="custom-item-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customItem.unitPrice}
                  onChange={(event) =>
                    setCustomItem((current) => ({
                      ...current,
                      unitPrice: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-item-description">Descrição</Label>
              <Textarea
                id="custom-item-description"
                value={customItem.description}
                onChange={(event) =>
                  setCustomItem((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Escopo, medidas, materiais ou observações para o orçamento."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomItemOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!customItem.name.trim()} onClick={addCustomItem}>
              Adicionar à proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Condição comercial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discount-percent">Desconto (%)</Label>
              <Input
                id="discount-percent"
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-reason">Justificativa</Label>
              <Textarea
                id="discount-reason"
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
                placeholder="Explique a condição negociada, concorrência, volume ou motivo da exceção..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Até 10% pode ser aplicado diretamente. Percentuais maiores seguem
              automaticamente para aprovação gerencial.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={discountPending || !discountReason.trim()}
              onClick={() => submitDiscount(true)}
            >
              Enviar para gerência
            </Button>
            <Button
              disabled={discountPending || !discountReason.trim()}
              onClick={() => submitDiscount(false)}
            >
              Aplicar condição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar novo lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-lead-name">Nome *</Label>
              <Input
                id="new-lead-name"
                autoFocus
                value={newLead.nome}
                onChange={(event) =>
                  setNewLead((current) => ({
                    ...current,
                    nome: event.target.value,
                  }))
                }
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-lead-phone">Telefone</Label>
                <Input
                  id="new-lead-phone"
                  inputMode="tel"
                  value={newLead.telefone}
                  onChange={(event) =>
                    setNewLead((current) => ({
                      ...current,
                      telefone: event.target.value,
                    }))
                  }
                  placeholder="+55 11 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-lead-email">E-mail</Label>
                <Input
                  id="new-lead-email"
                  inputMode="email"
                  value={newLead.email}
                  onChange={(event) =>
                    setNewLead((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="email@empresa.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-lead-company">Empresa</Label>
              <Input
                id="new-lead-company"
                value={newLead.empresa}
                onChange={(event) =>
                  setNewLead((current) => ({
                    ...current,
                    empresa: event.target.value,
                  }))
                }
                placeholder="Nome da empresa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-lead-goal">Objetivo</Label>
              <Textarea
                id="new-lead-goal"
                value={newLead.objetivo}
                onChange={(event) =>
                  setNewLead((current) => ({
                    ...current,
                    objetivo: event.target.value,
                  }))
                }
                placeholder="O que o cliente precisa?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewLeadOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !newLead.nome.trim() ||
                createLead.isPending ||
                createDeal.isPending
              }
              onClick={submitNewLead}
            >
              {createLead.isPending || createDeal.isPending
                ? "Salvando..."
                : "Salvar e continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
