import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BarChart3, FileText, Loader2, Megaphone, MessageCircle, Rocket, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-media-plan-preparation-actions";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

type MediaPlan = {
  id: string;
  conteudo: {
    acoesImediatas?: string[];
    nomeCampanha?: string;
    ofertaCampanha?: string;
    periodoDias?: number;
    campanhas?: Array<{
      id: string;
      nome: string;
      objetivo: string;
      produtoServico: string;
      publico: string;
      regiao?: string;
      oferta: string;
      mensagemCentral: string;
      kpiPrincipal: string;
    }>;
  };
};

type ActionTarget = {
  label: string;
  route: string;
  kind: "lp" | "ads" | "messaging" | "content" | "analytics" | "research";
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function readSession() {
  const override = readJson<{ id?: string }>(OVERRIDE_KEY);
  const user = readJson<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return {
    token: localStorage.getItem(TOKEN_KEY) ?? "",
    tenantId: override?.id ?? user?.tenantId ?? "",
  };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function resolveActionTarget(action: string, planId: string): ActionTarget {
  const text = normalize(action);
  const common = `from=media-plan&mediaPlanId=${encodeURIComponent(planId)}&preparation=1`;

  if (text.includes("landing") || text.includes("pagina de destino") || text.includes("site") || text.includes("lp")) {
    return { label: "Criar / revisar LP", route: `/content?tab=campanhas&view=lp&${common}`, kind: "lp" };
  }
  if (text.includes("meta") || text.includes("google") || text.includes("ads") || text.includes("anuncio") || text.includes("pesquisa")) {
    return { label: "Abrir Ads", route: `/ads?${common}`, kind: "ads" };
  }
  if (text.includes("whatsapp") || text.includes("inside sales") || text.includes("crm") || text.includes("qualificacao") || text.includes("follow-up")) {
    return { label: "Configurar fluxo", route: `/conversas?${common}`, kind: "messaging" };
  }
  if (text.includes("metrica") || text.includes("cpl") || text.includes("cac") || text.includes("roas") || text.includes("conversao") || text.includes("acompanhar")) {
    return { label: "Abrir performance", route: `/analytics?${common}`, kind: "analytics" };
  }
  if (text.includes("keyword") || text.includes("concorrent") || text.includes("pesquisa de mercado")) {
    return { label: "Abrir análise", route: `/marketing/plano-de-midia?${common}`, kind: "research" };
  }
  return { label: "Produzir conteúdo", route: `/content?tab=gerador&${common}`, kind: "content" };
}

function ActionIcon({ kind }: { kind: ActionTarget["kind"] }) {
  if (kind === "lp") return <FileText className="h-4 w-4" />;
  if (kind === "ads") return <Megaphone className="h-4 w-4" />;
  if (kind === "messaging") return <MessageCircle className="h-4 w-4" />;
  if (kind === "analytics") return <BarChart3 className="h-4 w-4" />;
  if (kind === "research") return <Search className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

export function MediaPlanPreparationActionsBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const { tenantId, token } = readSession();

  const visible = useMemo(() => {
    const [path, query = ""] = location.split("?");
    const params = new URLSearchParams(query);
    return path === "/marketing/plano-de-midia"
      || path === "/marketing/media-plan"
      || path === "/plano-de-midia"
      || (path === "/content" && (params.get("tab") ?? "") === "planejamento");
  }, [location]);

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 350);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setHost(null);
      return;
    }
    let originalCard: HTMLElement | null = null;
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) {
      portalHost = document.createElement("div");
      portalHost.setAttribute(HOST_ATTR, "true");
    }

    const attach = () => {
      const title = Array.from(document.querySelectorAll<HTMLElement>("p"))
        .find((element) => element.textContent?.trim() === "Ações de preparação");
      const card = title?.closest<HTMLElement>("[data-slot='card']") ?? title?.closest<HTMLElement>(".rounded-xl") ?? title?.parentElement?.parentElement ?? null;
      if (!card?.parentElement || !portalHost) return;
      originalCard = card;
      originalCard.style.display = "none";
      if (portalHost.parentElement !== card.parentElement) card.insertAdjacentElement("afterend", portalHost);
      setHost((current) => current === portalHost ? current : portalHost);
    };

    attach();
    const timer = window.setInterval(attach, 500);
    return () => {
      window.clearInterval(timer);
      if (originalCard) originalCard.style.display = "";
      portalHost?.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/media-plan`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => response.ok ? response.json() as Promise<MediaPlan | null> : null)
      .then((data) => { if (!cancelled) setPlan(data); })
      .catch(() => { if (!cancelled) setPlan(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, tenantId, token]);

  function execute(action: string, index: number) {
    if (!plan) return;
    const campaign = plan.conteudo.campanhas?.[0];
    const target = resolveActionTarget(action, plan.id);
    const campaignName = campaign?.nome || plan.conteudo.nomeCampanha || "Campanha do período";
    const marketingContext = {
      nicheId: `media-plan:${plan.id}:preparation:${index}`,
      nicheName: action,
      productIds: campaign ? [`custom:media-plan:${campaign.id}`] : [],
      productNames: campaign?.produtoServico ? [campaign.produtoServico] : [],
      audienceSegment: campaign?.publico,
      audienceNiche: campaign?.publico,
      campaignGoal: action,
      locationRegion: campaign?.regiao,
      projectName: campaignName,
      specificDetails: [
        `Ação de preparação: ${action}`,
        campaign?.objetivo ? `Objetivo: ${campaign.objetivo}` : "",
        campaign?.oferta ? `Oferta: ${campaign.oferta}` : plan.conteudo.ofertaCampanha ? `Oferta: ${plan.conteudo.ofertaCampanha}` : "",
      ].filter(Boolean).join(" | "),
      mandatoryDifferentiators: campaign?.mensagemCentral,
      primaryKpi: campaign?.kpiPrincipal,
      campaignId: campaign?.id,
      campaignName,
    };

    sessionStorage.setItem(ACTIVE_BRIEFING_KEY, JSON.stringify({
      tenantId,
      campaignId: campaign?.id,
      campaignName,
      marketingContext,
    }));
    sessionStorage.setItem(MEDIA_PLAN_EXECUTION_KEY, JSON.stringify({
      source: "media-plan-preparation",
      tenantId,
      mediaPlanId: plan.id,
      preparationAction: action,
      preparationIndex: index,
      campaign: campaign ?? null,
      marketingContext,
      savedAt: new Date().toISOString(),
    }));

    window.location.assign(target.route);
  }

  if (!visible || !host || !plan) return null;
  const actions = plan.conteudo.acoesImediatas ?? [];

  return createPortal(
    <Card className="h-full border-primary/20">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" />Ações de preparação executáveis</p>
            <p className="mt-0.5 text-xs text-muted-foreground">A recomendação da IA abre diretamente o executor correspondente, mantendo o contexto do Plano de Mídia.</p>
          </div>
          <Badge variant="outline" className="shrink-0">{actions.length} ações</Badge>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando ações…</div>
        ) : actions.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">Nenhuma preparação pendente foi sugerida neste plano.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((action, index) => {
              const target = resolveActionTarget(action, plan.id);
              return (
                <div key={`${index}-${action}`} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex gap-2.5">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</div>
                      <div className="min-w-0">
                        <p className="text-sm leading-relaxed">{action}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><ActionIcon kind={target.kind} />Executor: {target.label}</div>
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => execute(action, index)}>
                      {target.label}<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>,
    host,
  );
}
