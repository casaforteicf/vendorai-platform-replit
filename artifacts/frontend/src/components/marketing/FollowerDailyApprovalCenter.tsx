import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCheck, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Approval = {
  id: string;
  actionType: "content" | "replicate" | "paid";
  sourceId: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  payload?: Record<string, unknown>;
  decidedAt?: string | null;
};

type QueueItem = { id: string; title: string; status: "todo" | "doing" | "done"; pack?: Record<string, unknown> };

export function FollowerDailyApprovalCenter() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId || !token) return;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    setError(null);
    try {
      const [queueResponse, approvalResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/follower-growth/production-queue`, { headers }),
        fetch(`/api/tenants/${tenantId}/follower-growth/approvals`, { headers }),
      ]);
      if (!queueResponse.ok) throw new Error("Não foi possível carregar a rotina diária.");
      const queue = await queueResponse.json() as QueueItem[];
      const ready = queue.filter((item) => item.status === "done").map((item) => ({
        actionType: "content" as const,
        sourceId: item.id,
        title: item.title,
        payload: { queueItemId: item.id, pack: item.pack ?? {} },
      }));
      const sync = await fetch(`/api/tenants/${tenantId}/follower-growth/approvals/sync`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ items: ready }),
      });
      if (!sync.ok) throw new Error("Não foi possível sincronizar as aprovações do dia.");
      setItems(await sync.json() as Approval[]);
      if (approvalResponse.ok && !ready.length) setItems(await approvalResponse.json() as Approval[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar aprovações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId, token]);

  const pending = useMemo(() => items.filter((item) => item.status === "pending"), [items]);
  const approved = useMemo(() => items.filter((item) => item.status === "approved"), [items]);

  async function decide(ids: string[], status: "approved" | "rejected") {
    if (!tenantId || !token || !ids.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/follower-growth/approvals/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      const payload = await response.json() as Approval[] & { error?: string };
      if (!response.ok) throw new Error((payload as any).error || "Não foi possível registrar a decisão.");
      setItems(payload as Approval[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao registrar aprovação.");
    } finally {
      setBusy(false);
    }
  }

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando aprovações do dia…</CardContent></Card>;

  return (
    <Card className="border-sky-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky-600" /><CardTitle className="text-base">Aprovação da rotina de hoje</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Reúne apenas peças prontas. Aprovar não publica nem ativa mídia: libera a próxima etapa do fluxo.</p></div>
          <div className="flex gap-2"><Badge variant="outline">{pending.length} pendentes</Badge><Badge>{approved.length} aprovados</Badge></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="rounded-md border border-destructive/30 p-2 text-xs text-destructive">{error}</p> : null}
        {pending.length > 1 ? <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void decide(pending.map((item) => item.id), "approved")}><CheckCheck className="mr-1.5 h-4 w-4" />Aprovar tudo</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(pending.map((item) => item.id), "rejected")}><XCircle className="mr-1.5 h-4 w-4" />Rejeitar tudo</Button></div> : null}
        {!items.length ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma peça pronta aguardando aprovação.</div> : items.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
            <div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{item.title}</p><Badge variant={item.status === "approved" ? "default" : "outline"}>{item.status === "approved" ? "Aprovado" : item.status === "rejected" ? "Rejeitado" : "Pendente"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.actionType === "paid" ? "Teste pago" : item.actionType === "replicate" ? "Replicação" : "Conteúdo"}</p></div>
            {item.status === "pending" ? <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void decide([item.id], "approved")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Aprovar</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void decide([item.id], "rejected")}><XCircle className="mr-1.5 h-4 w-4" />Rejeitar</Button></div> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
