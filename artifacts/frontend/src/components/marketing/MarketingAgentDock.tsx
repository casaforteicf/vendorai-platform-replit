import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, ShieldCheck, BrainCircuit, Layers3, Loader2, Gauge } from "lucide-react";
import { buildMarketingAgentUiCard, inferMarketingSurface } from "@workspace/vendor-brain/marketing-agent-ui";
import type { MarketingAgentPlan } from "@workspace/vendor-brain/marketing-agent";
import type { DesignQaResult } from "@workspace/vendor-brain/creative-design";
import { getChannelPublicationCapability } from "@workspace/vendor-brain/channel-publication";
import type { ChannelId } from "@workspace/vendor-brain/platform-foundation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";

const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

const MARKETING_PATH_HINTS = [
  "marketing",
  "campanh",
  "content",
  "conteudo",
  "media",
  "midia",
  "ads",
  "anuncio",
  "calendar",
  "calendario",
  "performance",
  "analytics",
  "site",
  "landing",
  "video",
  "planej",
];

function isMarketingPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return MARKETING_PATH_HINTS.some((hint) => path.includes(hint));
}

type ActiveBriefing = {
  tenantId?: string;
  campaignId?: string;
  campaignName?: string;
  marketingContext?: {
    businessVertical?: string;
    businessVerticalSlug?: string;
    audienceSegment?: string;
    audienceNiche?: string;
    campaignGoal?: string;
    nicheName?: string;
    productIds?: string[];
    productNames?: string[];
  };
};

type RuntimeResponse = {
  agentPlan?: MarketingAgentPlan;
};

type SiteSummary = { id: string; name?: string; updatedAt?: string };
type SiteDetail = { id: string; html?: string; name?: string; siteType?: string };
type ContentItem = {
  id: string;
  type?: string;
  theme?: string;
  productName?: string | null;
  result?: {
    variations?: Array<Record<string, unknown>>;
    designQa?: DesignQaResult;
  } | null;
};

function readActiveBriefing(tenantId: string): ActiveBriefing | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ACTIVE_BRIEFING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBriefing;
    return parsed.tenantId === tenantId ? parsed : null;
  } catch {
    return null;
  }
}

function isWebSurface(surface: string) {
  return surface === "site";
}

function isCreativeQaSurface(surface: string) {
  return surface === "site" || surface === "content" || surface === "video";
}

function contentText(item: ContentItem) {
  const variation = item.result?.variations?.[0] ?? {};
  return [
    item.theme,
    item.productName,
    variation.caption,
    variation.text,
    variation.title,
    variation.cta,
    variation.descricao,
    variation.titulo,
    Array.isArray(variation.hashtags) ? variation.hashtags.join(" ") : null,
    Array.isArray(variation.scenes) ? JSON.stringify(variation.scenes) : null,
    Array.isArray(variation.roteiro) ? JSON.stringify(variation.roteiro) : null,
  ].filter(Boolean).join("\n");
}

function channelCapabilityLabel(channel: ChannelId) {
  const capability = getChannelPublicationCapability(channel);
  switch (capability.mode) {
    case "paid-native":
      return "publica anúncio";
    case "organic-native":
      return "publica conteúdo";
    case "messaging-native":
      return "envia";
    case "prepare-only":
    default:
      return "prepara";
  }
}

function channelDisplayName(channel: string) {
  const names: Record<string, string> = {
    meta: "Meta",
    instagram: "Instagram",
    "google-search": "Google Search",
    "google-pmax": "Google PMax",
    tiktok: "TikTok",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    email: "Email",
  };
  return names[channel] ?? channel;
}

export function MarketingAgentDock({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [designQa, setDesignQa] = useState<DesignQaResult | null>(null);
  const [qaArtifactName, setQaArtifactName] = useState<string | null>(null);
  const [loadingQa, setLoadingQa] = useState(false);
  const visible = isMarketingPath(pathname);
  const card = useMemo(() => buildMarketingAgentUiCard(pathname, runtime?.agentPlan), [pathname, runtime]);
  const surface = useMemo(() => inferMarketingSurface(pathname), [pathname]);
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const tenantVertical = (user as { tenantVertical?: string | null } | null)?.tenantVertical ?? null;

  useEffect(() => {
    if (!open || !visible || !tenantId || !token) return;
    let cancelled = false;
    const active = readActiveBriefing(tenantId);
    const context = active?.marketingContext;

    setLoadingRuntime(true);
    fetch(`/api/tenants/${tenantId}/marketing-agent/runtime`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        verticalId: context?.businessVerticalSlug || context?.businessVertical || tenantVertical || null,
        campaignId: active?.campaignId ?? null,
        campaignName: active?.campaignName ?? null,
        page: surface,
        objective: context?.campaignGoal ?? null,
        audience: context?.audienceNiche || context?.audienceSegment || context?.nicheName || null,
        productIds: context?.productIds ?? [],
        productNames: context?.productNames ?? [],
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`runtime ${response.status}`);
        return response.json() as Promise<RuntimeResponse>;
      })
      .then((data) => { if (!cancelled) setRuntime(data); })
      .catch(() => { if (!cancelled) setRuntime(null); })
      .finally(() => { if (!cancelled) setLoadingRuntime(false); });

    return () => { cancelled = true; };
  }, [open, visible, tenantId, token, pathname, surface, tenantVertical]);

  useEffect(() => {
    if (!open || !visible || !tenantId || !token || !isCreativeQaSurface(surface)) {
      setDesignQa(null);
      setQaArtifactName(null);
      return;
    }

    let cancelled = false;
    const active = readActiveBriefing(tenantId);
    const context = active?.marketingContext;
    setLoadingQa(true);

    (async () => {
      if (isWebSurface(surface)) {
        const listResponse = await fetch(`/api/tenants/${tenantId}/site-generator?includeHtml=0`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!listResponse.ok) throw new Error(`sites ${listResponse.status}`);
        const rows = await listResponse.json() as SiteSummary[];
        const latest = Array.isArray(rows) ? rows[0] : null;
        if (!latest?.id) return;

        const detailResponse = await fetch(`/api/tenants/${tenantId}/site-generator/${latest.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!detailResponse.ok) throw new Error(`site ${detailResponse.status}`);
        const site = await detailResponse.json() as SiteDetail;
        if (!site?.html) return;

        const qaResponse = await fetch(`/api/tenants/${tenantId}/marketing-agent/design-qa`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "site",
            artifactId: site.id,
            persist: true,
            text: site.html,
            channel: "google-search",
            format: site.siteType || "landing",
            objective: context?.campaignGoal || "converter visitantes em contatos qualificados",
            campaignId: active?.campaignId ?? null,
            audience: context?.audienceNiche || context?.audienceSegment || context?.nicheName || null,
            cta: null,
            technicalValid: true,
          }),
        });
        if (!qaResponse.ok) throw new Error(`qa ${qaResponse.status}`);
        const qa = await qaResponse.json() as { designQa?: DesignQaResult };
        if (!cancelled) {
          setDesignQa(qa.designQa ?? null);
          setQaArtifactName(site.name || latest.name || "Site/LP");
        }
        return;
      }

      const contentResponse = await fetch(`/api/tenants/${tenantId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!contentResponse.ok) throw new Error(`content ${contentResponse.status}`);
      const payload = await contentResponse.json() as { items?: ContentItem[] };
      const items = Array.isArray(payload.items) ? payload.items : [];
      const latest = surface === "video"
        ? items.find((item) => item.type === "reels" || item.type === "youtube")
        : items.find((item) => item.type !== "reels" && item.type !== "youtube") ?? items[0];
      if (!latest) return;

      if (latest.result?.designQa) {
        if (!cancelled) {
          setDesignQa(latest.result.designQa);
          setQaArtifactName(latest.theme || (surface === "video" ? "Vídeo" : "Conteúdo"));
        }
        return;
      }

      const text = contentText(latest);
      if (!text) return;
      const variation = latest.result?.variations?.[0] ?? {};
      const qaResponse = await fetch(`/api/tenants/${tenantId}/marketing-agent/design-qa`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: surface === "video" ? "video" : "content",
          text,
          channel: "instagram",
          format: latest.type || surface,
          objective: context?.campaignGoal || `revisar ${surface === "video" ? "vídeo" : "conteúdo"}`,
          campaignId: active?.campaignId ?? null,
          audience: context?.audienceNiche || context?.audienceSegment || context?.nicheName || null,
          cta: typeof variation.cta === "string" ? variation.cta : null,
          technicalValid: surface === "video"
            ? Boolean(variation.videoUrl || variation.scenes || variation.roteiro)
            : true,
        }),
      });
      if (!qaResponse.ok) throw new Error(`qa ${qaResponse.status}`);
      const qa = await qaResponse.json() as { designQa?: DesignQaResult };
      if (!cancelled) {
        setDesignQa(qa.designQa ?? null);
        setQaArtifactName(latest.theme || (surface === "video" ? "Vídeo" : "Conteúdo"));
      }
    })()
      .catch(() => {
        if (!cancelled) {
          setDesignQa(null);
          setQaArtifactName(null);
        }
      })
      .finally(() => { if (!cancelled) setLoadingQa(false); });

    return () => { cancelled = true; };
  }, [open, visible, tenantId, token, surface]);

  if (!visible) return null;

  const skills = runtime?.agentPlan?.skills ?? [];
  const channels = runtime?.agentPlan?.channels ?? [];
  const autonomy = runtime?.agentPlan?.autonomy;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {open && (
        <Card className="pointer-events-auto w-[380px] max-w-[calc(100vw-2rem)] border-primary/20 bg-background/95 shadow-2xl backdrop-blur">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">{card.title}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Contexto: {surface}</Badge>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                {autonomy?.publishAds || autonomy?.publishContent ? "autonomia controlada" : "modo preparar"}
              </Badge>
              {loadingRuntime && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />contexto</Badge>}
            </div>

            {isCreativeQaSurface(surface) && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
                    <Gauge className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">Design QA {qaArtifactName ? `· ${qaArtifactName}` : ""}</span>
                  </div>
                  {loadingQa && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                </div>
                {designQa ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>Score geral</span>
                      <Badge variant={designQa.approved ? "secondary" : "destructive"}>{designQa.overallScore}/100</Badge>
                    </div>
                    <Progress value={designQa.overallScore} />
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>Marca {designQa.brandScore}</span>
                      <span>Leitura {designQa.readabilityScore}</span>
                      <span>Composição {designQa.compositionScore}</span>
                      <span>Canal {designQa.channelFitScore}</span>
                      <span>CTA {designQa.ctaScore}</span>
                      <span>Técnico {designQa.technicalScore}</span>
                    </div>
                    {designQa.warnings.length > 0 && (
                      <p className="text-[11px] leading-4 text-amber-600">{designQa.warnings[0]}</p>
                    )}
                  </div>
                ) : !loadingQa ? (
                  <p className="text-[11px] text-muted-foreground">Gere ou salve um artefato para executar a revisão automática.</p>
                ) : null}
              </div>
            )}

            {channels.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Capacidade por canal</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {channels.map((channel) => {
                    const typedChannel = channel as ChannelId;
                    const capability = getChannelPublicationCapability(typedChannel);
                    const action = channelCapabilityLabel(typedChannel);
                    return (
                      <div key={channel} className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-2.5 py-2 text-[11px]">
                        <span className="truncate font-medium">{channelDisplayName(channel)}</span>
                        <Badge variant={capability.canPublish ? "secondary" : "outline"}>{action}</Badge>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                  “Publica anúncio” e “publica conteúdo” indicam publisher nativo. “Envia” usa os fluxos oficiais de mensagem. “Prepara” cria a peça, mas não publica nesse canal ainda.
                </p>
              </div>
            )}

            {skills.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Skills ativas</p>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {skills.map((skill) => <Badge key={skill} variant="outline">{skill.replace(/^marketing\.|^creative\.|^channel\./, "")}</Badge>)}
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                <Layers3 className="h-3.5 w-3.5 text-primary" />
                Ações disponíveis nesta área
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{card.primaryAction}</Badge>
                {card.secondaryActions.map((action) => (
                  <Badge key={action} variant="outline">{action}</Badge>
                ))}
              </div>
            </div>

            <p className="text-[11px] leading-4 text-muted-foreground">
              O agente resolve ao vivo a campanha ativa, vertical, tenant e dados da tela. Brand Profile e tom aprendido continuam vindo das fontes oficiais. Publicação automática exige Design QA aprovado quando aplicável e autorização server-side; alterações de verba continuam protegidas por limites e autonomia.
            </p>
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        className="pointer-events-auto gap-2 rounded-full px-4 shadow-lg"
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles className="h-4 w-4" />
        Marketing AI
      </Button>
    </div>
  );
}