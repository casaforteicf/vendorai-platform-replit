import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock3, History, Loader2, PauseCircle, RefreshCw, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-marketing-autonomy-audit";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type AuditDecision = {
  currentAllocation?: number;
  targetAllocation?: number;
  delta?: number;
  spend?: number;
  leads?: number;
  sales?: number;
  revenue?: number;
  roas?: number | null;
  reason?: string;
};

type AuditSchedule = {
  dailyBudget?: number;
  remainingBudget?: number;
  remainingDays?: number;
};

type LearningSnapshot = { spend?: number; leads?: number; sales?: number; revenue?: number; roas?: number | null };
type AuditLearning = {
  verdict?: "melhorou" | "piorou" | "inconclusivo";
  reason?: string;
  evaluatedAt?: string;
  evaluationWindowHours?: number;
  before?: LearningSnapshot;
  after?: LearningSnapshot;
  deltas?: { spend?: number; leads?: number; sales?: number; revenue?: number };
  postIncrementalRoas?: number | null;
};

type AuditItem = {
  id: string;
  campaignId: string;
  campaignName: string | null;
  platform: string | null;
  eventType: string;
  severity: string;
  message: string;
  createdAt: string;
  mediaPlanId: string | null;
  autonomyLevel: number | null;
  authorization: string | null;
  humanCeilingRespected: boolean | null;
  decision: AuditDecision | null;
  schedule: AuditSchedule | null;
  learning: AuditLearning | null;
};

type AuditResponse = {
  generatedAt: string;
  summary: {
    total: number; applied: number; failed: number; holds: number;
    improved: number; worsened: number; inconclusive: number; awaitingLearning: number;
  };
  items: AuditItem[];
};

type Policy = { level: 0 | 1 | 2 | 3 | 4; maxTransferFractionPerCycle: number };

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
  return document.querySelector<HTMLElement>("[data-vendorai-marketing-autonomy-control]")
    ?? document.querySelector<HTMLElement>("[data-vendorai-media-plan-budget-execution]")
    ?? document.querySelector<HTMLElement>("[data-vendorai-media-plan-performance-command-center]");
}

function brl(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function eventLabel(item: AuditItem) {
  if (item.eventType.includes("failed")) return "Falha automática";
  if (item.eventType.includes("hold")) return item.authorization === "agent-autonomous" ? "IA manteve" : "Mantido";
  if (item.eventType.includes("applied")) return item.authorization === "agent-autonomous" ? "IA aplicou" : "Humano aplicou";
  return "Decisão";
}

function learningLabel(verdict: AuditLearning["verdict"]) {
  if (verdict === "melhorou") return "Melhorou";
  if (verdict === "piorou") return "Piorou";
  return "Inconclusivo";
}

export function MarketingAutonomyAudit() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [message, setMessage] = useState("");
  const visible = isPlanPath(location);
  const { tenantId, token } = readSession();

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
    setMessage("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/autonomy/audit?limit=40`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Falha ao carregar auditoria");
      setData(body as AuditResponse);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (visible && tenantId && token) void load(); }, [visible, tenantId, token]);

  async function pauseAutonomy() {
    if (!tenantId || !token) return;
    setPausing(true);
    setMessage("");
    try {
      const currentResponse = await fetch(`/api/tenants/${tenantId}/marketing/autonomy`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const current = await currentResponse.json().catch(() => null) as Policy | null;
      if (!currentResponse.ok || !current) throw new Error("Não foi possível ler a política atual.");
      const response = await fetch(`/api/tenants/${tenantId}/marketing/autonomy`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ level: 0, maxTransferFractionPerCycle: current.maxTransferFractionPerCycle }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Falha ao pausar autonomia");
      setMessage("Autonomia pausada. O Marketing IA voltou para o nível 0 · Recomendar.");
      window.dispatchEvent(new CustomEvent("vendorai:marketing-autonomy-changed"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao pausar autonomia");
    } finally {
      setPausing(false);
    }
  }

  const visibleItems = useMemo(() => data?.items.slice(0, 12) ?? [], [data]);
  if (!visible || !host) return null;

  return createPortal(
    <Card className="mt-3 border-primary/20">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Auditoria do Marketing IA</p>
              <Badge variant="outline" className="text-[10px]">decisão + aprendizado</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Mostra o que foi aplicado e, após pelo menos 24 horas, compara o desempenho pós-decisão para classificar o aprendizado como melhorou, piorou ou inconclusivo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void pauseAutonomy()} disabled={pausing}>
              {pausing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PauseCircle className="mr-2 h-4 w-4" />}Pausar autonomia
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border bg-muted/20 p-3"><p className="text-[10px] uppercase text-muted-foreground">Aplicadas</p><p className="mt-1 text-lg font-semibold">{data?.summary.applied ?? "—"}</p></div>
          <div className="rounded-xl border bg-muted/20 p-3"><p className="text-[10px] uppercase text-muted-foreground">Melhoraram</p><p className="mt-1 text-lg font-semibold">{data?.summary.improved ?? "—"}</p></div>
          <div className="rounded-xl border bg-muted/20 p-3"><p className="text-[10px] uppercase text-muted-foreground">Pioraram</p><p className="mt-1 text-lg font-semibold">{data?.summary.worsened ?? "—"}</p></div>
          <div className="rounded-xl border bg-muted/20 p-3"><p className="text-[10px] uppercase text-muted-foreground">Aguardando leitura</p><p className="mt-1 text-lg font-semibold">{data?.summary.awaitingLearning ?? "—"}</p></div>
        </div>

        <div className="space-y-2">
          {visibleItems.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">Ainda não há decisões de redistribuição registradas para este tenant.</div>
          ) : visibleItems.map((item) => {
            const decision = item.decision;
            const applied = item.eventType.includes("applied");
            const failed = item.eventType.includes("failed");
            const delta = decision?.delta;
            const learning = item.learning;
            return (
              <div key={item.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {failed ? <AlertTriangle className="h-4 w-4 text-destructive" /> : applied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                      <p className="text-xs font-semibold">{item.campaignName ?? `Campanha ${item.campaignId.slice(0, 8)}`}</p>
                      <Badge variant={applied ? "default" : failed ? "destructive" : "secondary"} className="text-[10px]">{eventLabel(item)}</Badge>
                      {item.autonomyLevel !== null && <Badge variant="outline" className="text-[10px]">nível {item.autonomyLevel}</Badge>}
                      {item.platform && <Badge variant="outline" className="text-[10px]">{item.platform}</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{when(item.createdAt)}</p>
                  </div>
                  {item.humanCeilingRespected !== null && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> teto humano {item.humanCeilingRespected ? "respeitado" : "bloqueado"}</div>}
                </div>

                {decision && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-muted/30 p-2"><p className="text-[10px] text-muted-foreground">Antes</p><p className="text-xs font-semibold">{brl(decision.currentAllocation)}</p></div>
                    <div className="rounded-lg bg-muted/30 p-2"><p className="text-[10px] text-muted-foreground">Depois</p><p className="text-xs font-semibold">{brl(decision.targetAllocation)}</p></div>
                    <div className="rounded-lg bg-muted/30 p-2"><p className="text-[10px] text-muted-foreground">Mudança</p><p className="text-xs font-semibold">{typeof delta === "number" ? `${delta >= 0 ? "+" : ""}${brl(delta)}` : "—"}</p></div>
                    <div className="rounded-lg bg-muted/30 p-2"><p className="text-[10px] text-muted-foreground">ROAS / vendas</p><p className="text-xs font-semibold">{typeof decision.roas === "number" ? `${decision.roas.toFixed(2)}x` : "—"} · {decision.sales ?? 0}</p></div>
                  </div>
                )}

                <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{decision?.reason ?? item.message}</p>
                {item.schedule && <p className="mt-1 text-[10px] text-muted-foreground">Novo orçamento diário: {brl(item.schedule.dailyBudget)} · saldo futuro: {brl(item.schedule.remainingBudget)} · {item.schedule.remainingDays ?? "—"} dia(s)</p>}

                {applied && (
                  <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                    {learning ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {learning.verdict === "melhorou" ? <TrendingUp className="h-4 w-4 text-primary" /> : learning.verdict === "piorou" ? <TrendingDown className="h-4 w-4 text-destructive" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                          <p className="text-[11px] font-semibold">Aprendizado: {learningLabel(learning.verdict)}</p>
                          <Badge variant={learning.verdict === "piorou" ? "destructive" : learning.verdict === "melhorou" ? "default" : "secondary"} className="text-[10px]">{learning.evaluationWindowHours ?? "—"}h depois</Badge>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{learning.reason}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-4">
                          <div className="rounded-md bg-background p-2"><p className="text-[10px] text-muted-foreground">Gasto depois</p><p className="text-xs font-semibold">{brl(learning.deltas?.spend)}</p></div>
                          <div className="rounded-md bg-background p-2"><p className="text-[10px] text-muted-foreground">Novos leads</p><p className="text-xs font-semibold">{learning.deltas?.leads ?? 0}</p></div>
                          <div className="rounded-md bg-background p-2"><p className="text-[10px] text-muted-foreground">Novas vendas</p><p className="text-xs font-semibold">{learning.deltas?.sales ?? 0}</p></div>
                          <div className="rounded-md bg-background p-2"><p className="text-[10px] text-muted-foreground">ROAS incremental</p><p className="text-xs font-semibold">{typeof learning.postIncrementalRoas === "number" ? `${learning.postIncrementalRoas.toFixed(2)}x` : "—"}</p></div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Aguardando pelo menos 24h e volume mínimo para avaliar o efeito desta decisão.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {message && <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">{message}</div>}
        <div className="flex items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span>O aprendizado é conservador: só classifica piora com gasto pós-decisão relevante; sinais fracos ou mistos permanecem inconclusivos.</span>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
