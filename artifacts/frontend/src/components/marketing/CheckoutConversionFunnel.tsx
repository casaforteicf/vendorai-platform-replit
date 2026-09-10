import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShoppingCart, CreditCard, RefreshCw, CheckCircle2, TrendingUp } from "lucide-react";

const HOST_ATTR = "data-vendorai-checkout-conversion-funnel";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";

type FunnelGroup = {
  vertical: string;
  campaign: string;
  siteSlug: string;
  started: number;
  provisioned: number;
  pending: number;
  failed: number;
  contacted: number;
  recovered: number;
  conversionPercent: number;
  recoveryPercent: number;
};

type FunnelResponse = { groups: FunnelGroup[] };

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

export function CheckoutConversionFunnel() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [groups, setGroups] = useState<FunnelGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem(TOKEN_KEY) ?? "";
  const isSuperAdmin = readUser()?.platformRole === "super_admin";
  const visible = isSuperAdmin && isPlanPath(location);

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
      const response = await fetch("/api/admin/commerce/checkout-funnel", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json() as FunnelResponse;
      setGroups(data.groups ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || !token) return;
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token]);

  const totals = useMemo(() => {
    const started = groups.reduce((sum, row) => sum + row.started, 0);
    const provisioned = groups.reduce((sum, row) => sum + row.provisioned, 0);
    const pending = groups.reduce((sum, row) => sum + row.pending, 0);
    const contacted = groups.reduce((sum, row) => sum + row.contacted, 0);
    const recovered = groups.reduce((sum, row) => sum + row.recovered, 0);
    return {
      started,
      provisioned,
      pending,
      contacted,
      recovered,
      conversionPercent: started ? (provisioned / started) * 100 : 0,
      recoveryPercent: contacted ? (recovered / contacted) * 100 : 0,
    };
  }, [groups]);

  const leaders = useMemo(() => [...groups]
    .filter((row) => row.started > 0)
    .sort((a, b) => b.conversionPercent - a.conversionPercent || b.provisioned - a.provisioned)
    .slice(0, 6), [groups]);

  if (!visible || !host) return null;

  const metrics = [
    { label: "Checkouts iniciados", value: totals.started.toString(), icon: ShoppingCart },
    { label: "Conversão até ativação", value: `${totals.conversionPercent.toFixed(1)}%`, icon: CreditCard },
    { label: "Pendentes", value: totals.pending.toString(), icon: RefreshCw },
    { label: "Recuperação", value: `${totals.recoveryPercent.toFixed(1)}%`, icon: CheckCircle2 },
  ];

  return createPortal(
    <Card className="mt-3 border-emerald-500/20">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Funil real até pagamento</p>
              <Badge variant="secondary" className="text-[10px]">Asaas + provisionamento</Badge>
              <Badge variant="outline" className="text-[10px]">{groups.length} combinação(ões)</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">A IA passa a enxergar a campanha que realmente vira cliente ativo, não somente clique ou lead.</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border bg-background p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {leaders.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <div className="min-w-[720px] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><TrendingUp className="h-4 w-4" />Ranking por venda ativada</div>
              <div className="grid grid-cols-[1.2fr_1.5fr_1.2fr_.7fr_.7fr_.7fr] gap-2 border-b pb-2 text-[10px] font-medium text-muted-foreground">
                <span>Vertical</span><span>Campanha</span><span>LP</span><span>Iniciados</span><span>Ativados</span><span>Conversão</span>
              </div>
              {leaders.map((row) => (
                <div key={`${row.vertical}:${row.campaign}:${row.siteSlug}`} className="grid grid-cols-[1.2fr_1.5fr_1.2fr_.7fr_.7fr_.7fr] gap-2 border-b py-2 text-xs last:border-0">
                  <span className="truncate font-medium">{row.vertical}</span>
                  <span className="truncate">{row.campaign}</span>
                  <span className="truncate text-muted-foreground">{row.siteSlug}</span>
                  <span>{row.started}</span>
                  <span>{row.provisioned}</span>
                  <span className="font-semibold">{row.conversionPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>,
    host,
  );
}
