import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Bot, Loader2, Save, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-marketing-autonomy-control";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type Level = 0 | 1 | 2 | 3 | 4;
type Policy = {
  level: Level;
  automaticMode: boolean;
  autonomyEnabled: boolean;
  canRecommend: boolean;
  canProduce: boolean;
  canPublish: boolean;
  canOptimizeBudget: boolean;
  canOperateFull: boolean;
  maxTransferFractionPerCycle: number;
  reason: string;
};

const LEVELS: Array<{ level: Level; title: string; description: string }> = [
  { level: 0, title: "0 · Recomendar", description: "Analisa, sugere campanhas, conteúdo e otimizações. Nada é executado sozinho." },
  { level: 1, title: "1 · Produzir", description: "Pode gerar peças e preparar campanhas, mantendo publicação e verba sob aprovação." },
  { level: 2, title: "2 · Publicar", description: "Pode publicar materiais aprováveis pelos guardrails, sem otimizar orçamento sozinho." },
  { level: 3, title: "3 · Otimizar verba", description: "Pode publicar e realocar apenas saldo não consumido dentro do limite por ciclo." },
  { level: 4, title: "4 · Operação completa", description: "Executa o ciclo de Marketing IA dentro dos tetos, integrações, QA e regras de governança." },
];

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
  const budget = document.querySelector<HTMLElement>("[data-vendorai-media-plan-budget-execution]");
  if (budget) return budget;
  const performance = document.querySelector<HTMLElement>("[data-vendorai-media-plan-performance-command-center]");
  return performance;
}

export function MarketingAutonomyControl() {
  const [location, setLocation] = useState(() => locationHref());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [level, setLevel] = useState<Level>(0);
  const [fraction, setFraction] = useState(0.2);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const visible = isPlanPath(location);
  const { tenantId, token } = readSession();

  useEffect(() => {
    const update = () => setLocation(locationHref());
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
      if (portal.parentElement !== anchor.parentElement || anchor.nextElementSibling !== portal) {
        anchor.insertAdjacentElement("afterend", portal);
      }
      setHost((current) => current === portal ? current : portal);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => { window.clearInterval(timer); portal?.remove(); };
  }, [visible]);

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/autonomy`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Falha ao carregar autonomia");
      const next = await response.json() as Policy;
      setPolicy(next);
      setLevel(next.level);
      setFraction(next.maxTransferFractionPerCycle);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao carregar autonomia");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (visible && tenantId && token) void load(); }, [visible, tenantId, token]);

  useEffect(() => {
    const sync = () => {
      if (visible && tenantId && token) void load();
    };
    window.addEventListener("vendorai:marketing-autonomy-changed", sync);
    return () => window.removeEventListener("vendorai:marketing-autonomy-changed", sync);
  }, [visible, tenantId, token]);

  async function save() {
    if (!tenantId || !token) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/autonomy`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ level, maxTransferFractionPerCycle: fraction }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Falha ao salvar autonomia");
      setPolicy(body as Policy);
      setMessage(`Nível ${level} salvo. A política server-side já está valendo.`);
      window.dispatchEvent(new CustomEvent("vendorai:marketing-autonomy-changed"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao salvar autonomia");
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !host) return null;

  return createPortal(
    <Card className="mt-3 border-primary/20">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Autonomia do Marketing IA</p>
              <Badge variant="outline" className="text-[10px]">controle server-side</Badge>
              {policy && <Badge variant={policy.level >= 2 ? "default" : "secondary"} className="text-[10px]">nível {policy.level}</Badge>}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Escolha até onde a IA pode agir. O teto financeiro do Plano de Mídia continua soberano e as integrações/QA continuam podendo bloquear uma execução.
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {LEVELS.map((item) => (
            <button
              key={item.level}
              type="button"
              onClick={() => setLevel(item.level)}
              className={`rounded-xl border p-3 text-left transition ${level === item.level ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background hover:bg-muted/40"}`}
            >
              <p className="text-xs font-semibold">{item.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="rounded-xl border bg-muted/20 p-3">
            <label className="text-xs font-medium">Limite de realocação automática por ciclo</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0.05, 0.1, 0.15, 0.2, 0.3].map((value) => (
                <Button key={value} type="button" size="sm" variant={fraction === value ? "default" : "outline"} onClick={() => setFraction(value)} disabled={level < 3}>
                  {Math.round(value * 100)}%
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Só se aplica nos níveis 3 e 4. É um limite por rodada; saldo já gasto nunca é reutilizado.
            </p>
          </div>
          <Button type="button" onClick={() => void save()} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar autonomia
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>{policy?.reason ?? "Carregando política atual…"}</span>
          {message && <span className="font-medium text-foreground">{message}</span>}
        </div>
      </CardContent>
    </Card>,
    host,
  );
}

function locationHref() {
  return window.location.pathname + window.location.search;
}
