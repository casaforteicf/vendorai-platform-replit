import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Facebook,
  Info,
  Instagram,
  Loader2,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

type GrowthAlert = {
  id: string;
  severity: "success" | "warning" | "info";
  title: string;
  message: string;
};

type MetaRemarketingOverview = {
  eligibleLeads30d?: number;
  warmLeads30d?: number;
  hotLeads30d?: number;
  dmLeads30d?: number;
  commentLeads30d?: number;
  mentionLeads30d?: number;
  campaignEngagedLeads30d?: number;
  audiences?: Array<{
    key: string;
    label: string;
    count: number;
    lookbackDays: number;
    intent: "engaged" | "warm" | "hot";
    recommendedAction: string;
  }>;
  externalAudienceSync?: {
    status: string;
    reason: string;
  };
};

type MetaGrowthOverview = {
  connected?: boolean;
  instagramConnected?: boolean;
  facebookConnected?: boolean;
  followers?: number | null;
  followersDelta7d?: number | null;
  followersDelta30d?: number | null;
  reach30d?: number | null;
  profileVisits30d?: number | null;
  engagedAccounts30d?: number | null;
  leads30d?: number | null;
  opportunities30d?: number | null;
  pipelineValue30d?: number | null;
  sales30d?: number | null;
  revenueClosed30d?: number | null;
  paidSales30d?: number | null;
  paidRevenueClosed30d?: number | null;
  paidCac30d?: number | null;
  paidRoas30d?: number | null;
  paidSpend30d?: number | null;
  paidLeads30d?: number | null;
  organicLeads30d?: number | null;
  alerts?: GrowthAlert[];
  refreshedAt?: string;
  topContent?: Array<{
    id: string;
    title: string;
    format?: string;
    reach?: number | null;
    engagements?: number | null;
    followersGained?: number | null;
    leads?: number | null;
  }>;
};

function n(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function signed(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${n(value)}`;
}

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function MetaGrowthHub() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [data, setData] = useState<MetaGrowthOverview | null>(null);
  const [remarketing, setRemarketing] = useState<MetaRemarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`/api/tenants/${tenantId}/meta-growth/overview`, { headers }),
      fetch(`/api/tenants/${tenantId}/meta-growth/remarketing`, { headers }),
    ])
      .then(async ([overviewResponse, remarketingResponse]) => {
        if (!overviewResponse.ok) throw new Error("Não foi possível carregar os indicadores da Meta.");
        if (!remarketingResponse.ok) throw new Error("Não foi possível carregar as audiências de remarketing.");
        return Promise.all([
          overviewResponse.json() as Promise<MetaGrowthOverview>,
          remarketingResponse.json() as Promise<MetaRemarketingOverview>,
        ]);
      })
      .then(([overview, audiences]) => {
        if (cancelled) return;
        setData(overview);
        setRemarketing(audiences);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar a Meta."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  async function refreshMeta() {
    if (!tenantId || !token || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [overviewResponse, remarketingResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/meta-growth/atualizar`, { method: "POST", headers }),
        fetch(`/api/tenants/${tenantId}/meta-growth/remarketing`, { headers }),
      ]);
      if (!overviewResponse.ok) throw new Error("Não foi possível atualizar os indicadores da Meta.");
      if (!remarketingResponse.ok) throw new Error("Não foi possível atualizar as audiências de remarketing.");
      setData(await overviewResponse.json() as MetaGrowthOverview);
      setRemarketing(await remarketingResponse.json() as MetaRemarketingOverview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar a Meta.");
    } finally {
      setRefreshing(false);
    }
  }

  const attribution = useMemo(() => {
    const organic = data?.organicLeads30d ?? 0;
    const paid = data?.paidLeads30d ?? 0;
    const total = organic + paid;
    return total > 0 ? {
      organic: Math.round((organic / total) * 100),
      paid: Math.round((paid / total) * 100),
    } : null;
  }, [data]);

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando Meta Growth…</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle>Meta Growth</CardTitle></div>
              <p className="mt-1 text-sm text-muted-foreground">Instagram + Facebook: audiência, conteúdo, mídia paga, conversas e receita em uma única visão.</p>
              {data?.refreshedAt ? <p className="mt-1 text-xs text-muted-foreground">Atualizado em {new Date(data.refreshedAt).toLocaleString("pt-BR")}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={data?.instagramConnected ? "default" : "outline"} className="gap-1"><Instagram className="h-3 w-3" />Instagram</Badge>
              <Badge variant={data?.facebookConnected ? "default" : "outline"} className="gap-1"><Facebook className="h-3 w-3" />Facebook</Badge>
              <Button size="sm" variant="outline" onClick={refreshMeta} disabled={refreshing || !tenantId}>
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar Meta
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="rounded-lg border border-dashed p-4">
              <p className="font-medium">Camada de Growth pronta para receber os dados da Meta.</p>
              <p className="mt-1 text-sm text-muted-foreground">Conecte Instagram/Facebook para alimentar esta visão com Insights, Ads e atribuição CRM.</p>
            </div>
          ) : null}
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users className="h-4 w-4" />} label="Seguidores" value={n(data?.followers)} detail={`${signed(data?.followersDelta7d)} em 7 dias · ${signed(data?.followersDelta30d)} em 30 dias`} />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Alcance 30 dias" value={n(data?.reach30d)} detail={`${n(data?.profileVisits30d)} visitas ao perfil`} />
        <Metric icon={<MessageCircle className="h-4 w-4" />} label="Leads Meta" value={n(data?.leads30d)} detail={`${n(data?.opportunities30d)} oportunidades abertas`} />
        <Metric icon={<Target className="h-4 w-4" />} label="Vendas Meta" value={n(data?.sales30d)} detail={`${money(data?.revenueClosed30d)} de receita fechada`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<BarChart3 className="h-4 w-4" />} label="Pipeline atribuído" value={money(data?.pipelineValue30d)} detail="Somente oportunidades abertas" />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Receita fechada" value={money(data?.revenueClosed30d)} detail={`${n(data?.sales30d)} venda(s) ganha(s)`} />
        <Metric icon={<Megaphone className="h-4 w-4" />} label="Investimento Meta Ads" value={money(data?.paidSpend30d)} detail={`${n(data?.paidSales30d)} venda(s) paga(s) atribuída(s)`} />
        <Metric icon={<BarChart3 className="h-4 w-4" />} label="ROAS Meta" value={data?.paidRoas30d == null ? "—" : `${data.paidRoas30d.toFixed(2)}x`} detail={`CAC ${money(data?.paidCac30d)} · receita paga ${money(data?.paidRevenueClosed30d)}`} />
      </div>

      {remarketing ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Audiências prontas para remarketing</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Engajamentos entram na mesma jornada comercial do CRM e ficam elegíveis por 30 dias.</p>
              </div>
              <Badge variant="outline">{n(remarketing.eligibleLeads30d)} elegíveis</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<Users className="h-4 w-4" />} label="Engajados 30d" value={n(remarketing.eligibleLeads30d)} detail={`${n(remarketing.warmLeads30d)} em aquecimento`} />
              <Metric icon={<Target className="h-4 w-4" />} label="Alta intenção" value={n(remarketing.hotLeads30d)} detail="Prioridade de reimpacto" />
              <Metric icon={<MessageCircle className="h-4 w-4" />} label="DMs 30d" value={n(remarketing.dmLeads30d)} detail={`${n(remarketing.commentLeads30d)} por comentário`} />
              <Metric icon={<Megaphone className="h-4 w-4" />} label="Vindos de campanha" value={n(remarketing.campaignEngagedLeads30d)} detail="Atribuição preservada no CRM" />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(remarketing.audiences ?? []).map((audience) => (
                <div key={audience.key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{audience.label}</p>
                    <Badge variant={audience.intent === "hot" ? "default" : "outline"}>{n(audience.count)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{audience.recommendedAction}</p>
                </div>
              ))}
            </div>
            {remarketing.externalAudienceSync?.reason ? <p className="text-xs text-muted-foreground">{remarketing.externalAudienceSync.reason}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {data?.alerts?.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Alertas de crescimento</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {data.alerts.map((alert) => <GrowthAlertCard key={alert.id} alert={alert} />)}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Conteúdo que gera crescimento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.topContent?.length ? data.topContent : []).slice(0, 5).map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border p-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.format || "Conteúdo"} · {n(item.reach)} alcance · {n(item.engagements)} interações</p></div>
                <div className="text-right"><p className="text-sm font-semibold">{item.followersGained == null ? "—" : signed(item.followersGained)}</p><p className="text-[11px] text-muted-foreground">seguidores atribuídos</p></div>
              </div>
            ))}
            {!data?.topContent?.length ? <p className="text-sm text-muted-foreground">Assim que os Insights forem sincronizados, o VendorAI vai identificar quais peças realmente geram alcance, interações, leads e vendas.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Motor de crescimento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Action icon={<Target className="h-4 w-4" />} title="Atrair" text="Reels, carrosséis e campanhas para público frio." />
            <Action icon={<MessageCircle className="h-4 w-4" />} title="Engajar" text="Comentários e DMs entram no fluxo omnichannel e CRM." />
            <Action icon={<Megaphone className="h-4 w-4" />} title="Remarketing" text="Reimpactar visitantes, engajados e leads não convertidos." />
            <Action icon={<TrendingUp className="h-4 w-4" />} title="Otimizar" text="A IA prioriza formatos, temas e públicos com melhor retorno." />
            {attribution ? <div className="rounded-md bg-muted p-3 text-xs">Leads atribuídos: <strong>{attribution.organic}% orgânico</strong> · <strong>{attribution.paid}% pago</strong></div> : null}
            <Button className="w-full" onClick={() => window.location.assign("/content?tab=conteudos")}>Criar conteúdo para Meta</Button>
            <Button variant="outline" className="w-full" onClick={() => window.location.assign("/content?tab=campanhas")}>Abrir campanhas</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GrowthAlertCard({ alert }: { alert: GrowthAlert }) {
  const Icon = alert.severity === "success" ? CheckCircle2 : alert.severity === "warning" ? AlertTriangle : Info;
  return (
    <div className="flex gap-3 rounded-md border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div><p className="text-sm font-semibold">{alert.title}</p><p className="text-xs text-muted-foreground">{alert.message}</p></div>
    </div>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function Action({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3 rounded-md border p-3"><div className="mt-0.5 text-primary">{icon}</div><div><p className="text-sm font-semibold">{title}</p><p className="text-xs text-muted-foreground">{text}</p></div></div>;
}
