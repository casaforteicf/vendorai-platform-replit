import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Loader2, Play, ShieldAlert } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "Sem vigência";
}

type Renewal = {
  id: string;
  accountId: string;
  accountName: string;
  productName: string;
  insurerName?: string | null;
  policyNumber?: string | null;
  effectiveTo: string;
  premium?: string | null;
  renewalWindow: string;
  score?: string | null;
  status: string;
  blocked: boolean;
  humanRequired: boolean;
  explanation?: {
    facts?: Record<string, unknown>;
    inference?: { reasons?: string[]; priority?: string };
  };
};

const COLUMNS = [
  { key: "90_dias", label: "90 dias", tone: "border-sky-200 bg-sky-50/40" },
  { key: "60_dias", label: "60 dias", tone: "border-blue-200 bg-blue-50/40" },
  { key: "30_dias", label: "30 dias", tone: "border-amber-200 bg-amber-50/40" },
  { key: "10_dias", label: "10 dias", tone: "border-orange-200 bg-orange-50/40" },
  { key: "vencido", label: "Vencido", tone: "border-red-200 bg-red-50/40" },
] as const;

export default function InsuranceRenewals() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["insurance-renewals", tenantId];

  const { data = [], isLoading } = useQuery<Renewal[]>({
    queryKey,
    enabled: !!tenantId,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/scout/insurance/renewals`, { headers: authHeaders() });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Erro ao carregar renovações");
      return payload;
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/scout/insurance/renewals/run`, {
        method: "POST", headers: authHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Erro ao recalcular");
      return payload;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Renovações recalculadas", description: `${result.opportunitiesCreated} criada(s) · ${result.opportunitiesUpdated} atualizada(s)` });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tenants/${tenantId}/scout/insurance/renewals/${id}/approve`, {
        method: "POST", headers: authHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível aprovar");
      return payload;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Etapa aprovada", description: "A renovação segue sob supervisão humana e não será enviada automaticamente." });
    },
    onError: (error: Error) => toast({ title: "Aprovação bloqueada", description: error.message, variant: "destructive" }),
  });

  const grouped = useMemo(() => Object.fromEntries(COLUMNS.map((column) => [
    column.key,
    data.filter((item) => item.renewalWindow === column.key),
  ])) as Record<string, Renewal[]>, [data]);

  const blocked = data.filter((item) => item.blocked).length;
  const critical = data.filter((item) => Number(item.score ?? 0) >= 90).length;
  const premium = data.reduce((sum, item) => sum + Number(item.premium ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-6 w-6" /> Renovações de Seguros
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline automático por vigência. A coluna de prazo não pode ser movida manualmente.
          </p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Recalcular agora
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Renovações na janela", data.length, CalendarClock],
          ["Prioridade crítica", critical, AlertTriangle],
          ["Bloqueadas", blocked, ShieldAlert],
          ["Prêmio protegido", money(premium), Building2],
        ].map(([label, value, Icon]: any) => (
          <Card key={label}><CardContent className="p-4 flex justify-between gap-3">
            <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold mt-1">{value}</p></div>
            <Icon className="h-5 w-5 text-muted-foreground" />
          </CardContent></Card>
        ))}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 xl:grid-cols-5 gap-3">{COLUMNS.map((c) => <Skeleton key={c.key} className="h-80" />)}</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
          {COLUMNS.map((column) => (
            <Card key={column.key} className={column.tone}>
              <CardHeader className="p-3 border-b">
                <CardTitle className="text-sm flex items-center justify-between">
                  {column.label}<Badge variant="secondary">{grouped[column.key]?.length ?? 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-2">
                {(grouped[column.key] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhuma renovação</p>
                ) : (grouped[column.key] ?? []).map((item) => (
                  <div key={item.id} className="rounded-lg border bg-background p-3 space-y-2 shadow-sm">
                    <div>
                      <p className="font-semibold text-sm leading-tight">{item.accountName}</p>
                      <p className="text-xs font-medium text-primary mt-1">{item.productName}</p>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>{item.insurerName ?? "Seguradora não informada"}</p>
                      <p>Apólice: {item.policyNumber ?? "não informada"}</p>
                      <p>Vence: {date(item.effectiveTo)}</p>
                      <p>Prêmio: {money(item.premium)}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline">Score {Number(item.score ?? 0)}</Badge>
                      {item.blocked && <Badge variant="destructive">Bloqueada</Badge>}
                      {item.humanRequired && <Badge variant="outline" className="border-amber-300 text-amber-700">Humano</Badge>}
                      {item.status === "aprovado" && <Badge className="bg-emerald-600">Aprovada</Badge>}
                    </div>
                    {item.explanation?.inference?.reasons?.length ? (
                      <p className="text-[11px] text-muted-foreground">
                        Motivos: {item.explanation.inference.reasons.join(", ").replaceAll("_", " ")}
                      </p>
                    ) : null}
                    <Button
                      size="sm"
                      variant={item.status === "aprovado" ? "outline" : "default"}
                      className="w-full h-8"
                      disabled={item.blocked || item.status === "aprovado" || approve.isPending}
                      onClick={() => approve.mutate(item.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {item.status === "aprovado" ? "Etapa aprovada" : item.blocked ? "Requer tratamento" : "Aprovar preparação"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
