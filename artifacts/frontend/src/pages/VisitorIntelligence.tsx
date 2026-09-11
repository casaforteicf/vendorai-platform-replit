import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BellOff,
  BellRing,
  Clock3,
  Flame,
  Globe2,
  History,
  MapPin,
  MonitorSmartphone,
  MousePointerClick,
  Radio,
  RefreshCw,
  Repeat2,
  Route,
  Smartphone,
  Users,
} from "lucide-react";
import {
  getVisitorAlertsEnabled,
  getVisitorBrowserNotificationState,
  requestVisitorBrowserNotifications,
  setVisitorAlertsEnabled,
} from "@/lib/visitorIntelligence";

const API_BASE = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");

type VisitorSurface = "site" | "app" | "mobile" | "unknown";
type SessionStatus = "all" | "online" | "hot" | "identified" | "anonymous";
type ViewTab = "realtime" | "history" | "analytics";

type JourneyItem = {
  eventType: string;
  path: string | null;
  pageUrl: string | null;
  at: string | null;
  engagedMs: number | null;
  scrollDepth: number | null;
};

type IntentSummary = {
  score: number;
  tier: "baixo" | "medio" | "alto" | "muito_alto";
  tierLabel: string;
  recommendedAction: string;
  reasons: string[];
};

type VisitorSession = {
  sessionId: string;
  visitorId: string | null;
  surface: VisitorSurface;
  online: boolean;
  hotOpportunity: boolean;
  identified: boolean;
  identityType: "lead" | "user" | "anonymous";
  leadId: string | null;
  userId: string | null;
  currentPath: string | null;
  currentPageUrl: string | null;
  referrer: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  durationMs: number;
  pageViews: number;
  ctaClicks: number;
  formStarts: number;
  formSubmits: number;
  conversions: number;
  eventCount: number;
  maxScrollDepth: number;
  maxEngagedMs: number;
  intent: IntentSummary;
  geo: { country: string | null; region: string | null; city: string | null };
  device: { type: string | null; browser: string | null; os: string | null };
  source: string | null;
  medium: string | null;
  campaign: string | null;
  sourceLabel: string | null;
  journey: JourneyItem[];
};

type RankedItem = { label: string; value: number };
type DailyItem = { date: string; sessions: number; conversions: number; pageViews: number };

type VisitorResponse = {
  generatedAt: string;
  truncated: boolean;
  totals: {
    visitors: number;
    uniqueVisitors: number;
    returningVisitors: number;
    pageViews: number;
    conversions: number;
    onlineNow: number;
    identified: number;
    hotNow: number;
    siteVisitors: number;
    appVisitors: number;
    mobileVisitors: number;
    averageSessionDurationMs: number;
    averagePagesPerSession: number;
    averageIntent: number;
    conversionRate: number;
    identifiedRate: number;
  };
  analytics: {
    daily: DailyItem[];
    topSources: RankedItem[];
    topCities: RankedItem[];
    topCampaigns: RankedItem[];
    topPages: RankedItem[];
  };
  hotOpportunities: VisitorSession[];
  sessions: VisitorSession[];
};

function duration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function locationLabel(session: VisitorSession) {
  return [session.geo.city, session.geo.region, session.geo.country].filter(Boolean).join(" / ") || "Localização não disponível";
}

function sourceLabel(session: VisitorSession) {
  return session.sourceLabel || [session.source, session.medium, session.campaign].filter(Boolean).join(" · ") || session.referrer || "Direto / desconhecido";
}

function surfaceLabel(surface: VisitorSurface) {
  if (surface === "site") return "Site";
  if (surface === "app") return "App Web";
  if (surface === "mobile") return "App Mobile";
  return "Não classificado";
}

function intentClass(tier: IntentSummary["tier"]) {
  if (tier === "muito_alto") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (tier === "alto") return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (tier === "medio") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function matchesStatus(session: VisitorSession, status: SessionStatus) {
  if (status === "online") return session.online;
  if (status === "hot") return session.hotOpportunity;
  if (status === "identified") return session.identified;
  if (status === "anonymous") return !session.identified;
  return true;
}

function matchesSearch(session: VisitorSession, query: string) {
  if (!query) return true;
  const haystack = [
    session.sessionId,
    session.visitorId,
    session.currentPath,
    session.referrer,
    session.geo.city,
    session.geo.region,
    session.geo.country,
    session.source,
    session.medium,
    session.campaign,
    session.sourceLabel,
    session.device.type,
    session.device.browser,
    session.device.os,
    surfaceLabel(session.surface),
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
  return haystack.includes(query);
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    session_start: "Início da sessão",
    page_view: "Página visualizada",
    screen_view: "Tela visualizada",
    cta_click: "Clique em CTA",
    form_start: "Iniciou formulário",
    form_submit: "Enviou formulário",
    feature_use: "Usou recurso",
    search: "Pesquisa",
    login: "Login",
    signup: "Cadastro",
    conversion: "Conversão",
    engagement: "Engajamento",
    error: "Erro",
  };
  return labels[type] || type;
}

async function loadVisitors(minutes: number): Promise<VisitorResponse> {
  const token = window.localStorage.getItem("vendorai_token");
  if (!token) throw new Error("Sessão não autenticada");
  const response = await fetch(`${API_BASE}/visitor-intelligence?minutes=${minutes}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Falha ao carregar Visitor Intelligence");
  return response.json();
}

function Ranking({ title, items, empty = "Sem dados neste período" }: { title: string; items: RankedItem[]; empty?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="mt-4 space-y-3">
        {!items.length && <div className="text-sm text-muted-foreground">{empty}</div>}
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{item.label}</span>
              <span className="font-medium">{item.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VisitorIntelligence() {
  const [tab, setTab] = useState<ViewTab>("realtime");
  const [minutes, setMinutes] = useState(60);
  const [surface, setSurface] = useState<"all" | VisitorSurface>("all");
  const [status, setStatus] = useState<SessionStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabledState] = useState(() => getVisitorAlertsEnabled());
  const [browserPermission, setBrowserPermission] = useState(() => getVisitorBrowserNotificationState());

  const query = useQuery({
    queryKey: ["visitor-intelligence", minutes],
    queryFn: () => loadVisitors(minutes),
    refetchInterval: tab === "realtime" ? 15_000 : 60_000,
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredSessions = useMemo(() => (query.data?.sessions ?? []).filter((session) =>
    (surface === "all" || session.surface === surface)
    && matchesStatus(session, status)
    && matchesSearch(session, normalizedSearch),
  ), [query.data, surface, status, normalizedSearch]);

  const filteredHot = useMemo(() => filteredSessions.filter((session) => session.hotOpportunity), [filteredSessions]);
  const selected = useMemo(
    () => query.data?.sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [query.data, selectedSessionId],
  );

  const totals = query.data?.totals ?? {
    visitors: 0,
    uniqueVisitors: 0,
    returningVisitors: 0,
    pageViews: 0,
    conversions: 0,
    onlineNow: 0,
    identified: 0,
    hotNow: 0,
    siteVisitors: 0,
    appVisitors: 0,
    mobileVisitors: 0,
    averageSessionDurationMs: 0,
    averagePagesPerSession: 0,
    averageIntent: 0,
    conversionRate: 0,
    identifiedRate: 0,
  };

  const changeTab = (next: ViewTab) => {
    setTab(next);
    if (next === "realtime" && minutes > 1440) setMinutes(60);
    if (next !== "realtime" && minutes < 1440) setMinutes(7 * 24 * 60);
  };

  const toggleAlerts = () => {
    const next = !alertsEnabled;
    setVisitorAlertsEnabled(next);
    setAlertsEnabledState(next);
  };

  const enableBrowserNotifications = async () => {
    const result = await requestVisitorBrowserNotifications();
    setBrowserPermission(result);
  };

  const renderSessionList = () => (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="font-medium">{tab === "realtime" ? "Sessões agora e recentes" : "Histórico de sessões"}</h2>
            <p className="text-xs text-muted-foreground">{filteredSessions.length} sessão(ões) dentro dos filtros</p>
          </div>
          <button type="button" onClick={() => query.refetch()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-muted">
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
        <div className="divide-y">
          {query.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando visitantes…</div>}
          {query.isError && <div className="p-6 text-sm text-destructive">Não foi possível carregar os visitantes.</div>}
          {!query.isLoading && filteredSessions.length === 0 && <div className="p-6 text-sm text-muted-foreground">Nenhuma sessão neste filtro.</div>}
          {filteredSessions.map((session) => (
            <button
              type="button"
              key={session.sessionId}
              onClick={() => setSelectedSessionId(session.sessionId)}
              className={`grid w-full gap-2 px-4 py-3 text-left hover:bg-muted/50 md:grid-cols-[minmax(190px,1.2fr)_100px_145px_minmax(150px,.8fr)_minmax(170px,1fr)_auto] md:items-center ${selectedSessionId === session.sessionId ? "bg-muted/40" : ""}`}
            >
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <span className={`h-2.5 w-2.5 rounded-full ${session.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <span className="truncate">{session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`}</span>
                  {session.hotOpportunity ? <Flame className="h-4 w-4 shrink-0 text-orange-600" /> : null}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString("pt-BR") : ""}</div>
              </div>
              <div className="text-xs font-medium text-muted-foreground">{surfaceLabel(session.surface)}</div>
              <div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${intentClass(session.intent.tier)}`}>{session.intent.score}/100 · {session.intent.tierLabel}</span></div>
              <div className="truncate text-sm"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLabel(session)}</div>
              <div className="truncate text-sm text-muted-foreground">{sourceLabel(session)}</div>
              <div className="text-xs text-muted-foreground">{session.pageViews} pág. · {duration(session.durationMs)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {!selected ? (
          <div className="flex min-h-80 flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <Route className="mb-3 h-7 w-7" />
            Selecione uma sessão para ver origem, comportamento e jornada completa.
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${selected.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                <h2 className="font-medium">{selected.identified ? "Visitante identificado" : `Visitante ${selected.sessionId.slice(0, 8)}`}</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{surfaceLabel(selected.surface)} · {locationLabel(selected)}</p>
            </div>

            <div className={`rounded-lg border p-3 ${intentClass(selected.intent.tier)}`}>
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-xs opacity-80">Behavior Intent</div><div className="text-lg font-semibold">{selected.intent.score}/100 · {selected.intent.tierLabel}</div></div>
                {selected.hotOpportunity ? <Flame className="h-6 w-6" /> : null}
              </div>
              <p className="mt-2 text-xs leading-5">{selected.intent.recommendedAction}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Origem</div><div className="mt-1 break-words">{sourceLabel(selected)}</div></div>
              <div><div className="text-xs text-muted-foreground">Campanha</div><div className="mt-1 break-words">{selected.campaign || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Primeira visita</div><div className="mt-1">{selected.firstSeenAt ? new Date(selected.firstSeenAt).toLocaleString("pt-BR") : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Última atividade</div><div className="mt-1">{selected.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleString("pt-BR") : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Dispositivo</div><div className="mt-1">{[selected.device.type, selected.device.browser, selected.device.os].filter(Boolean).join(" · ") || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Tempo</div><div className="mt-1">{duration(selected.durationMs)}</div></div>
              <div><div className="text-xs text-muted-foreground">Páginas/telas</div><div className="mt-1">{selected.pageViews}</div></div>
              <div><div className="text-xs text-muted-foreground">CTAs</div><div className="mt-1">{selected.ctaClicks}</div></div>
              <div><div className="text-xs text-muted-foreground">Scroll máximo</div><div className="mt-1">{selected.maxScrollDepth}%</div></div>
              <div><div className="text-xs text-muted-foreground">Conversões</div><div className="mt-1">{selected.conversions}</div></div>
            </div>

            {selected.intent.reasons.length ? (
              <div>
                <h3 className="text-sm font-medium">Por que recebeu esse score</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {selected.intent.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                </ul>
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Jornada completa</h3>
                <span className="text-[11px] text-muted-foreground">{selected.eventCount} eventos</span>
              </div>
              <div className="mt-3 max-h-[460px] space-y-3 overflow-auto border-l pl-4 pr-1">
                {selected.journey.map((item, index) => (
                  <div key={`${item.at}-${index}`} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border bg-background" />
                    <div className="text-xs font-medium">{eventLabel(item.eventType)}</div>
                    <div className="break-all text-sm">{item.path || "—"}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.at ? new Date(item.at).toLocaleString("pt-BR") : ""}
                      {item.scrollDepth != null ? ` · scroll ${item.scrollDepth}%` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-1 md:p-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Visitor Intelligence</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Tempo real, histórico, origem, cidade, jornada, intenção e conversão do site, app web e app mobile em uma única ferramenta.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAlerts}
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium ${alertsEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-background"}`}
          >
            {alertsEnabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            Alertas no app: {alertsEnabled ? "ativos" : "desativados"}
          </button>
          {browserPermission !== "unsupported" && browserPermission !== "granted" ? (
            <button type="button" onClick={enableBrowserNotifications} className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
              <BellRing className="h-4 w-4" /> Notificação do navegador
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => changeTab("realtime")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === "realtime" ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted"}`}><Radio className="h-4 w-4" /> Tempo real</button>
          <button type="button" onClick={() => changeTab("history")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === "history" ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted"}`}><History className="h-4 w-4" /> Histórico</button>
          <button type="button" onClick={() => changeTab("analytics")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === "analytics" ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted"}`}><BarChart3 className="h-4 w-4" /> Análises</button>
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          <option value={30}>Últimos 30 min</option>
          <option value={60}>Última hora</option>
          <option value={360}>Últimas 6 horas</option>
          <option value={1440}>Últimas 24 horas</option>
          <option value={10080}>Últimos 7 dias</option>
          <option value={43200}>Últimos 30 dias</option>
          <option value={129600}>Últimos 90 dias</option>
        </select>
      </div>

      {query.data?.truncated ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">O período possui volume acima do limite de eventos detalhados. Totais permanecem calculados no banco, mas a lista detalhada mostra os eventos mais recentes.</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Online agora", value: totals.onlineNow, icon: Radio },
          { label: "Quentes agora", value: totals.hotNow, icon: Flame },
          { label: "Visitantes únicos", value: totals.uniqueVisitors, icon: Users },
          { label: "Retornando", value: totals.returningVisitors, icon: Repeat2 },
          { label: "Conversões", value: totals.conversions, icon: MousePointerClick },
          { label: "Taxa de conversão", value: `${totals.conversionRate}%`, icon: BarChart3 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Sessões</div><div className="mt-1 text-lg font-semibold">{totals.visitors}</div></div>
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Páginas/telas</div><div className="mt-1 text-lg font-semibold">{totals.pageViews}</div></div>
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Tempo médio</div><div className="mt-1 text-lg font-semibold">{duration(totals.averageSessionDurationMs)}</div></div>
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Páginas/sessão</div><div className="mt-1 text-lg font-semibold">{totals.averagePagesPerSession}</div></div>
        <div className="rounded-lg border bg-card px-4 py-3"><div className="text-xs text-muted-foreground">Intent médio</div><div className="mt-1 text-lg font-semibold">{totals.averageIntent}/100</div></div>
      </div>

      {tab !== "analytics" ? (
        <>
          <div className="grid gap-2 rounded-xl border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cidade, estado, origem, campanha ou tela..." className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={surface} onChange={(event) => setSurface(event.target.value as "all" | VisitorSurface)}>
              <option value="all">Todas as superfícies</option>
              <option value="site">Site</option>
              <option value="app">App Web</option>
              <option value="mobile">App Mobile</option>
              <option value="unknown">Não classificado</option>
            </select>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as SessionStatus)}>
              <option value="all">Todos os status</option>
              <option value="online">Online agora</option>
              <option value="hot">Oportunidades quentes</option>
              <option value="identified">Identificados</option>
              <option value="anonymous">Anônimos</option>
            </select>
            <button type="button" onClick={() => { setSearch(""); setSurface("all"); setStatus("all"); }} className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted">Limpar filtros</button>
          </div>

          {tab === "realtime" && filteredHot.length ? (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-600" />
                <div><h2 className="font-semibold">Oportunidades quentes agora</h2><p className="text-xs text-muted-foreground">Visitantes online com Behavior Intent a partir de 60/100.</p></div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {filteredHot.slice(0, 6).map((session) => (
                  <button key={session.sessionId} type="button" onClick={() => setSelectedSessionId(session.sessionId)} className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${intentClass(session.intent.tier)}`}>{session.intent.score}/100</span></div>
                    <div className="mt-1 text-[11px] font-medium text-muted-foreground">{surfaceLabel(session.surface)}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"} · {locationLabel(session)}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {renderSessionList()}
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <Ranking title="Principais origens" items={query.data?.analytics.topSources ?? []} />
            <Ranking title="Cidades" items={query.data?.analytics.topCities ?? []} />
            <Ranking title="Campanhas" items={query.data?.analytics.topCampaigns ?? []} />
            <Ranking title="Páginas e telas" items={query.data?.analytics.topPages ?? []} />
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-medium">Evolução diária</h3><p className="text-xs text-muted-foreground">Sessões, páginas/telas e conversões no período selecionado.</p></div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground"><span><Globe2 className="mr-1 inline h-3.5 w-3.5" />Site {totals.siteVisitors}</span><span><MonitorSmartphone className="mr-1 inline h-3.5 w-3.5" />Web {totals.appVisitors}</span><span><Smartphone className="mr-1 inline h-3.5 w-3.5" />Mobile {totals.mobileVisitors}</span></div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Data</th><th className="py-2 pr-4">Sessões</th><th className="py-2 pr-4">Páginas/telas</th><th className="py-2 pr-4">Conversões</th><th className="py-2">Conv./sessão</th></tr></thead>
                <tbody>
                  {(query.data?.analytics.daily ?? []).map((day) => (
                    <tr key={day.date} className="border-b last:border-0"><td className="py-2.5 pr-4">{new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR")}</td><td className="py-2.5 pr-4 font-medium">{day.sessions}</td><td className="py-2.5 pr-4">{day.pageViews}</td><td className="py-2.5 pr-4">{day.conversions}</td><td className="py-2.5">{day.sessions ? `${((day.conversions / day.sessions) * 100).toFixed(1)}%` : "0%"}</td></tr>
                  ))}
                </tbody>
              </table>
              {!query.data?.analytics.daily.length ? <div className="py-8 text-center text-sm text-muted-foreground">Sem dados históricos neste período.</div> : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><Clock3 className="h-5 w-5 text-primary" /><div className="mt-3 text-xs text-muted-foreground">Tempo médio por sessão</div><div className="mt-1 text-xl font-semibold">{duration(totals.averageSessionDurationMs)}</div></div>
            <div className="rounded-xl border bg-card p-4"><Users className="h-5 w-5 text-primary" /><div className="mt-3 text-xs text-muted-foreground">Visitantes identificados</div><div className="mt-1 text-xl font-semibold">{totals.identifiedRate}%</div></div>
            <div className="rounded-xl border bg-card p-4"><MousePointerClick className="h-5 w-5 text-primary" /><div className="mt-3 text-xs text-muted-foreground">Taxa de conversão</div><div className="mt-1 text-xl font-semibold">{totals.conversionRate}%</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
