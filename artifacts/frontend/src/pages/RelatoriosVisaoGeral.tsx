import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useListDeals,
  getListDealsQueryKey,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useListPropostas,
  getListPropostasQueryKey,
} from "@workspace/api-client-react";
import {
  BarChart3,
  Users,
  DollarSign,
  Target,
  MapPin,
  Megaphone,
  AlertTriangle,
  Briefcase,
  Database,
  TrendingUp,
  UserRound,
  Building2,
} from "lucide-react";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function countValues(values: Array<string | null | undefined>, limit = 8) {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit);
}

function extractArrayOrText(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return item.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
      if (item && typeof item === "object" && "nome" in item && typeof (item as any).nome === "string") {
        return [(item as any).nome.trim()].filter(Boolean);
      }
      return [];
    });
  }
  if (typeof value === "string") return value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function getAge(dateValue: unknown): number | null {
  if (typeof dateValue !== "string" || !dateValue.trim()) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

function ageBucket(age: number | null): string | null {
  if (age === null) return null;
  if (age <= 25) return "Até 25";
  if (age <= 35) return "26–35";
  if (age <= 45) return "36–45";
  if (age <= 55) return "46–55";
  return "56+";
}

function extractLocality(lead: any): string | null {
  const metadata = (lead?.metadata ?? {}) as Record<string, unknown>;
  const discovery = (lead?.discoveryData ?? {}) as Record<string, unknown>;
  const candidates = [
    metadata.cidade,
    metadata.city,
    metadata.municipio,
    metadata.localidade,
    discovery.cidade,
    discovery.city,
    discovery.municipio,
    discovery.localidade,
  ];
  for (const value of candidates) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function extractCompetitors(lead: any): string[] {
  const discovery = (lead?.discoveryData ?? {}) as Record<string, unknown>;
  return [
    ...extractArrayOrText(discovery.concorrentes),
    ...extractArrayOrText(discovery.concorrente),
    ...extractArrayOrText(discovery.competitors),
  ];
}

function DataList({ items, empty }: { items: Array<{ name: string; count: number }>; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-3">{empty}</p>;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.name} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{item.name}</span>
            <span className="font-medium tabular-nums">{item.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RelatoriosVisaoGeral() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: rawLeads = [], isLoading: loadingLeads } = useListTenantLeads(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantLeadsQueryKey(tenantId) },
  });
  const { data: rawDeals = [], isLoading: loadingDeals } = useListDeals(tenantId, undefined, {
    query: { enabled: !!tenantId, queryKey: getListDealsQueryKey(tenantId) },
  });
  const { data: rawPropostas = [], isLoading: loadingPropostas } = useListPropostas(tenantId, undefined, {
    query: { enabled: !!tenantId, queryKey: getListPropostasQueryKey(tenantId) },
  });

  const leads = rawLeads as any[];
  const deals = rawDeals as any[];
  const propostas = rawPropostas as any[];

  const metrics = useMemo(() => {
    const activeLeads = leads.filter((lead) => !lead.excluidoEm);
    const wonDeals = deals.filter((deal) => deal.etapa === "ganho");
    const lostDeals = deals.filter((deal) => deal.etapa === "perdido");
    const closedDeals = wonDeals.length + lostDeals.length;

    const latestProposalValueByDeal = new Map<string, { value: number; updatedAt: number }>();
    for (const proposal of propostas) {
      if (!proposal.dealId || proposal.valorTotal == null) continue;
      const value = Number(proposal.valorTotal);
      if (!Number.isFinite(value)) continue;
      const updatedAt = new Date(proposal.updatedAt ?? proposal.createdAt ?? 0).getTime();
      const current = latestProposalValueByDeal.get(proposal.dealId);
      if (!current || updatedAt >= current.updatedAt) {
        latestProposalValueByDeal.set(proposal.dealId, { value, updatedAt });
      }
    }
    const revenue = wonDeals.reduce(
      (sum, deal) => sum + (latestProposalValueByDeal.get(deal.id)?.value ?? Number(deal.valor ?? 0)),
      0,
    );
    const ticket = wonDeals.length ? revenue / wonDeals.length : 0;

    const gender = countValues(activeLeads.map((lead) => normalizeText(lead.genero)));
    const age = countValues(activeLeads.map((lead) => ageBucket(getAge(lead.dataNascimento))));
    const personType = countValues(activeLeads.map((lead) => lead.tipoPessoa === "juridica" ? "Pessoa jurídica" : lead.tipoPessoa === "fisica" ? "Pessoa física" : null));
    const professions = countValues(activeLeads.map((lead) => normalizeText(lead.representanteProfissao) ?? normalizeText(lead.discoveryData?.profissao)));
    const localities = countValues(activeLeads.map(extractLocality));
    const sources = countValues(activeLeads.map((lead) => normalizeText(lead.source)), 10);
    const campaigns = countValues(activeLeads.map((lead) => normalizeText(lead.adCampaignId)), 10);

    const financialCapacity = countValues(activeLeads.map((lead) =>
      normalizeText(lead.dadosPj?.faturamentoEstimado) ?? normalizeText(lead.orcamento)
    ));
    const creditLimits = activeLeads
      .map((lead) => Number(lead.limiteCredito ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgCreditLimit = creditLimits.length ? creditLimits.reduce((a, b) => a + b, 0) / creditLimits.length : 0;

    const lossReasons = countValues(lostDeals.map((deal) =>
      normalizeText(deal.categoriaPerda) ?? normalizeText(deal.lostReason) ?? normalizeText(deal.motivoPerda) ?? normalizeText(deal.lostReasonDetail)
    ));
    const churned = activeLeads.filter((lead) => lead.isChurned).length;

    const competitors = countValues(activeLeads.flatMap(extractCompetitors), 10);

    // Ranking de produtos: somente propostas aceitas e itens ligados de forma
    // explícita ao Catálogo por produtoId. Itens livres não são inferidos.
    const acceptedProposals = propostas.filter((proposta) => proposta.status === "aceita");
    const productMap = new Map<string, { produtoId: string; name: string; quantity: number; revenue: number; proposals: Set<string> }>();
    let totalAcceptedItemLines = 0;
    let linkedAcceptedItemLines = 0;
    for (const proposta of acceptedProposals) {
      const itens = Array.isArray(proposta.itens) ? proposta.itens : [];
      for (const item of itens) {
        totalAcceptedItemLines++;
        if (!item?.produtoId) continue;
        linkedAcceptedItemLines++;
        const quantity = Number(item.quantidade ?? 0);
        const unit = Number(item.valorUnitario ?? 0);
        const current = productMap.get(item.produtoId) ?? {
          produtoId: item.produtoId,
          name: normalizeText(item.nome) ?? "Produto sem nome",
          quantity: 0,
          revenue: 0,
          proposals: new Set<string>(),
        };
        current.quantity += Number.isFinite(quantity) ? quantity : 0;
        current.revenue += Number.isFinite(quantity * unit) ? quantity * unit : 0;
        if (proposta.id) current.proposals.add(String(proposta.id));
        productMap.set(item.produtoId, current);
      }
    }
    const productRanking = Array.from(productMap.values()).map((item) => ({
      produtoId: item.produtoId,
      name: item.name,
      quantity: item.quantity,
      revenue: item.revenue,
      proposals: item.proposals.size,
    }));
    const bestProducts = [...productRanking].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity).slice(0, 5);
    const worstProducts = [...productRanking].sort((a, b) => a.revenue - b.revenue || a.quantity - b.quantity).slice(0, 5);
    const productCoverage = totalAcceptedItemLines ? (linkedAcceptedItemLines / totalAcceptedItemLines) * 100 : 0;

    const profiledLeads = activeLeads.filter((lead) =>
      !!lead.genero || !!lead.dataNascimento || !!lead.representanteProfissao || !!extractLocality(lead)
    ).length;
    const profileCoverage = activeLeads.length ? (profiledLeads / activeLeads.length) * 100 : 0;
    const marketingCoverage = activeLeads.length ? (activeLeads.filter((lead) => !!lead.source || !!lead.adCampaignId).length / activeLeads.length) * 100 : 0;
    const financialCoverage = activeLeads.length ? (activeLeads.filter((lead) => !!lead.orcamento || !!lead.dadosPj?.faturamentoEstimado || Number(lead.limiteCredito ?? 0) > 0).length / activeLeads.length) * 100 : 0;

    return {
      activeLeads,
      wonDeals,
      lostDeals,
      closedDeals,
      revenue,
      ticket,
      conversion: closedDeals ? (wonDeals.length / closedDeals) * 100 : 0,
      gender,
      age,
      personType,
      professions,
      localities,
      sources,
      campaigns,
      financialCapacity,
      avgCreditLimit,
      creditLimitsCount: creditLimits.length,
      lossReasons,
      churned,
      competitors,
      acceptedProposals,
      bestProducts,
      worstProducts,
      linkedAcceptedItemLines,
      totalAcceptedItemLines,
      productCoverage,
      profileCoverage,
      marketingCoverage,
      financialCoverage,
    };
  }, [leads, deals, propostas]);

  const loading = loadingLeads || loadingDeals || loadingPropostas;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Visão Geral de Relatórios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Indicadores consolidados apenas com informações realmente registradas no VendorAI.
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5"><Database className="h-3.5 w-3.5" /> Dados do tenant atual</Badge>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Carregando dados reais do tenant...</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase">Leads ativos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.activeLeads.length}</div><p className="text-xs text-muted-foreground mt-1">sem excluídos</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase">Receita ganha</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{money(metrics.revenue)}</div><p className="text-xs text-muted-foreground mt-1">deals em ganho</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase">Conversão fechados</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.closedDeals ? percent(metrics.conversion) : "—"}</div><p className="text-xs text-muted-foreground mt-1">ganhos ÷ ganhos + perdidos</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase">Ticket médio ganho</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.wonDeals.length ? money(metrics.ticket) : "—"}</div><p className="text-xs text-muted-foreground mt-1">negócios ganhos</p></CardContent></Card>
          </div>

          <Card className="border-dashed">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" /> Cobertura dos dados</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><div className="flex justify-between text-sm"><span>Perfil/demografia</span><strong>{percent(metrics.profileCoverage)}</strong></div><p className="text-xs text-muted-foreground mt-1">gênero, idade, tipo, profissão ou localidade informados</p></div>
              <div><div className="flex justify-between text-sm"><span>Financeiro informado</span><strong>{percent(metrics.financialCoverage)}</strong></div><p className="text-xs text-muted-foreground mt-1">orçamento, faturamento PJ ou limite de crédito</p></div>
              <div><div className="flex justify-between text-sm"><span>Atribuição de marketing</span><strong>{percent(metrics.marketingCoverage)}</strong></div><p className="text-xs text-muted-foreground mt-1">origem e/ou campanha registrada</p></div>
            </CardContent>
          </Card>

          <Tabs defaultValue="perfil" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              <TabsTrigger value="comercial">Comercial</TabsTrigger>
              <TabsTrigger value="marketing">Marketing</TabsTrigger>
              <TabsTrigger value="perdas">Perdas</TabsTrigger>
            </TabsList>

            <TabsContent value="perfil" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><UserRound className="h-4 w-4" /> Gênero informado</CardTitle></CardHeader><CardContent><DataList items={metrics.gender} empty="Nenhum gênero estruturado foi informado nos leads." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Faixa etária</CardTitle></CardHeader><CardContent><DataList items={metrics.age} empty="Nenhuma data de nascimento válida foi informada." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Pessoa física / jurídica</CardTitle></CardHeader><CardContent><DataList items={metrics.personType} empty="Nenhum tipo de pessoa estruturado disponível." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> Profissão / ocupação</CardTitle></CardHeader><CardContent><DataList items={metrics.professions} empty="Nenhuma profissão estruturada foi registrada." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Localidade estruturada</CardTitle></CardHeader><CardContent><DataList items={metrics.localities} empty="Não há cidade/município estruturado em metadata ou discoveryData. Endereços livres não são inferidos." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Concorrentes mencionados</CardTitle></CardHeader><CardContent><DataList items={metrics.competitors} empty="Nenhum concorrente foi registrado de forma estruturada nos leads." /></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="financeiro" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Leads com limite de crédito</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.creditLimitsCount}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Limite médio informado</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.creditLimitsCount ? money(metrics.avgCreditLimit) : "—"}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Cobertura financeira</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{percent(metrics.financialCoverage)}</div></CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Orçamento / faturamento informado</CardTitle></CardHeader><CardContent><DataList items={metrics.financialCapacity} empty="Não há orçamento ou faturamento estimado informado. Renda pessoal não é inferida pelo sistema." /></CardContent></Card>
            </TabsContent>

            <TabsContent value="comercial" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Ganhos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.wonDeals.length}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Perdidos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.lostDeals.length}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Receita dos ganhos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{money(metrics.revenue)}</div></CardContent></Card>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Propostas aceitas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.acceptedProposals.length}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Itens ligados ao Catálogo</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.linkedAcceptedItemLines}</div><p className="text-xs text-muted-foreground mt-1">de {metrics.totalAcceptedItemLines} linhas aceitas</p></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Cobertura do ranking</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.totalAcceptedItemLines ? percent(metrics.productCoverage) : "—"}</div><p className="text-xs text-muted-foreground mt-1">somente produtoId real</p></CardContent></Card>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Melhores produtos vendidos</CardTitle></CardHeader>
                  <CardContent>
                    {metrics.bestProducts.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há itens de Catálogo em propostas aceitas.</p> : (
                      <div className="space-y-3">{metrics.bestProducts.map((product, index) => (
                        <div key={product.produtoId} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                          <div className="min-w-0"><p className="text-sm font-medium truncate">{index + 1}. {product.name}</p><p className="text-xs text-muted-foreground">{product.quantity.toLocaleString("pt-BR")} un. · {product.proposals} proposta(s)</p></div>
                          <strong className="text-sm tabular-nums shrink-0">{money(product.revenue)}</strong>
                        </div>
                      ))}</div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Menor desempenho entre vendidos</CardTitle></CardHeader>
                  <CardContent>
                    {metrics.worstProducts.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há itens de Catálogo em propostas aceitas.</p> : (
                      <div className="space-y-3">{metrics.worstProducts.map((product) => (
                        <div key={product.produtoId} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                          <div className="min-w-0"><p className="text-sm font-medium truncate">{product.name}</p><p className="text-xs text-muted-foreground">{product.quantity.toLocaleString("pt-BR")} un. · {product.proposals} proposta(s)</p></div>
                          <strong className="text-sm tabular-nums shrink-0">{money(product.revenue)}</strong>
                        </div>
                      ))}</div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-4">Ranking por receita de itens vinculados em propostas aceitas. Itens livres e sem produtoId são excluídos.</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="marketing" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" /> Leads por origem</CardTitle></CardHeader><CardContent><DataList items={metrics.sources} empty="Nenhuma origem de lead foi registrada." /></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Campanhas atribuídas</CardTitle></CardHeader><CardContent><DataList items={metrics.campaigns} empty="Nenhum lead possui adCampaignId registrado. O relatório não atribui campanha sem identificador real." /></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="perdas" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Negócios perdidos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.lostDeals.length}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Leads com churn confirmado</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.churned}</div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Taxa de perda</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.closedDeals ? percent((metrics.lostDeals.length / metrics.closedDeals) * 100) : "—"}</div></CardContent></Card>
              </div>
              <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Motivos de perda registrados</CardTitle></CardHeader><CardContent><DataList items={metrics.lossReasons} empty="Nenhum motivo/categoria de perda foi registrado nos negócios perdidos." /></CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
