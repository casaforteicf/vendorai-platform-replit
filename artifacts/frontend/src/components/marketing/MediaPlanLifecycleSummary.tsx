import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Loader2, PackageCheck, Send, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-media-plan-lifecycle-summary";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type CalendarStatus = "planejado" | "aprovado" | "recusado" | "gerado" | "publicado" | "pulado";
type CalendarItem = { id: string; mediaPlanId?: string | null; status: CalendarStatus };
type MediaPlan = { id: string; conteudo?: { statusPlanejamento?: "gerado" | "em_revisao" | "aprovado" } };

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
  return { tenantId: override?.id ?? user?.tenantId ?? "", token: localStorage.getItem(TOKEN_KEY) ?? "" };
}

function isPlanPath(location: string) {
  const [path, query = ""] = location.split("?");
  if (["/marketing/plano-de-midia", "/marketing/media-plan", "/plano-de-midia"].includes(path)) return true;
  const params = new URLSearchParams(query);
  return path === "/content" && (params.get("tab") ?? "") === "planejamento" && params.get("advanced") === "1";
}

function findAnchor() {
  return document.querySelector<HTMLElement>("[data-vendorai-media-plan-preparation-actions]")
    ?? document.querySelector<HTMLElement>("[data-vendorai-media-plan-performance-command-center]");
}

export function MediaPlanLifecycleSummary() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { tenantId, token } = readSession();
  const visible = isPlanPath(location);

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
    if (!visible || !tenantId || !token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const planResponse = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers, cache: "no-store" });
      const nextPlan = planResponse.ok ? await planResponse.json() as MediaPlan | null : null;
      setPlan(nextPlan);
      if (!nextPlan) { setItems([]); return; }
      const calendarResponse = await fetch(`/api/tenants/${tenantId}/content-calendar`, { headers, cache: "no-store" });
      const calendar = calendarResponse.ok ? await calendarResponse.json() as CalendarItem[] : [];
      setItems(calendar.filter((item) => item.mediaPlanId === nextPlan.id));
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
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tenantId, token]);

  const summary = useMemo(() => {
    const total = items.length;
    const awaiting = items.filter((item) => item.status === "planejado").length;
    const rejected = items.filter((item) => item.status === "recusado").length;
    const skipped = items.filter((item) => item.status === "pulado").length;
    const approved = items.filter((item) => ["aprovado", "gerado", "publicado"].includes(item.status)).length;
    const notStarted = items.filter((item) => item.status === "planejado" || item.status === "aprovado").length;
    const inProduction = items.filter((item) => item.status === "gerado").length;
    const published = items.filter((item) => item.status === "publicado").length;
    const blocked = rejected + skipped;
    return { total, awaiting, approved, rejected, skipped, notStarted, inProduction, published, blocked };
  }, [items]);

  if (!visible || !host || !plan) return null;

  const approval = [
    { label: "Aguardando", value: summary.awaiting, icon: CircleDashed },
    { label: "Aprovadas", value: summary.approved, icon: CheckCircle2 },
    { label: "Recusadas", value: summary.rejected, icon: XCircle },
    { label: "Ignoradas", value: summary.skipped, icon: ShieldAlert },
  ];
  const execution = [
    { label: "Não iniciadas", value: summary.notStarted, icon: CircleDashed },
    { label: "Produção iniciada", value: summary.inProduction, icon: PackageCheck },
    { label: "Publicadas", value: summary.published, icon: Send },
    { label: "Fora da execução", value: summary.blocked, icon: ShieldAlert },
  ];

  return createPortal(
    <Card className="mt-3 border-primary/20">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Governança do fluxo</p>
              <Badge variant="outline" className="text-[10px]">aprovação ≠ execução</Badge>
              <Badge variant="secondary" className="text-[10px]">{summary.total} ações</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Aprovar uma ação libera a produção, mas não significa que ela já foi produzida ou publicada. Os dois estados ficam visíveis separadamente.</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs font-semibold">Aprovação editorial</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {approval.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-lg border bg-muted/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
                  <p className="mt-1 text-base font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs font-semibold">Execução operacional</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {execution.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-lg border bg-muted/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
                  <p className="mt-1 text-base font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
