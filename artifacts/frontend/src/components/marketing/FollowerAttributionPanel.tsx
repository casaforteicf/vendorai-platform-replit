import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Gauge, Loader2, Sparkles, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type TopContent = {
  id: string;
  title: string;
  format?: string | null;
  reach?: number | null;
  engagements?: number | null;
};

type MetaGrowthOverview = {
  followers?: number | null;
  followersDelta7d?: number | null;
  followersDelta30d?: number | null;
  profileVisits30d?: number | null;
  reach30d?: number | null;
  organicLeads30d?: number | null;
  paidSpend30d?: number | null;
  topContent?: TopContent[];
  dataQuality?: {
    followerDeltas?: string;
    contentFollowerAttribution?: string;
  };
};

function n(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function FollowerAttributionPanel() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [data, setData] = useState<MetaGrowthOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/meta-growth/overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<MetaGrowthOverview>;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const attribution = useMemo(() => {
    const delta30 = Math.max(0, data?.followersDelta30d ?? 0);
    const visits = Math.max(0, data?.profileVisits30d ?? 0);
    const spend = Math.max(0, data?.paidSpend30d ?? 0);
    const contents = (data?.topContent ?? []).filter((item) => (item.engagements ?? 0) > 0);
    const totalEngagements = contents.reduce((sum, item) => sum + (item.engagements ?? 0), 0);
    const rows = contents.map((item) => {
      const influenceShare = totalEngagements > 0 ? (item.engagements ?? 0) / totalEngagements : 0;
      return {
        ...item,
        influenceShare,
        influencedFollowers: delta30 > 0 ? Math.round(delta30 * influenceShare) : null,
      };
    }).sort((a, b) => b.influenceShare - a.influenceShare);
    return {
      delta30,
      visits,
      visitToFollowRate: visits > 0 && delta30 > 0 ? (delta30 / visits) * 100 : null,
      blendedCostPerFollower: spend > 0 && delta30 > 0 ? spend / delta30 : null,
      rows,
    };
  }, [data]);

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando influência no crescimento…</CardContent></Card>;

  return (
    <Card className="border-cyan-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-cyan-600" /><CardTitle className="text-base">Atribuição de crescimento de seguidores</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Liga crescimento líquido, visitas ao perfil e conteúdos com maior sinal para mostrar onde concentrar produção e mídia.</p>
          </div>
          <Badge variant="outline">Estimativa transparente</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Seguidores líquidos · 30d" value={attribution.delta30 ? `+${n(attribution.delta30)}` : n(data?.followersDelta30d)} />
          <Metric label="Visitas ao perfil · 30d" value={n(attribution.visits)} />
          <Metric label="Visita → seguidor" value={attribution.visitToFollowRate == null ? "—" : `${attribution.visitToFollowRate.toFixed(1)}%`} />
          <Metric label="Custo misto / seguidor" value={money(attribution.blendedCostPerFollower)} detail="Conta inteira; não é atribuição direta do anúncio." />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /><p className="text-sm font-semibold">Conteúdos com maior influência estimada</p></div>
          {!attribution.rows.length ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há histórico suficiente de conteúdo + crescimento para estimar influência.</div>
          ) : attribution.rows.slice(0, 5).map((item, index) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Badge variant={index === 0 ? "default" : "outline"}>#{index + 1}</Badge><Badge variant="outline">{item.format || "conteúdo"}</Badge></div>
                <p className="mt-2 line-clamp-2 text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{(item.influenceShare * 100).toFixed(1)}% do sinal de influência · {n(item.reach)} alcance · {n(item.engagements)} interações</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right"><p className="text-xs text-muted-foreground">Seguidores influenciados*</p><p className="text-lg font-bold">{item.influencedFollowers == null ? "—" : `≈ ${n(item.influencedFollowers)}`}</p></div>
                <Button size="sm" variant="outline" onClick={() => window.location.assign(`/content?tab=gerador&from=follower-attribution&sourcePostId=${encodeURIComponent(item.id)}`)}>Replicar <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Sparkles className="h-4 w-4" />Como ler este número</div>
          <p className="mt-1">*A Meta não fornece no histórico atual do VendorAI um número confiável de novos seguidores por publicação. Por isso distribuímos o crescimento líquido de 30 dias proporcionalmente ao sinal de engajamento dos conteúdos. Isso serve para priorização, não como atribuição causal exata.</p>
          <p className="mt-1 flex items-center gap-1"><Users className="h-3 w-3" />Conforme acumulamos snapshots diários e mais publicações, a confiança da estimativa melhora.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-lg border bg-background p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p>{detail ? <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p> : null}</div>;
}
