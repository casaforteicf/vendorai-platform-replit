import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, MapPin, MousePointerClick, ShoppingBag, TrendingUp, UserPlus, WalletCards } from "lucide-react";

type Partner = {
  id: string;
  name?: string | null;
  nomeFantasia?: string | null;
  email: string;
  status: string;
  tipoParceiro: string;
  cupomCodigo?: string | null;
  cupomAtivo: boolean;
  comissaoPercentual?: string | null;
  comissaoRecorrentePercentual?: string | null;
};

type Analytics = {
  partnerId: string;
  clicks: number;
  leads: number;
  orders: number;
  sales: number;
  commissions: number;
  commissionAmount: string;
  paidCommissionAmount: string;
  leadConversionPercent: string;
  saleConversionPercent: string;
  leadToSalePercent: string;
};

type HistoryResponse = {
  rows: Analytics[];
  filters: {
    from: string | null;
    to: string | null;
    campaign: string | null;
    city: string | null;
    region: string | null;
  };
  dimensions: {
    campaigns: string[];
    cities: string[];
    regions: string[];
  };
};

type Totals = {
  clicks: number;
  leads: number;
  sales: number;
  conversion: number;
  commissionPaidPercent: number;
};

const TYPES = [
  ["all", "Todos os tipos"],
  ["revendedor", "Revendedor"],
  ["representante", "Representante"],
  ["influenciador", "Influenciador"],
  ["afiliado", "Afiliado"],
  ["indicador", "Indicador"],
  ["agencia", "Agência"],
  ["consultor", "Consultor"],
  ["integrador", "Integrador"],
  ["outro", "Outro"],
] as const;

function headers(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: headers() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body as T;
}

function pct(value?: string | number | null) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function nameOf(partner: Partner) {
  return partner.nomeFantasia || partner.name || partner.email;
}

function paidPercent(metric?: Analytics) {
  const total = Number(metric?.commissionAmount ?? 0);
  const paid = Number(metric?.paidCommissionAmount ?? 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (paid / total) * 100));
}

function commissionStatus(metric?: Analytics) {
  const total = Number(metric?.commissionAmount ?? 0);
  const paid = Number(metric?.paidCommissionAmount ?? 0);
  if (total <= 0) return "sem_comissao";
  if (paid >= total) return "paga";
  if (paid > 0) return "parcial";
  return "pendente";
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function toIsoStart(date: string) {
  return date ? new Date(`${date}T00:00:00`).toISOString() : "";
}

function toIsoEnd(date: string) {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : "";
}

function previousPeriod(from: string, to: string) {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
  const oneDay = 86_400_000;
  const days = Math.floor((end.getTime() - start.getTime()) / oneDay) + 1;
  const previousEnd = new Date(start.getTime() - oneDay);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * oneDay);
  const format = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  return { from: format(previousStart), to: format(previousEnd) };
}

function historyUrl(from: string, to: string, campaign: string, city: string, region: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", toIsoStart(from));
  if (to) params.set("to", toIsoEnd(to));
  if (campaign !== "all") params.set("campaign", campaign);
  if (city !== "all") params.set("city", city);
  if (region !== "all") params.set("region", region);
  const query = params.toString();
  return `/api/admin/partners-commercial/history${query ? `?${query}` : ""}`;
}

function totalsFor(rows: Analytics[]): Totals {
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks ?? 0), 0);
  const leads = rows.reduce((sum, row) => sum + Number(row.leads ?? 0), 0);
  const sales = rows.reduce((sum, row) => sum + Number(row.sales ?? 0), 0);
  const commissionAmount = rows.reduce((sum, row) => sum + Number(row.commissionAmount ?? 0), 0);
  const paidCommissionAmount = rows.reduce((sum, row) => sum + Number(row.paidCommissionAmount ?? 0), 0);
  return {
    clicks,
    leads,
    sales,
    conversion: clicks ? (sales / clicks) * 100 : 0,
    commissionPaidPercent: commissionAmount ? (paidCommissionAmount / commissionAmount) * 100 : 0,
  };
}

function deltaPercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function DeltaBadge({ current, previous, points = false }: { current: number; previous: number; points?: boolean }) {
  const delta = points ? current - previous : deltaPercent(current, previous);
  const Icon = delta > 0.01 ? ArrowUpRight : delta < -0.01 ? ArrowDownRight : ArrowRight;
  const label = `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${points ? " p.p." : "%"}`;
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}

export function PartnerPerformanceDashboard() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [coupon, setCoupon] = useState("all");
  const [commission, setCommission] = useState("all");
  const [sort, setSort] = useState("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [campaign, setCampaign] = useState("all");
  const [city, setCity] = useState("all");
  const [region, setRegion] = useState("all");

  const previous = useMemo(() => previousPeriod(from, to), [from, to]);
  const historyPath = useMemo(() => historyUrl(from, to, campaign, city, region), [from, to, campaign, city, region]);
  const previousHistoryPath = useMemo(
    () => previous ? historyUrl(previous.from, previous.to, campaign, city, region) : "",
    [previous, campaign, city, region],
  );

  const partnersQuery = useQuery<Partner[]>({
    queryKey: ["admin-partners-commercial"],
    queryFn: () => getJson("/api/admin/partners-commercial"),
  });
  const historyQuery = useQuery<HistoryResponse>({
    queryKey: ["admin-partners-commercial-history", from, to, campaign, city, region],
    queryFn: () => getJson(historyPath),
    retry: false,
  });
  const previousQuery = useQuery<HistoryResponse>({
    queryKey: ["admin-partners-commercial-history-previous", previous?.from, previous?.to, campaign, city, region],
    queryFn: () => getJson(previousHistoryPath),
    enabled: Boolean(previousHistoryPath),
    retry: false,
  });

  const partners = partnersQuery.data ?? [];
  const analytics = historyQuery.data?.rows ?? [];
  const previousAnalytics = previousQuery.data?.rows ?? [];
  const dimensions = historyQuery.data?.dimensions ?? { campaigns: [], cities: [], regions: [] };
  const analyticsByPartner = useMemo(() => new Map(analytics.map((row) => [row.partnerId, row])), [analytics]);
  const previousByPartner = useMemo(() => new Map(previousAnalytics.map((row) => [row.partnerId, row])), [previousAnalytics]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return partners
      .filter((partner) => {
        const metric = analyticsByPartner.get(partner.id);
        if (term) {
          const haystack = `${nameOf(partner)} ${partner.email} ${partner.cupomCodigo ?? ""}`.toLocaleLowerCase("pt-BR");
          if (!haystack.includes(term)) return false;
        }
        if (type !== "all" && partner.tipoParceiro !== type) return false;
        if (status !== "all" && partner.status !== status) return false;
        if (coupon === "ativo" && !(partner.cupomAtivo && partner.cupomCodigo)) return false;
        if (coupon === "sem_cupom" && partner.cupomCodigo) return false;
        if (coupon === "inativo" && (!partner.cupomCodigo || partner.cupomAtivo)) return false;
        if (commission !== "all" && commissionStatus(metric) !== commission) return false;
        return true;
      })
      .map((partner) => ({ partner, metric: analyticsByPartner.get(partner.id), previousMetric: previousByPartner.get(partner.id) }))
      .sort((a, b) => {
        if (sort === "clicks") return Number(b.metric?.clicks ?? 0) - Number(a.metric?.clicks ?? 0);
        if (sort === "leads") return Number(b.metric?.leads ?? 0) - Number(a.metric?.leads ?? 0);
        if (sort === "conversion") return Number(b.metric?.saleConversionPercent ?? 0) - Number(a.metric?.saleConversionPercent ?? 0);
        if (sort === "commission") return paidPercent(b.metric) - paidPercent(a.metric);
        if (sort === "growth") return deltaPercent(Number(b.metric?.sales ?? 0), Number(b.previousMetric?.sales ?? 0)) - deltaPercent(Number(a.metric?.sales ?? 0), Number(a.previousMetric?.sales ?? 0));
        return Number(b.metric?.sales ?? 0) - Number(a.metric?.sales ?? 0);
      });
  }, [partners, analyticsByPartner, previousByPartner, search, type, status, coupon, commission, sort]);

  const totals = useMemo(() => totalsFor(rows.map((row) => row.metric).filter((row): row is Analytics => Boolean(row))), [rows]);
  const previousTotals = useMemo(() => totalsFor(previousAnalytics), [previousAnalytics]);

  if (partnersQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Carregando performance dos parceiros...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Cliques" value={totals.clicks} icon={MousePointerClick} />
        <Metric label="Leads" value={totals.leads} icon={UserPlus} />
        <Metric label="Vendas" value={totals.sales} icon={ShoppingBag} />
        <Metric label="Conversão" value={pct(totals.conversion)} icon={TrendingUp} />
        <Metric label="Comissões pagas" value={pct(totals.commissionPaidPercent)} icon={WalletCards} />
      </div>

      {previous && !previousQuery.isError && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">Comparação com período anterior</h3>
              <p className="text-xs text-muted-foreground">{previous.from} a {previous.to}, mantendo os mesmos filtros de campanha e localização.</p>
            </div>
            {previousQuery.isFetching && <span className="text-xs text-muted-foreground">Atualizando comparação…</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Cliques</p><div className="mt-1"><DeltaBadge current={totals.clicks} previous={previousTotals.clicks} /></div></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Leads</p><div className="mt-1"><DeltaBadge current={totals.leads} previous={previousTotals.leads} /></div></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Vendas</p><div className="mt-1"><DeltaBadge current={totals.sales} previous={previousTotals.sales} /></div></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Conversão</p><div className="mt-1"><DeltaBadge current={totals.conversion} previous={previousTotals.conversion} points /></div></div>
            <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Comissões pagas</p><div className="mt-1"><DeltaBadge current={totals.commissionPaidPercent} previous={previousTotals.commissionPaidPercent} points /></div></div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4">
          <h3 className="font-semibold">Performance por parceiro</h3>
          <p className="text-sm text-muted-foreground">Os filtros históricos recalculam cliques, leads, vendas, conversão e comissão sobre os eventos reais.</p>
        </div>

        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pl-9" aria-label="Data inicial" /></div>
          <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pl-9" aria-label="Data final" /></div>
          <Select value={campaign} onValueChange={setCampaign}><SelectTrigger><SelectValue placeholder="Campanha" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as campanhas</SelectItem>{dimensions.campaigns.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={city} onValueChange={setCity}><SelectTrigger><MapPin className="mr-2 h-4 w-4" /><SelectValue placeholder="Cidade" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as cidades</SelectItem>{dimensions.cities.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue placeholder="Região" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as regiões</SelectItem>{dimensions.regions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, email ou cupom" className="xl:col-span-2" />
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="ativo">Ativos</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="suspenso">Suspensos</SelectItem></SelectContent></Select>
          <Select value={coupon} onValueChange={setCoupon}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os cupons</SelectItem><SelectItem value="ativo">Cupom ativo</SelectItem><SelectItem value="inativo">Cupom inativo</SelectItem><SelectItem value="sem_cupom">Sem cupom</SelectItem></SelectContent></Select>
          <Select value={commission} onValueChange={setCommission}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toda comissão</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="parcial">Parcial</SelectItem><SelectItem value="paga">Paga</SelectItem><SelectItem value="sem_comissao">Sem comissão</SelectItem></SelectContent></Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{rows.length} parceiro(s) no resultado</span>
          <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sales">Ordenar por vendas</SelectItem><SelectItem value="growth">Ordenar por crescimento</SelectItem><SelectItem value="clicks">Ordenar por cliques</SelectItem><SelectItem value="leads">Ordenar por leads</SelectItem><SelectItem value="conversion">Ordenar por conversão</SelectItem><SelectItem value="commission">Ordenar por % paga</SelectItem></SelectContent></Select>
        </div>
      </div>

      {historyQuery.isError ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">As métricas históricas ainda não puderam ser carregadas. Verifique se a migration de histórico foi aplicada.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Parceiro</TableHead><TableHead>Tipo</TableHead><TableHead>Cupom</TableHead><TableHead>Cliques</TableHead><TableHead>Leads</TableHead><TableHead>Vendas</TableHead>{previous && <TableHead>Δ vendas</TableHead>}<TableHead>Conversão</TableHead><TableHead>Comissão</TableHead><TableHead>% paga</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ partner, metric, previousMetric }, index) => {
                const commissionState = commissionStatus(metric);
                return (
                  <TableRow key={partner.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell><div><p className="font-medium">{nameOf(partner)}</p><p className="text-xs text-muted-foreground">{partner.email}</p></div></TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{partner.tipoParceiro}</Badge></TableCell>
                    <TableCell>{partner.cupomCodigo ? <Badge variant="outline">{partner.cupomCodigo}</Badge> : "—"}</TableCell>
                    <TableCell>{metric?.clicks ?? 0}</TableCell>
                    <TableCell>{metric?.leads ?? 0}</TableCell>
                    <TableCell>{metric?.sales ?? 0}</TableCell>
                    {previous && <TableCell><DeltaBadge current={Number(metric?.sales ?? 0)} previous={Number(previousMetric?.sales ?? 0)} /></TableCell>}
                    <TableCell>{pct(metric?.saleConversionPercent)}</TableCell>
                    <TableCell>{pct(partner.comissaoPercentual)}</TableCell>
                    <TableCell>{pct(paidPercent(metric))}</TableCell>
                    <TableCell><Badge variant={commissionState === "paga" ? "default" : "secondary"} className="capitalize">{commissionState.replace("_", " ")}</Badge></TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && <TableRow><TableCell colSpan={previous ? 12 : 11} className="py-10 text-center text-sm text-muted-foreground">Nenhum parceiro encontrado com estes filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
