import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Images,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Radio,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-marketing-overview";
const HIDDEN_ATTR = "data-vendorai-marketing-overview-hidden";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

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
    if (!child.hasAttribute(HIDDEN_ATTR)) {
      child.setAttribute(HIDDEN_ATTR, child.style.display || "__empty__");
    }
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
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.06] via-background to-background">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <LayoutDashboard className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Visão geral do Marketing</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Sua central para planejar, executar e acompanhar todas as campanhas</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Esta tela mostra o Marketing como um todo. O planejamento gera uma ou mais campanhas; depois você abre cada campanha individualmente para preparar conteúdos, publicar, rastrear contatos e acompanhar resultados.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/content?tab=planejamento")}><CalendarDays className="mr-2 h-4 w-4" />Planejamento</Button>
              <Button onClick={() => navigate("/content?tab=campanhas")}><Megaphone className="mr-2 h-4 w-4" />Campanhas</Button>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: Target, title: "1. Planejar", text: "Defina objetivo, público, oferta, canais e orçamento." },
              { icon: Megaphone, title: "2. Executar", text: "Transforme o plano em campanhas independentes." },
              { icon: Images, title: "3. Criar e publicar", text: "Produza peças, anúncios, páginas, vídeos e mensagens." },
              { icon: BarChart3, title: "4. Medir e melhorar", text: "Acompanhe origem, CRM, resultados e próximos ciclos." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border bg-background/85 p-3">
                <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{title}</p></div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && !plan ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando campanhas…</CardContent></Card>
      ) : error ? (
        <Card className="border-amber-300 bg-amber-50/50"><CardContent className="flex items-start gap-3 py-5 text-amber-900"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Não foi possível carregar a visão geral.</p><p className="mt-1 text-sm">{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Tentar novamente</Button></div></CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Campanhas no ciclo atual</p><p className="mt-1 text-2xl font-semibold">{summary.campaigns}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Canais planejados</p><p className="mt-1 text-2xl font-semibold">{summary.channels}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Peças em produção</p><p className="mt-1 text-2xl font-semibold">{summary.production}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Publicações concluídas</p><p className="mt-1 text-2xl font-semibold">{summary.published}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-base font-semibold">Campanhas geradas</p>{campaigns.length > 0 && <Badge variant="secondary">{campaigns.length}</Badge>}</div>
                  <p className="mt-1 text-sm text-muted-foreground">Escolha a campanha que quer trabalhar. Cada uma abre no seu próprio espaço de execução.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate("/content?tab=planejamento")}><CalendarDays className="mr-1.5 h-3.5 w-3.5" />Revisar planejamento</Button>
              </div>

              {campaignRows.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed p-7 text-center">
                  <CircleDashed className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="mt-3 font-semibold">Ainda não há campanhas geradas</p>
                  <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Comece pelo Planejamento. A IA prepara a estratégia e cria as campanhas que aparecerão aqui para você escolher e executar.</p>
                  <Button className="mt-4" onClick={() => navigate("/content?tab=planejamento")}>Começar planejamento<ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {campaignRows.map(({ campaign, items: campaignItems, published, production, ready, status }) => (
                    <div key={campaign.id} className="group rounded-xl border bg-background p-4 transition hover:border-primary/50 hover:shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={status.tone}>{status.label}</Badge>
                            {campaign.kpiPrincipal && <span className="text-[11px] text-muted-foreground">KPI: {campaign.kpiPrincipal}</span>}
                          </div>
                          <h3 className="mt-2 truncate text-base font-semibold">{campaign.nome}</h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{campaign.objetivo}</p>
                        </div>
                        <Button size="sm" onClick={() => openCampaign(campaign.id)}>Abrir campanha<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border bg-muted/10 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Produto / serviço</p><p className="mt-1 line-clamp-2 text-xs font-medium">{campaign.produtoServico}</p></div>
                        <div className="rounded-lg border bg-muted/10 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Público</p><p className="mt-1 line-clamp-2 text-xs font-medium">{campaign.publico}</p>{campaign.regiao && <p className="mt-0.5 text-[11px] text-muted-foreground">{campaign.regiao}</p>}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {campaign.canais.slice(0, 6).map((channel) => <Badge key={`${campaign.id}-${channel.canal}`} variant="outline" className="text-[10px]">{channel.canal}</Badge>)}
                        {campaign.canais.length > 6 && <Badge variant="secondary" className="text-[10px]">+{campaign.canais.length - 6}</Badge>}
                      </div>

                      <div className="mt-4 grid grid-cols-4 gap-2 border-t pt-3 text-center">
                        <div><p className="text-base font-semibold">{campaignItems.length}</p><p className="text-[10px] text-muted-foreground">ações</p></div>
                        <div><p className="text-base font-semibold">{ready}</p><p className="text-[10px] text-muted-foreground">a preparar</p></div>
                        <div><p className="text-base font-semibold">{production}</p><p className="text-[10px] text-muted-foreground">produção</p></div>
                        <div><p className="text-base font-semibold">{published}</p><p className="text-[10px] text-muted-foreground">publicadas</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <button type="button" onClick={() => navigate("/content?tab=conteudos")} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/40">
              <div className="flex items-center gap-2"><Images className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Conteúdos & Criativos</p></div><p className="mt-1 text-xs text-muted-foreground">Fila de produção, peças, vídeos, sites e aprovações.</p>
            </button>
            <button type="button" onClick={() => navigate("/content?tab=rastreamento")} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/40">
              <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Rastreamento</p></div><p className="mt-1 text-xs text-muted-foreground">Origem dos contatos e jornada até o CRM.</p>
            </button>
            <button type="button" onClick={() => navigate("/content?tab=resultados")} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/40">
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Resultados</p></div><p className="mt-1 text-xs text-muted-foreground">Performance das campanhas e aprendizado do próximo ciclo.</p>
            </button>
          </div>
        </>
      )}

      {loading && plan && <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Atualizando dados…</div>}
    </div>,
    host,
  );
}
