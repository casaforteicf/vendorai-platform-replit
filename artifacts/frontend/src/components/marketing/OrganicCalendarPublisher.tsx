import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Globe2, Instagram, Linkedin, Loader2, Send, ShieldCheck } from "lucide-react";
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

type PublishPreview = {
  text: string;
  mediaUrls: string[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function previewData(generation: ContentGeneration | undefined, variationIdx = 0): PublishPreview {
  const variations = Array.isArray(generation?.result?.variations) ? generation!.result!.variations! : [];
  const raw = variations[variationIdx] ?? variations[0];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { text: "", mediaUrls: [] };
  const value = raw as Record<string, unknown>;
  const mediaUrls = [
    ...(Array.isArray(value.imageUrls) ? value.imageUrls.filter((url): url is string => typeof url === "string") : []),
    typeof value.imageUrl === "string" ? value.imageUrl : "",
    ...(Array.isArray(value.mediaUrls) ? value.mediaUrls.filter((url): url is string => typeof url === "string") : []),
    typeof value.videoUrl === "string" ? value.videoUrl : "",
  ].filter(Boolean);
  const text = [
    typeof value.hook === "string" ? value.hook : "",
    typeof value.caption === "string" ? value.caption : "",
    typeof value.text === "string" ? value.text : "",
    typeof value.cta === "string" ? value.cta : "",
    Array.isArray(value.hashtags) ? value.hashtags.filter((tag): tag is string => typeof tag === "string").join(" ") : "",
  ].filter(Boolean).join("\n\n");
  return { text, mediaUrls: Array.from(new Set(mediaUrls)) };
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

export function OrganicCalendarPublisher({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [history, setHistory] = useState<ContentHistory>({ items: [] });
  const [facebook, setFacebook] = useState<FacebookCapability | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const [path, query = ""] = pathname.split("?");
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const source = params.get("source") || params.get("from");
  const tab = params.get("tab") || "gerador";
  const visible = path === "/content" && tab === "gerador" && (source === "media-plan" || source === "media-calendar");

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`/api/tenants/${tenantId}/content-calendar`, { headers }),
      fetch(`/api/tenants/${tenantId}/content`, { headers }),
      fetch(`/api/tenants/${tenantId}/facebook-organic-capability`, { headers }),
    ]).then(async ([calendarResponse, contentResponse, facebookResponse]) => {
      const nextCalendar = calendarResponse.ok ? await calendarResponse.json() as CalendarItem[] : [];
      const nextHistory = contentResponse.ok ? await contentResponse.json() as ContentHistory : { items: [] };
      const nextFacebook = facebookResponse.ok ? await facebookResponse.json() as FacebookCapability : { ready: false };
      if (!cancelled) {
        setCalendar(Array.isArray(nextCalendar) ? nextCalendar : []);
        setHistory(nextHistory ?? { items: [] });
        setFacebook(nextFacebook);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token, visible]);

  const briefing = readBriefing();
  const generationById = useMemo(() => new Map((history.items ?? []).map((item) => [item.id, item])), [history.items]);
  const hasFacebookPlanned = useMemo(() => calendar.some((item) => {
    const channel = normalize(item.canal);
    return channel.includes("facebook") && item.status !== "recusado" && item.status !== "pulado";
  }), [calendar]);
  const items = useMemo(() => calendar.filter((item) => {
    if (item.status !== "aprovado" || !item.contentGenerationId) return false;
    if (briefing?.campaignName && !normalize(item.pilar).includes(normalize(briefing.campaignName))) return false;
    const channel = normalize(item.canal);
    if (item.tipo === "linkedin_post") return channel.includes("linkedin");
    if (channel.includes("facebook")) return ["feed", "carrossel"].includes(item.tipo);
    return ["feed", "stories", "carrossel"].includes(item.tipo) && channel.includes("instagram");
  }).slice(0, 12), [briefing?.campaignName, calendar]);

  if (!visible || (items.length === 0 && !loading && !hasFacebookPlanned)) return null;

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

  async function publish(item: CalendarItem) {
    if (!tenantId || !token || !item.contentGenerationId) return;
    const preview = previewData(generationById.get(item.contentGenerationId), item.variationIdx ?? 0);
    const channel = normalize(item.canal);
    const isLinkedIn = item.tipo === "linkedin_post" || channel.includes("linkedin");
    const isFacebook = channel.includes("facebook");

    if (isFacebook && !facebook?.ready) {
      toast({ title: "Facebook ainda não está pronto", description: facebookReason(facebook?.reason), variant: "destructive" });
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
          ? item.tipo === "carrossel" ? "carousel" : preview.mediaUrls.length ? "image" : "post"
          : item.tipo === "stories"
            ? "story"
            : item.tipo === "carrossel"
              ? "carousel"
              : "image";
      const response = await fetch(`/api/tenants/${tenantId}/social-publications/${provider}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: preview.text || item.temaSugerido,
          mediaUrl: preview.mediaUrls[0] || undefined,
          mediaUrls: preview.mediaUrls.length > 1 ? preview.mediaUrls : undefined,
          contentType,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "publish_failed");
      setSent((current) => new Set(current).add(item.id));
      const label = isLinkedIn ? "LinkedIn" : isFacebook ? "Facebook" : "Instagram";
      toast({ title: `Publicação enviada para ${label}`, description: "A peça entrou na fila nativa com retry automático." });
    } catch (error) {
      toast({ title: "Não foi possível publicar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
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
              <p className="mt-1 text-sm text-muted-foreground">Instagram, Facebook e LinkedIn usam a peça já aprovada e a mesma fila social, com retry automático e sem criar outra campanha.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Somente peças aprovadas aparecem aqui</div>
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
              Facebook pronto: <span className="font-semibold text-foreground">{facebook.pageName}</span> foi validada como a Page vinculada ao Instagram deste tenant.
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando peças aprovadas…</div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {items.map((item) => {
                const channel = normalize(item.canal);
                const isLinkedIn = item.tipo === "linkedin_post" || channel.includes("linkedin");
                const isFacebook = channel.includes("facebook");
                const label = isLinkedIn ? "LinkedIn" : isFacebook ? "Facebook" : "Instagram";
                const wasSent = sent.has(item.id);
                const disabled = busy === item.id || wasSent || (isFacebook && !facebook?.ready);
                return (
                  <div key={item.id} className="rounded-lg border bg-background/80 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isLinkedIn ? <Linkedin className="h-4 w-4" /> : isFacebook ? <Globe2 className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
                        <span className="text-xs font-semibold uppercase tracking-wide">{label} · {item.tipo}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{item.temaSugerido}</p>
                    </div>
                    <Button size="sm" variant={wasSent ? "outline" : "default"} disabled={disabled} onClick={() => void publish(item)}>
                      {busy === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : wasSent ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      {wasSent ? "Enviado" : isFacebook && !facebook?.ready ? "Meta pendente" : "Publicar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {hasFacebookPlanned && (
            <p className="text-[11px] text-muted-foreground">Facebook Stories/Reels permanecem fora desta etapa até o executor dedicado ser validado; Feed e Carrossel usam publicação nativa da Page.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
