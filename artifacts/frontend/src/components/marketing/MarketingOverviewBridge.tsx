import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CircleDashed,
  Images,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Radio,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-marketing-overview";
const HIDDEN_ATTR = "data-vendorai-marketing-overview-hidden";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STYLE_ID = "vendorai-marketing-unified-design";
const ROOT_ATTR = "data-vendorai-marketing-root";
const TABS_ATTR = "data-vendorai-marketing-tabs";
const TOOLS_ATTR = "data-vendorai-marketing-tools";

type CampaignChannel = {
  canal: string;
  funcao?: string;
  etapaFunil?: string;
  formatos?: string[];
  frequencia?: string;
  quantidadeMateriais?: number;
  kpiPrincipal?: string;
};

type PlannedCampaign = {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral?: string;
  canais: CampaignChannel[];
  kpiPrincipal?: string;
  metaPrincipal?: string;
  coverUrl?: string;
};

type MediaPlan = {
  id: string;
  conteudo?: {
    periodoDias?: number;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: PlannedCampaign[];
  };
};

type CalendarStatus = "planejado" | "aprovado" | "recusado" | "gerado" | "publicado" | "pulado";
type CalendarItem = {
  id: string;
  mediaPlanId?: string | null;
  pilar?: string | null;
  canal?: string | null;
  status: CalendarStatus;
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
    tenantId: override?.id ?? user?.tenantId ?? "",
    token: localStorage.getItem(TOKEN_KEY) ?? "",
  };
}

function locationSnapshot() {
  return `${window.location.pathname}${window.location.search}`;
}

function isMarketingPath(location: string) {
  return location.split("?")[0] === "/content";
}

function isOverviewPath(location: string) {
  const [path, query = ""] = location.split("?");
  if (path !== "/content") return false;
  const tab = new URLSearchParams(query).get("tab");
  return !tab || tab === "visao-geral";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function campaignNameFromPilar(pilar: string) {
  return pilar.split(" · ")[0]?.trim() || pilar.trim();
}

function findOverviewPanel() {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  const byCopy = panels.find((panel) => {
    const text = panel.textContent ?? "";
    return text.includes("Sua jornada de marketing")
      || text.includes("Carregando a situação do marketing")
      || text.includes("Prepare as campanhas e os conteúdos")
      || text.includes("Crie o planejamento de marketing");
  });
  if (byCopy) return byCopy;
  return panels.find((panel) => panel.dataset.state === "active") ?? null;
}

function navigate(target: string) {
  window.history.pushState(window.history.state, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function hideOriginalChildren(panel: HTMLElement, portal: HTMLElement) {
  Array.from(panel.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child === portal) return;
    if (!child.hasAttribute(HIDDEN_ATTR)) child.setAttribute(HIDDEN_ATTR, child.style.display || "__empty__");
    child.style.display = "none";
  });
}

function restoreOriginalChildren(panel: HTMLElement | null) {
  if (!panel) return;
  panel.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((child) => {
    const previous = child.getAttribute(HIDDEN_ATTR);
    child.style.display = previous && previous !== "__empty__" ? previous : "";
    child.removeAttribute(HIDDEN_ATTR);
  });
}

function campaignStatus(planApproved: boolean, items: CalendarItem[]) {
  if (!planApproved) return { label: "Em revisão", tone: "secondary" as const };
  if (items.length === 0) return { label: "Planejada", tone: "outline" as const };
  const published = items.filter((item) => item.status === "publicado").length;
  const production = items.filter((item) => item.status === "gerado").length;
  const ready = items.filter((item) => item.status === "planejado" || item.status === "aprovado").length;
  if (published === items.length) return { label: "Concluída", tone: "secondary" as const };
  if (published > 0 || production > 0) return { label: "Em andamento", tone: "default" as const };
  if (ready > 0) return { label: "Pronta para preparar", tone: "outline" as const };
  return { label: "Planejada", tone: "outline" as const };
}

function ensureUnifiedMarketingStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body[data-vendorai-marketing-shell="true"] { overflow-x:hidden; }
    body[data-vendorai-marketing-shell="true"] [${ROOT_ATTR}] { min-width:0; }
    body[data-vendorai-marketing-shell="true"] [${ROOT_ATTR}] > div:first-child { max-width:1480px; margin-inline:auto; }
    body[data-vendorai-marketing-shell="true"] [${TABS_ATTR}] {
      display:flex !important;
      flex-wrap:nowrap !important;
      align-items:center;
      gap:6px;
      width:100%;
      min-width:0;
      overflow-x:auto;
      overflow-y:hidden;
      scrollbar-width:none;
      padding:4px;
      border:1px solid hsl(var(--border));
      border-radius:14px;
      background:hsl(var(--background));
    }
    body[data-vendorai-marketing-shell="true"] [${TABS_ATTR}]::-webkit-scrollbar { display:none; }
    body[data-vendorai-marketing-shell="true"] [${TABS_ATTR}] > [role="tab"] {
      flex:0 0 auto;
      min-height:40px;
      white-space:nowrap;
      border-radius:10px;
      padding-inline:14px;
      font-size:12px;
      font-weight:600;
      color:hsl(var(--muted-foreground));
    }
    body[data-vendorai-marketing-shell="true"] [${TABS_ATTR}] > [role="tab"][data-state="active"] {
      background:hsl(var(--accent));
      color:hsl(var(--foreground));
      box-shadow:none;
    }
    body[data-vendorai-marketing-shell="true"] [${TOOLS_ATTR}] { margin-top:10px !important; padding-top:10px !important; }
    body[data-vendorai-marketing-shell="true"] [role="tabpanel"] { min-width:0; }
    body[data-vendorai-marketing-shell="true"] [role="tabpanel"] > * { min-width:0; }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-card { border-radius:16px; }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-overview-grid { display:grid; gap:12px; grid-template-columns:repeat(4,minmax(0,1fr)); }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-grid { display:grid; gap:12px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-card { min-width:0; }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-card h3 { overflow-wrap:anywhere; }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-meta-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    body[data-vendorai-marketing-shell="true"] .vendor-marketing-bottom-links { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }

    @media (max-width: 1023px) {
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-overview-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-grid { grid-template-columns:1fr; }
    }

    @media (max-width: 767px) {
      body[data-vendorai-marketing-shell="true"] [${ROOT_ATTR}] > div:first-child { padding-left:12px !important; padding-right:12px !important; padding-top:14px !important; }
      body[data-vendorai-marketing-shell="true"] [${ROOT_ATTR}] h1 { font-size:22px !important; line-height:1.15 !important; }
      body[data-vendorai-marketing-shell="true"] [${ROOT_ATTR}] h1 + p { margin-top:4px; font-size:12px !important; line-height:1.45; }
      body[data-vendorai-marketing-shell="true"] [${TABS_ATTR}] {
        margin-top:12px;
        padding:3px 2px 6px;
        border:0;
        border-radius:0;
        background:transparent;
        scroll-snap-type:x proximity;
      }
      body[data-vendorai-marketing-shell="true"] [${TABS_ATTR}] > [role="tab"] {
        scroll-snap-align:start;
        min-height:38px;
        padding-inline:12px;
        border:1px solid hsl(var(--border));
        background:hsl(var(--background));
      }
      body[data-vendorai-marketing-shell="true"] [${TOOLS_ATTR}] { display:none !important; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-overview-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-overview-grid > * { min-height:86px; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-grid { gap:10px; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-meta-row { grid-template-columns:1fr; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-bottom-links { grid-template-columns:1fr; gap:8px; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-bottom-links > button { min-height:64px; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-hero-actions { display:grid !important; grid-template-columns:1fr 1fr; width:100%; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-hero-actions > button { width:100%; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-head { display:grid !important; grid-template-columns:1fr; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-head > button { width:100%; }
      body[data-vendorai-marketing-shell="true"] .vendor-marketing-campaign-title { font-size:18px !important; line-height:1.2 !important; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-campaign-guidance="sequence"] { overflow-x:auto; scroll-snap-type:x proximity; padding-bottom:4px; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-campaign-guidance="sequence"] > * { min-width:210px; scroll-snap-align:start; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-campaign-clarity="production-details"] button[data-vendorai-campaign-production-toggle] { padding:12px; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-campaign-production-metrics] { grid-template-columns:repeat(3,minmax(0,1fr)) !important; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-campaign-production-metrics] > div { padding:10px 8px; text-align:center; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-review-workspace] { margin-top:8px; }
      body[data-vendorai-marketing-shell="true"] [data-vendorai-review-drawer] { top:8px !important; right:8px !important; bottom:8px !important; left:8px !important; width:auto !important; max-width:none !important; border-radius:16px !important; }
    }
  `;
  document.head.appendChild(style);
}

function markMarketingShell(active: boolean) {
  ensureUnifiedMarketingStyle();
  document.body.dataset.vendoraiMarketingShell = active ? "true" : "false";
  if (!active) return;

  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1"));
  const marketingHeading = headings.find((heading) => normalize(heading.textContent ?? "") === "marketing");
  const root = marketingHeading?.closest<HTMLElement>("div.min-w-0") ?? marketingHeading?.parentElement?.parentElement ?? null;
  root?.setAttribute(ROOT_ATTR, "true");

  const tabLists = Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]'));
  const mainTabs = tabLists.find((tabList) => {
    const text = normalize(tabList.textContent ?? "");
    return text.includes("visao geral") && text.includes("planejamento") && text.includes("campanhas") && text.includes("conteudos");
  });
  mainTabs?.setAttribute(TABS_ATTR, "true");

  if (root) {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>("div"));
    const tools = candidates.find((node) => normalize(node.textContent ?? "").startsWith("ferramentas:"));
    tools?.setAttribute(TOOLS_ATTR, "true");
  }
}

export function MarketingOverviewBridge() {
  const [location, setLocation] = useState(locationSnapshot);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tenantId, token } = readSession();
  const visible = isOverviewPath(location);
  const marketingVisible = isMarketingPath(location);

  useEffect(() => {
    const update = () => setLocation(locationSnapshot());
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 250);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    markMarketingShell(marketingVisible);
    if (!marketingVisible) return;
    const timer = window.setInterval(() => markMarketingShell(true), 400);
    return () => window.clearInterval(timer);
  }, [marketingVisible, location]);

  useEffect(() => {
    if (!visible) {
      restoreOriginalChildren(panel);
      setPanel(null);
      setHost(null);
      return;
    }

    let portal = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portal) {
      portal = document.createElement("div");
      portal.setAttribute(HOST_ATTR, "true");
      portal.className = "space-y-4";
    }

    let currentPanel: HTMLElement | null = null;
    const attach = () => {
      const nextPanel = findOverviewPanel();
      if (!nextPanel || !portal) return;
      if (currentPanel && currentPanel !== nextPanel) restoreOriginalChildren(currentPanel);
      currentPanel = nextPanel;
      if (portal.parentElement !== nextPanel) nextPanel.appendChild(portal);
      hideOriginalChildren(nextPanel, portal);
      setPanel((value) => value === nextPanel ? value : nextPanel);
      setHost((value) => value === portal ? value : portal);
    };

    attach();
    const timer = window.setInterval(attach, 300);
    return () => {
      window.clearInterval(timer);
      restoreOriginalChildren(currentPanel);
      portal?.remove();
    };
  }, [visible]);

  async function load() {
    if (!visible || !tenantId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [planResponse, calendarResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers, cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers, cache: "no-store" }),
      ]);
      if (!planResponse.ok) throw new Error("Não foi possível carregar o planejamento atual.");
      if (!calendarResponse.ok) throw new Error("Não foi possível carregar a execução das campanhas.");
      const nextPlan = await planResponse.json() as MediaPlan | null;
      const calendar = await calendarResponse.json() as CalendarItem[];
      setPlan(nextPlan);
      setItems(nextPlan ? calendar.filter((item) => item.mediaPlanId === nextPlan.id) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o Marketing.");
      setPlan(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tenantId, token]);

  const campaigns = plan?.conteudo?.campanhas ?? [];
  const planApproved = plan?.conteudo?.statusPlanejamento === "aprovado";

  const campaignRows = useMemo(() => campaigns.map((campaign) => {
    const campaignItems = items.filter((item) => normalize(campaignNameFromPilar(item.pilar ?? "")) === normalize(campaign.nome));
    const published = campaignItems.filter((item) => item.status === "publicado").length;
    const production = campaignItems.filter((item) => item.status === "gerado").length;
    const ready = campaignItems.filter((item) => item.status === "planejado" || item.status === "aprovado").length;
    return {
      campaign,
      items: campaignItems,
      published,
      production,
      ready,
      status: campaignStatus(planApproved, campaignItems),
    };
  }), [campaigns, items, planApproved]);

  const summary = useMemo(() => {
    const channels = new Set(campaigns.flatMap((campaign) => campaign.canais.map((channel) => normalize(channel.canal))));
    const production = items.filter((item) => item.status === "gerado").length;
    const published = items.filter((item) => item.status === "publicado").length;
    return { campaigns: campaigns.length, channels: channels.size, production, published };
  }, [campaigns, items]);

  function openCampaign(campaignId: string) {
    if (!plan) return;
    const params = new URLSearchParams({
      source: "media-plan",
      tab: "campanhas",
      mediaPlanId: plan.id,
      campaignId,
    });
    navigate(`/content?${params.toString()}`);
  }

  if (!visible || !host) return null;

  return createPortal(
    <div className="space-y-4">
      <Card className="vendor-marketing-card overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.05] via-background to-background">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-1.5 flex items-center gap-2 text-primary">
                <LayoutDashboard className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">Visão geral do Marketing</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight md:text-2xl">Planeje, execute e acompanhe suas campanhas em um único fluxo</h2>
              <p className="mt-1.5 text-sm leading-5 text-muted-foreground">Veja o que está acontecendo agora, escolha uma campanha e avance para a próxima ação sem percorrer telas enormes.</p>
            </div>
            <div className="vendor-marketing-hero-actions flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/content?tab=planejamento")}><CalendarDays className="mr-2 h-4 w-4" />Planejamento</Button>
              <Button onClick={() => navigate("/content?tab=campanhas")}><Megaphone className="mr-2 h-4 w-4" />Campanhas</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && !plan ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando campanhas…</CardContent></Card>
      ) : error ? (
        <Card className="border-amber-300 bg-amber-50/50"><CardContent className="flex items-start gap-3 py-4 text-amber-900"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Não foi possível carregar a visão geral.</p><p className="mt-1 text-sm">{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Tentar novamente</Button></div></CardContent></Card>
      ) : (
        <>
          <div className="vendor-marketing-overview-grid">
            {[
              ["Campanhas", summary.campaigns],
              ["Canais", summary.channels],
              ["Em produção", summary.production],
              ["Publicadas", summary.published],
            ].map(([label, value]) => (
              <Card key={String(label)} className="vendor-marketing-card"><CardContent className="p-3.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>
            ))}
          </div>

          <Card className="vendor-marketing-card">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-base font-semibold">Campanhas geradas</p>{campaigns.length > 0 && <Badge variant="secondary">{campaigns.length}</Badge>}</div>
                  <p className="mt-1 text-xs text-muted-foreground">Abra uma campanha para trabalhar nela sem misturar as demais.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate("/content?tab=planejamento")}><CalendarDays className="mr-1.5 h-3.5 w-3.5" />Revisar planejamento</Button>
              </div>

              {campaignRows.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed p-6 text-center">
                  <CircleDashed className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="mt-3 font-semibold">Ainda não há campanhas geradas</p>
                  <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Comece pelo Planejamento para a IA preparar a estratégia e as campanhas.</p>
                  <Button className="mt-4" onClick={() => navigate("/content?tab=planejamento")}>Começar planejamento<ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="vendor-marketing-campaign-grid mt-4">
                  {campaignRows.map(({ campaign, items: campaignItems, published, production, ready, status }) => (
                    <div key={campaign.id} className="vendor-marketing-campaign-card rounded-xl border bg-background p-4 transition hover:border-primary/45 hover:shadow-sm">
                      <div className="mb-3 overflow-hidden rounded-lg border bg-muted/30">
                        {campaign.coverUrl ? (
                          <img src={campaign.coverUrl} alt="" className="h-32 w-full object-cover" />
                        ) : (
                          <div className="flex h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Megaphone className="h-4 w-4" />
                            Capa da campanha
                          </div>
                        )}
                      </div>
                      <div className="vendor-marketing-campaign-head flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={status.tone}>{status.label}</Badge>
                            {campaign.kpiPrincipal && <span className="text-[11px] text-muted-foreground">KPI: {campaign.kpiPrincipal}</span>}
                          </div>
                          <h3 className="vendor-marketing-campaign-title mt-2 text-base font-semibold">{campaign.nome}</h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{campaign.objetivo}</p>
                        </div>
                        <Button size="sm" onClick={() => openCampaign(campaign.id)}>Abrir campanha<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
                      </div>

                      <div className="vendor-marketing-meta-row mt-3">
                        <div className="rounded-lg bg-muted/35 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Produto / serviço</p><p className="mt-1 line-clamp-2 text-xs font-medium">{campaign.produtoServico}</p></div>
                        <div className="rounded-lg bg-muted/35 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Público</p><p className="mt-1 line-clamp-2 text-xs font-medium">{campaign.publico}</p>{campaign.regiao && <p className="mt-0.5 text-[11px] text-muted-foreground">{campaign.regiao}</p>}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {campaign.canais.slice(0, 5).map((channel) => <Badge key={`${campaign.id}-${channel.canal}`} variant="outline" className="text-[10px]">{channel.canal}</Badge>)}
                        {campaign.canais.length > 5 && <Badge variant="secondary" className="text-[10px]">+{campaign.canais.length - 5}</Badge>}
                      </div>

                      <div className="mt-3 border-t pt-3">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">Progresso</span>
                          <span className="font-medium">{published}/{campaignItems.length || 0} publicadas</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary transition-all" style={{ width: `${campaignItems.length ? Math.round((published / campaignItems.length) * 100) : 0}%` }} />
                        </div>
                        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                          <span className="text-muted-foreground">Próximo passo: </span>
                          <span className="font-medium">
                            {ready > 0 ? `Preparar ${ready} ${ready === 1 ? "ação" : "ações"}` : production > 0 ? `Revisar ${production} em produção` : campaignItems.length > 0 && published === campaignItems.length ? "Analisar resultados" : "Revisar campanha"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="vendor-marketing-bottom-links">
            <button type="button" onClick={() => navigate("/content?tab=conteudos")} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/40">
              <div className="flex items-center gap-2"><Images className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Conteúdos</p></div><p className="mt-1 text-xs text-muted-foreground">Produza, revise, aprove e publique.</p>
            </button>
            <button type="button" onClick={() => navigate("/content?tab=resultados")} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/40">
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Resultados</p></div><p className="mt-1 text-xs text-muted-foreground">Veja o que funcionou e o que melhorar.</p>
            </button>
          </div>
        </>
      )}

      {loading && plan && <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Atualizando dados…</div>}
    </div>,
    host,
  );
}
