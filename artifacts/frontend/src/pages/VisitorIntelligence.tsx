import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Flame, MapPin, MonitorSmartphone, MousePointerClick, Radio, UserCheck, Users } from "lucide-react";

const API_BASE = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");

type JourneyItem = { path: string | null; pageUrl: string | null; at: string | null };
type IntentSummary = {
  score: number;
  tier: "baixo" | "medio" | "alto" | "muito_alto";
  tierLabel: string;
  recommendedAction: string;
  reasons: string[];
};
type VisitorSession = {
  sessionId: string;
  online: boolean;
  hotOpportunity: boolean;
  identified: boolean;
  leadId: string | null;
  currentPath: string | null;
  referrer: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  durationMs: number;
  pageViews: number;
  ctaClicks: number;
  formStarts: number;
  formSubmits: number;
  maxScrollDepth: number;
  maxEngagedMs: number;
  intent: IntentSummary;
  geo: { country: string | null; region: string | null; city: string | null };
  device: { type: string | null; browser: string | null; os: string | null };
  source: string | null;
  medium: string | null;
  campaign: string | null;
  journey: JourneyItem[];
};

type VisitorResponse = {
  generatedAt: string;
  totals: { visitors: number; pageViews: number; conversions: number; onlineNow: number; identified: number; hotNow: number };
  hotOpportunities: VisitorSession[];
  sessions: VisitorSession[];
};

function duration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function locationLabel(session: VisitorSession) {
  return [session.geo.city, session.geo.region, session.geo.country].filter(Boolean).join(" / ") || "Localização não disponível";
}

function sourceLabel(session: VisitorSession) {
  return [session.source, session.medium, session.campaign].filter(Boolean).join(" · ") || session.referrer || "Direto / desconhecido";
}

function intentClass(tier: IntentSummary["tier"]) {
  if (tier === "muito_alto") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (tier === "alto") return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (tier === "medio") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
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

export default function VisitorIntelligence() {
  const [minutes, setMinutes] = useState(60);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["visitor-intelligence", minutes],
    queryFn: () => loadVisitors(minutes),
    refetchInterval: 15_000,
  });

  const selected = useMemo(
    () => query.data?.sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [query.data, selectedSessionId],
  );

  const totals = query.data?.totals ?? { visitors: 0, pageViews: 0, conversions: 0, onlineNow: 0, identified: 0, hotNow: 0 };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitor Intelligence</h1>
          <p className="text-sm text-muted-foreground">Acompanhe visitantes, origem, localização aproximada, tela atual, jornada e intenção comercial.</p>
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
        >
          <option value={30}>Últimos 30 min</option>
          <option value={60}>Última hora</option>
          <option value={360}>Últimas 6 horas</option>
          <option value={1440}>Últimas 24 horas</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Quentes agora", value: totals.hotNow, icon: Flame },
          { label: "Online agora", value: totals.onlineNow, icon: Radio },
          { label: "Visitantes", value: totals.visitors, icon: Users },
          { label: "Páginas", value: totals.pageViews, icon: Activity },
          { label: "Identificados", value: totals.identified, icon: UserCheck },
          { label: "Conversões", value: totals.conversions, icon: MousePointerClick },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {query.data?.hotOpportunities?.length ? (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-600" />
            <div>
              <h2 className="font-semibold">Oportunidades quentes agora</h2>
              <p className="text-xs text-muted-foreground">Visitantes online com Behavior Intent a partir de 60/100.</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {query.data.hotOpportunities.slice(0, 6).map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => setSelectedSessionId(session.sessionId)}
                className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${intentClass(session.intent.tier)}`}>{session.intent.score}/100</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"} · {locationLabel(session)}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-medium">Sessões recentes</h2>
          </div>
          <div className="divide-y">
            {query.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando visitantes…</div>}
            {query.isError && <div className="p-6 text-sm text-destructive">Não foi possível carregar os visitantes.</div>}
            {!query.isLoading && query.data?.sessions.length === 0 && <div className="p-6 text-sm text-muted-foreground">Nenhuma sessão neste período.</div>}
            {query.data?.sessions.map((session) => (
              <button
                type="button"
                key={session.sessionId}
                onClick={() => setSelectedSessionId(session.sessionId)}
                className="grid w-full gap-2 px-4 py-3 text-left hover:bg-muted/50 md:grid-cols-[minmax(180px,1.1fr)_minmax(150px,0.7fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto] md:items-center"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${session.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    {session.identified ? "Visitante identificado" : `Visitante ${session.sessionId.slice(0, 8)}`}
                    {session.hotOpportunity ? <Flame className="h-4 w-4 text-orange-600" /> : null}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{session.currentPath || "/"}</div>
                </div>
                <div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${intentClass(session.intent.tier)}`}>{session.intent.score}/100 · {session.intent.tierLabel}</span></div>
                <div className="text-sm"><MapPin className="mr-1 inline h-3.5 w-3.5" />{locationLabel(session)}</div>
                <div className="truncate text-sm text-muted-foreground">{sourceLabel(session)}</div>
                <div className="text-xs text-muted-foreground">{session.pageViews} pág. · {duration(session.durationMs)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          {!selected ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <MonitorSmartphone className="mb-3 h-7 w-7" />
              Selecione uma sessão para ver a jornada completa.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${selected.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} /><h2 className="font-medium">{selected.identified ? "Visitante identificado" : `Visitante ${selected.sessionId.slice(0, 8)}`}</h2></div>
                <p className="mt-1 text-xs text-muted-foreground">{locationLabel(selected)}</p>
              </div>

              <div className={`rounded-lg border p-3 ${intentClass(selected.intent.tier)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs opacity-80">Behavior Intent</div><div className="text-lg font-semibold">{selected.intent.score}/100 · {selected.intent.tierLabel}</div></div>
                  {selected.hotOpportunity ? <Flame className="h-6 w-6" /> : null}
                </div>
                <p className="mt-2 text-xs leading-5">{selected.intent.recommendedAction}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Página atual</div><div className="mt-1 break-all">{selected.currentPath || "/"}</div></div>
                <div><div className="text-xs text-muted-foreground">Origem</div><div className="mt-1 break-all">{sourceLabel(selected)}</div></div>
                <div><div className="text-xs text-muted-foreground">Páginas</div><div className="mt-1">{selected.pageViews}</div></div>
                <div><div className="text-xs text-muted-foreground">CTAs</div><div className="mt-1">{selected.ctaClicks}</div></div>
                <div><div className="text-xs text-muted-foreground">Scroll máx.</div><div className="mt-1">{selected.maxScrollDepth}%</div></div>
                <div><div className="text-xs text-muted-foreground">Tempo</div><div className="mt-1">{duration(selected.durationMs)}</div></div>
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
                <h3 className="text-sm font-medium">Jornada</h3>
                <div className="mt-3 space-y-3 border-l pl-4">
                  {selected.journey.map((item, index) => (
                    <div key={`${item.at}-${index}`} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border bg-background" />
                      <div className="break-all">{item.path || "/"}</div>
                      <div className="text-xs text-muted-foreground">{item.at ? new Date(item.at).toLocaleString("pt-BR") : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
