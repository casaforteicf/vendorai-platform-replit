import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Loader2, MessageCircle, Play, Sparkles, Target, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type GrowthOverview = {
  followers?: number | null;
  followersDelta7d?: number | null;
  reach30d?: number | null;
  profileVisits30d?: number | null;
  organicLeads30d?: number | null;
};

type Metrics = {
  reach?: number;
  views?: number;
  plays?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  replies?: number;
  linkClicks?: number;
};

type PublishedPost = {
  id: string;
  contentType: string;
  theme?: string | null;
  captionOuTexto?: string | null;
  metricas?: Metrics | null;
  publishedAt: string;
};

type Learning = {
  aprendizados?: {
    temasQueFuncionam?: string[];
    formatoQueMaisEngaja?: string;
    observacoes?: string;
  } | null;
};

type PlanItem = {
  id: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  priority: "alta" | "media";
};

function score(metrics: Metrics | null | undefined) {
  if (!metrics) return 0;
  const reach = Math.max(1, metrics.reach ?? metrics.views ?? metrics.plays ?? 0);
  const quality = (metrics.saved ?? 0) * 5 + (metrics.shares ?? 0) * 6 + (metrics.comments ?? 0) * 3 + (metrics.replies ?? 0) * 4 + (metrics.linkClicks ?? 0) * 5 + (metrics.likes ?? 0);
  return quality / reach;
}

export function FollowerDailyPlan() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [overview, setOverview] = useState<GrowthOverview | null>(null);
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch(`/api/tenants/${tenantId}/meta-growth/overview`, { headers }),
      fetch(`/api/tenants/${tenantId}/content-performance/posts`, { headers }),
      fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers }),
    ])
      .then(async ([overviewResponse, postsResponse, learningResponse]) => {
        if (!overviewResponse.ok || !postsResponse.ok || !learningResponse.ok) throw new Error();
        return Promise.all([
          overviewResponse.json() as Promise<GrowthOverview>,
          postsResponse.json() as Promise<PublishedPost[]>,
          learningResponse.json() as Promise<Learning | null>,
        ]);
      })
      .then(([overviewData, postsData, learningData]) => {
        if (cancelled) return;
        setOverview(overviewData);
        setPosts(postsData);
        setLearning(learningData);
      })
      .catch(() => {
        if (cancelled) return;
        setOverview(null);
        setPosts([]);
        setLearning(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const recent = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return posts.filter((post) => new Date(post.publishedAt).getTime() >= cutoff);
  }, [posts]);

  const winner = useMemo(() => [...recent]
    .filter((post) => (post.metricas?.reach ?? post.metricas?.views ?? post.metricas?.plays ?? 0) > 0)
    .sort((a, b) => score(b.metricas) - score(a.metricas))[0] ?? null, [recent]);

  const winningTheme = learning?.aprendizados?.temasQueFuncionam?.[0]
    || winner?.theme
    || winner?.captionOuTexto?.slice(0, 70)
    || "uma dor real do cliente";
  const winningFormat = learning?.aprendizados?.formatoQueMaisEngaja || winner?.contentType || "Reel";
  const reach = overview?.reach30d ?? 0;
  const profileVisits = overview?.profileVisits30d ?? 0;
  const visitRate = reach > 0 ? (profileVisits / reach) * 100 : null;
  const stagnant = (overview?.followersDelta7d ?? 0) <= 0;
  const lowProfileConversion = visitRate != null && visitRate < 1.5;

  const plan = useMemo<PlanItem[]>(() => {
    const items: PlanItem[] = [
      {
        id: "reel-discovery",
        title: `Reel de descoberta sobre ${winningTheme}`,
        description: `Use ${winningFormat} com gancho forte, uma dor específica e CTA explícito para seguir o perfil.`,
        cta: "Criar Reel",
        href: `/content?tab=gerador&from=follower-daily-plan&format=reel&theme=${encodeURIComponent(winningTheme)}`,
        priority: "alta",
      },
      {
        id: "winner-variation",
        title: "Variação do melhor conteúdo",
        description: winner ? "Mantenha a ideia central do vencedor e troque gancho, abertura e CTA para testar uma nova versão hoje." : "Assim que houver um vencedor claro, crie uma nova versão mantendo a mesma dor central.",
        cta: winner ? "Criar variação" : "Abrir gerador",
        href: winner ? `/content?tab=gerador&from=follower-daily-plan&sourcePostId=${encodeURIComponent(winner.id)}` : "/content?tab=gerador&from=follower-daily-plan",
        priority: "alta",
      },
      {
        id: "stories-sequence",
        title: "Sequência de Stories para relacionamento",
        description: "Publique prova/resultado, enquete ou pergunta e finalize com CTA para DM. O objetivo é transformar alcance em conversa.",
        cta: "Criar Stories",
        href: "/content?tab=gerador&from=follower-daily-plan&format=stories",
        priority: "media",
      },
    ];
    if (stagnant) {
      items.unshift({
        id: "discovery-extra",
        title: "Reel extra de alcance",
        description: "O crescimento em 7 dias está parado ou negativo. Adicione um segundo Reel curto focado exclusivamente em descoberta.",
        cta: "Criar Reel extra",
        href: "/content?tab=gerador&from=follower-daily-plan&format=reel&goal=discovery",
        priority: "alta",
      });
    }
    if (lowProfileConversion) {
      items.push({
        id: "profile-cta",
        title: "Conteúdo para aumentar visitas ao perfil",
        description: `A taxa atual é ${visitRate?.toFixed(1)}%. Crie uma peça com promessa clara, prova e CTA para visitar/seguir o perfil.`,
        cta: "Criar peça",
        href: "/content?tab=gerador&from=follower-daily-plan&goal=profile-visits",
        priority: "alta",
      });
    }
    return items.slice(0, 5);
  }, [winner, winningTheme, winningFormat, stagnant, lowProfileConversion, visitRate]);

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando pauta diária de crescimento…</CardContent></Card>;

  return (
    <Card className="border-sky-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-sky-600" /><CardTitle className="text-base">Pauta diária para crescer seguidores</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Monta o plano de hoje com base no desempenho real, no tema vencedor e no gargalo atual.</p>
          </div>
          <Badge variant="outline">{plan.length} ações hoje</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tema vencedor</p><p className="mt-1 text-sm font-semibold">{winningTheme}</p></div>
          <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Formato prioritário</p><p className="mt-1 text-sm font-semibold">{winningFormat}</p></div>
          <div className="rounded-lg border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gargalo detectado</p><p className="mt-1 text-sm font-semibold">{stagnant ? "Descoberta / novos seguidores" : lowProfileConversion ? "Visitas ao perfil" : "Escalar o que já funciona"}</p></div>
        </div>

        <div className="space-y-2">
          {plan.map((item, index) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{index + 1}</div>
                <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.title}</p><Badge variant={item.priority === "alta" ? "default" : "outline"}>{item.priority}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></div>
              </div>
              <Button size="sm" variant={item.priority === "alta" ? "default" : "outline"} onClick={() => window.location.assign(item.href)}>
                {item.id.includes("stories") ? <MessageCircle className="mr-1.5 h-4 w-4" /> : item.id.includes("profile") ? <Target className="mr-1.5 h-4 w-4" /> : <Video className="mr-1.5 h-4 w-4" />}
                {item.cta}
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Sparkles className="h-4 w-4" />Regra de execução</div>
          <p className="mt-1">A pauta é recalculada com os dados disponíveis. Ela prepara a execução do dia, mas não publica nem ativa gasto de mídia sem ação do usuário.</p>
        </div>

        <Button className="w-full" onClick={() => window.location.assign("/content?tab=gerador&from=follower-daily-plan&view=today")}>
          <Play className="mr-2 h-4 w-4" />Executar pauta de hoje
        </Button>
      </CardContent>
    </Card>
  );
}
