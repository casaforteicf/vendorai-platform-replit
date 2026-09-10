import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MousePointerClick, ShoppingBag, TrendingUp, UserPlus, WalletCards } from "lucide-react";

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

function headers() {
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

function money(value?: string | number | null) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nameOf(partner: Partner) {
  return partner.nomeFantasia || partner.name || partner.email;
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

export function PartnerPerformanceDashboard() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [coupon, setCoupon] = useState("all");
  const [commission, setCommission] = useState("all");
  const [sort, setSort] = useState("sales");

  const partnersQuery = useQuery<Partner[]>({
    queryKey: ["admin-partners-commercial"],
    queryFn: () => getJson("/api/admin/partners-commercial"),
  });
  const analyticsQuery = useQuery<Analytics[]>({
    queryKey: ["admin-partners-commercial-analytics"],
    queryFn: () => getJson("/api/admin/partners-commercial/analytics"),
    retry: false,
  });

  const partners = partnersQuery.data ?? [];
  const analytics = analyticsQuery.data ?? [];
  const analyticsByPartner = useMemo(() => new Map(analytics.map((row) => [row.partnerId, row])), [analytics]);

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
      .map((partner) => ({ partner, metric: analyticsByPartner.get(partner.id) }))
      .sort((a, b) => {
        if (sort === "clicks") return Number(b.metric?.clicks ?? 0) - Number(a.metric?.clicks ?? 0);
        if (sort === "leads") return Number(b.metric?.leads ?? 0) - Number(a.metric?.leads ?? 0);
        if (sort === "conversion") return Number(b.metric?.saleConversionPercent ?? 0) - Number(a.metric?.saleConversionPercent ?? 0);
        if (sort === "commission") return Number(b.metric?.commissionAmount ?? 0) - Number(a.metric?.commissionAmount ?? 0);
        return Number(b.metric?.sales ?? 0) - Number(a.metric?.sales ?? 0);
      });
  }, [partners, analyticsByPartner, search, type, status, coupon, commission, sort]);

  const totals = useMemo(() => {
    const values = rows.map((row) => row.metric);
    const clicks = values.reduce((sum, row) => sum + Number(row?.clicks ?? 0), 0);
    const leads = values.reduce((sum, row) => sum + Number(row?.leads ?? 0), 0);
    const sales = values.reduce((sum, row) => sum + Number(row?.sales ?? 0), 0);
    const commissionAmount = values.reduce((sum, row) => sum + Number(row?.commissionAmount ?? 0), 0);
    const paidCommissionAmount = values.reduce((sum, row) => sum + Number(row?.paidCommissionAmount ?? 0), 0);
    return {
      clicks,
      leads,
      sales,
      conversion: clicks ? (sales / clicks) * 100 : 0,
      commissionAmount,
      paidCommissionAmount,
      pendingCommissionAmount: Math.max(0, commissionAmount - paidCommissionAmount),
    };
  }, [rows]);

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
        <Metric label="Comissão pendente" value={money(totals.pendingCommissionAmount)} icon={WalletCards} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4">
          <h3 className="font-semibold">Performance por parceiro</h3>
          <p className="text-sm text-muted-foreground">Filtre a rede e veja rapidamente quem gera tráfego, leads, vendas e comissão.</p>
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
          <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-8 w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sales">Ordenar por vendas</SelectItem><SelectItem value="clicks">Ordenar por cliques</SelectItem><SelectItem value="leads">Ordenar por leads</SelectItem><SelectItem value="conversion">Ordenar por conversão</SelectItem><SelectItem value="commission">Ordenar por comissão</SelectItem></SelectContent></Select>
        </div>
      </div>

      {analyticsQuery.isError ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">As métricas ainda não puderam ser carregadas; os filtros cadastrais continuam funcionando.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Parceiro</TableHead><TableHead>Tipo</TableHead><TableHead>Cupom</TableHead><TableHead>Cliques</TableHead><TableHead>Leads</TableHead><TableHead>Vendas</TableHead><TableHead>Conversão</TableHead><TableHead>Comissão</TableHead><TableHead>Pago</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ partner, metric }, index) => {
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
                    <TableCell>{pct(metric?.saleConversionPercent)}</TableCell>
                    <TableCell>{money(metric?.commissionAmount)}</TableCell>
                    <TableCell>{money(metric?.paidCommissionAmount)}</TableCell>
                    <TableCell><Badge variant={commissionState === "paga" ? "default" : "secondary"} className="capitalize">{commissionState.replace("_", " ")}</Badge></TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && <TableRow><TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">Nenhum parceiro encontrado com estes filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
