import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Loader2, PlayCircle, Rows3, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type QueueStatus = "todo" | "doing" | "done";

type QueuePack = {
  title: string;
  hook: string;
  script: string;
  cta: string;
  caption: string;
  visual: string;
};

type QueueItem = {
  id: string;
  title: string;
  priority: "alta" | "media";
  status: QueueStatus;
  pack: QueuePack;
};

function statusLabel(status: QueueStatus) {
  if (status === "doing") return "Em produção";
  if (status === "done") return "Pronto";
  return "A produzir";
}

function nextStatus(status: QueueStatus): QueueStatus {
  if (status === "todo") return "doing";
  if (status === "doing") return "done";
  return "todo";
}

export function FollowerProductionQueue({ packs, theme }: { packs: QueuePack[]; theme: string }) {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const storageKey = tenantId ? `vendorai_follower_production_queue_v1:${tenantId}` : "";
  const [items, setItems] = useState<QueueItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const defaults = packs.map((pack, index) => ({
      id: `${theme}:${index}:${pack.title}`,
      title: pack.title,
      priority: index < 2 ? "alta" as const : "media" as const,
      status: "todo" as const,
      pack,
    }));
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw ? JSON.parse(raw) as QueueItem[] : [];
      const byId = new Map(saved.map((item) => [item.id, item]));
      setItems(defaults.map((item) => byId.get(item.id) ? { ...item, status: byId.get(item.id)!.status } : item));
    } catch {
      setItems(defaults);
    } finally {
      setHydrated(true);
    }
  }, [tenantId, storageKey, theme, packs]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, hydrated, storageKey]);

  const summary = useMemo(() => ({
    todo: items.filter((item) => item.status === "todo").length,
    doing: items.filter((item) => item.status === "doing").length,
    done: items.filter((item) => item.status === "done").length,
  }), [items]);

  function advance(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus(item.status) } : item));
  }

  function openGenerator(item: QueueItem) {
    const brief = [item.pack.hook, item.pack.script, item.pack.cta, item.pack.caption, item.pack.visual].join(" | ");
    window.location.assign(`/content?tab=gerador&from=follower-production-queue&format=reel&theme=${encodeURIComponent(theme)}&brief=${encodeURIComponent(brief)}&queueItem=${encodeURIComponent(item.id)}`);
  }

  if (!tenantId) return null;
  if (!hydrated) return <Card><CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando fila de produção…</CardContent></Card>;

  return (
    <Card className="border-emerald-500/25">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Rows3 className="h-5 w-5 text-emerald-600" /><CardTitle className="text-base">Fila de produção de hoje</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Transforma o pacote diário em execução: prioriza, acompanha produção e abre cada Reel no gerador.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{summary.todo} a produzir</Badge>
            <Badge variant="outline">{summary.doing} em produção</Badge>
            <Badge variant={summary.done === items.length && items.length > 0 ? "default" : "outline"}>{summary.done} prontos</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => {
          const Icon = item.status === "done" ? CheckCircle2 : item.status === "doing" ? PlayCircle : Circle;
          return (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <Badge variant={item.priority === "alta" ? "default" : "outline"}>{item.priority}</Badge>
                    <Badge variant="outline">{statusLabel(item.status)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.pack.hook}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => advance(item.id)}>{item.status === "todo" ? "Iniciar" : item.status === "doing" ? "Marcar pronto" : "Reabrir"}</Button>
                <Button size="sm" onClick={() => openGenerator(item)}><Video className="mr-1.5 h-4 w-4" />Abrir no gerador</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
