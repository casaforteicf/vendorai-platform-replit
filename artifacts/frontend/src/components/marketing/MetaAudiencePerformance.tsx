import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Target, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type AudienceRow = {
  key: string;
  label: string;
  campaigns: number;
  activeCampaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  opportunities: number;
  sales: number;
  revenue: number;
  costPerLead: number | null;
  costPerOpportunity: number | null;
  costPerSale: number | null;
  leadToSaleRate: number | null;
  roas: number | null;
  score: number;
  recommendation: string;
};

type PerformanceResponse = {
  rows: AudienceRow[];
  winner: { key: string; label: string; score: number; roas: number | null } | null;
  generatedAt: string;
};

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function number(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function MetaAudiencePerformance() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    fetch(`/api/tenants/${tenantId}/meta-growth/audience-performance`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Não foi possível carregar o desempenho por audiência.");
        return payload as PerformanceResponse;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar desempenho por audiência."); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const rows = data?.rows ?? [];
  if (!rows.length && !error) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Resultado por audiência Meta</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Quando campanhas com Custom Audience começarem a gerar gasto, leads e vendas, a comparação aparecerá aqui automaticamente.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Resultado por audiência Meta</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Compara gasto real, CRM e vendas pela Custom Audience realmente aplicada à campanha.</p>
          </div>
          {data?.winner ? (
            <Badge className="gap-1"><Trophy className="h-3 w-3" />Melhor sinal: {data.winner.label}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Audiência</th>
                <th className="px-3 py-2 text-right">Gasto</th>
                <th className="px-3 py-2 text-right">Leads</th>
                <th className="px-3 py-2 text-right">Oportunidades</th>
                <th className="px-3 py-2 text-right">Vendas</th>
                <th className="px-3 py-2 text-right">Receita</th>
                <th className="px-3 py-2 text-right">CPL</th>
                <th className="px-3 py-2 text-right">Custo/venda</th>
                <th className="px-3 py-2 text-right">ROAS</th>
                <th className="px-3 py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t align-top">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2"><Target className="h-3.5 w-3.5 text-primary" /><span className="font-medium">{row.label}</span></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{row.campaigns} campanha(s) · {row.activeCampaigns} ativa(s)</p>
                    <p className="mt-1 max-w-[320px] text-[11px] text-muted-foreground">{row.recommendation}</p>
                  </td>
                  <td className="px-3 py-3 text-right">{money(row.spend)}</td>
                  <td className="px-3 py-3 text-right">{number(row.leads)}</td>
                  <td className="px-3 py-3 text-right">{number(row.opportunities)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{number(row.sales)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{money(row.revenue)}</td>
                  <td className="px-3 py-3 text-right">{money(row.costPerLead)}</td>
                  <td className="px-3 py-3 text-right">{money(row.costPerSale)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{row.roas == null ? "—" : `${row.roas.toFixed(2)}x`}</td>
                  <td className="px-3 py-3 text-right"><Badge variant={row.score >= 70 ? "default" : "outline"}>{row.score}/100</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.generatedAt ? <p className="text-[11px] text-muted-foreground">Calculado em {new Date(data.generatedAt).toLocaleString("pt-BR")} com dados de campanhas, Ads e CRM.</p> : null}
      </CardContent>
    </Card>
  );
}
