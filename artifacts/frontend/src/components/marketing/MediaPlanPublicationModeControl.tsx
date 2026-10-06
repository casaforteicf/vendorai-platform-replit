import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, CalendarClock, CheckCircle2, Eye, Loader2, Send, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const HOST_ATTR = "data-vendorai-media-plan-publication-mode";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type PublicationSettings = {
  modo: "manual" | "automatico";
  horario: string;
  timezone: string;
};

type MediaPlan = {
  id: string;
  conteudo: {
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    publicacaoOrganica?: Partial<PublicationSettings>;
  };
};

type PerformanceInsight = {
  baseadoEmPosts: number;
  atualizadoEm?: string | null;
  aprendizados?: {
    temasQueFuncionam: string[];
    temasQueNaoFuncionam: string[];
    formatoQueMaisEngaja: string;
    observacoes: string;
  } | null;
};

function readJsonStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readSession() {
  const tenantOverride = readJsonStorage<{ id?: string }>(OVERRIDE_KEY);
  const user = readJsonStorage<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return {
    token: window.localStorage.getItem(TOKEN_KEY) ?? "",
    tenantId: tenantOverride?.id ?? user?.tenantId ?? "",
  };
}

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

function normalizeSettings(value?: Partial<PublicationSettings>): PublicationSettings {
  return {
    modo: value?.modo === "automatico" ? "automatico" : "manual",
    horario: typeof value?.horario === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.horario) ? value.horario : "10:00",
    timezone: typeof value?.timezone === "string" && value.timezone.trim() ? value.timezone : defaultTimezone(),
  };
}

export function MediaPlanPublicationModeControl() {
  const { toast } = useToast();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [performanceInsight, setPerformanceInsight] = useState<PerformanceInsight | null>(null);
  const [settings, setSettings] = useState<PublicationSettings>(() => normalizeSettings());
  const [saved, setSaved] = useState<PublicationSettings>(() => normalizeSettings());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const { tenantId, token } = readSession();

  const visible = useMemo(() => {
    const [path, query = ""] = location.split("?");
    const params = new URLSearchParams(query);
    const contentPlanner = path === "/content" && (params.get("tab") ?? "gerador") === "planejamento";
    const dedicatedPlanner = path === "/marketing/plano-de-midia" || path === "/marketing/media-plan" || path === "/plano-de-midia";
    return contentPlanner || dedicatedPlanner;
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

    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) {
      portalHost = document.createElement("div");
      portalHost.setAttribute(HOST_ATTR, "true");
    }

    const attach = () => {
      const plannerBody = document.querySelector<HTMLElement>(".marketing-plan-responsive");
      if (!plannerBody?.parentElement || !portalHost) return;
      if (portalHost.parentElement !== plannerBody.parentElement || plannerBody.nextElementSibling !== portalHost) {
        plannerBody.insertAdjacentElement("afterend", portalHost);
      }
      setHost((current) => current === portalHost ? current : portalHost);
    };

    attach();
    const timer = window.setInterval(attach, 500);
    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/tenants/${tenantId}/media-plan`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
    ])
      .then(async ([planResponse, insightResponse]) => {
        if (!planResponse.ok) throw new Error("Não foi possível carregar a preferência de publicação.");
        const nextPlan = await planResponse.json() as MediaPlan | null;
        const nextInsight = insightResponse.ok ? await insightResponse.json() as PerformanceInsight | null : null;
        return { nextPlan, nextInsight };
      })
      .then(({ nextPlan, nextInsight }) => {
        if (cancelled) return;
        setPlan(nextPlan);
        setPerformanceInsight(nextInsight);
        const next = normalizeSettings(nextPlan?.conteudo.publicacaoOrganica);
        setSettings(next);
        setSaved(next);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tenantId, token, visible]);

  const dirty = settings.modo !== saved.modo || settings.horario !== saved.horario || settings.timezone !== saved.timezone;

  async function save() {
    if (!plan || !tenantId || !token || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: { publicacaoOrganica: settings },
          ...(plan.conteudo.statusPlanejamento === "aprovado" ? { aprovar: true } : {}),
        }),
      });
      const body = await response.json().catch(() => ({})) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar a preferência de publicação.");
      setPlan(body);
      setSaved(settings);
      toast({
        title: settings.modo === "automatico" ? "Publicação automática ativada" : "Revisão antes de publicar ativada",
        description: settings.modo === "automatico"
          ? "Quando a peça estiver pronta, ela seguirá o calendário aprovado nos canais conectados sem precisar deixar o VendorAI aberto."
          : "A IA continuará preparando as peças, mas você fará a aprovação final antes da publicação.",
      });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !host || !plan) return null;

  return createPortal(
    <Card className="mt-3 border-primary/25 bg-primary/[0.025]">
      <CardContent className="py-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Send className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Modo de publicação</p>
              <Badge variant="outline" className="text-[10px]">Instagram · Facebook · LinkedIn · TikTok · YouTube</Badge>
              {plan.conteudo.statusPlanejamento === "aprovado" && <Badge className="bg-emerald-600 text-[10px]">Plano aprovado</Badge>}
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              Esta escolha define o que acontece depois que o conteúdo estiver produzido e pronto. No automático, o VendorAI publica nos canais conectados seguindo data e horário do calendário.
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="rounded-lg border bg-background px-3 py-2.5 text-xs">
          <span className="text-muted-foreground">Sequência</span>
          <p className="mt-0.5 font-medium">Plano aprovado → Produção → Peça pronta → Revisão opcional → Publicação multicanal</p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setSettings((current) => ({ ...current, modo: "manual" }))}
            className={`rounded-xl border p-3 text-left transition-colors ${settings.modo === "manual" ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40"}`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4" /> Revisar antes de publicar</div>
            <p className="mt-1 text-xs text-muted-foreground">A IA cria e deixa a peça pronta. Você revisa e confirma a publicação.</p>
          </button>

          <button
            type="button"
            onClick={() => setSettings((current) => ({ ...current, modo: "automatico" }))}
            className={`rounded-xl border p-3 text-left transition-colors ${settings.modo === "automatico" ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40"}`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> Publicar automaticamente</div>
            <p className="mt-1 text-xs text-muted-foreground">A IA prepara cada formato e publica automaticamente em todos os canais conectados previstos no planejamento.</p>
          </button>
        </div>

        {settings.modo === "automatico" && (
          <div className="space-y-3 rounded-xl border bg-background p-3">
            <div>
              <p className="text-xs font-medium">Horário padrão de publicação</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Cada item pode ter horário próprio no calendário. Este horário é usado quando nenhum horário específico tiver sido definido. Canais desconectados ou sem autorização não são publicados até a conexão ser regularizada.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
              <div>
                <p className="mb-1.5 text-xs font-medium">Horário padrão</p>
                <Input type="time" value={settings.horario} onChange={(event) => setSettings((current) => ({ ...current, horario: event.target.value }))} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium">Fuso horário</p>
                <Input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} placeholder="America/Sao_Paulo" />
              </div>
            </div>
          </div>
        )}

        {performanceInsight?.aprendizados && (
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/10">
            <div className="flex flex-wrap items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              <p className="text-sm font-semibold">Resultados e aprendizado</p>
              <Badge variant="outline" className="text-[10px]">{performanceInsight.baseadoEmPosts} posts analisados</Badge>
              <Badge variant="outline" className="gap-1 text-[10px]"><TrendingUp className="h-3 w-3" /> Próximo ciclo</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Depois da publicação, os resultados reais alimentam o próximo planejamento sem alterar um plano já aprovado.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border bg-background/80 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que funcionou</p>
                <p className="mt-1 text-xs font-medium">{performanceInsight.aprendizados.temasQueFuncionam.join(" · ") || "Ainda sem padrão suficiente"}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Formato mais forte</p>
                <p className="mt-1 text-xs font-medium">{performanceInsight.aprendizados.formatoQueMaisEngaja || "Ainda em aprendizado"}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ajuste recomendado</p>
                <p className="mt-1 text-xs font-medium">{performanceInsight.aprendizados.observacoes || "Continuar coletando dados reais."}</p>
              </div>
            </div>
            {performanceInsight.aprendizados.temasQueNaoFuncionam.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Reformular/evitar: <span className="font-medium text-foreground">{performanceInsight.aprendizados.temasQueNaoFuncionam.join(" · ")}</span></p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Produção e publicação continuam separadas. A peça só pode ser publicada depois de estar pronta.
          </div>
          <Button type="button" size="sm" onClick={() => void save()} disabled={!dirty || saving || !settings.horario.trim() || !settings.timezone.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="mr-1.5 h-3.5 w-3.5" />}
            Salvar preferência
          </Button>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
