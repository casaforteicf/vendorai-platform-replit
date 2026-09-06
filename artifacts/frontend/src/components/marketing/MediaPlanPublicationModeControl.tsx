import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CheckCircle2, Loader2, MousePointerClick, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const HOST_ATTR = "data-vendorai-media-plan-publication-mode";

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
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [settings, setSettings] = useState<PublicationSettings>(() => normalizeSettings());
  const [saved, setSaved] = useState<PublicationSettings>(() => normalizeSettings());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);

  const visible = useMemo(() => {
    const [path, query = ""] = location.split("?");
    const params = new URLSearchParams(query);
    return path === "/content" && (params.get("tab") ?? "gerador") === "planejamento";
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
      const plannerCard = Array.from(document.querySelectorAll<HTMLElement>(".overflow-hidden"))
        .find((element) => element.textContent?.includes("Planejador de Mídia com IA"));
      if (!plannerCard?.parentElement || !portalHost) return;
      if (portalHost.parentElement !== plannerCard.parentElement || plannerCard.nextElementSibling !== portalHost) {
        plannerCard.insertAdjacentElement("afterend", portalHost);
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
    fetch(`/api/tenants/${tenantId}/media-plan`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o modo de publicação.");
        return response.json() as Promise<MediaPlan | null>;
      })
      .then((nextPlan) => {
        if (cancelled) return;
        setPlan(nextPlan);
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
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar a execução orgânica.");
      setPlan(body);
      setSaved(settings);
      toast({
        title: settings.modo === "automatico" ? "Publicação automática autorizada" : "Revisão manual mantida",
        description: settings.modo === "automatico"
          ? `As peças orgânicas geradas serão publicadas na data do calendário às ${settings.horario}, no fuso ${settings.timezone}.`
          : "Nenhuma peça orgânica será publicada sem ação humana.",
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
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarClock className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Execução das publicações orgânicas</p>
              <Badge variant="outline" className="text-[10px]">Instagram · Facebook · LinkedIn</Badge>
              {plan.conteudo.statusPlanejamento === "aprovado" && <Badge className="bg-emerald-600 text-[10px]">Plano aprovado</Badge>}
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              A aprovação do plano autoriza a produção dos materiais. A publicação automática é uma autorização separada e pode permanecer manual.
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setSettings((current) => ({ ...current, modo: "manual" }))}
            className={`rounded-xl border p-3 text-left transition-colors ${settings.modo === "manual" ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40"}`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold"><MousePointerClick className="h-4 w-4" /> Revisão manual</div>
            <p className="mt-1 text-xs text-muted-foreground">O sistema prepara a peça e aguarda o usuário clicar em Publicar.</p>
          </button>
          <button
            type="button"
            onClick={() => setSettings((current) => ({ ...current, modo: "automatico" }))}
            className={`rounded-xl border p-3 text-left transition-colors ${settings.modo === "automatico" ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40"}`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> Automático no calendário</div>
            <p className="mt-1 text-xs text-muted-foreground">Somente peças já geradas e pertencentes a um plano aprovado entram na fila quando a data chegar.</p>
          </button>
        </div>

        {settings.modo === "automatico" && (
          <div className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-[180px_1fr] sm:items-end">
            <div>
              <p className="mb-1.5 text-xs font-medium">Horário padrão</p>
              <Input type="time" value={settings.horario} onChange={(event) => setSettings((current) => ({ ...current, horario: event.target.value }))} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">Fuso horário</p>
              <Input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} placeholder="America/Sao_Paulo" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Stories, Reels, Feed, Carrossel e LinkedIn usam o mesmo publicador e o mesmo status real: Na fila → Publicando → Publicado/Falhou.
          </div>
          <Button type="button" size="sm" onClick={() => void save()} disabled={!dirty || saving || !settings.horario.trim() || !settings.timezone.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
            Salvar modo de execução
          </Button>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
