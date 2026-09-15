import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Eye, Layers3, Loader2, Play, Plus, RefreshCw, ShieldCheck } from "lucide-react";

const HOST_ATTR = "data-vendorai-media-plan-batch-control";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const LEGACY_AUTO_KEY_PREFIX = "vendorai_media_plan_auto_production_v2:";
const BATCH_SIZE = 10;

type MediaPlan = {
  id: string;
  conteudo?: {
    periodoDias?: number;
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
  };
};

type CalendarItem = {
  id: string;
  mediaPlanId?: string | null;
  status: string;
  contentGenerationId?: string | null;
  variationIdx?: number | null;
};

function currentTenantId(): string {
  try {
    const override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "null") as { id?: string } | null;
    if (override?.id) return override.id;
  } catch {}
  try {
    const user = JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? "null") as { tenantId?: string } | null;
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function routeContext() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") ?? "";
  const source = params.get("source") ?? params.get("from") ?? "";
  const mediaPlanId = params.get("mediaPlanId")?.trim() ?? "";
  return {
    active: window.location.pathname === "/content" && tab === "campanhas" && source === "media-plan" && Boolean(mediaPlanId),
    mediaPlanId,
  };
}

function openActionDetails() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((item) => normalizedText(item.textContent ?? "").startsWith("Ver detalhes"));
  button?.click();
  if (button) window.setTimeout(() => button.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}

function findProductionButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-vendorai-plan-production] button`))
    .find((button) => normalizedText(button.textContent ?? "").startsWith("Produzir plano completo"));
}

export function MediaPlanBatchControl() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [busy, setBusy] = useState<"approve" | "generate" | "produce" | "refresh" | null>(null);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const tenantId = currentTenantId();

  const context = useMemo(() => {
    void location;
    return routeContext();
  }, [location]);

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  // O produtor legado tinha auto-start ao abrir a fila. O lote agora é deliberado:
  // aprovar não consome IA; somente o clique explícito em "Produzir lote" inicia geração.
  useEffect(() => {
    if (!context.active || !context.mediaPlanId) return;
    try {
      sessionStorage.setItem(`${LEGACY_AUTO_KEY_PREFIX}${context.mediaPlanId}`, "manual-batch-control");
    } catch {}
  }, [context.active, context.mediaPlanId]);

  useEffect(() => {
    if (!context.active) {
      setHost(null);
      return;
    }

    const attach = () => {
      const backButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => normalizedText(button.textContent ?? "") === "Todas as campanhas" && button.offsetParent !== null);
      const topRow = backButton?.parentElement;
      const container = topRow?.parentElement;
      if (!topRow || !container) return;

      let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.setAttribute(HOST_ATTR, "true");
      }
      if (portalHost.parentElement !== container || portalHost.previousElementSibling !== topRow) {
        container.insertBefore(portalHost, topRow.nextSibling);
      }
      setHost((current) => current === portalHost ? current : portalHost);
    };

    attach();
    const timer = window.setInterval(attach, 500);
    return () => {
      window.clearInterval(timer);
      document.querySelector<HTMLElement>(`[${HOST_ATTR}]`)?.remove();
    };
  }, [context.active]);

  const load = useCallback(async (mode: "refresh" | "silent" = "silent") => {
    if (!tenantId || !context.mediaPlanId) return;
    if (mode === "refresh") setBusy("refresh");
    try {
      const [planResponse, calendarResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      if (!planResponse.ok || !calendarResponse.ok) throw new Error("Não foi possível atualizar o lote do Plano de Mídia.");
      const nextPlan = await planResponse.json() as MediaPlan | null;
      const calendar = await calendarResponse.json() as CalendarItem[];
      setPlan(nextPlan);
      setItems(calendar.filter((item) => item.mediaPlanId === context.mediaPlanId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar o lote.");
    } finally {
      if (mode === "refresh") setBusy(null);
    }
  }, [context.mediaPlanId, tenantId]);

  useEffect(() => {
    if (!host || !context.active) return;
    void load();
  }, [context.active, host, load]);

  const summary = useMemo(() => ({
    total: items.length,
    pending: items.filter((item) => item.status === "planejado").length,
    awaitingProduction: items.filter((item) => item.status === "aprovado" && !item.contentGenerationId).length,
    approved: items.filter((item) => ["aprovado", "gerado", "publicado"].includes(item.status)).length,
    produced: items.filter((item) => Boolean(item.contentGenerationId) || ["gerado", "publicado"].includes(item.status)).length,
    rejected: items.filter((item) => ["recusado", "pulado"].includes(item.status)).length,
  }), [items]);

  const batchNumber = Math.max(1, Math.ceil(Math.max(1, summary.total) / BATCH_SIZE));

  const approveBatch = useCallback(async () => {
    if (!tenantId || !context.mediaPlanId || busy || summary.pending === 0) return;
    setBusy("approve");
    setMessage("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/content-calendar/${context.mediaPlanId}/aprovar-lote`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ limit: BATCH_SIZE }),
      });
      const payload = await response.json().catch(() => ({})) as { approved?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível aprovar o lote.");
      setMessage(`${payload.approved ?? 0} ações aprovadas. Nenhuma IA foi acionada. Agora clique em Produzir lote quando quiser iniciar a geração.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível aprovar o lote.");
    } finally {
      setBusy(null);
    }
  }, [busy, context.mediaPlanId, load, summary.pending, tenantId]);

  const produceBatch = useCallback(async () => {
    if (busy || summary.awaitingProduction === 0) return;
    setBusy("produce");
    setMessage("");
    try {
      const trigger = findProductionButton();
      if (!trigger) {
        setMessage("O produtor do lote ainda está carregando. Aguarde alguns segundos e tente novamente.");
        return;
      }
      trigger.click();
      setMessage(`Produção do lote iniciada sob comando do usuário. Máximo atual: ${Math.min(summary.awaitingProduction, BATCH_SIZE)} ações.`);
      window.setTimeout(() => { void load(); }, 1500);
    } finally {
      window.setTimeout(() => setBusy(null), 700);
    }
  }, [busy, load, summary.awaitingProduction]);

  const generateNextBatch = useCallback(async () => {
    if (!tenantId || !context.mediaPlanId || busy || summary.pending > 0 || summary.awaitingProduction > 0) return;
    setBusy("generate");
    setMessage("");
    setComplete(false);
    try {
      const weeks = Math.max(1, Math.min(53, Math.ceil((plan?.conteudo?.periodoDias ?? 30) / 7)));
      const response = await fetch(`/api/tenants/${tenantId}/content-calendar/gerar`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          mediaPlanId: context.mediaPlanId,
          semanas: weeks,
          substituirPlanejado: false,
          batchSize: BATCH_SIZE,
        }),
      });
      const payload = await response.json().catch(() => ([])) as CalendarItem[] | { error?: string };
      if (!response.ok) {
        const error = Array.isArray(payload) ? "Não foi possível gerar o próximo lote." : payload.error ?? "Não foi possível gerar o próximo lote.";
        throw new Error(error);
      }
      const created = Array.isArray(payload) ? payload.length : 0;
      if (created === 0) {
        setComplete(true);
        setMessage("Todas as ações previstas neste plano já foram materializadas em lotes.");
      } else {
        setMessage(`${created} novas ações geradas para revisão. Nenhuma produção de IA foi iniciada automaticamente.`);
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o próximo lote.");
    } finally {
      setBusy(null);
    }
  }, [busy, context.mediaPlanId, load, plan?.conteudo?.periodoDias, summary.awaitingProduction, summary.pending, tenantId]);

  if (!host || !context.active || !plan || plan.id !== context.mediaPlanId) return null;

  return createPortal(
    <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Layers3 className="h-4 w-4 text-primary" />Execução em lotes de 10</span>
            <span className="rounded-full border bg-background px-2 py-0.5 text-[11px]">Lote {batchNumber}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />IA somente sob comando</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.pending > 0
              ? `${summary.pending} ação(ões) aguardam sua aprovação. Revisar e aprovar não consome IA.`
              : summary.awaitingProduction > 0
                ? `${summary.awaitingProduction} ação(ões) estão aprovadas e aguardam produção. Produza este lote antes de liberar os próximos 10.`
                : complete
                  ? "O plano não possui mais ações pendentes para gerar."
                  : summary.total === 0
                    ? "Gere o primeiro lote. O sistema cria no máximo 10 ações por vez."
                    : "O lote atual já foi produzido/decidido. Gere as próximas 10 somente quando quiser continuar."}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>{summary.total} ações no total</span>
            <span>{summary.pending} em revisão</span>
            <span>{summary.awaitingProduction} aprovadas aguardando produção</span>
            <span>{summary.produced} com produção iniciada/concluída</span>
            {summary.rejected > 0 ? <span>{summary.rejected} recusadas/ignoradas</span> : null}
          </div>
          {message ? <p className="mt-2 text-xs font-medium text-foreground">{message}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {summary.pending > 0 ? (
            <>
              <button type="button" onClick={openActionDetails} className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
                <Eye className="mr-1.5 h-4 w-4" />Revisar ações
              </button>
              <button type="button" onClick={() => void approveBatch()} disabled={busy !== null} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60">
                {busy === "approve" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Aprovar lote ({Math.min(summary.pending, BATCH_SIZE)})
              </button>
            </>
          ) : summary.awaitingProduction > 0 ? (
            <button type="button" onClick={() => void produceBatch()} disabled={busy !== null} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60">
              {busy === "produce" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Produzir lote ({Math.min(summary.awaitingProduction, BATCH_SIZE)})
            </button>
          ) : (
            <button type="button" onClick={() => void generateNextBatch()} disabled={busy !== null || complete} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60">
              {busy === "generate" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              {summary.total === 0 ? "Gerar primeiro lote (10)" : "Gerar próximos 10"}
            </button>
          )}
          <button type="button" onClick={() => void load("refresh")} disabled={busy !== null} className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60" title="Atualizar estado do lote">
            {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}
