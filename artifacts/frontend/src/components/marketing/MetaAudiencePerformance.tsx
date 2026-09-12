import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ShieldCheck, Target, TrendingUp, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type MediaAction = {
  action: "manter" | "reduzir" | "pausar" | "testar_criativo" | "escalar";
  label: string;
  reason: string;
  confidence: "baixa" | "media" | "alta";
  requiresApproval: boolean;
  suggestedBudgetChangePct: number | null;
};

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
  mediaAction: MediaAction;
};

type PerformanceResponse = {
  rows: AudienceRow[];
  winner: { key: string; label: string; score: number; roas: number | null } | null;
  generatedAt: string;
  safety?: {
    automaticBudgetChanges?: boolean;
    automaticPauseResume?: boolean;
    approvalRequiredForSpendChanges?: boolean;
  };
};

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function number(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function actionVariant(action: MediaAction["action"]): "default" | "outline" | "destructive" | "secondary" {
  if (action === "escalar") return "default";
  if (action === "pausar") return "destructive";
  if (action === "reduzir") return "secondary";
  return "outline";
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
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Resultado e próxima ação por audiência</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Compara gasto real, CRM e vendas e transforma o resultado em uma recomendação de mídia conservadora.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.winner ? <Badge className="gap-1"><Trophy className="h-3 w-3" />Melhor sinal: {data.winner.label}</Badge> : null}
            <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />Sem mudança automática de verba</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Audiência</th>
                <th className="px-3 py-2">Ação recomendada</th>
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
                    <p className="mt-1 max-w-[280px] text-[11px] text-muted-foreground">{row.recommendation}</p>
                  </td>
                  <td className="px-3 py-3 min-w-[260px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={actionVariant(row.mediaAction.action)}>{row.mediaAction.label}</Badge>
                      <Badge variant="outline">confiança {row.mediaAction.confidence}</Badge>
                      {row.mediaAction.requiresApproval ? <Badge variant="outline">exige aprovação</Badge> : null}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">{row.mediaAction.reason}</p>
                    {row.mediaAction.suggestedBudgetChangePct != null ? (
                      <p className="mt-1 text-[11px] font-medium">Sugestão: {row.mediaAction.suggestedBudgetChangePct > 0 ? "+" : ""}{row.mediaAction.suggestedBudgetChangePct}% no orçamento.</p>
                    ) : null}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          {data?.generatedAt ? <p className="text-[11px] text-muted-foreground">Calculado em {new Date(data.generatedAt).toLocaleString("pt-BR")} com dados de campanhas, Ads e CRM.</p> : <span />}
          <Button size="sm" variant="outline" onClick={() => window.location.assign("/ads")}>
            Revisar campanhas em Anúncios <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
