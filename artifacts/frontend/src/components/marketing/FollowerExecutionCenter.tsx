import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Link2, Loader2, Play, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type ExecutionItem = {
  id: string;
  actionType: "content" | "replicate" | "paid";
  sourceId: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  executionStatus?: "released" | "running" | "done";
  executedAt?: string | null;
  executionEvidenceType?: "social_publication" | "publication" | "campaign" | null;
  executionEvidenceId?: string | null;
  executionEvidenceLabel?: string | null;
  payload?: Record<string, unknown>;
};

type AutoEvidenceResult = { linked?: Array<{ approvalId: string; evidenceType: string; evidenceId: string }>; ambiguous?: string[]; checked?: number };

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
  const [scanning, setScanning] = useState(false);
  const [evidenceDraft, setEvidenceDraft] = useState<Record<string, string>>({});
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scanAutoEvidence() {
    if (!tenantId || !token || scanning) return;
    setScanning(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/follower-growth/approvals/auto-evidence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({})) as AutoEvidenceResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível procurar evidências automáticas.");
      const linked = result.linked?.length ?? 0;
      const ambiguous = result.ambiguous?.length ?? 0;
      setAutoMessage(linked > 0 ? `${linked} evidência(s) vinculada(s) automaticamente.` : ambiguous > 0 ? `${ambiguous} ação(ões) têm mais de um candidato; vínculo automático foi evitado.` : null);
    } finally {
      setScanning(false);
    }
  }

  async function load(options: { scan?: boolean } = { scan: true }) {
    if (!tenantId || !token) return;
    setLoading(true);
    setError(null);
    try {
      if (options.scan !== false) await scanAutoEvidence();
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

  async function linkEvidence(item: ExecutionItem) {
    if (!tenantId || !token || busyId) return;
    const evidenceId = (evidenceDraft[item.id] || "").trim();
    if (!evidenceId) { setError("Informe o ID da publicação ou campanha executada."); return; }
    setBusyId(item.id);
    setError(null);
    try {
      const evidenceType = item.actionType === "paid" ? "campaign" : "social_publication";
      const response = await fetch(`/api/tenants/${tenantId}/follower-growth/approvals/${item.id}/evidence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceType, evidenceId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível validar a evidência.");
      await load({ scan: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao validar evidência.");
    } finally {
      setBusyId(null);
    }
  }

  async function refreshEvidence() {
    setError(null);
    try {
      await scanAutoEvidence();
      await load({ scan: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao procurar evidências.");
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
          <div><div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-indigo-600" /><CardTitle className="text-base">Central de Execução do Dia</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Mostra somente ações aprovadas e procura evidência real automaticamente antes da conclusão.</p></div>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{summary.released} liberadas</Badge><Badge variant="outline">{summary.running} em execução</Badge><Badge>{summary.done} concluídas</Badge><Button size="sm" variant="outline" disabled={scanning} onClick={() => void refreshEvidence()}><RefreshCw className={`mr-1.5 h-4 w-4 ${scanning ? "animate-spin" : ""}`} />Atualizar evidências</Button></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="rounded-md border border-destructive/30 p-2 text-xs text-destructive">{error}</p> : null}
        {autoMessage ? <p className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2 text-xs">{autoMessage}</p> : null}
        {!items.length ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma ação aprovada para executar hoje.</div> : items.map((item) => {
          const status = item.executionStatus ?? "released";
          const hasEvidence = Boolean(item.executionEvidenceId);
          return <div key={item.id} className="rounded-lg border p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.title}</p><Badge variant="outline">{item.actionType === "paid" ? "Mídia" : item.actionType === "replicate" ? "Replicação" : "Conteúdo"}</Badge><Badge variant={status === "done" ? "default" : "outline"}>{executionLabel(status)}</Badge>{hasEvidence ? <Badge className="gap-1"><Link2 className="h-3 w-3" />Evidência validada</Badge> : null}</div>{hasEvidence ? <p className="mt-1 text-[11px] text-muted-foreground">{item.executionEvidenceLabel} · {item.executionEvidenceId}</p> : null}{status === "done" && item.executedAt ? <p className="mt-1 text-[11px] text-muted-foreground">Concluído em {new Date(item.executedAt).toLocaleString("pt-BR")}</p> : null}</div><div className="flex flex-wrap gap-2">{status === "released" ? <Button size="sm" disabled={busyId === item.id} onClick={() => void setExecution(item, "running")}><Play className="mr-1.5 h-4 w-4" />Iniciar execução</Button> : null}{status === "running" ? <><Button size="sm" variant="outline" onClick={() => openAction(item)}>Abrir novamente</Button><Button size="sm" disabled={busyId === item.id || !hasEvidence} onClick={() => void setExecution(item, "done")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Concluir com evidência</Button></> : null}{status === "done" ? <div className="flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-4 w-4" />Execução comprovada</div> : null}</div></div>{status === "running" && !hasEvidence ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"><span className="text-[11px] text-muted-foreground">A detecção automática evita vínculos quando encontra mais de um candidato.</span><input className="h-9 min-w-[260px] rounded-md border bg-background px-3 text-xs" placeholder={item.actionType === "paid" ? "ID da campanha (fallback)" : "ID da publicação (fallback)"} value={evidenceDraft[item.id] ?? ""} onChange={(event) => setEvidenceDraft((current) => ({ ...current, [item.id]: event.target.value }))} /><Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void linkEvidence(item)}><Link2 className="mr-1.5 h-4 w-4" />Validar manualmente</Button></div> : null}</div>;
        })}
        <p className="text-[11px] text-muted-foreground">A detecção automática só vincula quando há um único candidato criado depois do início da ação. Em caso de dúvida, mantém a ação sem vínculo para evitar atribuição incorreta.</p>
      </CardContent>
    </Card>
  );
}
