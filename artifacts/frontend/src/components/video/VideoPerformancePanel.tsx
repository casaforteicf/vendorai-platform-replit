import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Metrics = Record<string, number>;

type Publication = {
  id: string;
  provider: string;
  status: string;
  externalId?: string | null;
  metrics?: Metrics | null;
  metadata?: Record<string, unknown> | null;
  publishedAt?: string | null;
  createdAt?: string | null;
};

type PerformancePost = {
  id: string;
  instagramMediaId: string;
  contentType: string;
  theme?: string | null;
  metricas?: Metrics | null;
  ultimaColetaEm?: string | null;
  ultimoErroMetricas?: string | null;
  publishedAt?: string | null;
};

type Learning = {
  temasQueFuncionam?: string[];
  temasQueNaoFuncionam?: string[];
  formatoQueMaisEngaja?: string;
  observacoes?: string;
};

type Insight = {
  aprendizados?: Learning | null;
  baseadoEmPosts?: number;
  atualizadoEm?: string | null;
};

type PerformanceRow = Publication & {
  resolvedMetrics: Metrics;
  title: string;
  version: number;
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function metric(metrics: Metrics, ...keys: string[]) {
  for (const key of keys) {
    const value = number(metrics[key]);
    if (value) return value;
  }
  return 0;
}

function views(metrics: Metrics) {
  return metric(metrics, "views", "plays", "videoViews", "impressions");
}

function interactions(metrics: Metrics) {
  return ["likes", "comments", "saved", "shares", "replies", "linkClicks"]
    .reduce((sum, key) => sum + number(metrics[key]), 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function providerLabel(provider: string) {
  if (provider === "instagram") return "Instagram";
  if (provider === "facebook") return "Facebook";
  if (provider === "youtube") return "YouTube";
  if (provider === "tiktok") return "TikTok";
  if (provider === "linkedin") return "LinkedIn";
  return provider;
}

function statusLabel(status: string) {
  if (status === "published") return "Publicado";
  if (status === "processing") return "Processando";
  if (status === "publishing") return "Publicando";
  if (status === "queued") return "Na fila";
  if (status === "scheduled") return "Agendado";
  if (status === "failed") return "Falhou";
  return status || "Aguardando";
}

function statusClass(status: string) {
  if (status === "published") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "scheduled") return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export default function VideoPerformancePanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [posts, setPosts] = useState<PerformancePost[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [publicationResponse, postsResponse, insightResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/social-publications`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/content-performance/posts`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers: authHeaders() }),
      ]);

      const publicationBody = publicationResponse.ok ? await publicationResponse.json() as { publications?: Publication[] } : { publications: [] };
      const postsBody = postsResponse.ok ? await postsResponse.json() as PerformancePost[] : [];
      const insightBody = insightResponse.ok ? await insightResponse.json() as Insight | null : null;

      setPublications(Array.isArray(publicationBody.publications) ? publicationBody.publications : []);
      setPosts(Array.isArray(postsBody) ? postsBody : []);
      setInsight(insightBody && typeof insightBody === "object" ? insightBody : null);
    } catch (error) {
      toast({ title: "Não foi possível carregar os resultados", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<PerformanceRow[]>(() => {
    const instagramByExternalId = new Map(posts.map((post) => [post.instagramMediaId, post]));
    return publications
      .filter((publication) => asRecord(publication.metadata).source === "video-studio")
      .map((publication) => {
        const metadata = asRecord(publication.metadata);
        const instagramPost = publication.provider === "instagram" && publication.externalId
          ? instagramByExternalId.get(publication.externalId)
          : undefined;
        const resolvedMetrics = {
          ...(publication.metrics ?? {}),
          ...(instagramPost?.metricas ?? {}),
        };
        return {
          ...publication,
          resolvedMetrics,
          title: typeof metadata.sourceProjectTitle === "string" && metadata.sourceProjectTitle.trim()
            ? metadata.sourceProjectTitle.trim()
            : "Vídeo publicado",
          version: Math.max(1, Number(metadata.sourceVersion ?? 1) || 1),
        };
      })
      .sort((a, b) => new Date(b.publishedAt ?? b.createdAt ?? 0).getTime() - new Date(a.publishedAt ?? a.createdAt ?? 0).getTime());
  }, [publications, posts]);

  const publishedRows = rows.filter((row) => row.status === "published" || row.status === "processing");
  const withMetrics = publishedRows.filter((row) => Object.keys(row.resolvedMetrics).some((key) => number(row.resolvedMetrics[key]) > 0));
  const totalViews = withMetrics.reduce((sum, row) => sum + views(row.resolvedMetrics), 0);
  const totalReach = withMetrics.reduce((sum, row) => sum + metric(row.resolvedMetrics, "reach"), 0);
  const totalInteractions = withMetrics.reduce((sum, row) => sum + interactions(row.resolvedMetrics), 0);
  const activeChannels = new Set(publishedRows.map((row) => row.provider)).size;
  const learning = insight?.aprendizados ?? null;

  const refreshLearning = async () => {
    if (!tenantId || refreshing) return;
    setRefreshing(true);
    let metricMessage = "";
    let learningMessage = "";
    try {
      const metricsResponse = await fetch(`/api/tenants/${tenantId}/content-performance/posts/atualizar-metricas`, {
        method: "POST",
        headers: authHeaders(true),
        body: "{}",
      });
      const metricsBody = await metricsResponse.json().catch(() => ({})) as { atualizados?: number; erros?: number; error?: string };
      metricMessage = metricsResponse.ok
        ? `${metricsBody.atualizados ?? 0} publicação(ões) atualizada(s)`
        : metricsBody.error || "Métricas ainda não disponíveis";

      const insightResponse = await fetch(`/api/tenants/${tenantId}/content-performance/insights/atualizar`, {
        method: "POST",
        headers: authHeaders(true),
        body: "{}",
      });
      const insightBody = await insightResponse.json().catch(() => ({})) as Insight & { error?: string };
      learningMessage = insightResponse.ok
        ? "aprendizado atualizado"
        : insightBody.error || "aprendizado aguardando mais dados";

      await load();
      toast({ title: "Resultados revisados", description: `${metricMessage} · ${learningMessage}` });
    } catch (error) {
      toast({ title: "Não foi possível atualizar agora", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <section className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando resultados dos vídeos…</section>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">Resultados e aprendizado</h2></div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Acompanhe o que aconteceu depois da publicação. Quando há dados suficientes, a VendorAI transforma o desempenho real em aprendizado para os próximos roteiros e criativos.</p>
        </div>
        <button type="button" onClick={() => void refreshLearning()} disabled={refreshing} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar dados
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <BarChart3 className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">Os resultados aparecem depois da primeira publicação</p>
          <p className="mt-1 text-xs text-muted-foreground">Publique ou agende um vídeo acima. O histórico e os aprendizados ficam vinculados ao tenant.</p>
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-background/40 p-4"><p className="text-xs text-muted-foreground">Vídeos publicados</p><p className="mt-1 text-2xl font-semibold text-foreground">{publishedRows.length}</p><p className="mt-1 text-[11px] text-muted-foreground">em {activeChannels} canal{activeChannels === 1 ? "" : "is"}</p></div>
            <div className="rounded-2xl border border-border bg-background/40 p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" />Visualizações</div><p className="mt-1 text-2xl font-semibold text-foreground">{withMetrics.length ? formatNumber(totalViews) : "—"}</p><p className="mt-1 text-[11px] text-muted-foreground">dados disponíveis em {withMetrics.length}/{publishedRows.length}</p></div>
            <div className="rounded-2xl border border-border bg-background/40 p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Heart className="h-3.5 w-3.5" />Interações</div><p className="mt-1 text-2xl font-semibold text-foreground">{withMetrics.length ? formatNumber(totalInteractions) : "—"}</p><p className="mt-1 text-[11px] text-muted-foreground">curtidas, comentários, salvos e compartilhamentos</p></div>
            <div className="rounded-2xl border border-border bg-background/40 p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />Alcance</div><p className="mt-1 text-2xl font-semibold text-foreground">{withMetrics.length ? formatNumber(totalReach) : "—"}</p><p className="mt-1 text-[11px] text-muted-foreground">quando o canal disponibiliza essa métrica</p></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-2xl border border-border bg-background/30 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-foreground">Publicações recentes</p><span className="text-[11px] text-muted-foreground">{rows.length} registro{rows.length === 1 ? "" : "s"}</span></div>
              <div className="mt-3 space-y-2">
                {rows.slice(0, 8).map((row) => {
                  const rowViews = views(row.resolvedMetrics);
                  const rowInteractions = interactions(row.resolvedMetrics);
                  const hasMetrics = rowViews > 0 || rowInteractions > 0 || metric(row.resolvedMetrics, "reach") > 0;
                  return (
                    <div key={row.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><p className="text-sm font-semibold text-foreground">{providerLabel(row.provider)} · V{row.version}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{row.publishedAt ? new Date(row.publishedAt).toLocaleString("pt-BR") : "Aguardando conclusão"}</p></div>
                        <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", statusClass(row.status))}>{statusLabel(row.status)}</span>
                      </div>
                      {hasMetrics ? (
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{formatNumber(rowViews)} views</span>
                          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{formatNumber(metric(row.resolvedMetrics, "likes"))}</span>
                          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{formatNumber(metric(row.resolvedMetrics, "comments", "replies"))}</span>
                          <span className="inline-flex items-center gap-1"><Share2 className="h-3.5 w-3.5" />{formatNumber(metric(row.resolvedMetrics, "shares"))}</span>
                        </div>
                      ) : row.status === "published" ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">Métricas ainda não coletadas. No Instagram, a primeira leitura automática ocorre após aproximadamente 24 horas.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/[0.025] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BrainCircuit className="h-4.5 w-4.5" /></div>
                <div><p className="text-sm font-semibold text-foreground">O que a VendorAI aprendeu</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Este aprendizado é reaproveitado automaticamente nas próximas gerações de conteúdo.</p></div>
              </div>

              {learning ? (
                <div className="mt-4 space-y-3 text-xs">
                  {Array.isArray(learning.temasQueFuncionam) && learning.temasQueFuncionam.length > 0 && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3"><p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Abordagens que funcionam</p><p className="mt-1.5 leading-relaxed text-muted-foreground">{learning.temasQueFuncionam.join(" · ")}</p></div>}
                  {learning.formatoQueMaisEngaja && <div><p className="font-semibold text-foreground">Formato com melhor resposta</p><p className="mt-1 leading-relaxed text-muted-foreground">{learning.formatoQueMaisEngaja}</p></div>}
                  {Array.isArray(learning.temasQueNaoFuncionam) && learning.temasQueNaoFuncionam.length > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3"><p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Vale reformular</p><p className="mt-1.5 leading-relaxed text-muted-foreground">{learning.temasQueNaoFuncionam.join(" · ")}</p></div>}
                  {learning.observacoes && <div><p className="font-semibold text-foreground">Próximo aprendizado acionável</p><p className="mt-1 leading-relaxed text-muted-foreground">{learning.observacoes}</p></div>}
                  <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">Base: {insight?.baseadoEmPosts ?? 0} publicações com métricas{insight?.atualizadoEm ? ` · atualizado ${new Date(insight.atualizadoEm).toLocaleString("pt-BR")}` : ""}.</p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-center">
                  <p className="text-xs font-semibold text-foreground">Aprendizado ainda em formação</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">A VendorAI começa a comparar padrões quando há volume suficiente de publicações com métricas reais. Até lá, ela mantém as regras de qualidade e marca já aprovadas.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
