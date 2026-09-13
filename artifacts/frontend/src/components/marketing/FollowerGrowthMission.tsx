import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart3, Loader2, Megaphone, RefreshCw, Rocket, Target, TrendingUp, Users, Video } from "lucide-react";

type MetaGrowthOverview = {
  instagramConnected?: boolean;
  followers?: number | null;
  followersDelta7d?: number | null;
  followersDelta30d?: number | null;
  reach30d?: number | null;
  profileVisits30d?: number | null;
  engagedAccounts30d?: number | null;
  organicLeads30d?: number | null;
};

function n(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function goalKey(tenantId: string) {
  return `vendorai_follower_growth_goal_v1:${tenantId}`;
}

export function FollowerGrowthMission() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [data, setData] = useState<MetaGrowthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState(5000);

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/meta-growth/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Falha ao carregar crescimento.");
      const payload = await response.json() as MetaGrowthOverview;
      setData(payload);
      const stored = Number(window.localStorage.getItem(goalKey(tenantId)) || 0);
      const followers = payload.followers ?? 0;
      setGoal(stored > followers ? stored : Math.max(5000, Math.ceil((followers + 1) / 1000) * 1000));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId, token]);

  const followers = data?.followers ?? 0;
  const gap = Math.max(0, goal - followers);
  const dailyTarget = Math.max(1, Math.ceil(gap / 30));
  const weeklyPace = (data?.followersDelta7d ?? 0) * 4.2857;
  const projected30d = Math.max(0, Math.round(weeklyPace));
  const onPace = gap === 0 || projected30d >= gap;
  const profileRate = (data?.reach30d ?? 0) > 0
    ? ((data?.profileVisits30d ?? 0) / Math.max(1, data?.reach30d ?? 0)) * 100
    : 0;

  const todayPlan = useMemo(() => [
    { icon: Video, title: "2 Reels de descoberta", detail: "Gancho forte, dor real, demonstração e CTA para seguir." },
    { icon: TrendingUp, title: "Replicar o vencedor", detail: "Criar uma nova versão do conteúdo com melhor sinal recente." },
    { icon: Users, title: "Stories de relacionamento", detail: "Prova + enquete/pergunta + CTA para DM." },
    { icon: Megaphone, title: "Impulsionar apenas vencedor", detail: "Levar para mídia paga só o conteúdo que já provou tração orgânica." },
  ], []);

  function saveGoal(value: number) {
    const next = Math.max(followers + 1, Math.round(value || followers + 1));
    setGoal(next);
    if (tenantId) window.localStorage.setItem(goalKey(tenantId), String(next));
  }

  async function refresh() {
    if (!tenantId || !token || refreshing) return;
    setRefreshing(true);
    try {
      await fetch(`/api/tenants/${tenantId}/content-performance/posts/atualizar-metricas`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      await fetch(`/api/tenants/${tenantId}/content-performance/insights/atualizar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando missão de crescimento…</CardContent></Card>;

  return (
    <Card className="border-primary/40 bg-primary/[0.025]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /><CardTitle>Missão: Aumentar Seguidores</CardTitle><Badge>Prioridade</Badge></div>
            <p className="mt-1 text-sm text-muted-foreground">Plano operacional de 30 dias usando Meta Growth, conteúdo, métricas e campanhas já existentes.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar sinais
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data?.instagramConnected ? <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Conecte o Instagram para medir seguidores, alcance e conversão real antes de escalar mídia.</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Seguidores agora" value={n(followers)} />
          <Metric label="Meta 30 dias" value={n(goal)} />
          <Metric label="Faltam" value={n(gap)} />
          <Metric label="Meta diária" value={`+${n(dailyTarget)}`} />
          <Metric label="Ritmo projetado" value={`+${n(projected30d)}`} detail={onPace ? "No ritmo" : "Abaixo da meta"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2"><Target className="h-4 w-4" /><p className="text-sm font-semibold">Definir meta</p></div>
            <div className="mt-3 flex gap-2">
              <Input type="number" min={followers + 1} value={goal} onChange={(event) => saveGoal(Number(event.target.value))} />
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>{n(data?.followersDelta7d)} novos seguidores nos últimos 7 dias.</p>
              <p>{n(data?.reach30d)} de alcance e {n(data?.profileVisits30d)} visitas ao perfil em 30 dias.</p>
              <p>{profileRate.toFixed(1)}% do alcance virou visita ao perfil.</p>
              <p>{n(data?.organicLeads30d)} leads orgânicos atribuídos no período.</p>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /><p className="text-sm font-semibold">Execução de hoje</p></div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {todayPlan.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="rounded-md bg-muted/45 p-3">
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><p className="text-sm font-medium">{title}</p></div>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => window.location.assign("/content?tab=conteudos&objective=followers&format=reels")}>Criar Reels de hoje</Button>
          <Button variant="outline" onClick={() => window.location.assign("/content?tab=campanhas&objective=followers")}>Impulsionar vencedor</Button>
          <Button variant="outline" onClick={() => window.location.assign("/content?tab=resultados")}>Ver crescimento completo</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-lg border bg-background p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p>{detail ? <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p> : null}</div>;
}
