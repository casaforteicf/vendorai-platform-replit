import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, Play, Rocket, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type ExecutionItem = {
  id: string;
  actionType: "content" | "replicate" | "paid";
  sourceId: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  executionStatus?: "released" | "running" | "done";
  executedAt?: string | null;
  payload?: Record<string, unknown>;
};

function executionLabel(status?: ExecutionItem["executionStatus"]) {
  if (status === "running") return "Em execução";
  if (status === "done") return "Concluído";
  return "Liberado";
}

export function FollowerExecutionCenter() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [items, setItems] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/follower-growth/approvals`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as ExecutionItem[] & { error?: string };
      if (!response.ok) throw new Error((payload as any).error || "Não foi possível carregar a execução do dia.");
      setItems((payload as ExecutionItem[]).filter((item) => item.status === "approved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar execução.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId, token]);

  const summary = useMemo(() => ({
    released: items.filter((item) => (item.executionStatus ?? "released") === "released").length,
    running: items.filter((item) => item.executionStatus === "running").length,
    done: items.filter((item) => item.executionStatus === "done").length,
  }), [items]);

  async function setExecution(item: ExecutionItem, executionStatus: "running" | "done") {
    if (!tenantId || !token || busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/follower-growth/approvals/${item.id}/execution`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ executionStatus }),
      });
      const payload = await response.json() as ExecutionItem[] & { error?: string };
      if (!response.ok) throw new Error((payload as any).error || "Não foi possível atualizar a execução.");
      setItems((payload as ExecutionItem[]).filter((entry) => entry.status === "approved"));
      if (executionStatus === "running") openAction(item);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar execução.");
    } finally {
      setBusyId(null);
    }
  }

  function openAction(item: ExecutionItem) {
    if (item.actionType === "paid") {
      window.location.assign(`/content?tab=campanhas&objective=followers&from=follower-execution&approvalId=${encodeURIComponent(item.id)}`);
      return;
    }
    const pack = (item.payload?.pack ?? {}) as Record<string, unknown>;
    const brief = [pack.hook, pack.script, pack.cta, pack.caption, pack.visual].filter(Boolean).join(" | ");
    const params = new URLSearchParams({ tab: "gerador", objective: "followers", from: "follower-execution", approvalId: item.id });
    if (brief) params.set("brief", brief);
    window.location.assign(`/content?${params.toString()}`);
  }

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando Central de Execução…</CardContent></Card>;

  return (
    <Card className="border-indigo-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-indigo-600" /><CardTitle className="text-base">Central de Execução do Dia</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Mostra somente ações já aprovadas. Abertura da execução e conclusão ficam registradas separadamente.</p></div>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{summary.released} liberadas</Badge><Badge variant="outline">{summary.running} em execução</Badge><Badge>{summary.done} concluídas</Badge></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="rounded-md border border-destructive/30 p-2 text-xs text-destructive">{error}</p> : null}
        {!items.length ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma ação aprovada para executar hoje.</div> : items.map((item) => {
          const status = item.executionStatus ?? "released";
          return <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.title}</p><Badge variant="outline">{item.actionType === "paid" ? "Mídia" : item.actionType === "replicate" ? "Replicação" : "Conteúdo"}</Badge><Badge variant={status === "done" ? "default" : "outline"}>{executionLabel(status)}</Badge></div>{status === "done" && item.executedAt ? <p className="mt-1 text-[11px] text-muted-foreground">Concluído em {new Date(item.executedAt).toLocaleString("pt-BR")}</p> : null}</div><div className="flex flex-wrap gap-2">{status === "released" ? <Button size="sm" disabled={busyId === item.id} onClick={() => void setExecution(item, "running")}><Play className="mr-1.5 h-4 w-4" />Iniciar execução</Button> : null}{status === "running" ? <><Button size="sm" variant="outline" onClick={() => openAction(item)}>Abrir novamente</Button><Button size="sm" disabled={busyId === item.id} onClick={() => void setExecution(item, "done")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Marcar concluído</Button></> : null}{status === "done" ? <div className="flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Execução registrada</div> : null}</div></div>;
        })}
        <p className="text-[11px] text-muted-foreground">Abrir uma ação não significa publicação nem gasto realizado; conclusão deve ser marcada somente depois da execução real no fluxo correspondente.</p>
      </CardContent>
    </Card>
  );
}
