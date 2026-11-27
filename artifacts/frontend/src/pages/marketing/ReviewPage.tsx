import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MediaPlanReviewWorkspace from "@/components/video/MediaPlanReviewWorkspace";

const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type CalendarItem = {
  id: string;
  tipo: string;
  canal: string;
  temaSugerido: string;
  status: string;
  campanhaId?: string | null;
  pilar?: string | null;
  mediaPlanId?: string | null;
  contentGenerationId?: string | null;
};

type Campaign = { id: string; nome: string; pilar?: string | null };
type Plan = {
  id: string;
  conteudo?: { periodoDias?: number; campanhas?: Campaign[] | null } | null;
};

type Asset = {
  id: string;
  type: string;
  source?: string | null;
  storageUrl?: string | null;
  url?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown> | null;
};

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as { id?: string | null };
      if (override?.id) return override.id;
    }
  } catch {
    // cache inválido
  }
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return "";
    const user = JSON.parse(raw) as { tenantId?: string | null };
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function campaignForItem(plan: Plan, item: CalendarItem): Campaign | undefined {
  const campaigns = plan.conteudo?.campanhas ?? [];
  if (item.campanhaId) {
    const byId = campaigns.find((campaign) => campaign.id === item.campanhaId);
    if (byId) return byId;
  }
  const pillar = String(item.pilar ?? "").split(" · ")[0]?.trim().toLowerCase();
  if (pillar) {
    const byPillar = campaigns.find((campaign) => String(campaign.nome ?? "").trim().toLowerCase() === pillar);
    if (byPillar) return byPillar;
  }
  return campaigns[0];
}

export default function MarketingReviewPage() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const pieceId = params?.id ?? location.split("/marketing/revisao/")[1]?.split(/[/?#]/)[0] ?? "";
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    if (!pieceId) {
      setState("missing");
      return;
    }
    let active = true;

    void (async () => {
      try {
        const tenantId = currentTenantId();
        if (!tenantId) {
          setState("missing");
          return;
        }
        const [calendarResponse, planResponse, assetsResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" }),
          fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders(), cache: "no-store" }),
          fetch(`/api/tenants/${tenantId}/media/assets?limit=80`, { headers: authHeaders(), cache: "no-store" }),
        ]);

        const calendar = calendarResponse.ok ? await calendarResponse.json() as CalendarItem[] : [];
        const plan = planResponse.ok ? await planResponse.json() as Plan | null : null;
        const assetsBody = assetsResponse.ok ? await assetsResponse.json() as { assets?: Asset[] } : {};
        const item = (Array.isArray(calendar) ? calendar : []).find((entry) => entry.id === pieceId);
        if (!active) return;
        if (!item) {
          setState("missing");
          return;
        }

        const campaign = plan ? campaignForItem(plan, item) : undefined;
        const references = (assetsBody.assets ?? [])
          .filter((asset) => ["image", "video"].includes(asset.type) && (!asset.source || asset.source === "upload" || asset.source === "imported"))
          .slice(0, 4)
          .map((asset, index) => ({
            assetId: asset.id,
            type: asset.type,
            role: "auto",
            importance: index === 0 ? "preferred" : "reference",
            order: index,
            originalFilename: asset.originalFilename ?? null,
            storageUrl: asset.storageUrl ?? asset.url ?? "",
            mimeType: asset.mimeType ?? null,
            metadata: asset.metadata ?? null,
          }))
          .filter((asset) => Boolean(asset.storageUrl));

        sessionStorage.setItem(MEDIA_PLAN_EXECUTION_KEY, JSON.stringify({
          source: "media-calendar",
          tenantId,
          mediaPlanId: plan?.id ?? item.mediaPlanId ?? undefined,
          periodoDias: plan?.conteudo?.periodoDias,
          campaign,
          calendarItem: item,
          referenceMedia: references,
          savedAt: new Date().toISOString(),
        }));
        if (active) setState("ready");
      } catch {
        if (active) setState("error");
      }
    })();

    return () => { active = false; };
  }, [pieceId]);

  if (state === "ready") return <MediaPlanReviewWorkspace key={pieceId} />;

  if (state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Carregando revisão do material…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 py-16 text-center">
      <p className="text-sm font-semibold">{state === "missing" ? "Peça não encontrada" : "Não foi possível abrir a revisão"}</p>
      <p className="text-xs text-muted-foreground">
        {state === "missing"
          ? "O conteúdo pode ter sido removido ou pertence a outro tenant."
          : "Tente novamente ou volte para a fila de conteúdos."}
      </p>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate("/content?tab=conteudos")}>Voltar aos conteúdos</Button>
        <Button size="sm" onClick={() => window.location.reload()}>Tentar de novo</Button>
      </div>
    </div>
  );
}
