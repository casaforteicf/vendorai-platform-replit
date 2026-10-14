import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Sparkles, Wrench, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}` };
}

interface ChangelogEntry {
  id: string;
  titulo: string;
  descricao: string;
  tipo: "novidade" | "melhoria" | "correcao";
  publicadoEm: string;
}

const TIPO_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  novidade: { label: "Novidade", className: "bg-violet-50 text-violet-700 border-violet-200", icon: <Sparkles className="h-3 w-3" /> },
  melhoria: { label: "Melhoria", className: "bg-blue-50 text-blue-700 border-blue-200", icon: <Wrench className="h-3 w-3" /> },
  correcao: { label: "Correção", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Bug className="h-3 w-3" /> },
};

export function NovidadesBell({ variant = "sidebar" }: { variant?: "sidebar" | "icon" } = {}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["changelog-unread"],
    queryFn: async () => {
      const r = await fetch("/api/changelog/unread-count", { headers: authHeaders() });
      if (!r.ok) throw new Error(`unread-count failed: ${r.status}`);
      return r.json();
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    retry: (failureCount, error) => !String(error).includes("429") && failureCount < 2,
  });

  const { data: entries = [], isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["changelog-entries"],
    queryFn: () => fetch("/api/changelog", { headers: authHeaders() }).then((r) => r.json()),
    enabled: open,
  });

  const marcarLido = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/changelog/marcar-lido", { method: "POST", headers: authHeaders() });
      if (!response.ok) throw new Error(`Falha ao marcar novidades como lidas (HTTP ${response.status})`);
      return response;
    },
    onSuccess: () => qc.setQueryData(["changelog-unread"], { count: 0 }),
    onError: () => {
      // Mantém o contador visível se o servidor não confirmar a leitura.
      qc.invalidateQueries({ queryKey: ["changelog-unread"] });
    },
  });

  function handleOpen(v: boolean) {
    setOpen(v);
    if (v && (unread?.count ?? 0) > 0) marcarLido.mutate();
  }

  const count = unread?.count ?? 0;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => handleOpen(true)}
          className="relative rounded-lg p-2 text-slate-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          aria-label={count > 0 ? `Novidades: ${count} não lidas` : "Novidades"}
        >
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#070f1a]">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      ) : (
        <Button variant="ghost" size="sm" className="relative w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => handleOpen(true)}>
          <Bell className="h-4 w-4 mr-2" />
          Novidades
          {count > 0 && (
            <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      )}

      <Sheet open={open} onOpenChange={handleOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Novidades do Vendor.ai</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {marcarLido.isError ? (
              <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Não foi possível marcar as novidades como lidas. O contador será mantido até o servidor confirmar.
              </div>
            ) : null}
            {isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma novidade publicada ainda.</p>
            ) : (
              entries.map((e) => {
                const cfg = TIPO_CONFIG[e.tipo] ?? TIPO_CONFIG.novidade!;
                return (
                  <div key={e.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs flex items-center gap-1 ${cfg.className}`}>
                        {cfg.icon} {cfg.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(e.publicadoEm), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{e.titulo}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{e.descricao}</p>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
