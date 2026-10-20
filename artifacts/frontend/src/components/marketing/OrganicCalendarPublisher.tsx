import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Clock3, Globe2, Instagram, Linkedin, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

type CalendarItem = {
  id: string;
  pilar: string;
  temaSugerido: string;
  tipo: string;
  canal: string;
  status: string;
  contentGenerationId?: string | null;
  variationIdx?: number | null;
  contentIdPublicado?: string | null;
};

type ContentGeneration = {
  id: string;
  result?: { variations?: unknown[] } | null;
};

type ContentHistory = { items?: ContentGeneration[] };
type ActiveBriefing = { campaignName?: string };

type FacebookCapability = {
  ready: boolean;
  reason?: string;
  pageId?: string;
  pageName?: string;
  reconnectMeta?: boolean;
};

type SocialPublication = {
  id: string;
  provider: string;
  externalId?: string | null;
  status: string;
  publishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PublishPreview = {
  text: string;
  mediaUrls: string[];
  videoUrls: string[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function previewData(generation: ContentGeneration | undefined, variationIdx = 0): PublishPreview {
  const variations = Array.isArray(generation?.result?.variations) ? generation!.result!.variations! : [];
  const raw = variations[variationIdx] ?? variations[0];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { text: "", mediaUrls: [], videoUrls: [] };
  const value = raw as Record<string, unknown>;
  const videoUrls = [
    ...(Array.isArray(value.videoUrls) ? value.videoUrls.filter((url): url is string => typeof url === "string") : []),
    typeof value.videoUrl === "string" ? value.videoUrl : "",
  ].filter(Boolean);
  const mediaUrls = [
    ...(Array.isArray(value.imageUrls) ? value.imageUrls.filter((url): url is string => typeof url === "string") : []),
    typeof value.imageUrl === "string" ? value.imageUrl : "",
    ...(Array.isArray(value.mediaUrls) ? value.mediaUrls.filter((url): url is string => typeof url === "string") : []),
    ...videoUrls,
  ].filter(Boolean);
  const text = [
    typeof value.hook === "string" ? value.hook : "",
    typeof value.caption === "string" ? value.caption : "",
    typeof value.text === "string" ? value.text : "",
    typeof value.cta === "string" ? value.cta : "",
    Array.isArray(value.hashtags) ? value.hashtags.filter((tag): tag is string => typeof tag === "string").join(" ") : "",
  ].filter(Boolean).join("\n\n");
  return {
    text,
    mediaUrls: Array.from(new Set(mediaUrls)),
    videoUrls: Array.from(new Set(videoUrls)),
  };
}

function readBriefing(): ActiveBriefing | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_BRIEFING_KEY);
    return raw ? JSON.parse(raw) as ActiveBriefing : null;
  } catch {
    return null;
  }
}

function facebookReason(reason?: string) {
  if (reason === "meta_not_connected") return "Conecte a Meta para habilitar a Page do Facebook.";
  if (reason === "meta_token_expired") return "A conexão Meta expirou. Reconecte para renovar as permissões.";
  if (reason === "instagram_not_connected") return "Conecte o Instagram profissional para identificarmos a Page correspondente.";
  if (reason === "page_permission_missing") return "Reconecte a Meta uma vez para liberar as permissões de publicação da Page.";
  if (reason === "linked_page_not_found") return "A Meta não encontrou uma Page vinculada ao mesmo Instagram deste tenant.";
  return "Facebook orgânico ainda não está disponível para esta conexão.";
}

function calendarItemId(publication: SocialPublication) {
  const value = publication.metadata?.calendarItemId;
  return typeof value === "string" ? value : null;
}

export function OrganicCalendarPublisher({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [history, setHistory] = useState<ContentHistory>({ items: [] });
  const [facebook, setFacebook] = useState<FacebookCapability | null>(null);
  const [publications, setPublications] = useState<SocialPublication[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const [path, query = ""] = pathname.split("?");
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const source = params.get("source") || params.get("from");
  const tab = params.get("tab") || "gerador";
  const visible = path === "/content" && tab === "gerador" && (source === "media-plan" || source === "media-calendar");

  async function fetchPublications(headers: { Authorization: string }) {
    const response = await fetch(`/api/tenants/${tenantId}/social-publications`, { headers });
    if (!response.ok) throw new Error("social_publications_unavailable");
    const body = await response.json() as { publications?: SocialPublication[] };
    return Array.isArray(body.publications) ? body.publications : [];
  }

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`/api/tenants/${tenantId}/content-calendar`, { headers }),
      fetch(`/api/tenants/${tenantId}/content`, { headers }),
      fetch(`/api/tenants/${tenantId}/facebook-organic-capability`, { headers }),
      fetchPublications(headers),
    ]).then(async ([calendarResponse, contentResponse, facebookResponse, nextPublications]) => {
      if (!calendarResponse.ok || !contentResponse.ok || !facebookResponse.ok) throw new Error("marketing_calendar_unavailable");
      const nextCalendar = await calendarResponse.json() as CalendarItem[];
      const nextHistory = await contentResponse.json() as ContentHistory;
      const nextFacebook = await facebookResponse.json() as FacebookCapability;
      if (!cancelled) {
        setCalendar(Array.isArray(nextCalendar) ? nextCalendar : []);
        setHistory(nextHistory ?? { items: [] });
        setFacebook(nextFacebook);
        setPublications(nextPublications);
        setLoadError(false);
      }
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token, visible, refreshAttempt]);

  const hasActivePublication = publications.some((publication) => publication.status === "queued" || publication.status === "publishing");
  useEffect(() => {
    if (!visible || !tenantId || !token || !hasActivePublication) return;
    const headers = { Authorization: `Bearer ${token}` };
    const timer = window.setInterval(() => {
      void fetchPublications(headers).then(setPublications).catch(() => { setLoadError(true); });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActivePublication, tenantId, token, visible]);

  const briefing = readBriefing();
  const generationById = useMemo(() => new Map((history.items ?? []).map((item) => [item.id, item])), [history.items]);
  const publicationByCalendarId = useMemo(() => {
    const map = new Map<string, SocialPublication>();
    for (const publication of publications) {
      const itemId = calendarItemId(publication);
      if (itemId && !map.has(itemId)) map.set(itemId, publication);
    }
    return map;
  }, [publications]);
  const hasFacebookPlanned = useMemo(() => calendar.some((item) => {
    const channel = normalize(item.canal);
    return channel.includes("facebook") && item.status !== "recusado" && item.status !== "pulado";
  }), [calendar]);
  const items = useMemo(() => calendar.filter((item) => {
    if (!["aprovado", "gerado", "publicado"].includes(item.status) || !item.contentGenerationId) return false;
    if (briefing?.campaignName && !normalize(item.pilar).includes(normalize(briefing.campaignName))) return false;
    const channel = normalize(item.canal);
    if (item.tipo === "linkedin_post") return channel.includes("linkedin");
    if (channel.includes("facebook")) return ["feed", "carrossel", "stories", "reels"].includes(item.tipo);
    return ["feed", "stories", "carrossel"].includes(item.tipo) && channel.includes("instagram");
  }).slice(0, 12), [briefing?.campaignName, calendar]);

  if (!visible || (items.length === 0 && !loading && !loadError && !hasFacebookPlanned)) return null;

  async function reconnectMeta() {
    if (!token) return;
    setBusy("reconnect-meta");
    try {
      const response = await fetch("/api/auth/meta-ads", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "meta_reconnect_failed");
      window.location.href = body.url;
    } catch (error) {
      toast({ title: "Não foi possível iniciar a reconexão Meta", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      setBusy(null);
    }
  }

  async function refreshPublications() {
    if (!token || !tenantId) return;
    setPublications(await fetchPublications({ Authorization: `Bearer ${token}` }));
  }

  async function retry(publication: SocialPublication, item: CalendarItem) {
    if (!tenantId || !token) return;
    setBusy(item.id);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/social-publications/${publication.id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({})) as { publication?: SocialPublication; error?: string; detail?: string };
      if (!response.ok) throw new Error(body.detail || body.error || "retry_failed");
      await refreshPublications();
      toast({ title: body.publication?.status === "published" ? "Publicação concluída" : "Nova tentativa iniciada" });
    } catch (error) {
      await refreshPublications();
      toast({ title: "A nova tentativa falhou", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function publish(item: CalendarItem) {
    if (!tenantId || !token || !item.contentGenerationId) return;
    const preview = previewData(generationById.get(item.contentGenerationId), item.variationIdx ?? 0);
    const channel = normalize(item.canal);
    const isLinkedIn = item.tipo === "linkedin_post" || channel.includes("linkedin");
    const isFacebook = channel.includes("facebook");
    const isFacebookReel = isFacebook && item.tipo === "reels";
    const isFacebookStory = isFacebook && item.tipo === "stories";

    if (isFacebook && !facebook?.ready) {
      toast({ title: "Facebook ainda não está pronto", description: facebookReason(facebook?.reason), variant: "destructive" });
      return;
    }
    if (isFacebookReel && preview.videoUrls.length === 0) {
      toast({ title: "Reel sem vídeo aprovado", description: "O Facebook Reel exige um vídeo aprovado. Gere ou aprove a peça de vídeo antes de publicar.", variant: "destructive" });
      return;
    }
    if (isFacebookStory && preview.mediaUrls.length === 0) {
      toast({ title: "Story sem mídia aprovada", description: "O Facebook Story exige uma imagem ou vídeo aprovado.", variant: "destructive" });
      return;
    }
    if (!isLinkedIn && !isFacebook && preview.mediaUrls.length === 0) {
      toast({ title: "Peça sem mídia publicável", description: "A publicação no Instagram precisa de uma imagem ou vídeo aprovado.", variant: "destructive" });
      return;
    }

    setBusy(item.id);
    try {
      const provider = isLinkedIn ? "linkedin" : isFacebook ? "facebook" : "instagram";
      const contentType = isLinkedIn
        ? (preview.mediaUrls.length ? "image" : "post")
        : isFacebook
          ? item.tipo === "carrossel"
            ? "carousel"
            : item.tipo === "stories"
              ? "story"
              : item.tipo === "reels"
                ? "reel"
                : preview.mediaUrls.length ? "image" : "post"
          : item.tipo === "stories"
            ? "story"
            : item.tipo === "carrossel"
              ? "carousel"
              : "image";

      const facebookMediaUrl = isFacebookReel
        ? preview.videoUrls[0]
        : isFacebookStory
          ? (preview.videoUrls[0] || preview.mediaUrls[0])
          : preview.mediaUrls[0];
      const facebookMediaKind = isFacebookReel || (isFacebookStory && preview.videoUrls.includes(facebookMediaUrl || ""))
        ? "video"
        : isFacebookStory
          ? "image"
          : undefined;

      const response = await fetch(`/api/tenants/${tenantId}/social-publications/${provider}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: preview.text || item.temaSugerido,
          mediaUrl: isFacebook ? (facebookMediaUrl || undefined) : (preview.mediaUrls[0] || undefined),
          mediaUrls: isFacebook && (isFacebookStory || isFacebookReel)
            ? undefined
            : preview.mediaUrls.length > 1 ? preview.mediaUrls : undefined,
          contentType,
          mediaKind: isFacebook ? facebookMediaKind : undefined,
          calendarItemId: item.id,
          contentGenerationId: item.contentGenerationId,
        }),
      });
      const body = await response.json().catch(() => ({})) as { publication?: SocialPublication; error?: string };
      if (!response.ok || !body.publication) throw new Error(body.error || "publish_failed");
      setPublications((current) => [body.publication!, ...current.filter((publication) => publication.id !== body.publication!.id)]);
      const label = isLinkedIn ? "LinkedIn" : isFacebook ? "Facebook" : "Instagram";
      toast({ title: `Peça adicionada à fila do ${label}`, description: "O status muda para Publicado somente após confirmação real do canal." });
    } catch (error) {
      toast({ title: "Não foi possível iniciar a publicação", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-4 pt-4 md:px-6">
      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-600">Peças aprovadas</Badge>
                <Badge variant="outline">Publicação orgânica nativa</Badge>
              </div>
              <p className="mt-2 font-semibold">Publicar a campanha sem sair do Plano de Mídia</p>
              <p className="mt-1 text-sm text-muted-foreground">Instagram, Facebook e LinkedIn usam a peça já aprovada. O estado exibido vem da fila real e permanece após recarregar a página.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Publicado só após confirmação do canal</div>
          </div>

          {hasFacebookPlanned && facebook && !facebook.ready && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-amber-900">Facebook planejado, mas a Page ainda não está liberada</p>
                <p className="mt-1 text-xs text-amber-800">{facebookReason(facebook.reason)}</p>
              </div>
              {(facebook.reconnectMeta || facebook.reason === "meta_not_connected") && (
                <Button size="sm" variant="outline" disabled={busy === "reconnect-meta"} onClick={() => void reconnectMeta()}>
                  {busy === "reconnect-meta" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Globe2 className="mr-1.5 h-3.5 w-3.5" />}
                  {facebook.reason === "meta_not_connected" ? "Conectar Meta" : "Reconectar Meta"}
                </Button>
              )}
            </div>
          )}

          {facebook?.ready && facebook.pageName && (
            <div className="rounded-md border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              Facebook pronto: <span className="font-semibold text-foreground">{facebook.pageName}</span> foi validada como a Page vinculada ao Instagram deste tenant. Feed, Carrossel, Stories e Reels usam publicação nativa.
            </div>
          )}

          {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><span>Não foi possível conferir todos os dados de publicação. As ações ficam bloqueadas até uma nova verificação.</span><Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRefreshAttempt((attempt) => attempt + 1)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{loading ? "Verificando..." : "Verificar novamente"}</Button></div>}
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando peças aprovadas…</div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {items.map((item) => {
                const channel = normalize(item.canal);
                const isLinkedIn = item.tipo === "linkedin_post" || channel.includes("linkedin");
                const isFacebook = channel.includes("facebook");
                const label = isLinkedIn ? "LinkedIn" : isFacebook ? "Facebook" : "Instagram";
                const publication = publicationByCalendarId.get(item.id);
                const isPublished = publication?.status === "published" || item.status === "publicado";
                const isQueued = publication?.status === "queued";
                const isPublishing = publication?.status === "publishing";
                const isFailed = publication?.status === "failed";
                const disabled = loading || loadError || busy === item.id || isPublished || isQueued || isPublishing || (isFacebook && !facebook?.ready);

                return (
                  <div key={item.id} className="rounded-lg border bg-background/80 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isLinkedIn ? <Linkedin className="h-4 w-4" /> : isFacebook ? <Globe2 className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
                        <span className="text-xs font-semibold uppercase tracking-wide">{label} · {item.tipo}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{item.temaSugerido}</p>
                      {isPublished && <p className="mt-1 text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Publicado e confirmado pelo canal</p>}
                      {isQueued && <p className="mt-1 text-xs text-amber-700 flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Aguardando processamento</p>}
                      {isPublishing && <p className="mt-1 text-xs text-blue-700 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Publicando no canal</p>}
                      {isFailed && <p className="mt-1 text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />A tentativa falhou; a peça continua aprovada</p>}
                    </div>
                    {isFailed && publication ? (
                      <Button size="sm" variant="outline" disabled={loading || loadError || busy === item.id} onClick={() => void retry(publication, item)}>
                        {busy === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                        Tentar novamente
                      </Button>
                    ) : (
                      <Button size="sm" variant={isPublished ? "outline" : "default"} disabled={disabled} onClick={() => void publish(item)}>
                        {busy === item.id || isPublishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : isPublished ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : isQueued ? <Clock3 className="mr-1.5 h-3.5 w-3.5" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                        {isPublished ? "Publicado" : isPublishing ? "Publicando" : isQueued ? "Na fila" : isFacebook && !facebook?.ready ? "Meta pendente" : "Publicar"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasFacebookPlanned && facebook?.ready && (
            <p className="text-[11px] text-muted-foreground">Facebook: Feed, Carrossel, Stories e Reels são enviados para a Page validada pela conexão Meta deste tenant. Reels exigem vídeo aprovado; Stories preservam o tipo de mídia da peça.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}