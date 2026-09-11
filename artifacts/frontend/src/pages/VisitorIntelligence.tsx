import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BellOff,
  BellRing,
  Clock3,
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
  UserRound,
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
type SessionStatus = "all" | "online" | "identified" | "anonymous";
type ViewMode = "realtime" | "history";

type VisitorIdentity = {
  displayName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: "lead" | "user" | null;
};

type JourneyItem = {
  eventType: string;
  path: string | null;
  pageUrl: string | null;
  at: string | null;
  engagedMs: number | null;
  scrollDepth: number | null;
};

type VisitorSession = {
  sessionId: string;
  visitorId: string | null;
  surface: VisitorSurface;
  online: boolean;
  identified: boolean;
  identity: VisitorIdentity;
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
  conversions: number;
  eventCount: number;
  maxScrollDepth: number;
  geo: {
    country: string | null;
    region: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    source: string | null;
  };
  device: {
    type: string | null;
    browser: string | null;
    os: string | null;
  };
  source: string | null;
  medium: string | null;
  campaign: string | null;
  sourceLabel: string | null;
  journey: JourneyItem[];
};

type VisitorTotals = {
  visitors: number;
  uniqueVisitors: number;
  returningVisitors: number;
  pageViews: number;
  conversions: number;
  onlineNow: number;
  identified: number;
  averageSessionDurationMs: number;
};

type VisitorResponse = {
  truncated: boolean;
  totals: VisitorTotals;
  sessions: VisitorSession[];
};

type UnknownRecord = Record<string, unknown>;

const EMPTY_IDENTITY: VisitorIdentity = {
  displayName: null,
  email: null,
  phone: null,
  company: null,
  source: null,
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = num(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function surface(value: unknown): VisitorSurface {
  return value === "site" || value === "app" || value === "mobile" ? value : "unknown";
}

function identitySource(value: unknown): "lead" | "user" | null {
  return value === "lead" || value === "user" ? value : null;
}

function normalizeJourney(value: unknown): JourneyItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = record(item);
    return {
      eventType: text(raw.eventType) || "event",
      path: text(raw.path),
      pageUrl: text(raw.pageUrl),
      at: text(raw.at),
      engagedMs: nullableNum(raw.engagedMs),
      scrollDepth: nullableNum(raw.scrollDepth),
    };
  });
}

function normalizeSession(value: unknown, index: number): VisitorSession {
  const raw = record(value);
  const identityRaw = record(raw.identity);
  const geoRaw = record(raw.geo);
  const deviceRaw = record(raw.device);
  const sessionId = text(raw.sessionId) || text(raw.anonymousSessionId) || `legacy-${index}`;
  const leadId = text(raw.leadId);
  const userId = text(raw.userId);
  const normalizedIdentity: VisitorIdentity = {
    displayName: text(identityRaw.displayName),
    email: text(identityRaw.email),
    phone: text(identityRaw.phone),
    company: text(identityRaw.company),
    source: identitySource(identityRaw.source),
  };
  const identified = bool(raw.identified)
    || Boolean(leadId || userId || normalizedIdentity.displayName || normalizedIdentity.email || normalizedIdentity.phone);

  return {
    sessionId,
    visitorId: text(raw.visitorId),
    surface: surface(raw.surface),
    online: bool(raw.online),
    identified,
    identity: normalizedIdentity,
    leadId,
    userId,
    currentPath: text(raw.currentPath) || text(raw.path),
    currentPageUrl: text(raw.currentPageUrl) || text(raw.pageUrl),
    referrer: text(raw.referrer),
    firstSeenAt: text(raw.firstSeenAt),
    lastSeenAt: text(raw.lastSeenAt),
    durationMs: Math.max(0, num(raw.durationMs)),
    pageViews: Math.max(0, num(raw.pageViews)),
    ctaClicks: Math.max(0, num(raw.ctaClicks)),
    conversions: Math.max(0, num(raw.conversions)),
    eventCount: Math.max(0, num(raw.eventCount)),
    maxScrollDepth: Math.max(0, Math.min(100, num(raw.maxScrollDepth))),
    geo: {
      country: text(geoRaw.country),
      region: text(geoRaw.region),
      city: text(geoRaw.city),
      latitude: nullableNum(geoRaw.latitude),
      longitude: nullableNum(geoRaw.longitude),
      source: text(geoRaw.source),
    },
    device: {
      type: text(deviceRaw.type),
      browser: text(deviceRaw.browser),
      os: text(deviceRaw.os),
    },
    source: text(raw.source),
    medium: text(raw.medium),
    campaign: text(raw.campaign),
    sourceLabel: text(raw.sourceLabel),
    journey: normalizeJourney(raw.journey),
  };
}

function derivedTotals(sessions: VisitorSession[]): VisitorTotals {
  const visitorKeys = new Set(sessions.map((session) => session.visitorId || `session:${session.sessionId}`));
  const recurrence = new Map<string, number>();
  for (const session of sessions) {
    if (!session.visitorId) continue;
    recurrence.set(session.visitorId, (recurrence.get(session.visitorId) ?? 0) + 1);
  }
  const returningVisitors = Array.from(recurrence.values()).filter((count) => count > 1).length;
  return {
    visitors: sessions.length,
    uniqueVisitors: visitorKeys.size,
    returningVisitors,
    pageViews: sessions.reduce((sum, session) => sum + session.pageViews, 0),
    conversions: sessions.reduce((sum, session) => sum + session.conversions, 0),
    onlineNow: sessions.filter((session) => session.online).length,
    identified: sessions.filter((session) => session.identified).length,
    averageSessionDurationMs: sessions.length
      ? Math.round(sessions.reduce((sum, session) => sum + session.durationMs, 0) / sessions.length)
      : 0,
  };
}

function normalizeResponse(value: unknown): VisitorResponse {
  const raw = record(value);
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession) : [];
  const fallback = derivedTotals(sessions);
  const totalsRaw = record(raw.totals);
  return {
    truncated: bool(raw.truncated),
    sessions,
    totals: {
      visitors: Math.max(0, num(totalsRaw.visitors, fallback.visitors)),
      uniqueVisitors: Math.max(0, num(totalsRaw.uniqueVisitors, fallback.uniqueVisitors)),
      returningVisitors: Math.max(0, num(totalsRaw.returningVisitors, fallback.returningVisitors)),
      pageViews: Math.max(0, num(totalsRaw.pageViews, fallback.pageViews)),
      conversions: Math.max(0, num(totalsRaw.conversions, fallback.conversions)),
      onlineNow: Math.max(0, num(totalsRaw.onlineNow, fallback.onlineNow)),
      identified: Math.max(0, num(totalsRaw.identified, fallback.identified)),
      averageSessionDurationMs: Math.max(0, num(totalsRaw.averageSessionDurationMs, fallback.averageSessionDurationMs)),
    },
  };
}

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

function visitorLabel(session: VisitorSession) {
  return session.identity?.displayName
    || (session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`);
}

function identitySourceLabel(session: VisitorSession) {
  if (session.identity?.source === "lead") return "Lead no CRM";
  if (session.identity?.source === "user") return "Usuário do sistema";
  if (session.identified) return "Identificado";
  return "Anônimo";
}

function sourceLabel(session: VisitorSession) {
  return session.sourceLabel
    || [session.source, session.medium].filter(Boolean).join(" / ")
    || session.referrer
    || "Direto / desconhecido";
}

function surfaceLabel(value: VisitorSurface) {
  if (value === "site") return "Site";
  if (value === "app") return "App Web";
  if (value === "mobile") return "App Mobile";
  return "Não classificado";
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
  if (!response.ok) throw new Error("Falha ao carregar o rastreamento");
  return normalizeResponse(await response.json());
}

function recurrenceKey(session: VisitorSession) {
  if (session.leadId) return `lead:${session.leadId}`;
  if (session.userId) return `user:${session.userId}`;
  if (session.visitorId) return `visitor:${session.visitorId}`;
  return null;
}

function matchesStatus(session: VisitorSession, status: SessionStatus) {
  if (status === "online") return session.online;
  if (status === "identified") return session.identified;
  if (status === "anonymous") return !session.identified;
  return true;
}

function matchesSearch(session: VisitorSession, query: string) {
  if (!query) return true;
  const identity = session.identity || EMPTY_IDENTITY;
  return [
    session.sessionId,
    session.visitorId,
    identity.displayName,
    identity.email,
    identity.phone,
    identity.company,
    session.currentPath,
    session.currentPageUrl,
    session.referrer,
    session.geo?.city,
    session.geo?.region,
    session.geo?.country,
    session.source,
    session.medium,
    session.campaign,
    session.sourceLabel,
    session.device?.type,
    session.device?.browser,
    session.device?.os,
    surfaceLabel(session.surface),
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(query);
}

export default function VisitorIntelligence() {
  const [mode, setMode] = useState<ViewMode>("realtime");
  const [minutes, setMinutes] = useState(60);
  const [surfaceFilter, setSurfaceFilter] = useState<"all" | VisitorSurface>("all");
  const [status, setStatus] = useState<SessionStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    const value = new URLSearchParams(window.location.search).get("session");
    return value && /^[a-zA-Z0-9_-]{4,160}$/.test(value) ? value : null;
  });
  const [alertsEnabled, setAlertsEnabledState] = useState(() => getVisitorAlertsEnabled());
  const [browserPermission, setBrowserPermission] = useState(() => getVisitorBrowserNotificationState());

  const query = useQuery({
    queryKey: ["visitor-intelligence", minutes],
    queryFn: () => loadVisitors(minutes),
    refetchInterval: mode === "realtime" ? 15_000 : 60_000,
  });

  const recurrenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of query.data?.sessions ?? []) {
      const key = recurrenceKey(session);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [query.data]);

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredSessions = useMemo(() => (query.data?.sessions ?? []).filter((session) =>
    (surfaceFilter === "all" || session.surface === surfaceFilter)
    && matchesStatus(session, status)
    && matchesSearch(session, normalizedSearch),
  ), [query.data, surfaceFilter, status, normalizedSearch]);

  const selected = useMemo(
    () => query.data?.sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [query.data, selectedSessionId],
  );

  const totals = query.data?.totals ?? derivedTotals([]);

  const selectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const changeMode = (next: ViewMode) => {
    setMode(next);
    if (next === "realtime" && minutes > 1440) setMinutes(60);
    if (next === "history" && minutes < 1440) setMinutes(7 * 24 * 60);
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

  return (
    <div className="space-y-5 p-1 md:p-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Rastreamento</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Somente dados de navegação: visitante, cidade/estado, origem, campanha, dispositivo, página atual e jornada da sessão.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAlerts}
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium ${alertsEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-background"}`}
          >
            {alertsEnabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            Alertas: {alertsEnabled ? "ativos" : "desativados"}
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
          <button type="button" onClick={() => changeMode("realtime")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${mode === "realtime" ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted"}`}>
            <Radio className="h-4 w-4" /> Tempo real
          </button>
          <button type="button" onClick={() => changeMode("history")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${mode === "history" ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted"}`}>
            <History className="h-4 w-4" /> Histórico
          </button>
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
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          Há mais eventos no período do que a lista detalhada comporta. Os totais continuam corretos; a lista mostra as sessões mais recentes.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Online agora", value: totals.onlineNow, icon: Radio },
          { label: "Visitantes únicos", value: totals.uniqueVisitors, icon: Users },
          { label: "Retornando", value: totals.returningVisitors, icon: Repeat2 },
          { label: "Sessões", value: totals.visitors, icon: MonitorSmartphone },
          { label: "Páginas/telas", value: totals.pageViews, icon: Globe2 },
          { label: "Conversões", value: totals.conversions, icon: MousePointerClick },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 rounded-xl border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar nome, cidade, estado, origem, campanha ou tela..."
          className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={surfaceFilter} onChange={(event) => setSurfaceFilter(event.target.value as "all" | VisitorSurface)}>
          <option value="all">Todas as superfícies</option>
          <option value="site">Site</option>
          <option value="app">App Web</option>
          <option value="mobile">App Mobile</option>
          <option value="unknown">Não classificado</option>
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as SessionStatus)}>
          <option value="all">Todos os status</option>
          <option value="online">Online agora</option>
          <option value="identified">Identificados</option>
          <option value="anonymous">Anônimos</option>
        </select>
        <button type="button" onClick={() => { setSearch(""); setSurfaceFilter("all"); setStatus("all"); }} className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted">Limpar filtros</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="font-medium">{mode === "realtime" ? "Sessões agora e recentes" : "Histórico de sessões"}</h2>
              <p className="text-xs text-muted-foreground">{filteredSessions.length} sessão(ões) dentro dos filtros</p>
            </div>
            <button type="button" onClick={() => query.refetch()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-muted">
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          <div className="divide-y">
            {query.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando visitantes…</div>}
            {query.isError && <div className="p-6 text-sm text-destructive">Não foi possível carregar o rastreamento. Tente atualizar.</div>}
            {!query.isLoading && !query.isError && filteredSessions.length === 0 && <div className="p-6 text-sm text-muted-foreground">Nenhuma sessão neste filtro.</div>}
            {filteredSessions.map((session) => {
              const key = recurrenceKey(session);
              const recurrence = key ? recurrenceCounts.get(key) ?? 1 : 1;
              return (
                <button
                  type="button"
                  key={session.sessionId}
                  onClick={() => selectSession(session.sessionId)}
                  aria-pressed={selectedSessionId === session.sessionId}
                  className={`grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 md:grid-cols-[minmax(190px,1.2fr)_100px_minmax(155px,.9fr)_minmax(180px,1fr)_auto] md:items-center ${selectedSessionId === session.sessionId ? "bg-muted/40 ring-1 ring-inset ring-primary/20" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${session.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <span className="truncate">{visitorLabel(session)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{identitySourceLabel(session)}</span>
                      {recurrence > 1 ? <span className="rounded-full border px-1.5 py-0.5">Recorrente · {recurrence}</span> : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"}</div>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">{surfaceLabel(session.surface)}</div>
                  <div className="truncate text-sm"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLabel(session)}</div>
                  <div className="truncate text-sm text-muted-foreground">{sourceLabel(session)}</div>
                  <div className="text-xs text-muted-foreground">{session.pageViews} pág. · {duration(session.durationMs)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          {!selected ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Route className="mb-3 h-7 w-7" />
              Clique em uma sessão para ver localização, origem, dispositivo e jornada completa.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${selected.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <h2 className="font-medium">{visitorLabel(selected)}</h2>
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{identitySourceLabel(selected)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{surfaceLabel(selected.surface)} · {locationLabel(selected)}</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium">Identificação</h3></div>
                {selected.identity.displayName || selected.identity.email || selected.identity.phone ? (
                  <div className="mt-3 space-y-1 text-sm">
                    {selected.identity.displayName ? <div className="font-semibold">{selected.identity.displayName}</div> : null}
                    {selected.identity.company ? <div className="text-muted-foreground">{selected.identity.company}</div> : null}
                    {selected.identity.email ? <div className="break-all text-xs text-muted-foreground">{selected.identity.email}</div> : null}
                    {selected.identity.phone ? <div className="text-xs text-muted-foreground">{selected.identity.phone}</div> : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Visitante ainda anônimo. Se ele for associado a um lead ou usuário, a identificação aparecerá aqui.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Localização aproximada por IP</div>
                  <div className="mt-1 font-medium"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLabel(selected)}</div>
                  {selected.geo.latitude != null && selected.geo.longitude != null ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">{selected.geo.latitude.toFixed(4)}, {selected.geo.longitude.toFixed(4)}{selected.geo.source ? ` · ${selected.geo.source}` : ""}</div>
                  ) : null}
                </div>
                <div><div className="text-xs text-muted-foreground">Origem</div><div className="mt-1 break-words">{sourceLabel(selected)}</div></div>
                <div><div className="text-xs text-muted-foreground">Campanha</div><div className="mt-1 break-words">{selected.campaign || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Primeira visita</div><div className="mt-1">{selected.firstSeenAt ? new Date(selected.firstSeenAt).toLocaleString("pt-BR") : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Última atividade</div><div className="mt-1">{selected.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleString("pt-BR") : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Dispositivo</div><div className="mt-1">{[selected.device.type, selected.device.browser, selected.device.os].filter(Boolean).join(" · ") || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Tempo</div><div className="mt-1"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{duration(selected.durationMs)}</div></div>
                <div><div className="text-xs text-muted-foreground">Páginas/telas</div><div className="mt-1">{selected.pageViews}</div></div>
                <div><div className="text-xs text-muted-foreground">CTAs</div><div className="mt-1">{selected.ctaClicks}</div></div>
                <div><div className="text-xs text-muted-foreground">Conversões</div><div className="mt-1">{selected.conversions}</div></div>
                <div><div className="text-xs text-muted-foreground">Scroll máximo</div><div className="mt-1">{selected.maxScrollDepth}%</div></div>
                <div className="col-span-2"><div className="text-xs text-muted-foreground">Página/tela atual</div><div className="mt-1 break-all">{selected.currentPath || selected.currentPageUrl || "—"}</div></div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Jornada completa</h3>
                  <span className="text-[11px] text-muted-foreground">{selected.eventCount || selected.journey.length} eventos</span>
                </div>
                {selected.journey.length ? (
                  <div className="mt-3 max-h-[460px] space-y-3 overflow-auto border-l pl-4 pr-1">
                    {selected.journey.map((item, index) => (
                      <div key={`${item.at || "sem-data"}-${index}`} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border bg-background" />
                        <div className="text-xs font-medium">{eventLabel(item.eventType)}</div>
                        <div className="break-all text-sm">{item.path || item.pageUrl || "—"}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.at ? new Date(item.at).toLocaleString("pt-BR") : ""}
                          {item.scrollDepth != null ? ` · scroll ${item.scrollDepth}%` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Nenhum evento detalhado disponível nesta sessão.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span><Globe2 className="mr-1 inline h-3.5 w-3.5" />Site</span>
          <span><MonitorSmartphone className="mr-1 inline h-3.5 w-3.5" />App Web</span>
          <span><Smartphone className="mr-1 inline h-3.5 w-3.5" />App Mobile</span>
          <span><UserRound className="mr-1 inline h-3.5 w-3.5" />{totals.identified} identificados</span>
          <span><Clock3 className="mr-1 inline h-3.5 w-3.5" />tempo médio {duration(totals.averageSessionDurationMs)}</span>
        </div>
      </div>
    </div>
  );
}
