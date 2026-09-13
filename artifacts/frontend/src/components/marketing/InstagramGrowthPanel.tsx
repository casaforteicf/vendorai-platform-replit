import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageCircle, RefreshCw, Rocket, Share2, Sparkles, Target, TrendingUp, Users, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type GrowthOverview = {
  instagramConnected?: boolean;
  followers?: number | null;
  followersDelta7d?: number | null;
  followersDelta30d?: number | null;
  reach30d?: number | null;
  profileVisits30d?: number | null;
  engagedAccounts30d?: number | null;
  organicLeads30d?: number | null;
};

type PostMetrics = {
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
  metricas?: PostMetrics | null;
  publishedAt: string;
  ultimaColetaEm?: string | null;
};

type Learning = {
  aprendizados?: {
    temasQueFuncionam?: string[];
    temasQueNaoFuncionam?: string[];
    formatoQueMaisEngaja?: string;
    observacoes?: string;
  } | null;
  baseadoEmPosts?: number;
};

type FormatKey = "reels" | "stories" | "feed";

type FormatStats = {
  key: FormatKey;
  label: string;
  posts: number;
  reach: number;
  views: number;
  engagements: number;
  saves: number;
  shares: number;
  replies: number;
  linkClicks: number;
  score: number;
};

function n(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatKey(raw: string): FormatKey {
  const value = raw.toLowerCase();
  if (value.includes("reel") || value.includes("video")) return "reels";
  if (value.includes("stor")) return "stories";
  return "feed";
}

function nextFollowerGoal(followers: number) {
  const milestones = [1000, 3000, 5000, 10000, 25000, 50000, 100000];
  return milestones.find((goal) => followers < goal) ?? Math.ceil((followers + 1) / 100000) * 100000;
}

function postScore(metrics: PostMetrics | null | undefined) {
  if (!metrics) return 0;
  return (metrics.likes ?? 0)
    + (metrics.comments ?? 0) * 2
    + (metrics.saved ?? 0) * 4
    + (metrics.shares ?? 0) * 5
    + (metrics.replies ?? 0) * 4
    + (metrics.linkClicks ?? 0) * 5;
}

export function InstagramGrowthPanel() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [overview, setOverview] = useState<GrowthOverview | null>(null);
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedFor, setLoadedFor] = useState("");

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [overviewResponse, postsResponse, learningResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/meta-growth/overview`, { headers }),
        fetch(`/api/tenants/${tenantId}/content-performance/posts`, { headers }),
        fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers }),
      ]);
      if (!overviewResponse.ok || !postsResponse.ok || !learningResponse.ok) throw new Error("Não foi possível carregar o Instagram Growth.");
      setOverview(await overviewResponse.json() as GrowthOverview);
      setPosts(await postsResponse.json() as PublishedPost[]);
      setLearning(await learningResponse.json() as Learning | null);
    } catch (cause) {
      toast({ title: "Instagram Growth indisponível", description: cause instanceof Error ? cause.message : "Falha ao carregar dados.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (tenantId && token && loadedFor !== tenantId) {
    setLoadedFor(tenantId);
    void load();
  }

  const recentPosts = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return posts.filter((post) => new Date(post.publishedAt).getTime() >= cutoff);
  }, [posts]);

  const formatStats = useMemo<FormatStats[]>(() => {
    const base: Record<FormatKey, FormatStats> = {
      reels: { key: "reels", label: "Reels", posts: 0, reach: 0, views: 0, engagements: 0, saves: 0, shares: 0, replies: 0, linkClicks: 0, score: 0 },
      stories: { key: "stories", label: "Stories", posts: 0, reach: 0, views: 0, engagements: 0, saves: 0, shares: 0, replies: 0, linkClicks: 0, score: 0 },
      feed: { key: "feed", label: "Feed/Carrossel", posts: 0, reach: 0, views: 0, engagements: 0, saves: 0, shares: 0, replies: 0, linkClicks: 0, score: 0 },
    };
    for (const post of recentPosts) {
      const row = base[formatKey(post.contentType)];
      const m = post.metricas ?? {};
      row.posts += 1;
      row.reach += m.reach ?? 0;
      row.views += m.views ?? m.plays ?? 0;
      row.saves += m.saved ?? 0;
      row.shares += m.shares ?? 0;
      row.replies += m.replies ?? 0;
      row.linkClicks += m.linkClicks ?? 0;
      row.engagements += (m.likes ?? 0) + (m.comments ?? 0) + (m.saved ?? 0) + (m.shares ?? 0) + (m.replies ?? 0);
      row.score += postScore(m);
    }
    return Object.values(base);
  }, [recentPosts]);

  const bestPost = useMemo(() => [...recentPosts].sort((a, b) => postScore(b.metricas) - postScore(a.metricas))[0] ?? null, [recentPosts]);
  const bestFormat = useMemo(() => [...formatStats].filter((row) => row.posts > 0).sort((a, b) => (b.score / b.posts) - (a.score / a.posts))[0] ?? null, [formatStats]);
  const followers = overview?.followers ?? 0;
  const followerGoal = nextFollowerGoal(followers);
  const followerProgress = followerGoal > 0 ? Math.min(100, (followers / followerGoal) * 100) : 0;
  const profileConversion = (overview?.reach30d ?? 0) > 0 ? ((overview?.profileVisits30d ?? 0) / (overview?.reach30d ?? 1)) * 100 : null;
  const engagementRate = (overview?.reach30d ?? 0) > 0 ? ((overview?.engagedAccounts30d ?? 0) / (overview?.reach30d ?? 1)) * 100 : null;
  const postsWithMetrics = recentPosts.filter((post) => post.metricas && Object.keys(post.metricas).length > 0).length;

  const actions = useMemo(() => {
    const next: Array<{ title: string; text: string; priority: "alta" | "media" | "baixa" }> = [];
    if (!overview?.instagramConnected) {
      next.push({ title: "Conectar Instagram", text: "Sem conexão ativa não dá para aprender com audiência e conteúdo reais.", priority: "alta" });
      return next;
    }
    if ((overview.followersDelta7d ?? 0) <= 0) next.push({ title: "Aumentar descoberta", text: "O crescimento de seguidores em 7 dias está parado ou negativo. Priorize Reels curtos com gancho forte e CTA para seguir.", priority: "alta" });
    if (profileConversion != null && profileConversion < 1.5) next.push({ title: "Otimizar perfil", text: `Só ${profileConversion.toFixed(1)}% do alcance virou visita ao perfil. Reforce promessa, prova e CTA nos conteúdos e na bio.`, priority: "alta" });
    const stories = formatStats.find((row) => row.key === "stories");
    if ((stories?.posts ?? 0) < 7) next.push({ title: "Aumentar Stories", text: "Há menos de 7 Stories registrados em 30 dias. Use sequência diária com prova, enquete/pergunta e CTA para DM.", priority: "media" });
    if ((overview.organicLeads30d ?? 0) === 0 && (overview.profileVisits30d ?? 0) > 0) next.push({ title: "Converter visitas em conversa", text: "Há visitas ao perfil, mas nenhum lead orgânico atribuído. Inclua CTA explícito para DM, orçamento ou demonstração.", priority: "alta" });
    if (bestPost) next.push({ title: "Criar continuação do vencedor", text: `Repita a lógica de “${bestPost.theme || bestPost.captionOuTexto?.slice(0, 55) || "melhor conteúdo"}” com novo gancho e mesma dor central.`, priority: "media" });
    if (postsWithMetrics < 4) next.push({ title: "Aumentar base de aprendizado", text: `Só ${postsWithMetrics} publicação(ões) recente(s) têm métricas. Atualize a coleta para liberar comparações mais confiáveis.`, priority: "baixa" });
    return next.slice(0, 5);
  }, [overview, profileConversion, formatStats, bestPost, postsWithMetrics]);

  async function refreshMetrics() {
    if (!tenantId || !token || refreshing) return;
    setRefreshing(true);
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const metricsResponse = await fetch(`/api/tenants/${tenantId}/content-performance/posts/atualizar-metricas`, { method: "POST", headers });
      const payload = await metricsResponse.json().catch(() => ({})) as { error?: string; atualizados?: number; erros?: number };
      if (!metricsResponse.ok) throw new Error(payload.error || "Não foi possível atualizar as métricas.");
      await fetch(`/api/tenants/${tenantId}/content-performance/insights/atualizar`, { method: "POST", headers }).catch(() => null);
      await load();
      toast({ title: "Instagram atualizado", description: `${payload.atualizados ?? 0} publicação(ões) atualizadas. ${payload.erros ?? 0} erro(s).` });
    } catch (cause) {
      toast({ title: "Falha ao atualizar Instagram", description: cause instanceof Error ? cause.message : "Falha inesperada.", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando Instagram Growth…</CardContent></Card>;

  return (
    <Card className="border-fuchsia-500/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /><CardTitle className="text-base">Instagram Growth</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Transforma Insights, conteúdo e CRM em próximas ações para crescer audiência e gerar conversas.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void refreshMetrics()} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar métricas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric icon={<Users className="h-4 w-4" />} label={`Meta ${n(followerGoal)}`} value={n(followers)} detail={`${followerProgress.toFixed(0)}% do próximo marco`} />
          <MiniMetric icon={<TrendingUp className="h-4 w-4" />} label="Visita ao perfil / alcance" value={pct(profileConversion)} detail={`${n(overview?.profileVisits30d)} visitas em 30 dias`} />
          <MiniMetric icon={<Target className="h-4 w-4" />} label="Engajados / alcance" value={pct(engagementRate)} detail={`${n(overview?.engagedAccounts30d)} contas engajadas`} />
          <MiniMetric icon={<MessageCircle className="h-4 w-4" />} label="Leads orgânicos" value={n(overview?.organicLeads30d)} detail={`${recentPosts.length} conteúdos em 30 dias`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {formatStats.map((row) => (
            <div key={row.key} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{row.label}</p>{bestFormat?.key === row.key ? <Badge>Melhor sinal</Badge> : <Badge variant="outline">{row.posts} publ.</Badge>}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Stat label="Alcance" value={n(row.reach)} />
                <Stat label="Views" value={n(row.views)} />
                <Stat label="Interações" value={n(row.engagements)} />
                <Stat label="Salvos + compartilhados" value={n(row.saves + row.shares)} />
              </div>
              {row.key === "stories" && (row.replies > 0 || row.linkClicks > 0) ? <p className="mt-2 text-[11px] text-muted-foreground">{n(row.replies)} respostas · {n(row.linkClicks)} cliques em link</p> : null}
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_.9fr]">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2"><Rocket className="h-4 w-4" /><p className="text-sm font-semibold">Próximas ações da IA</p></div>
            <div className="mt-3 space-y-2">
              {actions.map((action, index) => (
                <div key={`${action.title}-${index}`} className="rounded-md bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{action.title}</p><Badge variant={action.priority === "alta" ? "default" : "outline"}>{action.priority}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{action.text}</p>
                </div>
              ))}
              {!actions.length ? <p className="text-sm text-muted-foreground">Sem ação crítica agora. Continue alimentando o histórico para a IA comparar tendências.</p> : null}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2"><Video className="h-4 w-4" /><p className="text-sm font-semibold">Aprendizado do conteúdo</p></div>
            {bestPost ? (
              <div className="mt-3 rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Conteúdo com melhor sinal recente</p>
                <p className="mt-1 text-sm font-semibold">{bestPost.theme || bestPost.captionOuTexto?.slice(0, 90) || "Conteúdo publicado"}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>{formatKey(bestPost.contentType)}</span><span>·</span><span>score {n(postScore(bestPost.metricas))}</span><span>·</span><span>{n(bestPost.metricas?.shares)} compartilhamentos</span><span>·</span><span>{n(bestPost.metricas?.saved)} salvos</span></div>
              </div>
            ) : null}
            {learning?.aprendizados ? (
              <div className="mt-3 space-y-2 text-xs">
                <p><strong>Formato:</strong> {learning.aprendizados.formatoQueMaisEngaja || "Em aprendizado"}</p>
                {learning.aprendizados.temasQueFuncionam?.length ? <p><strong>Temas fortes:</strong> {learning.aprendizados.temasQueFuncionam.slice(0, 3).join(" · ")}</p> : null}
                {learning.aprendizados.observacoes ? <p className="text-muted-foreground">{learning.aprendizados.observacoes}</p> : null}
              </div>
            ) : <p className="mt-3 text-xs text-muted-foreground">Com 4+ conteúdos com métricas, o VendorAI começa a consolidar aprendizados de tema e formato.</p>}
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" onClick={() => window.location.assign("/content?tab=conteudos")}><Video className="mr-1.5 h-4 w-4" />Criar próximo conteúdo</Button>
              <Button size="sm" variant="outline" onClick={() => window.location.assign("/content?tab=campanhas")}><Share2 className="mr-1.5 h-4 w-4" />Planejar distribuição</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><p className="mt-1 text-xl font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{detail}</p></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}
