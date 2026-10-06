import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CheckCircle2, FileText, Loader2, Megaphone, Save, Search, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const HOST_ATTR = "data-vendorai-media-plan-lp-strategy";
const PUBLICATION_HOST_ATTR = "data-vendorai-media-plan-publication-mode";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type BaseLandingPage = {
  tipo: "dor" | "marketing" | "crm";
  nome: string;
  objetivo: string;
  obrigatoria: false;
};

type LandingPageStrategy = {
  versao: 1;
  segmento: string;
  nicho: string;
  regra: "templates_base_adaptaveis";
  base: BaseLandingPage[];
  estrategicas: string[];
  atualizadoEm?: string;
};

type MediaPlan = {
  id: string;
  conteudo: {
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    estrategiaLandingPages?: LandingPageStrategy;
  };
  contextoUsado?: {
    configuracaoPlanejamento?: {
      produtoServicoPrioritario?: string;
      publicoPrioritario?: string;
    } | null;
  } | null;
};

const BASE_LPS: BaseLandingPage[] = [
  {
    tipo: "dor",
    nome: "LP Dor / Descoberta",
    objetivo: "Falar com quem sente os problemas do segmento, mas ainda não sabe que precisa de uma solução como o VendorAI. Deve trabalhar as 10 dores principais, sintomas, impacto e descoberta da solução.",
    obrigatoria: false,
  },
  {
    tipo: "marketing",
    nome: "LP Marketing / Crescimento",
    objetivo: "Falar com quem quer atrair mais clientes e vender mais. Deve conectar conteúdo, Meta, Google, criativos, campanhas, páginas, WhatsApp, captação, rastreamento e conversão.",
    obrigatoria: false,
  },
  {
    tipo: "crm",
    nome: "LP CRM / Alta intenção",
    objetivo: "Falar com quem já procura CRM, automação ou inteligência comercial. Deve apresentar CRM com IA, WhatsApp, pipeline, follow-up, agentes, prospecção, integrações e diferenciais.",
    obrigatoria: false,
  },
];

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

function defaultStrategy(plan: MediaPlan): LandingPageStrategy {
  return {
    versao: 1,
    segmento: plan.contextoUsado?.configuracaoPlanejamento?.produtoServicoPrioritario?.trim() ?? "",
    nicho: "",
    regra: "templates_base_adaptaveis",
    base: BASE_LPS,
    estrategicas: [],
  };
}

function normalizeStrategy(plan: MediaPlan): LandingPageStrategy {
  const current = plan.conteudo.estrategiaLandingPages;
  if (!current) return defaultStrategy(plan);
  return {
    versao: 1,
    segmento: current.segmento ?? "",
    nicho: current.nicho ?? "",
    regra: "templates_base_adaptaveis",
    base: BASE_LPS,
    estrategicas: Array.isArray(current.estrategicas) ? current.estrategicas.filter(Boolean) : [],
    atualizadoEm: current.atualizadoEm,
  };
}

function iconFor(type: BaseLandingPage["tipo"]) {
  if (type === "dor") return Target;
  if (type === "marketing") return Megaphone;
  return Search;
}

export function MediaPlanLandingPageStrategy() {
  const { toast } = useToast();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [strategy, setStrategy] = useState<LandingPageStrategy | null>(null);
  const [saved, setSaved] = useState<LandingPageStrategy | null>(null);
  const [extrasText, setExtrasText] = useState("");
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
      const publicationHost = document.querySelector<HTMLElement>(`[${PUBLICATION_HOST_ATTR}]`);
      if (publicationHost?.parentElement === plannerBody.parentElement) {
        if (portalHost.parentElement !== plannerBody.parentElement || portalHost.nextElementSibling !== publicationHost) {
          publicationHost.insertAdjacentElement("beforebegin", portalHost);
        }
      } else if (portalHost.parentElement !== plannerBody.parentElement) {
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
    fetch(`/api/tenants/${tenantId}/media-plan`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a estratégia de landing pages.");
        return await response.json() as MediaPlan | null;
      })
      .then((nextPlan) => {
        if (cancelled || !nextPlan) return;
        const nextStrategy = normalizeStrategy(nextPlan);
        setPlan(nextPlan);
        setStrategy(nextStrategy);
        setSaved(nextStrategy);
        setExtrasText(nextStrategy.estrategicas.join(", "));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tenantId, token, visible]);

  const extras = useMemo(() => extrasText.split(/[,\n]/).map((item) => item.trim()).filter(Boolean), [extrasText]);
  const dirty = Boolean(strategy && saved && (
    strategy.segmento !== saved.segmento ||
    strategy.nicho !== saved.nicho ||
    extras.join("|") !== saved.estrategicas.join("|")
  ));

  async function persist(openGenerator = false) {
    if (!plan || !strategy || !tenantId || !token || saving) return;
    const next: LandingPageStrategy = {
      ...strategy,
      base: BASE_LPS,
      estrategicas: extras,
      regra: "templates_base_adaptaveis",
      atualizadoEm: new Date().toISOString(),
    };
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: { estrategiaLandingPages: next },
          ...(plan.conteudo.statusPlanejamento === "aprovado" ? { aprovar: true } : {}),
        }),
      });
      const body = await response.json().catch(() => ({})) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar a estratégia de landing pages.");
      setPlan(body);
      setStrategy(next);
      setSaved(next);
      toast({
        title: "Estratégia de LPs salva",
        description: "As 3 LPs Base permanecem obrigatórias. LPs Estratégicas são complementares e nunca substituem Dor, Marketing e CRM.",
      });
      if (openGenerator) {
        const params = new URLSearchParams({ tab: "gerador", source: "landing-pages", mediaPlanId: plan.id });
        window.history.pushState(window.history.state, "", `/content?${params.toString()}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !host || !plan || !strategy) return null;

  return createPortal(
    <Card className="mt-3 border-primary/25 bg-primary/[0.025]">
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Estratégia de Landing Pages</p>
              <Badge variant="outline" className="text-[10px]">3 modelos de LP</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              Use estes modelos como referência. O Vendi deve adaptar, combinar ou dispensar páginas conforme objetivo, oferta, público e estágio do funil.
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium">Segmento</p>
            <Input
              value={strategy.segmento}
              onChange={(event) => setStrategy((current) => current ? { ...current, segmento: event.target.value } : current)}
              placeholder="Ex.: Distribuição, Saúde, Construção"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium">Nicho</p>
            <Input
              value={strategy.nicho}
              onChange={(event) => setStrategy((current) => current ? { ...current, nicho: event.target.value } : current)}
              placeholder="Ex.: Distribuidora de autopeças"
            />
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-3">
          {BASE_LPS.map((lp) => {
            const Icon = iconFor(lp.tipo);
            return (
              <div key={lp.tipo} className="rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{lp.nome}</div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{lp.objetivo}</p>
                <Badge variant="secondary" className="mt-3 text-[10px]">Modelo sugerido</Badge>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border bg-background p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">LPs Estratégicas adicionais</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            O Planejador pode acrescentar páginas para campanhas, sazonalidades, produtos, regiões, eventos ou dores específicas. Separe por vírgula ou linha.
          </p>
          <textarea
            value={extrasText}
            onChange={(event) => setExtrasText(event.target.value)}
            className="mt-3 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex.: Black Friday, recuperação de clientes parados, lançamento de produto, campanha regional"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Regra: <span className="font-medium text-foreground">gere somente as páginas que fizerem sentido para a estratégia aprovada.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void persist(false)} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Salvar estratégia
            </Button>
            <Button type="button" size="sm" onClick={() => void persist(true)} disabled={saving || !strategy.segmento.trim()}>
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              Levar ao Gerador de Conteúdo
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
