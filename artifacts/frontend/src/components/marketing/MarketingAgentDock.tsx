import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, ShieldCheck, BrainCircuit, Layers3, Loader2 } from "lucide-react";
import { buildMarketingAgentUiCard, inferMarketingSurface } from "@workspace/vendor-brain/marketing-agent-ui";
import type { MarketingAgentPlan } from "@workspace/vendor-brain/marketing-agent";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function MarketingAgentDock({ pathname }: { pathname: string }) {
  const { user, tenantOverride, token } = useAuth();
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
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

            {channels.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Canais considerados</p>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map((channel) => <Badge key={channel} variant="secondary">{channel}</Badge>)}
                </div>
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
              O agente resolve ao vivo a campanha ativa, vertical, tenant e dados da tela. Brand Profile e tom aprendido continuam vindo das fontes oficiais. Publicação e alteração de verba permanecem protegidas por permissão e autonomia.
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
