import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BellOff,
  BellRing,
  Clock3,
  Flame,
  Globe2,
  History,
  MapPin,
  MousePointerClick,
  Radio,
  RefreshCw,
  Repeat2,
  Route,
  Target,
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
type SessionStatus = "all" | "online" | "identified" | "anonymous" | "hot" | "remarketing";
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
  label: string | null;
  href: string | null;
};

type PageBreakdown = { path: string; views: number; engagedMs: number };
type ClickSignal = { label: string; href: string | null; path: string | null; at: string | null };

type IntentSignals = {
  pricingViews: number;
  highIntentViews: number;
  formStarts: number;
  formSubmits: number;
  totalEngagedMs: number;
};

type VisitorSession = {
  sessionId: string;
  visitorId: string | null;
  surface: VisitorSurface;
  online: boolean;
  hotOpportunity: boolean;
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
  geo: { country: string | null; region: string | null; city: string | null };
  device: { type: string | null; browser: string | null; os: string | null };
  source: string | null;
  medium: string | null;
  campaign: string | null;
  sourceLabel: string | null;
  commercialStage: string;
  commercialStageLabel: string;
  commercialSummary: string;
  nextBestAction: string;
  audienceTags: string[];
  campaigns: string[];
  pageBreakdown: PageBreakdown[];
  clicks: ClickSignal[];
  recurrenceCount: number;
  signalLabels: string[];
  remarketingReady: boolean;
  intent: { score: number; signals: IntentSignals };
  journey: JourneyItem[];
};

type VisitorTotals = {
  visitors: number;
  uniqueVisitors: number;
  returningVisitors: number;
  conversions: number;
  onlineNow: number;
  identified: number;
  hotNow: number;
  hotLeadsNow: number;
  pricingVisitors: number;
  ctaVisitors: number;
  remarketingReady: number;
  averageSessionDurationMs: number;
};

type VisitorResponse = { truncated: boolean; totals: VisitorTotals; sessions: VisitorSession[] };
type VitalMetricSummary = {
  name: "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
  samples: number;
  p75: number | null;
  median: number | null;
  goodPercent: number | null;
  distribution: { good: number; needsImprovement: number; poor: number };
};
type WebVitalsResponse = {
  minutes: number;
  device?: "all" | "mobile" | "tablet" | "desktop";
  since: string;
  previousSince?: string;
  previous2Since?: string;
  generatedAt: string;
  sampleCount: number;
  metrics: Record<"LCP" | "INP" | "CLS" | "FCP" | "TTFB", VitalMetricSummary>;
  devices: { mobile: number; tablet: number; desktop: number };
  apiTimings?: Array<{ endpoint: string; samples: number; p75: number | null; median: number | null; max: number | null; transferP75?: number | null; bodyP75?: number | null }>;
  apiRouteTimings?: Array<{ path: string; endpoint: string; samples: number; p75: number | null; median: number | null; transferP75?: number | null }>;
  runtimeErrors?: Array<{ path: string; message: string; count: number; source: string | null; lastSeenAt: string | null }>;
  routes: Array<{
    path: string;
    samples: number;
    lcp: number | null;
    inp: number | null;
    cls: number | null;
    previous?: { samples: number; lcp: number | null; inp: number | null; cls: number | null };
    previous2?: { samples: number; lcp: number | null; inp: number | null; cls: number | null };
  }>;
};
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function num(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}
function bool(value: unknown) { return value === true || value === "true" || value === 1 || value === "1"; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function surface(value: unknown): VisitorSurface { return value === "site" || value === "app" || value === "mobile" ? value : "unknown"; }
function normalizePageBreakdown(value: unknown): PageBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = record(item);
    return { path: text(raw.path) || "/", views: Math.max(0, num(raw.views)), engagedMs: Math.max(0, num(raw.engagedMs)) };
  });
}
function normalizeClicks(value: unknown): ClickSignal[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = record(item);
    return { label: text(raw.label) || "CTA", href: text(raw.href), path: text(raw.path), at: text(raw.at) };
  });
}
function normalizeJourney(value: unknown): JourneyItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = record(item);
    return {
      eventType: text(raw.eventType) || "event",
      path: text(raw.path), pageUrl: text(raw.pageUrl), at: text(raw.at),
      engagedMs: raw.engagedMs == null ? null : num(raw.engagedMs),
      scrollDepth: raw.scrollDepth == null ? null : num(raw.scrollDepth),
      label: text(raw.label), href: text(raw.href),
    };
  });
}

function normalizeSession(value: unknown, index: number): VisitorSession {
  const raw = record(value);
  const identity = record(raw.identity);
  const geo = record(raw.geo);
  const device = record(raw.device);
  const intent = record(raw.intent);
  const signals = record(intent.signals);
  const leadId = text(raw.leadId);
  const userId = text(raw.userId);
  return {
    sessionId: text(raw.sessionId) || `legacy-${index}`,
    visitorId: text(raw.visitorId),
    surface: surface(raw.surface),
    online: bool(raw.online),
    hotOpportunity: bool(raw.hotOpportunity),
    identified: bool(raw.identified) || Boolean(leadId || userId || text(identity.displayName)),
    identity: {
      displayName: text(identity.displayName), email: text(identity.email), phone: text(identity.phone), company: text(identity.company),
      source: identity.source === "lead" || identity.source === "user" ? identity.source : null,
    },
    leadId, userId,
    currentPath: text(raw.currentPath) || text(raw.path), currentPageUrl: text(raw.currentPageUrl), referrer: text(raw.referrer),
    firstSeenAt: text(raw.firstSeenAt), lastSeenAt: text(raw.lastSeenAt), durationMs: Math.max(0, num(raw.durationMs)),
    pageViews: Math.max(0, num(raw.pageViews)), ctaClicks: Math.max(0, num(raw.ctaClicks)), conversions: Math.max(0, num(raw.conversions)),
    eventCount: Math.max(0, num(raw.eventCount)), maxScrollDepth: Math.max(0, Math.min(100, num(raw.maxScrollDepth))),
    geo: { country: text(geo.country), region: text(geo.region), city: text(geo.city) },
    device: { type: text(device.type), browser: text(device.browser), os: text(device.os) },
    source: text(raw.source), medium: text(raw.medium), campaign: text(raw.campaign), sourceLabel: text(raw.sourceLabel),
    commercialStage: text(raw.commercialStage) || "observacao",
    commercialStageLabel: text(raw.commercialStageLabel) || "Observação",
    commercialSummary: text(raw.commercialSummary) || "Ainda há poucos sinais comerciais para uma leitura conclusiva.",
    nextBestAction: text(raw.nextBestAction) || "Continuar rastreando e reavaliar quando surgirem novos sinais.",
    audienceTags: stringArray(raw.audienceTags), campaigns: stringArray(raw.campaigns),
    pageBreakdown: normalizePageBreakdown(raw.pageBreakdown), clicks: normalizeClicks(raw.clicks),
    recurrenceCount: Math.max(1, num(raw.recurrenceCount, 1)), signalLabels: stringArray(raw.signalLabels), remarketingReady: bool(raw.remarketingReady),
    intent: {
      score: Math.max(0, Math.min(100, num(intent.score))),
      signals: {
        pricingViews: Math.max(0, num(signals.pricingViews)), highIntentViews: Math.max(0, num(signals.highIntentViews)),
        formStarts: Math.max(0, num(signals.formStarts)), formSubmits: Math.max(0, num(signals.formSubmits)), totalEngagedMs: Math.max(0, num(signals.totalEngagedMs)),
      },
    },
    journey: normalizeJourney(raw.journey),
  };
}

function normalizeResponse(value: unknown): VisitorResponse {
  const raw = record(value);
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession) : [];
  const totals = record(raw.totals);
  const siteSessions = sessions.filter((session) => session.surface === "site");
  return {
    truncated: bool(raw.truncated), sessions,
    totals: {
      visitors: num(totals.visitors, sessions.length), uniqueVisitors: num(totals.uniqueVisitors, sessions.length),
      returningVisitors: num(totals.returningVisitors, sessions.filter((s) => s.recurrenceCount > 1).length),
      conversions: num(totals.conversions, sessions.reduce((sum, s) => sum + s.conversions, 0)), onlineNow: num(totals.onlineNow, sessions.filter((s) => s.online).length),
      identified: num(totals.identified, sessions.filter((s) => s.identified).length), hotNow: num(totals.hotNow, sessions.filter((s) => s.hotOpportunity).length),
      hotLeadsNow: num(totals.hotLeadsNow, sessions.filter((s) => s.hotOpportunity && s.leadId).length),
      pricingVisitors: num(totals.pricingVisitors, siteSessions.filter((s) => s.intent.signals.pricingViews > 0).length),
      ctaVisitors: num(totals.ctaVisitors, siteSessions.filter((s) => s.ctaClicks > 0).length),
      remarketingReady: num(totals.remarketingReady, siteSessions.filter((s) => s.remarketingReady).length),
      averageSessionDurationMs: num(totals.averageSessionDurationMs, sessions.length ? sessions.reduce((sum, s) => sum + s.durationMs, 0) / sessions.length : 0),
    },
  };
}

async function loadVisitors(minutes: number): Promise<VisitorResponse> {
  const token = window.localStorage.getItem("vendorai_token");
  if (!token) throw new Error("Sessão não autenticada");
  const response = await fetch(`${API_BASE}/visitor-intelligence?minutes=${minutes}`, { credentials: "include", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Falha ao carregar o rastreamento");
  return normalizeResponse(await response.json());
}

async function loadWebVitals(minutes: number, device: "all" | "mobile" | "tablet" | "desktop"): Promise<WebVitalsResponse> {
  const token = window.localStorage.getItem("vendorai_token");
  if (!token) throw new Error("Sessão não autenticada");
  const response = await fetch(`${API_BASE}/visitor-intelligence/web-vitals?minutes=${minutes}&device=${device}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Falha ao carregar Web Vitals");
  return response.json() as Promise<WebVitalsResponse>;
}

function formatVital(name: VitalMetricSummary["name"], value: number | null) {
  if (value == null) return "—";
  if (name === "CLS") return value.toFixed(3);
  return `${Math.round(value)} ms`;
}

function routeBottleneck(route: WebVitalsResponse["routes"][number]) {
  const normalized = [
    { key: "carregamento/renderização", value: route.lcp == null ? 0 : route.lcp / 2500 },
    { key: "interação", value: route.inp == null ? 0 : route.inp / 200 },
    { key: "estabilidade visual", value: route.cls == null ? 0 : route.cls / 0.1 },
  ].sort((a, b) => b.value - a.value);

  if (!normalized[0] || normalized[0].value <= 1) return "sem gargalo dominante";
  return normalized[0].key;
}

function compositePriorityScore(input: {
  vitalScore: number;
  runtimeErrorCount: number;
  persistentRegression: boolean;
  slowestApi: { p75: number | null; transferP75?: number | null } | null;
}) {
  let score = input.vitalScore;
  score += Math.min(120, input.runtimeErrorCount * 20);
  if (input.persistentRegression) score += 120;
  if ((input.slowestApi?.p75 ?? 0) > 1200) score += 80;
  else if ((input.slowestApi?.p75 ?? 0) > 800) score += 40;
  if ((input.slowestApi?.transferP75 ?? 0) > 500_000) score += 70;
  else if ((input.slowestApi?.transferP75 ?? 0) > 250_000) score += 35;
  return Math.round(score);
}

function routeRecommendation(input: {
  bottleneck: string;
  slowestApi: { p75: number | null; transferP75?: number | null } | null;
  runtimeErrorCount: number;
}) {
  if (input.runtimeErrorCount > 0) return "Corrigir o erro recorrente desta rota antes de novas otimizações.";
  if ((input.slowestApi?.p75 ?? 0) > 1200 && (input.slowestApi?.transferP75 ?? 0) > 250_000) {
    return "Reduzir o payload e revisar paginação/campos retornados pela API desta tela.";
  }
  if ((input.slowestApi?.p75 ?? 0) > 1200) {
    return "Investigar a API mais lenta: query, cache, chamadas em cascata e processamento no backend.";
  }
  if ((input.slowestApi?.transferP75 ?? 0) > 250_000) {
    return "Diminuir o volume transferido: paginação, seleção de campos e carregamento sob demanda.";
  }
  if (input.bottleneck === "carregamento/renderização") {
    return "Revisar lazy loading, trabalho síncrono e componentes pesados acima da dobra.";
  }
  if (input.bottleneck === "interação") {
    return "Reduzir trabalho no clique/input, renders em cascata e tarefas longas na thread principal.";
  }
  if (input.bottleneck === "estabilidade visual") {
    return "Reservar espaço para conteúdo assíncrono e estabilizar dimensões de imagens, cards e painéis.";
  }
  return "Revisar a rota com profiling antes de alterar arquitetura.";
}

function routeTrend(route: WebVitalsResponse["routes"][number]) {
  const previous = route.previous;
  if (!previous || previous.samples < 4) return { label: "sem histórico", direction: "neutral" as const };

  const deltas = [
    route.lcp != null && previous.lcp != null ? (route.lcp - previous.lcp) / Math.max(previous.lcp, 1) : 0,
    route.inp != null && previous.inp != null ? (route.inp - previous.inp) / Math.max(previous.inp, 1) : 0,
    route.cls != null && previous.cls != null ? (route.cls - previous.cls) / Math.max(previous.cls, 0.001) : 0,
  ];
  const avg = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  if (avg <= -0.1) return { label: "melhorando", direction: "up" as const };
  if (avg >= 0.1) return { label: "piorando", direction: "down" as const };
  return { label: "estável", direction: "neutral" as const };
}

function routePersistentRegression(route: WebVitalsResponse["routes"][number]) {
  const previous = route.previous;
  const previous2 = route.previous2;
  if (!previous || !previous2 || previous.samples < 4 || previous2.samples < 4) return false;

  const ratio = (current: number | null, base: number | null, floor: number) =>
    current != null && base != null ? (current - base) / Math.max(base, floor) : 0;

  const currentVsPrevious = [
    ratio(route.lcp, previous.lcp, 1),
    ratio(route.inp, previous.inp, 1),
    ratio(route.cls, previous.cls, 0.001),
  ].reduce((sum, value) => sum + value, 0) / 3;

  const previousVsPrevious2 = [
    ratio(previous.lcp, previous2.lcp, 1),
    ratio(previous.inp, previous2.inp, 1),
    ratio(previous.cls, previous2.cls, 0.001),
  ].reduce((sum, value) => sum + value, 0) / 3;

  return currentVsPrevious >= 0.1 && previousVsPrevious2 >= 0.1;
}

function routePerformancePriority(route: WebVitalsResponse["routes"][number]) {
  const lcpPenalty = route.lcp == null ? 0 : Math.max(0, route.lcp / 2500 - 1);
  const inpPenalty = route.inp == null ? 0 : Math.max(0, route.inp / 200 - 1) * 1.25;
  const clsPenalty = route.cls == null ? 0 : Math.max(0, route.cls / 0.1 - 1) * 2;
  const confidenceWeight = Math.min(1, Math.log2(route.samples + 1) / 4);
  const score = Math.round((lcpPenalty + inpPenalty + clsPenalty) * 100 * confidenceWeight);
  const confidence = route.samples >= 10 ? "alta" : route.samples >= 4 ? "média" : "baixa";
  const status = confidence === "baixa"
    ? "amostra baixa"
    : score >= 180
      ? "crítica"
      : score >= 60
        ? "atenção"
        : "estável";
  return { score, status, confidence };
}

function duration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}
function visitorLabel(session: VisitorSession) { return session.identity.displayName || (session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`); }
function sourceLabel(session: VisitorSession) { return session.sourceLabel || [session.source, session.medium].filter(Boolean).join(" / ") || session.referrer || "Direto / desconhecido"; }
function locationLabel(session: VisitorSession) { return [session.geo.city, session.geo.region].filter(Boolean).join(" / ") || "Localização não disponível"; }
function eventLabel(type: string) {
  return ({ page_view: "Página visualizada", screen_view: "Tela visualizada", cta_click: "Clique", form_start: "Iniciou formulário", form_submit: "Enviou formulário", conversion: "Conversão", engagement: "Tempo ativo", session_start: "Início" } as Record<string, string>)[type] || type;
}
function stageClass(stage: string) {
  if (stage === "prioridade") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (stage === "oportunidade") return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (stage === "nutricao") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (stage === "remarketing") return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "border-border bg-muted text-muted-foreground";
}
function matchesStatus(session: VisitorSession, status: SessionStatus) {
  if (status === "online") return session.online;
  if (status === "identified") return session.identified;
  if (status === "anonymous") return !session.identified;
  if (status === "hot") return session.intent.score >= 60;
  if (status === "remarketing") return session.remarketingReady;
  return true;
}
function matchesSearch(session: VisitorSession, query: string) {
  if (!query) return true;
  return [visitorLabel(session), session.identity.email, session.identity.phone, session.identity.company, session.currentPath, session.geo.city, session.geo.region, sourceLabel(session), session.campaign, ...session.signalLabels, ...session.audienceTags]
    .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(query);
}

export default function VisitorIntelligence() {
  const [mode, setMode] = useState<ViewMode>("realtime");
  const [minutes, setMinutes] = useState(60);
  const [surfaceFilter, setSurfaceFilter] = useState<"commercial" | "all" | VisitorSurface>("commercial");
  const [status, setStatus] = useState<SessionStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [alertsEnabled, setAlertsEnabledState] = useState(() => getVisitorAlertsEnabled());
  const [browserPermission, setBrowserPermission] = useState(() => getVisitorBrowserNotificationState());
  const [vitalsDevice, setVitalsDevice] = useState<"all" | "mobile" | "tablet" | "desktop">("all");

  const query = useQuery({ queryKey: ["visitor-intelligence", minutes], queryFn: () => loadVisitors(minutes), refetchInterval: mode === "realtime" ? 15_000 : 60_000 });
  const vitalsQuery = useQuery({
    queryKey: ["visitor-intelligence", "web-vitals", minutes, vitalsDevice],
    queryFn: () => loadWebVitals(minutes, vitalsDevice),
    staleTime: 60_000,
    refetchInterval: mode === "realtime" ? 60_000 : 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredSessions = useMemo(() => (query.data?.sessions ?? []).filter((session) => {
    const surfaceMatch = surfaceFilter === "all" ? true : surfaceFilter === "commercial" ? session.surface === "site" : session.surface === surfaceFilter;
    return surfaceMatch && matchesStatus(session, status) && matchesSearch(session, normalizedSearch);
  }), [query.data, surfaceFilter, status, normalizedSearch]);
  const selected = useMemo(() => query.data?.sessions.find((session) => session.sessionId === selectedSessionId) ?? null, [query.data, selectedSessionId]);
  const totals = query.data?.totals;
  const rankedVitalRoutes = useMemo(() => (vitalsQuery.data?.routes ?? [])
    .map((route) => ({ ...route, ...routePerformancePriority(route) }))
    .sort((a, b) => b.score - a.score || b.samples - a.samples), [vitalsQuery.data?.routes]);
  const actionableVitalRoutes = useMemo(() => rankedVitalRoutes
    .filter((route) => route.confidence !== "baixa" && (route.status === "crítica" || route.status === "atenção"))
    .map((route) => {
      const routeApis = (vitalsQuery.data?.apiRouteTimings ?? [])
        .filter((api) => api.path === route.path)
        .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0));
      const routeErrors = (vitalsQuery.data?.runtimeErrors ?? [])
        .filter((error) => error.path === route.path)
        .sort((a, b) => b.count - a.count);
      const bottleneck = routeBottleneck(route);
      const slowestApi = routeApis[0] ?? null;
      const runtimeErrorCount = routeErrors.reduce((sum, error) => sum + error.count, 0);
      const persistentRegression = routePersistentRegression(route);
      const compositeScore = compositePriorityScore({
        vitalScore: route.score,
        runtimeErrorCount,
        persistentRegression,
        slowestApi,
      });
      return {
        ...route,
        bottleneck,
        slowestApi,
        runtimeErrorCount,
        topRuntimeError: routeErrors[0] ?? null,
        recommendation: routeRecommendation({ bottleneck, slowestApi, runtimeErrorCount }),
        trend: routeTrend(route),
        persistentRegression,
        compositeScore,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore || b.score - a.score)
    .slice(0, 5), [rankedVitalRoutes, vitalsQuery.data?.apiRouteTimings, vitalsQuery.data?.runtimeErrors]);
  const regressionRoutes = useMemo(() => actionableVitalRoutes
    .filter((route) => route.trend.direction === "down")
    .slice(0, 3), [actionableVitalRoutes]);
  const persistentRegressionRoutes = useMemo(() => actionableVitalRoutes
    .filter((route) => route.persistentRegression)
    .slice(0, 3), [actionableVitalRoutes]);
  const slowServerOrNetwork = (vitalsQuery.data?.metrics.TTFB.p75 ?? 0) > 800;

  const selectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const toggleAlerts = () => {
    const next = !alertsEnabled;
    setVisitorAlertsEnabled(next); setAlertsEnabledState(next);
  };
  const enableBrowserNotifications = async () => setBrowserPermission(await requestVisitorBrowserNotifications());

  return (
    <div className="space-y-5 p-1 md:p-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><h1 className="text-2xl font-semibold tracking-tight">Rastreamento & Audiências</h1></div>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">Transforma visitas em sinais comerciais, audiências de remarketing e contexto para SDR, Follow-up e Pipeline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleAlerts} className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium ${alertsEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "bg-background"}`}>
            {alertsEnabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Alertas: {alertsEnabled ? "ativos" : "desativados"}
          </button>
          {browserPermission !== "unsupported" && browserPermission !== "granted" ? <button type="button" onClick={enableBrowserNotifications} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"><BellRing className="h-4 w-4" />Navegador</button> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Leads quentes agora", value: totals?.hotLeadsNow ?? 0, icon: Flame, hint: "Identificados com alta intenção" },
          { label: "Retornaram", value: totals?.returningVisitors ?? 0, icon: Repeat2, hint: "Mais de uma sessão no período" },
          { label: "Viram preços", value: totals?.pricingVisitors ?? 0, icon: Target, hint: "Visitantes com sinal de decisão" },
          { label: "Prontos p/ remarketing", value: totals?.remarketingReady ?? 0, icon: Users, hint: "Audiência comportamental do site" },
        ].map(({ label, value, icon: Icon, hint }) => <div key={label} className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4" /></div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{hint}</div></div>)}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">Performance real do app</h2>
            <p className="text-xs text-muted-foreground">Core Web Vitals coletados dos usuários reais no período selecionado.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={vitalsDevice}
              onChange={(event) => setVitalsDevice(event.target.value as typeof vitalsDevice)}
              className="h-9 rounded-md border bg-background px-2.5 text-xs"
              aria-label="Filtrar Web Vitals por dispositivo"
            >
              <option value="all">Todos dispositivos</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
              <option value="desktop">Desktop</option>
            </select>
            <button type="button" onClick={() => vitalsQuery.refetch()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${vitalsQuery.isFetching ? "animate-spin" : ""}`} />
              Atualizar performance
            </button>
          </div>
        </div>

        {vitalsQuery.isLoading ? <div className="mt-4 text-sm text-muted-foreground">Carregando Web Vitals…</div> : null}
        {vitalsQuery.isError ? <div className="mt-4 text-sm text-destructive">Não foi possível carregar os Web Vitals.</div> : null}
        {vitalsQuery.data ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {(["LCP", "INP", "CLS", "FCP", "TTFB"] as const).map((name) => {
                const metric = vitalsQuery.data!.metrics[name];
                return (
                  <div key={name} className="rounded-lg border bg-background p-3">
                    <div className="text-xs font-medium text-muted-foreground">{name} p75</div>
                    <div className="mt-1 text-xl font-semibold">{formatVital(name, metric.p75)}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {metric.samples} amostras · {metric.goodPercent == null ? "—" : `${metric.goodPercent}% boas`}
                    </div>
                  </div>
                );
              })}
            </div>

            {persistentRegressionRoutes.length ? (
              <div className="mt-4 rounded-lg border border-red-600/40 bg-red-600/[0.06] p-3">
                <div className="text-xs font-semibold text-red-800">Regressões persistentes</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Piora confirmada em duas comparações consecutivas com amostra mínima.</div>
                <div className="mt-2 space-y-2">
                  {persistentRegressionRoutes.map((route) => (
                    <div key={route.path} className="rounded-md border bg-background px-2.5 py-2 text-xs">
                      <div className="font-medium">{route.path}</div>
                      <div className="mt-1 text-[11px] text-red-700">Intervenção recomendada: {route.recommendation}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {regressionRoutes.length ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-red-700">Regressões detectadas</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Rotas com confiança suficiente que pioraram versus o período anterior.</div>
                  </div>
                  <span className="rounded-full border border-red-500/30 bg-background px-2 py-0.5 text-[10px] font-semibold text-red-700">{regressionRoutes.length}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {regressionRoutes.map((route) => (
                    <div key={route.path} className="rounded-md border bg-background px-2.5 py-2 text-xs">
                      <div className="font-medium">{route.path}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>LCP {route.previous?.lcp == null || route.lcp == null ? "—" : `${Math.round(route.previous.lcp)} → ${Math.round(route.lcp)}ms`}</span>
                        <span>INP {route.previous?.inp == null || route.inp == null ? "—" : `${Math.round(route.previous.inp)} → ${Math.round(route.inp)}ms`}</span>
                        <span>CLS {route.previous?.cls == null || route.cls == null ? "—" : `${route.previous.cls.toFixed(3)} → ${route.cls.toFixed(3)}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-primary">Fila objetiva de otimização</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">Somente rotas com confiança suficiente e métricas fora da faixa boa.</div>
                </div>
                <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold">{actionableVitalRoutes.length} prioridades</span>
              </div>
              {slowServerOrNetwork ? (
                <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800">
                  TTFB p75 acima de 800 ms: há sinal de latência de servidor/rede além dos gargalos específicos das rotas.
                </div>
              ) : null}
              <div className="mt-2 space-y-2">
                {actionableVitalRoutes.length ? actionableVitalRoutes.map((route, index) => (
                  <div key={route.path} className="flex flex-col gap-1 rounded-md border bg-background px-2.5 py-2 text-xs md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{index + 1}. {route.path}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {route.samples} amostras · confiança {route.confidence} · prioridade composta {route.compositeScore} · Web Vitals {route.score}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-foreground/80">
                        Gargalo dominante: {route.bottleneck}
                      </div>
                      <div className={`mt-0.5 text-[11px] font-medium ${
                        route.trend.direction === "up"
                          ? "text-emerald-700"
                          : route.trend.direction === "down"
                            ? "text-red-700"
                            : "text-muted-foreground"
                      }`}>
                        Tendência versus período anterior: {route.trend.label}
                      </div>
                      {route.slowestApi ? (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          API mais lenta nesta rota: {route.slowestApi.endpoint} · p75 {route.slowestApi.p75 == null ? "—" : `${Math.round(route.slowestApi.p75)}ms`}
                          {route.slowestApi.transferP75 ? ` · ${Math.round(route.slowestApi.transferP75 / 1024)} KB transferidos` : ""}
                        </div>
                      ) : null}
                      {route.runtimeErrorCount > 0 ? (
                        <div className="mt-0.5 truncate text-[11px] text-red-700">
                          {route.runtimeErrorCount} erros observados nesta rota{route.topRuntimeError ? ` · ${route.topRuntimeError.message}` : ""}
                        </div>
                      ) : null}
                      <div className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-foreground/80">
                        Recomendação: {route.recommendation}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>LCP {route.lcp == null ? "—" : `${Math.round(route.lcp)}ms`}</span>
                      <span>INP {route.inp == null ? "—" : `${Math.round(route.inp)}ms`}</span>
                      <span>CLS {route.cls == null ? "—" : route.cls.toFixed(3)}</span>
                      <a
                        href={route.path}
                        className="ml-auto inline-flex h-7 items-center rounded-md border bg-background px-2 font-medium text-foreground hover:bg-muted"
                      >
                        Abrir rota
                      </a>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground">Nenhuma rota com confiança suficiente exige intervenção neste período.</div>}
              </div>
            </div>

            {(vitalsQuery.data.runtimeErrors?.length ?? 0) > 0 ? (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
                <div className="text-xs font-medium text-red-700">Erros de execução mais frequentes</div>
                <div className="mt-2 space-y-2">
                  {vitalsQuery.data.runtimeErrors!.slice(0, 8).map((error, index) => (
                    <div key={`${error.path}-${error.message}-${index}`} className="rounded-md border bg-background px-2.5 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate font-medium">{error.path}</div>
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold">{error.count} ocorrências</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{error.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(vitalsQuery.data.apiTimings?.length ?? 0) > 0 ? (
              <div className="mt-4 rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground">APIs mais lentas observadas no navegador</div>
                <div className="mt-2 space-y-2">
                  {vitalsQuery.data.apiTimings!.slice(0, 8).map((api) => (
                    <div key={api.endpoint} className="grid gap-1 rounded-md border px-2.5 py-2 text-xs md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-center">
                      <div className="truncate font-medium">{api.endpoint}</div>
                      <div className="text-muted-foreground">p75 {api.p75 == null ? "—" : `${Math.round(api.p75)}ms`}</div>
                      <div className="text-muted-foreground">mediana {api.median == null ? "—" : `${Math.round(api.median)}ms`}</div>
                      <div className="text-muted-foreground">{api.transferP75 ? `${Math.round(api.transferP75 / 1024)} KB` : "payload —"}</div>
                      <div className="text-muted-foreground">{api.samples} amostras</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground">Amostras por dispositivo</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="font-semibold">{vitalsQuery.data.devices.mobile}</div><div className="text-xs text-muted-foreground">Mobile</div></div>
                  <div><div className="font-semibold">{vitalsQuery.data.devices.tablet}</div><div className="text-xs text-muted-foreground">Tablet</div></div>
                  <div><div className="font-semibold">{vitalsQuery.data.devices.desktop}</div><div className="text-xs text-muted-foreground">Desktop</div></div>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground">Prioridade de otimização por rota</div>
                <div className="mt-2 space-y-2">
                  {rankedVitalRoutes.length ? rankedVitalRoutes.slice(0, 8).map((route, index) => (
                    <div key={route.path} className="rounded-md border px-2.5 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate font-medium">{index + 1}. {route.path}</div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          route.status === "crítica"
                            ? "border-red-500/30 bg-red-500/10 text-red-700"
                            : route.status === "atenção"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                              : route.status === "amostra baixa"
                                ? "border-slate-500/30 bg-slate-500/10 text-slate-700"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        }`}>{route.status}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                        <span>LCP {route.lcp == null ? "—" : `${Math.round(route.lcp)}ms`}</span>
                        <span>INP {route.inp == null ? "—" : `${Math.round(route.inp)}ms`}</span>
                        <span>CLS {route.cls == null ? "—" : route.cls.toFixed(3)}</span>
                        <span>{route.samples} amostras</span>
                        <span>confiança {route.confidence}</span>
                        <span>prioridade {route.score}</span>
                      </div>
                    </div>
                  )) : <div className="text-xs text-muted-foreground">Ainda não há amostras suficientes para priorizar rotas.</div>}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("realtime")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${mode === "realtime" ? "bg-primary text-primary-foreground" : "border bg-background"}`}><Radio className="h-4 w-4" />Tempo real</button>
          <button type="button" onClick={() => { setMode("history"); if (minutes < 1440) setMinutes(10080); }} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${mode === "history" ? "bg-primary text-primary-foreground" : "border bg-background"}`}><History className="h-4 w-4" />Histórico</button>
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          <option value={30}>Últimos 30 min</option><option value={60}>Última hora</option><option value={360}>Últimas 6 horas</option><option value={1440}>Últimas 24 horas</option><option value={10080}>Últimos 7 dias</option><option value={43200}>Últimos 30 dias</option><option value={129600}>Últimos 90 dias</option>
        </select>
      </div>

      <div className="grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead, cidade, página, sinal, campanha..." className="h-10 rounded-md border bg-background px-3 text-sm" />
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={surfaceFilter} onChange={(event) => setSurfaceFilter(event.target.value as typeof surfaceFilter)}>
          <option value="commercial">Site + LPs (comercial)</option><option value="all">Tudo</option><option value="app">Uso do App Web</option><option value="mobile">Uso do App Mobile</option><option value="unknown">Não classificado</option>
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as SessionStatus)}>
          <option value="all">Todos os sinais</option><option value="hot">Alta intenção</option><option value="remarketing">Remarketing</option><option value="identified">Leads identificados</option><option value="online">Online agora</option><option value="anonymous">Anônimos</option>
        </select>
        <button type="button" onClick={() => { setSearch(""); setSurfaceFilter("commercial"); setStatus("all"); }} className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted">Limpar</button>
      </div>

      {query.data?.truncated ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800">O período tem alto volume. A leitura comercial usa os eventos mais recentes disponíveis.</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,.85fr)]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div><h2 className="font-semibold">Visitantes e leads em movimento</h2><p className="text-xs text-muted-foreground">Priorizados por intenção, identificação, recorrência e atividade.</p></div><button type="button" onClick={() => query.refetch()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />Atualizar</button></div>
          {query.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando sinais…</div> : null}
          {query.isError ? <div className="p-6 text-sm text-destructive">Não foi possível carregar o rastreamento.</div> : null}
          {!query.isLoading && !filteredSessions.length ? <div className="p-6 text-sm text-muted-foreground">Nenhum visitante neste filtro.</div> : null}
          <div className="divide-y">
            {filteredSessions.map((session) => <button key={session.sessionId} type="button" onClick={() => selectSession(session.sessionId)} className={`w-full px-4 py-3 text-left hover:bg-muted/40 ${selectedSessionId === session.sessionId ? "bg-muted/40 ring-1 ring-inset ring-primary/20" : ""}`}>
              <div className="grid gap-2 lg:grid-cols-[minmax(210px,1.15fr)_minmax(200px,1fr)_115px_minmax(150px,.8fr)] lg:items-center">
                <div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${session.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} /><span className="truncate font-medium">{visitorLabel(session)}</span>{session.intent.score >= 60 ? <Flame className="h-4 w-4 text-blue-600" /> : null}</div><div className="mt-1 text-[11px] text-muted-foreground">{session.identified ? "Lead identificado" : "Visitante anônimo"} · {locationLabel(session)}</div></div>
                <div className="flex flex-wrap gap-1">{session.signalLabels.slice(0, 4).map((signal) => <span key={signal} className="rounded-full border bg-background px-2 py-0.5 text-[10px]">{signal}</span>)}{!session.signalLabels.length ? <span className="text-xs text-muted-foreground">Sem sinal forte ainda</span> : null}</div>
                <div><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stageClass(session.commercialStage)}`}>{session.intent.score}/100</span><div className="mt-1 text-[10px] text-muted-foreground">{session.commercialStageLabel}</div></div>
                <div className="text-xs"><div className="truncate font-medium">{session.currentPath || "/"}</div><div className="mt-1 text-muted-foreground">{duration(session.durationMs)} · {sourceLabel(session)}</div></div>
              </div>
            </button>)}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          {!selected ? <div className="flex min-h-96 flex-col items-center justify-center text-center text-sm text-muted-foreground"><Route className="mb-3 h-7 w-7" />Selecione um visitante para ver a leitura comercial, páginas, cliques, audiências e próxima ação.</div> : <div className="space-y-5">
            <div><div className="flex flex-wrap items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${selected.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} /><h2 className="font-semibold">{visitorLabel(selected)}</h2><span className={`rounded-full border px-2 py-0.5 text-[11px] ${stageClass(selected.commercialStage)}`}>{selected.commercialStageLabel} · {selected.intent.score}/100</span></div><p className="mt-1 text-xs text-muted-foreground">{locationLabel(selected)} · {sourceLabel(selected)}</p></div>

            <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3"><div className="text-xs font-medium text-primary">Leitura comercial</div><p className="mt-2 text-sm leading-6">{selected.commercialSummary}</p><div className="mt-3 rounded-md border bg-background p-2.5"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Próxima melhor ação</div><div className="mt-1 text-sm font-medium">{selected.nextBestAction}</div></div></div>

            <div><div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium">Audiências</h3></div><div className="flex flex-wrap gap-1.5">{selected.audienceTags.length ? selected.audienceTags.map((tag) => <span key={tag} className="rounded-full border bg-muted/40 px-2 py-1 text-[11px]">{tag}</span>) : <span className="text-xs text-muted-foreground">Ainda sem audiência específica.</span>}</div></div>

            {selected.campaigns.length ? <div><div className="text-xs text-muted-foreground">Campanhas relacionadas</div><div className="mt-1 flex flex-wrap gap-1.5">{selected.campaigns.map((campaign) => <span key={campaign} className="rounded-md border px-2 py-1 text-xs">{campaign}</span>)}</div></div> : null}

            <div><div className="mb-2 flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium">Tempo e interesse por página</h3></div><div className="space-y-2">{selected.pageBreakdown.length ? selected.pageBreakdown.slice(0, 8).map((page) => <div key={page.path} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border px-2.5 py-2"><div className="truncate text-xs font-medium">{page.path}</div><div className="text-xs text-muted-foreground">{duration(page.engagedMs)} · {page.views}x</div></div>) : <div className="text-xs text-muted-foreground">Tempo por página ainda não disponível nesta sessão.</div>}</div></div>

            <div><div className="mb-2 flex items-center gap-2"><MousePointerClick className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium">Cliques relevantes</h3></div><div className="space-y-2">{selected.clicks.length ? selected.clicks.slice(0, 8).map((click, index) => <div key={`${click.at}-${index}`} className="rounded-md border px-2.5 py-2"><div className="text-xs font-medium">{click.label}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{click.path || click.href || "—"}{click.at ? ` · ${new Date(click.at).toLocaleString("pt-BR")}` : ""}</div></div>) : <div className="text-xs text-muted-foreground">Nenhum CTA registrado nesta sessão.</div>}</div></div>

            <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-md border p-2"><div className="text-muted-foreground">Recorrência</div><div className="mt-1 font-semibold">{selected.recurrenceCount > 1 ? `${selected.recurrenceCount} sessões` : "Primeira sessão"}</div></div><div className="rounded-md border p-2"><div className="text-muted-foreground">Campanha atual</div><div className="mt-1 truncate font-semibold">{selected.campaign || "Sem campanha"}</div></div><div className="rounded-md border p-2"><div className="text-muted-foreground">Dispositivo</div><div className="mt-1 font-semibold">{[selected.device.type, selected.device.browser].filter(Boolean).join(" · ") || "—"}</div></div><div className="rounded-md border p-2"><div className="text-muted-foreground">Conversões</div><div className="mt-1 font-semibold">{selected.conversions}</div></div></div>

            <details><summary className="cursor-pointer text-sm font-medium">Jornada detalhada ({selected.eventCount} eventos)</summary><div className="mt-3 max-h-72 space-y-2 overflow-auto border-l pl-4">{selected.journey.map((item, index) => <div key={`${item.at}-${index}`} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border bg-background" /><div className="text-xs font-medium">{eventLabel(item.eventType)}{item.label ? ` · ${item.label}` : ""}</div><div className="truncate text-xs text-muted-foreground">{item.path || "—"}{item.engagedMs ? ` · ${duration(item.engagedMs)}` : ""}{item.at ? ` · ${new Date(item.at).toLocaleString("pt-BR")}` : ""}</div></div>)}</div></details>
          </div>}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><Globe2 className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="font-medium">Regra do fluxo</h3><p className="mt-1 text-sm text-muted-foreground">Todo visitante do site pode alimentar audiências comportamentais. Quando se identifica, o histórico é ligado ao lead, atualiza a próxima ação e o contexto do SDR; sinais fortes alimentam a oportunidade na Pipeline. Campanhas podem terminar sem apagar a jornada do lead.</p></div></div></div>
    </div>
  );
}
