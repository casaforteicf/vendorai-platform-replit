import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { mediaUrl, type ProfessionalMediaAsset } from "./professional-video";

type Provider = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube";
type PublishMode = "now" | "schedule";

type MediaProject = {
  id: string;
  title: string;
  kind: string;
  status: string;
  context?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MediaProjectDetail = {
  project?: MediaProject;
  assets?: ProfessionalMediaAsset[];
};

type PublishableVideo = {
  projectId: string;
  assetId: string;
  title: string;
  url: string;
  seriesId: string;
  version: number;
  updatedAt: string;
  context: Record<string, unknown>;
  approvedAt: string;
  approvedAssetId: string;
};

type SocialConnection = {
  provider: "linkedin" | "tiktok" | "youtube";
  connected: boolean;
  configured?: boolean;
  accountName?: string | null;
};

type InstagramConnection = {
  connected?: boolean;
  publishReady?: boolean;
  username?: string | null;
  needsReconnect?: boolean;
  reason?: string;
};

type FacebookCapability = {
  ready?: boolean;
  pageName?: string | null;
  reason?: string;
  reconnectMeta?: boolean;
};

type Publication = {
  id: string;
  provider: string;
  status: string;
  externalId?: string | null;
  metrics?: Record<string, number> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PublicationResult = {
  publication?: Publication;
  publishing?: boolean;
  scheduled?: boolean;
};

type ChannelOption = {
  id: Provider;
  label: string;
  description: string;
};

const CHANNELS: ChannelOption[] = [
  { id: "instagram", label: "Instagram", description: "Publica como Reel" },
  { id: "facebook", label: "Facebook", description: "Publica como Reel" },
  { id: "tiktok", label: "TikTok", description: "Publica como vídeo curto" },
  { id: "youtube", label: "YouTube", description: "Publica como Short" },
  { id: "linkedin", label: "LinkedIn", description: "Publica como vídeo" },
];

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function absoluteMediaUrl(value: string): string {
  if (!value) return "";
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function outputVideo(detail: MediaProjectDetail): ProfessionalMediaAsset | null {
  return (detail.assets ?? []).find((asset) => asset.type === "video" && asset.role === "output") ?? null;
}

function statusLabel(status: string) {
  if (status === "published") return "Publicado";
  if (status === "processing") return "Processando no canal";
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

function friendlyError(code: string) {
  if (code === "connection_not_found" || code === "instagram_not_connected" || code === "meta_not_connected") return "Este canal ainda não está conectado.";
  if (code === "meta_token_expired") return "A conexão Meta expirou. Reconecte antes de publicar.";
  if (code === "page_permission_missing") return "Falta permissão de publicação da Página. Reconecte a Meta.";
  if (code === "linked_page_not_found") return "Não foi encontrada uma Página vinculada ao Instagram deste tenant.";
  if (code === "schedule_in_past") return "Escolha uma data e hora futuras para o agendamento.";
  if (code === "invalid_publication") return "Os dados da publicação estão incompletos ou inválidos.";
  if (code.includes("QUALITY_GATE")) return "A publicação foi bloqueada pela verificação de qualidade. Revise o vídeo antes de tentar novamente.";
  return code || "Não foi possível concluir a publicação.";
}

export default function VideoPublishPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [videos, setVideos] = useState<PublishableVideo[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [instagram, setInstagram] = useState<InstagramConnection>({});
  const [facebook, setFacebook] = useState<FacebookCapability>({});
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<Provider[]>([]);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [publicationIds, setPublicationIds] = useState<string[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.assetId === selectedAssetId) ?? videos[0] ?? null,
    [videos, selectedAssetId],
  );

  const approvedForPublication = Boolean(
    selectedVideo?.approvedAt && selectedVideo.approvedAssetId === selectedVideo.assetId,
  );

  const connectionMap = useMemo(() => {
    const map = new Map<Provider, { connected: boolean; name: string; detail?: string }>();
    map.set("instagram", {
      connected: Boolean(instagram.connected && instagram.publishReady !== false),
      name: instagram.username ? `@${instagram.username.replace(/^@/, "")}` : "Instagram",
      detail: instagram.reason,
    });
    map.set("facebook", {
      connected: Boolean(facebook.ready),
      name: facebook.pageName || "Facebook",
      detail: facebook.reason,
    });
    for (const option of socialConnections) {
      map.set(option.provider, {
        connected: Boolean(option.connected),
        name: option.accountName || option.provider,
        detail: option.configured === false ? "Integração não configurada" : undefined,
      });
    }
    return map;
  }, [instagram, facebook, socialConnections]);

  const loadVideos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects?limit=80`, { headers: authHeaders() });
      const body = await response.json().catch(() => ({})) as { projects?: MediaProject[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao carregar projetos");
      const candidates = (body.projects ?? [])
        .filter((project) => project.status === "ready" && ["video", "reel", "story", "mixed"].includes(project.kind))
        .filter((project) => Boolean(asRecord(project.context).guidedVideoSeriesId))
        .slice(0, 12);

      const details = await Promise.all(candidates.map(async (project) => {
        const detailResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, { headers: authHeaders() });
        if (!detailResponse.ok) return null;
        const detail = await detailResponse.json().catch(() => ({})) as MediaProjectDetail;
        const asset = outputVideo(detail);
        if (!asset) return null;
        const context = asRecord(detail.project?.context ?? project.context);
        const rawUrl = asset.storageUrl ?? asset.storage_url ?? "";
        if (!rawUrl) return null;
        return {
          projectId: project.id,
          assetId: asset.id,
          title: project.title,
          url: mediaUrl(rawUrl),
          seriesId: String(context.guidedVideoSeriesId ?? ""),
          version: Math.max(1, Number(context.guidedVideoVersion ?? 1) || 1),
          updatedAt: String(project.updatedAt ?? project.createdAt ?? ""),
          context,
          approvedAt: typeof context.publicationApprovedAt === "string" ? context.publicationApprovedAt : "",
          approvedAssetId: typeof context.publicationApprovedAssetId === "string" ? context.publicationApprovedAssetId : "",
        } satisfies PublishableVideo;
      }));

      const ready = details.filter((item): item is PublishableVideo => Boolean(item));
      setVideos(ready);
      setSelectedAssetId((current) => current && ready.some((item) => item.assetId === current) ? current : ready[0]?.assetId ?? "");
    } catch (error) {
      setVideos([]);
      toast({ title: "Não foi possível carregar os vídeos prontos", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  const loadConnections = useCallback(async () => {
    if (!tenantId) return;
    setConnectionsLoading(true);
    try {
      const [instagramResponse, facebookResponse, socialResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/instagram-connection`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/facebook-organic-capability`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/social-connections`, { headers: authHeaders() }),
      ]);
      const instagramBody = instagramResponse.ok ? await instagramResponse.json() as InstagramConnection : { connected: false };
      const facebookBody = facebookResponse.ok ? await facebookResponse.json() as FacebookCapability : { ready: false };
      const socialBody = socialResponse.ok ? await socialResponse.json() as { connections?: SocialConnection[] } : { connections: [] };
      setInstagram(instagramBody);
      setFacebook(facebookBody);
      setSocialConnections(Array.isArray(socialBody.connections) ? socialBody.connections : []);
    } finally {
      setConnectionsLoading(false);
    }
  }, [tenantId]);

  const refreshPublications = useCallback(async () => {
    if (!tenantId) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/social-publications`, { headers: authHeaders() });
      if (!response.ok) return;
      const body = await response.json() as { publications?: Publication[] };
      const currentIds = new Set(publicationIds);
      const studioItems = (body.publications ?? []).filter((item) => {
        const metadata = asRecord(item.metadata);
        return metadata.source === "video-studio" || currentIds.has(item.id);
      }).slice(0, 18);
      setPublications(studioItems);
    } catch {
      // O histórico é complementar; a criação/publicação continua funcionando.
    }
  }, [tenantId, publicationIds]);

  useEffect(() => {
    void loadVideos();
    void loadConnections();
  }, [loadVideos, loadConnections]);

  useEffect(() => {
    void refreshPublications();
  }, [refreshPublications]);

  const hasPendingPublication = publications.some((item) => ["queued", "publishing", "processing", "scheduled"].includes(item.status));
  useEffect(() => {
    if (!hasPendingPublication) return;
    const timer = window.setInterval(() => { void refreshPublications(); }, 4000);
    return () => window.clearInterval(timer);
  }, [refreshPublications, hasPendingPublication]);

  const toggleProvider = (provider: Provider) => {
    if (!approvedForPublication || !connectionMap.get(provider)?.connected) return;
    setSelectedProviders((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
  };

  const approveVideo = async () => {
    if (!tenantId || !selectedVideo || approving) return;
    setApproving(true);
    const approvedAt = new Date().toISOString();
    const nextContext = {
      ...selectedVideo.context,
      publicationApprovedAt: approvedAt,
      publicationApprovedAssetId: selectedVideo.assetId,
      publicationApprovalSource: "video-studio",
    };
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${selectedVideo.projectId}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ context: nextContext }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao aprovar vídeo");
      setVideos((current) => current.map((video) => video.projectId === selectedVideo.projectId ? {
        ...video,
        context: nextContext,
        approvedAt,
        approvedAssetId: selectedVideo.assetId,
      } : video));
      toast({ title: "Vídeo aprovado para publicação", description: "Agora escolha os canais e publique ou agende com segurança." });
    } catch (error) {
      toast({ title: "Não foi possível registrar a aprovação", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const retryPublication = async (publication: Publication) => {
    if (!tenantId || retryingId) return;
    setRetryingId(publication.id);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/social-publications/${publication.id}/retry`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json().catch(() => ({})) as { publication?: Publication; error?: string; detail?: string };
      if (!response.ok || !body.publication) throw new Error(body.detail || body.error || "Falha ao tentar novamente");
      toast({ title: body.publication.status === "published" ? "Publicação concluída" : "Nova tentativa iniciada" });
      await refreshPublications();
    } catch (error) {
      toast({ title: "A nova tentativa falhou", description: friendlyError(error instanceof Error ? error.message : String(error)), variant: "destructive" });
    } finally {
      setRetryingId("");
    }
  };

  const publish = async () => {
    if (!tenantId || !selectedVideo || submitting) return;
    if (!approvedForPublication) {
      toast({ title: "Aprove o vídeo antes de publicar", description: "Assista à versão final e confirme a aprovação para liberar os canais." });
      return;
    }
    if (selectedProviders.length === 0) {
      toast({ title: "Escolha pelo menos um canal", description: "Selecione onde este vídeo deve ser publicado." });
      return;
    }
    let scheduleIso: string | undefined;
    if (mode === "schedule") {
      if (!scheduledAt) {
        toast({ title: "Escolha a data e hora", description: "Informe quando a publicação deve acontecer." });
        return;
      }
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 30_000) {
        toast({ title: "Horário inválido", description: "Escolha um horário futuro para agendar." });
        return;
      }
      scheduleIso = date.toISOString();
    }

    setSubmitting(true);
    const created: Publication[] = [];
    const failures: string[] = [];
    const absoluteUrl = absoluteMediaUrl(selectedVideo.url);

    for (const provider of selectedProviders) {
      const contentType = provider === "instagram" || provider === "facebook"
        ? "reel"
        : provider === "linkedin"
          ? "video"
          : "short";
      try {
        const response = await fetch(`/api/tenants/${tenantId}/social-publications/${provider}`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            text: caption.trim() || undefined,
            mediaUrl: absoluteUrl,
            contentType,
            mediaKind: "video",
            scheduledAt: scheduleIso,
            mediaAssetId: selectedVideo.assetId,
            sourceProjectId: selectedVideo.projectId,
            sourceSeriesId: selectedVideo.seriesId || undefined,
            sourceVersion: selectedVideo.version,
          }),
        });
        const body = await response.json().catch(() => ({})) as PublicationResult & { error?: string; detail?: string };
        if (!response.ok || !body.publication) throw new Error(body.detail || body.error || `Falha em ${provider}`);
        created.push(body.publication);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${CHANNELS.find((item) => item.id === provider)?.label ?? provider}: ${friendlyError(message)}`);
      }
    }

    setSubmitting(false);
    if (created.length) {
      setPublicationIds(created.map((item) => item.id));
      setPublications((current) => [...created, ...current.filter((item) => !created.some((next) => next.id === item.id))].slice(0, 18));
      toast({
        title: mode === "schedule" ? "Publicação agendada" : "Publicação iniciada",
        description: `${created.length} canal${created.length === 1 ? "" : "is"} recebido${created.length === 1 ? "" : "s"} pela fila de publicação.`,
      });
    }
    if (failures.length) {
      toast({ title: "Alguns canais precisam de atenção", description: failures.join(" · "), variant: "destructive" });
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2"><Send className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">Publicar ou agendar</h2></div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Escolha um vídeo final, aprove a versão e publique sem sair do fluxo. O histórico continua visível depois de atualizar a página.</p>
        </div>
        <button type="button" onClick={() => { void loadVideos(); void loadConnections(); void refreshPublications(); }} disabled={loading || connectionsLoading} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          {loading || connectionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Procurando vídeos finalizados…</div>
      ) : !selectedVideo ? (
        <div className="px-5 py-10 text-center">
          <Video className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">Ainda não há um vídeo guiado pronto para publicar</p>
          <p className="mt-1 text-xs text-muted-foreground">Finalize uma versão V1, V2 ou V3 acima e clique em Atualizar.</p>
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <div className="space-y-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Vídeo final</span>
                <select value={selectedVideo.assetId} onChange={(event) => { setSelectedAssetId(event.target.value); setSelectedProviders([]); }} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                  {videos.map((video) => <option key={video.assetId} value={video.assetId}>{video.title} · V{video.version}</option>)}
                </select>
              </label>
              <div className="overflow-hidden rounded-2xl border border-border bg-black">
                <video src={selectedVideo.url} controls className="max-h-[420px] w-full bg-black" />
              </div>
              <div className={cn("rounded-xl border p-3", approvedForPublication ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.05]")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">{approvedForPublication ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <ShieldCheck className="h-4 w-4 text-amber-500" />}<p className="text-xs font-semibold text-foreground">{approvedForPublication ? "Aprovado para publicar" : "Aprovação final necessária"}</p></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{approvedForPublication ? `Esta versão foi aprovada em ${new Date(selectedVideo.approvedAt).toLocaleString("pt-BR")}.` : "Assista ao vídeo acima. Ao aprovar, os canais de publicação serão liberados."}</p>
                  </div>
                  {!approvedForPublication && <button type="button" onClick={() => void approveVideo()} disabled={approving} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Aprovar vídeo</button>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Onde publicar</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {CHANNELS.map((channel) => {
                    const connection = connectionMap.get(channel.id);
                    const connected = Boolean(connection?.connected);
                    const selected = selectedProviders.includes(channel.id);
                    return (
                      <button key={channel.id} type="button" onClick={() => toggleProvider(channel.id)} disabled={!approvedForPublication || !connected || connectionsLoading} className={cn("rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55", selected ? "border-primary/45 bg-primary/[0.07]" : "border-border bg-background/40 hover:border-primary/25")}>
                        <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-foreground">{channel.label}</span>{connected ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}</div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{connected ? `${connection?.name || channel.label} · ${channel.description}` : "Não conectado"}</p>
                      </button>
                    );
                  })}
                </div>
                {CHANNELS.some((channel) => !connectionMap.get(channel.id)?.connected) && <button type="button" onClick={() => navigate("/configuracoes?tab=integracoes")} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Conectar canais<ExternalLink className="h-3.5 w-3.5" /></button>}
              </div>

              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Legenda / texto da publicação</span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={4} placeholder="Opcional. Escreva a legenda ou deixe em branco para publicar somente o vídeo." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>

              <div>
                <p className="text-xs font-medium text-muted-foreground">Quando publicar</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMode("now")} className={cn("rounded-xl border px-3 py-2.5 text-sm font-semibold", mode === "now" ? "border-primary/45 bg-primary/[0.07] text-primary" : "border-border text-muted-foreground")}><Send className="mr-1.5 inline h-4 w-4" />Agora</button>
                  <button type="button" onClick={() => setMode("schedule")} className={cn("rounded-xl border px-3 py-2.5 text-sm font-semibold", mode === "schedule" ? "border-primary/45 bg-primary/[0.07] text-primary" : "border-border text-muted-foreground")}><CalendarClock className="mr-1.5 inline h-4 w-4" />Agendar</button>
                </div>
                {mode === "schedule" && <label className="mt-2 block space-y-1.5"><span className="text-[11px] text-muted-foreground">Data e hora local</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} min={localDateTimeValue(new Date(Date.now() + 60_000))} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>}
              </div>

              <button type="button" onClick={() => void publish()} disabled={!approvedForPublication || submitting || selectedProviders.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "schedule" ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {submitting ? "Enviando…" : mode === "schedule" ? `Agendar em ${selectedProviders.length || 0} canal${selectedProviders.length === 1 ? "" : "is"}` : `Publicar em ${selectedProviders.length || 0} canal${selectedProviders.length === 1 ? "" : "is"}`}
              </button>
            </div>
          </div>

          {publications.length > 0 && (
            <div className="rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-sm font-semibold text-foreground">Histórico de publicação</p></div>
              <p className="mt-1 text-xs text-muted-foreground">Acompanhe publicações recentes deste Video Studio, inclusive depois de recarregar a página.</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {publications.map((publication) => {
                  const metadata = asRecord(publication.metadata);
                  return (
                    <div key={publication.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold capitalize text-foreground">{publication.provider}</p><span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", statusClass(publication.status))}>{statusLabel(publication.status)}</span></div>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">{["queued", "publishing", "processing", "scheduled"].includes(publication.status) ? <Clock3 className="h-3.5 w-3.5" /> : publication.status === "published" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}{publication.status === "scheduled" && typeof metadata.scheduledAt === "string" ? `Programado para ${new Date(metadata.scheduledAt).toLocaleString("pt-BR")}` : statusLabel(publication.status)}</div>
                      {publication.status === "failed" && <button type="button" onClick={() => void retryPublication(publication)} disabled={Boolean(retryingId)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">{retryingId === publication.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Tentar novamente</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
