import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Radar, Sparkles, TrendingUp } from "lucide-react";

type Partner = {
  id: string;
  name?: string | null;
  nomeFantasia?: string | null;
  email: string;
  status: string;
  tipoParceiro: string;
  cupomCodigo?: string | null;
};

type Analytics = {
  partnerId: string;
  clicks: number;
  leads: number;
  sales: number;
  commissionAmount: string;
  paidCommissionAmount: string;
  saleConversionPercent: string;
};

type HistoryResponse = {
  rows: Analytics[];
  dimensions: { campaigns: string[]; cities: string[]; regions: string[] };
};

type Signal = {
  partner: Partner;
  current?: Analytics;
  previous?: Analytics;
  score: number;
  salesGrowth: number;
  leadsGrowth: number;
  conversionDelta: number;
  paidPercent: number;
  status: "acelerar" | "acompanhar" | "atencao";
  reason: string;
};

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

function isoStart(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function isoEnd(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

function historyUrl(from: Date, to: Date, campaign: string, city: string, region: string) {
  const params = new URLSearchParams({ from: isoStart(from), to: isoEnd(to) });
  if (campaign !== "all") params.set("campaign", campaign);
  if (city !== "all") params.set("city", city);
  if (region !== "all") params.set("region", region);
  return `/api/admin/partners-commercial/history?${params.toString()}`;
}

function pct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function pp(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`;
}

function growth(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function paidPercent(metric?: Analytics) {
  const total = Number(metric?.commissionAmount ?? 0);
  const paid = Number(metric?.paidCommissionAmount ?? 0);
  if (total <= 0) return 0;
  return clamp((paid / total) * 100, 0, 100);
}

function partnerName(partner: Partner) {
  return partner.nomeFantasia || partner.name || partner.email;
}

function scoreSignal(partner: Partner, current?: Analytics, previous?: Analytics): Signal {
  const currentSales = Number(current?.sales ?? 0);
  const previousSales = Number(previous?.sales ?? 0);
  const currentLeads = Number(current?.leads ?? 0);
  const previousLeads = Number(previous?.leads ?? 0);
  const currentConversion = Number(current?.saleConversionPercent ?? 0);
  const previousConversion = Number(previous?.saleConversionPercent ?? 0);

  const salesGrowth = growth(currentSales, previousSales);
  const leadsGrowth = growth(currentLeads, previousLeads);
  const conversionDelta = currentConversion - previousConversion;
  const payment = paidPercent(current);

  // Score 0-100: prioriza crescimento real e eficiência; pagamentos funcionam como sinal operacional,
  // não como valor financeiro absoluto.
  const score = Math.round(clamp(
    50 +
      clamp(salesGrowth, -100, 100) * 0.25 +
      clamp(leadsGrowth, -100, 100) * 0.12 +
      clamp(conversionDelta, -30, 30) * 0.8 +
      (payment - 50) * 0.08,
    0,
    100,
  ));

  let status: Signal["status"] = "acompanhar";
  let reason = "Desempenho estável no recorte analisado.";

  if (salesGrowth >= 20 && conversionDelta >= 0) {
    status = "acelerar";
    reason = "Vendas cresceram com conversão estável ou melhor; há sinal para ampliar a oportunidade.";
  } else if (salesGrowth <= -20 || conversionDelta <= -5) {
    status = "atencao";
    reason = salesGrowth <= -20
      ? "Queda relevante de vendas em relação ao período anterior."
      : "Conversão caiu de forma relevante mesmo sem queda equivalente de tráfego.";
  } else if (leadsGrowth >= 25 && salesGrowth < 10) {
    reason = "Leads estão crescendo mais rápido que vendas; existe espaço para melhorar a conversão.";
  } else if (salesGrowth >= 10) {
    reason = "Crescimento positivo de vendas; vale acompanhar para confirmar tendência.";
  }

  return { partner, current, previous, score, salesGrowth, leadsGrowth, conversionDelta, paidPercent: payment, status, reason };
}

function SignalCard({ signal }: { signal: Signal }) {
  const Icon = signal.status === "acelerar" ? ArrowUpRight : signal.status === "atencao" ? ArrowDownRight : TrendingUp;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{partnerName(signal.partner)}</p>
            <Badge variant={signal.status === "acelerar" ? "default" : "secondary"} className="capitalize">
              {signal.status === "atencao" ? "atenção" : signal.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{signal.partner.tipoParceiro} · score {signal.score}/100</p>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-sm">{signal.reason}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-muted/40 p-2"><span className="text-muted-foreground">Vendas</span><p className="font-medium">{pct(signal.salesGrowth)}</p></div>
        <div className="rounded-lg bg-muted/40 p-2"><span className="text-muted-foreground">Leads</span><p className="font-medium">{pct(signal.leadsGrowth)}</p></div>
        <div className="rounded-lg bg-muted/40 p-2"><span className="text-muted-foreground">Conversão</span><p className="font-medium">{pp(signal.conversionDelta)}</p></div>
        <div className="rounded-lg bg-muted/40 p-2"><span className="text-muted-foreground">Comissões pagas</span><p className="font-medium">{signal.paidPercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p></div>
      </div>
    </div>
  );
}

export function PartnerOpportunityRadar() {
  const [campaign, setCampaign] = useState("all");
  const [city, setCity] = useState("all");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");

  const periods = useMemo(() => {
    const currentTo = new Date();
    const currentFrom = new Date(currentTo);
    currentFrom.setDate(currentFrom.getDate() - 29);
    const previousTo = new Date(currentFrom);
    previousTo.setDate(previousTo.getDate() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setDate(previousFrom.getDate() - 29);
    return { currentFrom, currentTo, previousFrom, previousTo };
  }, []);

  const partnersQuery = useQuery<Partner[]>({
    queryKey: ["admin-partners-commercial-opportunity"],
    queryFn: () => getJson("/api/admin/partners-commercial"),
  });

  const currentQuery = useQuery<HistoryResponse>({
    queryKey: ["partner-opportunity-current", campaign, city, region],
    queryFn: () => getJson(historyUrl(periods.currentFrom, periods.currentTo, campaign, city, region)),
    retry: false,
  });

  const previousQuery = useQuery<HistoryResponse>({
    queryKey: ["partner-opportunity-previous", campaign, city, region],
    queryFn: () => getJson(historyUrl(periods.previousFrom, periods.previousTo, campaign, city, region)),
    retry: false,
  });

  const dimensions = currentQuery.data?.dimensions ?? { campaigns: [], cities: [], regions: [] };
  const signals = useMemo(() => {
    const current = new Map((currentQuery.data?.rows ?? []).map((row) => [row.partnerId, row]));
    const previous = new Map((previousQuery.data?.rows ?? []).map((row) => [row.partnerId, row]));
    return (partnersQuery.data ?? [])
      .filter((partner) => partner.status === "ativo")
      .map((partner) => scoreSignal(partner, current.get(partner.id), previous.get(partner.id)))
      .filter((signal) => status === "all" || signal.status === status)
      .sort((a, b) => b.score - a.score);
  }, [partnersQuery.data, currentQuery.data, previousQuery.data, status]);

  const summary = useMemo(() => ({
    acelerar: signals.filter((item) => item.status === "acelerar").length,
    atencao: signals.filter((item) => item.status === "atencao").length,
    acompanhar: signals.filter((item) => item.status === "acompanhar").length,
  }), [signals]);

  if (partnersQuery.isLoading || currentQuery.isLoading || previousQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Analisando oportunidades da rede...</div>;
  }

  if (currentQuery.isError || previousQuery.isError) {
    return <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Não foi possível montar o radar. Verifique se o histórico de parceiros está disponível.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Radar className="h-5 w-5" /><h3 className="font-semibold">Radar de oportunidades</h3></div>
            <p className="mt-1 text-sm text-muted-foreground">Compara os últimos 30 dias com os 30 dias anteriores e prioriza sinais por crescimento, conversão e execução de comissão.</p>
          </div>
          <Badge variant="outline" className="gap-1"><Sparkles className="h-3.5 w-3.5" /> Score 0–100</Badge>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Acelerar</p><p className="text-2xl font-semibold">{summary.acelerar}</p></div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Acompanhar</p><p className="text-2xl font-semibold">{summary.acompanhar}</p></div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Atenção</p><p className="text-2xl font-semibold">{summary.atencao}</p></div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select value={campaign} onValueChange={setCampaign}><SelectTrigger><SelectValue placeholder="Campanha" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as campanhas</SelectItem>{dimensions.campaigns.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={city} onValueChange={setCity}><SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as cidades</SelectItem>{dimensions.cities.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={region} onValueChange={setRegion}><SelectTrigger><SelectValue placeholder="Região" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as regiões</SelectItem>{dimensions.regions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os sinais</SelectItem><SelectItem value="acelerar">Acelerar</SelectItem><SelectItem value="acompanhar">Acompanhar</SelectItem><SelectItem value="atencao">Atenção</SelectItem></SelectContent></Select>
        </div>
      </div>

      {signals.length ? (
        <div className="grid gap-3 xl:grid-cols-2">{signals.map((signal) => <SignalCard key={signal.partner.id} signal={signal} />)}</div>
      ) : (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground"><AlertTriangle className="mx-auto mb-2 h-5 w-5" />Nenhum sinal encontrado com estes filtros.</div>
      )}
    </div>
  );
}
