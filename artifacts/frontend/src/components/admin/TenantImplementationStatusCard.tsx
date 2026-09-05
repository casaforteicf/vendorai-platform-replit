import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, CheckCircle2, Clock3, Loader2, ShieldAlert, UserRoundCheck, Wrench } from "lucide-react";

type Snapshot = {
  status: "implementing" | "ready" | "live";
  mode: "guided" | "assisted" | "automatic";
  progress: { completed: number; total: number; percent: number };
  nextAction: { title: string } | null;
  readiness: {
    ready: boolean;
    hardScore: number;
    blockers: Array<{ id: string; title: string }>;
  };
  goLiveAt: string | null;
  followups: Array<{ day: string; status: "upcoming" | "due" | "completed" }>;
  handoffs: {
    customerSuccessAt: string | null;
    devAt: string | null;
    devTicketId: string | null;
  };
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function TenantImplementationStatusCard({ tenantId }: { tenantId: string }) {
  const { token } = useAuth();
  const { data, isLoading, error } = useQuery<Snapshot>({
    queryKey: ["admin-tenant-implementation", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/superadmin/tenants/${tenantId}/implementation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao carregar implantação");
      return result;
    },
    enabled: !!tenantId && !!token,
    refetchInterval: 30_000,
  });

  const due = data?.followups.filter((item) => item.status === "due").length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold"><Bot className="h-5 w-5" /> Implantação do tenant</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Readiness, bloqueios, go-live e escalonamentos do Agente de Implantação.</p>
          </div>
          {data && <Badge variant="outline">{data.status === "live" ? "Em operação" : data.readiness.ready ? "Ready" : "Em implantação"}</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar o estado da implantação.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Modo</p><p className="mt-1 font-semibold capitalize">{data.mode}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Progresso</p><p className="mt-1 font-semibold">{data.progress.percent}%</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Readiness crítico</p><p className="mt-1 font-semibold">{data.readiness.hardScore}%</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Go-live</p><p className="mt-1 text-sm font-semibold">{formatDate(data.goLiveAt)}</p></div>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${data.readiness.hardScore}%` }} /></div>

            {data.readiness.blockers.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4" /> {data.readiness.blockers.length} bloqueio(s) de go-live</p>
                <div className="mt-2 flex flex-wrap gap-2">{data.readiness.blockers.map((item) => <Badge key={item.id} variant="outline">{item.title}</Badge>)}</div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Sem bloqueios críticos.</p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Próxima ação</p><p className="mt-1 text-sm font-medium">{data.nextAction?.title ?? (data.status === "live" ? "Operação liberada" : "Nenhuma")}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pós-go-live</p><p className="mt-1 flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4" /> {due} acompanhamento(s) vencido(s)</p></div>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.handoffs.customerSuccessAt && <Badge variant="secondary" className="gap-1"><UserRoundCheck className="h-3 w-3" /> Customer Success acionado</Badge>}
              {data.handoffs.devTicketId && <Badge variant="secondary" className="gap-1"><Wrench className="h-3 w-3" /> Dev IA · {data.handoffs.devTicketId.slice(0, 8)}</Badge>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
