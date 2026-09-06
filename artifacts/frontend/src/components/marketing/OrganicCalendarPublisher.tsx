import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Instagram, Linkedin, Loader2, Send, ShieldCheck } from "lucide-react";
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

export function OrganicCalendarPublisher({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [history, setHistory] = useState<ContentHistory>({ items: [] });
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
    Promise.all([
      fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/tenants/${tenantId}/content`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([calendarResponse, contentResponse]) => {
      const nextCalendar = calendarResponse.ok ? await calendarResponse.json() as CalendarItem[] : [];
      const nextHistory = contentResponse.ok ? await contentResponse.json() as ContentHistory : { items: [] };
      if (!cancelled) {
        setCalendar(Array.isArray(nextCalendar) ? nextCalendar : []);
        setHistory(nextHistory ?? { items: [] });
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token, visible]);

  const briefing = readBriefing();
  const generationById = useMemo(() => new Map((history.items ?? []).map((item) => [item.id, item])), [history.items]);
  const items = useMemo(() => calendar.filter((item) => {
    if (item.status !== "aprovado" || !item.contentGenerationId) return false;
    if (briefing?.campaignName && !normalize(item.pilar).includes(normalize(briefing.campaignName))) return false;
    const channel = normalize(item.canal);
    if (item.tipo === "linkedin_post") return channel.includes("linkedin");
    return ["feed", "stories", "carrossel"].includes(item.tipo) && channel.includes("instagram");
  }).slice(0, 8), [briefing?.campaignName, calendar]);

  if (!visible || (items.length === 0 && !loading)) return null;

  async function publish(item: CalendarItem) {
    if (!tenantId || !token || !item.contentGenerationId) return;
    const preview = previewData(generationById.get(item.contentGenerationId), item.variationIdx ?? 0);
    const isLinkedIn = item.tipo === "linkedin_post";
    if (!isLinkedIn && preview.mediaUrls.length === 0) {
      toast({ title: "Peça sem mídia publicável", description: "A publicação no Instagram precisa de uma imagem ou vídeo aprovado.", variant: "destructive" });
      return;
    }
    setBusy(item.id);
    try {
      const provider = isLinkedIn ? "linkedin" : "instagram";
      const contentType = isLinkedIn
        ? (preview.mediaUrls.length ? "image" : "post")
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
      toast({ title: `Publicação enviada para ${isLinkedIn ? "LinkedIn" : "Instagram"}`, description: "A peça entrou na fila nativa com retry automático." });
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
              <p className="mt-1 text-sm text-muted-foreground">Instagram e LinkedIn usam a peça já aprovada. A publicação entra na fila social existente, com retry automático e sem criar outra campanha.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Somente peças aprovadas aparecem aqui</div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando peças aprovadas…</div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {items.map((item) => {
                const isLinkedIn = item.tipo === "linkedin_post";
                const wasSent = sent.has(item.id);
                return (
                  <div key={item.id} className="rounded-lg border bg-background/80 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isLinkedIn ? <Linkedin className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
                        <span className="text-xs font-semibold uppercase tracking-wide">{isLinkedIn ? "LinkedIn" : "Instagram"} · {item.tipo}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{item.temaSugerido}</p>
                    </div>
                    <Button size="sm" variant={wasSent ? "outline" : "default"} disabled={busy === item.id || wasSent} onClick={() => void publish(item)}>
                      {busy === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : wasSent ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      {wasSent ? "Enviado" : "Publicar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
