import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Clock3, History, Loader2, PlayCircle, Rows3, UserRound, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type QueueStatus = "todo" | "doing" | "done";
type QueuePack = { title: string; hook: string; script: string; cta: string; caption: string; visual: string };
type QueueItem = { id: string; externalKey: string; title: string; theme?: string | null; priority: "alta" | "media"; status: QueueStatus; pack: QueuePack; assigneeUserId?: string | null; assigneeName?: string | null; assigneeEmail?: string | null; dueAt?: string | null; updatedAt?: string | null };
type QueueHistory = { id: string; queueItemId: string; eventType: string; fromStatus?: string | null; toStatus?: string | null; createdAt: string };

function statusLabel(status: QueueStatus) { if (status === "doing") return "Em produção"; if (status === "done") return "Pronto"; return "A produzir"; }
function nextStatus(status: QueueStatus): QueueStatus { if (status === "todo") return "doing"; if (status === "doing") return "done"; return "todo"; }
function isoDueDate(value: string) { if (!value) return null; return new Date(`${value}T23:59:59`).toISOString(); }

export function FollowerProductionQueue({ packs, theme }: { packs: QueuePack[]; theme: string }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const currentUserId = (user as any)?.id ?? (user as any)?.sub ?? null;
  const [items, setItems] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadQueue() {
    if (!tenantId || !token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [queueResponse, historyResponse] = await Promise.all([
      fetch(`/api/tenants/${tenantId}/follower-growth/production-queue`, { headers }),
      fetch(`/api/tenants/${tenantId}/follower-growth/production-queue/history`, { headers }),
    ]);
    if (!queueResponse.ok) throw new Error("Não foi possível carregar a fila compartilhada.");
    setItems(await queueResponse.json() as QueueItem[]);
    if (historyResponse.ok) setHistory(await historyResponse.json() as QueueHistory[]);
  }

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const defaults = packs.map((pack, index) => ({ externalKey: `${theme}:${index}:${pack.title}`, title: pack.title, theme, priority: index < 2 ? "alta" as const : "media" as const, pack }));
    fetch(`/api/tenants/${tenantId}/follower-growth/production-queue/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items: defaults }),
    })
      .then(async (response) => { if (!response.ok) throw new Error("Não foi possível sincronizar a fila compartilhada."); return response.json() as Promise<QueueItem[]>; })
      .then(async (data) => {
        if (cancelled) return;
        setItems(data);
        const historyResponse = await fetch(`/api/tenants/${tenantId}/follower-growth/production-queue/history`, { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled && historyResponse.ok) setHistory(await historyResponse.json() as QueueHistory[]);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao sincronizar fila."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token, theme, packs]);

  const summary = useMemo(() => ({ todo: items.filter((item) => item.status === "todo").length, doing: items.filter((item) => item.status === "doing").length, done: items.filter((item) => item.status === "done").length }), [items]);
  const historyCount = useMemo(() => { const map = new Map<string, number>(); for (const entry of history) map.set(entry.queueItemId, (map.get(entry.queueItemId) ?? 0) + 1); return map; }, [history]);

  async function patchItem(id: string, patch: Record<string, unknown>) {
    if (!tenantId || !token || busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/follower-growth/production-queue/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const payload = await response.json().catch(() => ({})) as QueueItem & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar a fila.");
      setItems((current) => current.map((item) => item.id === id ? payload : item));
      await loadQueue();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar a fila."); }
    finally { setBusyId(null); }
  }

  function openGenerator(item: QueueItem) {
    const brief = [item.pack.hook, item.pack.script, item.pack.cta, item.pack.caption, item.pack.visual].join(" | ");
    window.location.assign(`/content?tab=gerador&from=follower-production-queue&format=reel&theme=${encodeURIComponent(theme)}&brief=${encodeURIComponent(brief)}&queueItem=${encodeURIComponent(item.id)}`);
  }

  if (!tenantId || !token) return null;
  if (loading) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Sincronizando fila de produção por tenant…</CardContent></Card>;

  return <Card className="border-emerald-500/25"><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Rows3 className="h-5 w-5 text-emerald-600" /><CardTitle className="text-base">Fila de produção compartilhada</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Status, responsável, prazo e histórico ficam centralizados por tenant e disponíveis para a equipe.</p></div><div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">{summary.todo} a produzir</Badge><Badge variant="outline">{summary.doing} em produção</Badge><Badge variant={summary.done === items.length && items.length > 0 ? "default" : "outline"}>{summary.done} prontos</Badge></div></div></CardHeader><CardContent className="space-y-2">{error ? <p className="rounded-md border border-destructive/30 p-2 text-xs text-destructive">{error}</p> : null}{items.map((item, index) => { const Icon = item.status === "done" ? CheckCircle2 : item.status === "doing" ? PlayCircle : Circle; const dueValue = item.dueAt ? new Date(item.dueAt).toISOString().slice(0, 10) : ""; const owner = item.assigneeName || item.assigneeEmail || (item.assigneeUserId ? "Responsável definido" : "Sem responsável"); return <div key={item.id} className="rounded-lg border p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">#{index + 1}</span><p className="truncate text-sm font-semibold">{item.title}</p><Badge variant={item.priority === "alta" ? "default" : "outline"}>{item.priority}</Badge><Badge variant="outline">{statusLabel(item.status)}</Badge></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.pack.hook}</p><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{owner}</span><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{item.dueAt ? new Date(item.dueAt).toLocaleDateString("pt-BR") : "Sem prazo"}</span><span className="flex items-center gap-1"><History className="h-3 w-3" />{historyCount.get(item.id) ?? 0} alterações</span></div></div></div><div className="flex shrink-0 flex-wrap gap-2">{currentUserId ? <Button size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => void patchItem(item.id, { assigneeUserId: currentUserId })}>Atribuir a mim</Button> : null}<Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void patchItem(item.id, { status: nextStatus(item.status) })}>{busyId === item.id ? "Salvando…" : item.status === "todo" ? "Iniciar" : item.status === "doing" ? "Marcar pronto" : "Reabrir"}</Button><Button size="sm" onClick={() => openGenerator(item)}><Video className="mr-1.5 h-4 w-4" />Abrir no gerador</Button></div></div><div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"><label className="text-xs text-muted-foreground" htmlFor={`due-${item.id}`}>Prazo</label><input id={`due-${item.id}`} type="date" defaultValue={dueValue} className="h-8 rounded-md border bg-background px-2 text-xs" onBlur={(event) => { const next = event.currentTarget.value; if (next !== dueValue) void patchItem(item.id, { dueAt: isoDueDate(next) }); }} /><Button size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => void patchItem(item.id, { priority: item.priority === "alta" ? "media" : "alta" })}>Prioridade: {item.priority}</Button></div></div>; })}</CardContent></Card>;
}
