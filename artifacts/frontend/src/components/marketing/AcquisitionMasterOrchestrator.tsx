import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const HOST_ATTR = "data-vendorai-acquisition-master-orchestrator";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";

type Allocation = {
  key: string;
  label: string;
  score: number;
  recommendation: "scale" | "maintain" | "test" | "reduce";
  evidenceStarts: number;
  paidActivations: number;
  conversionPercent: number;
  targetPercent: number;
  targetAmount: number;
};
type Config = {
  totalBudget: string;
  active: boolean;
  period: string;
  autonomy: "recommend_only" | "approval_required" | "autonomous";
  guardrails: { reservePercent: number; minimumEvidenceStarts: number; maxShiftPercentPerCycle: number };
  lastPlan?: { generatedAt: string; reserveAmount: number; availableBudget: number; allocations: Allocation[] } | null;
  lastApprovedAt?: string | null;
};

function readUser() {
  try { const raw = localStorage.getItem(USER_CACHE_KEY); return raw ? JSON.parse(raw) as { platformRole?: string } : null; }
  catch { return null; }
}
function isPlanPath(location: string) {
  const [path, query = ""] = location.split("?");
  if (["/marketing/plano-de-midia", "/marketing/media-plan", "/plano-de-midia"].includes(path)) return true;
  return path === "/content" && (new URLSearchParams(query).get("tab") ?? "") === "planejamento";
}
function findAnchor() {
  return document.querySelector<HTMLElement>("[data-vendorai-acquisition-investment-intelligence]")
    ?? document.querySelector<HTMLElement>("[data-vendorai-media-plan-performance-command-center]");
}
function money(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export function AcquisitionMasterOrchestrator() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [budget, setBudget] = useState("0");
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem(TOKEN_KEY) ?? "";
  const visible = isPlanPath(location) && readUser()?.platformRole === "super_admin";

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    const timer = window.setInterval(update, 400);
    window.addEventListener("popstate", update);
    return () => { window.clearInterval(timer); window.removeEventListener("popstate", update); };
  }, []);

  useEffect(() => {
    if (!visible) { setHost(null); return; }
    let portal = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portal) { portal = document.createElement("div"); portal.setAttribute(HOST_ATTR, "true"); }
    const attach = () => {
      const anchor = findAnchor();
      if (!anchor?.parentElement || !portal) return;
      if (portal.parentElement !== anchor.parentElement || anchor.nextElementSibling !== portal) anchor.insertAdjacentElement("afterend", portal);
      setHost(portal);
    };
    attach(); const timer = window.setInterval(attach, 500);
    return () => { window.clearInterval(timer); portal?.remove(); };
  }, [visible]);

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function load() {
    if (!visible || !token) return;
    setLoading(true);
    try {
      const data = await request("/api/admin/commerce/acquisition-orchestrator");
      setConfig(data.config); setBudget(String(data.config.totalBudget ?? 0));
    } finally { setLoading(false); }
  }
  useEffect(() => { if (visible && token) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [visible, token]);

  async function save() {
    setLoading(true);
    try {
      const data = await request("/api/admin/commerce/acquisition-orchestrator", {
        method: "PUT",
        body: JSON.stringify({ totalBudget: Number(budget), active: true, period: "monthly", autonomy: "approval_required" }),
      });
      setConfig(data.config);
    } finally { setLoading(false); }
  }
  async function generate() {
    setLoading(true);
    try { const data = await request("/api/admin/commerce/acquisition-orchestrator/plan", { method: "POST" }); setConfig(data.config ? { ...data.config, lastPlan: data.plan } : config); }
    finally { setLoading(false); }
  }
  async function approve() {
    setLoading(true);
    try { const data = await request("/api/admin/commerce/acquisition-orchestrator/approve", { method: "POST" }); setConfig(data.config); }
    finally { setLoading(false); }
  }

  if (!visible || !host || !config) return null;
  const plan = config.lastPlan;

  return createPortal(
    <Card className="mt-3 border-primary/30">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /><p className="text-sm font-semibold">Orquestrador Mestre de Aquisição</p><Badge variant="outline">teto humano</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">Você define o orçamento total. A IA distribui entre verticais com evidência real e usa oferta, LP, canal, criativo e campanha como orientação interna.</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Orçamento mensal total" />
          <Button onClick={() => void save()} disabled={loading}><Save className="mr-2 h-4 w-4" />Salvar teto</Button>
          <Button variant="secondary" onClick={() => void generate()} disabled={loading || Number(budget) <= 0}><RefreshCw className="mr-2 h-4 w-4" />Gerar distribuição</Button>
        </div>

        {plan ? <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">Orçamento total</p><p className="text-lg font-semibold">{money(Number(config.totalBudget))}</p></div>
            <div className="rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">Reserva de teste</p><p className="text-lg font-semibold">{money(plan.reserveAmount)}</p></div>
            <div className="rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">Distribuição com evidência</p><p className="text-lg font-semibold">{money(plan.availableBudget)}</p></div>
          </div>
          <div className="space-y-2">
            {plan.allocations.length ? plan.allocations.map((row) => (
              <div key={row.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                <div><p className="text-sm font-semibold">{row.label}</p><p className="text-[11px] text-muted-foreground">{row.paidActivations}/{row.evidenceStarts} ativações · conversão {row.conversionPercent.toFixed(1)}% · score {row.score.toFixed(0)}%</p></div>
                <Badge variant="secondary">{row.recommendation}</Badge>
                <p className="text-sm font-semibold">{row.targetPercent.toFixed(1)}%</p>
                <p className="text-sm font-semibold">{money(row.targetAmount)}</p>
              </div>
            )) : <p className="text-xs text-muted-foreground">Ainda não há volume mínimo por vertical para redistribuir com segurança.</p>}
          </div>
          <div className="flex justify-end"><Button onClick={() => void approve()} disabled={loading || !plan.allocations.length}><ShieldCheck className="mr-2 h-4 w-4" />Aprovar distribuição</Button></div>
        </> : null}
      </CardContent>
    </Card>, host,
  );
}
