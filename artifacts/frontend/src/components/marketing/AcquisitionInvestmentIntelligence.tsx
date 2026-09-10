import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, FlaskConical, Loader2, Minus, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-acquisition-investment-intelligence";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";

type Dimension = "vertical" | "offer" | "landing_page" | "channel" | "creative" | "campaign";
type Recommendation = "scale" | "maintain" | "test" | "reduce";
type Row = {
  dimension: Dimension;
  key: string;
  label: string;
  started: number;
  provisioned: number;
  conversionPercent: number;
  recoveryPercent: number;
  evidencePercent: number;
  investmentScore: number;
  recommendation: Recommendation;
};
type Payload = {
  generatedAt: string;
  best: Row | null;
  weakest: Row | null;
  dimensions: Array<{ dimension: Dimension; rows: Row[] }>;
};

const dimensionLabels: Record<Dimension, string> = {
  vertical: "Vertical",
  offer: "Oferta",
  landing_page: "Landing page",
  channel: "Canal",
  creative: "Criativo",
  campaign: "Campanha",
};

const recommendationLabels: Record<Recommendation, string> = {
  scale: "Escalar",
  maintain: "Manter",
  test: "Testar",
  reduce: "Reduzir",
};

function readUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) as { platformRole?: string } : null;
  } catch {
    return null;
  }
}

function isPlanPath(location: string) {
  const [path, query = ""] = location.split("?");
  if (["/marketing/plano-de-midia", "/marketing/media-plan", "/plano-de-midia"].includes(path)) return true;
  return path === "/content" && (new URLSearchParams(query).get("tab") ?? "") === "planejamento";
}

function findAnchor() {
  return document.querySelector<HTMLElement>("[data-vendorai-media-plan-lifecycle-summary]")
    ?? document.querySelector<HTMLElement>("[data-vendorai-media-plan-performance-command-center]");
}

function RecommendationIcon({ recommendation }: { recommendation: Recommendation }) {
  if (recommendation === "scale") return <ArrowUpRight className="h-3.5 w-3.5" />;
  if (recommendation === "reduce") return <ArrowDownRight className="h-3.5 w-3.5" />;
  if (recommendation === "test") return <FlaskConical className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

export function AcquisitionInvestmentIntelligence() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const visible = isPlanPath(location) && readUser()?.platformRole === "super_admin";
  const token = localStorage.getItem(TOKEN_KEY) ?? "";

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 400);
    return () => { window.removeEventListener("popstate", update); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!visible) { setHost(null); return; }
    let portal = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portal) {
      portal = document.createElement("div");
      portal.setAttribute(HOST_ATTR, "true");
    }
    const attach = () => {
      const anchor = findAnchor();
      if (!anchor?.parentElement || !portal) return;
      if (portal.parentElement !== anchor.parentElement || anchor.nextElementSibling !== portal) anchor.insertAdjacentElement("afterend", portal);
      setHost((current) => current === portal ? current : portal);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => { window.clearInterval(timer); portal?.remove(); };
  }, [visible]);

  async function load() {
    if (!visible || !token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/commerce/investment-intelligence", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.ok) setData(await response.json() as Payload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || !token) return;
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token]);

  const leaders = useMemo(() => {
    if (!data) return [];
    return data.dimensions.map((group) => group.rows[0]).filter(Boolean) as Row[];
  }, [data]);

  if (!visible || !host || !data) return null;

  return createPortal(
    <Card className="mt-3 border-primary/20">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Target className="h-4 w-4" />
              <p className="text-sm font-semibold">Inteligência de investimento por venda real</p>
              <Badge variant="outline" className="text-[10px]">LP → pagamento → ativação</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Compara vertical, oferta, LP, canal, criativo e campanha. O score prioriza conversão paga, recuperação e volume de evidência.
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Melhor sinal com evidência</p>
            {data.best ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{data.best.label}</p>
                  <p className="text-xs text-muted-foreground">{dimensionLabels[data.best.dimension]} · {data.best.provisioned}/{data.best.started} ativações</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{data.best.investmentScore.toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">score investimento</p>
                </div>
              </div>
            ) : <p className="mt-2 text-xs text-muted-foreground">Ainda sem volume suficiente.</p>}
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Maior ponto de atenção</p>
            {data.weakest ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{data.weakest.label}</p>
                  <p className="text-xs text-muted-foreground">{dimensionLabels[data.weakest.dimension]} · conversão {data.weakest.conversionPercent.toFixed(1)}%</p>
                </div>
                <Badge variant="secondary">{recommendationLabels[data.weakest.recommendation]}</Badge>
              </div>
            ) : <p className="mt-2 text-xs text-muted-foreground">Ainda sem volume suficiente.</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {leaders.map((row) => (
            <div key={`${row.dimension}:${row.key}`} className="rounded-xl border bg-muted/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{dimensionLabels[row.dimension]}</p>
                  <p className="mt-1 truncate text-sm font-semibold">{row.label}</p>
                </div>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <RecommendationIcon recommendation={row.recommendation} />
                  {recommendationLabels[row.recommendation]}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-base font-semibold">{row.investmentScore.toFixed(0)}%</p><p className="text-[10px] text-muted-foreground">score</p></div>
                <div><p className="text-base font-semibold">{row.conversionPercent.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground">conversão</p></div>
                <div><p className="text-base font-semibold">{row.started}</p><p className="text-[10px] text-muted-foreground">checkouts</p></div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
