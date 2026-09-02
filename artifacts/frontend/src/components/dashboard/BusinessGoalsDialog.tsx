import { useEffect, useMemo, useState } from "react";
import { useListTenantUsers } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Trash2 } from "lucide-react";

type GoalMetric = {
  key: string;
  label: string;
  unit: "count" | "currency" | "percent";
};

type BusinessGoalRecord = {
  id: string;
  metric_key: string;
  label: string;
  period_type: string;
  target_value: string | number;
  unit: "count" | "currency" | "percent";
  starts_at: string;
  ends_at: string;
  responsible_id: string | null;
  team_key: string | null;
  active: boolean;
};

const METRICS: GoalMetric[] = [
  { key: "new_leads", label: "Leads novos", unit: "count" },
  { key: "active_opportunities", label: "Oportunidades ativas", unit: "count" },
  { key: "confirmed_sales", label: "Vendas confirmadas", unit: "count" },
  { key: "sold_revenue", label: "Receita vendida", unit: "currency" },
  { key: "average_ticket", label: "Ticket médio", unit: "currency" },
  { key: "commercial_conversion", label: "Conversão comercial", unit: "percent" },
];

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeFor(periodType: string) {
  const now = new Date();
  if (periodType === "weekly") {
    const day = now.getDay() || 7;
    const start = new Date(now);
    start.setDate(now.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toInputDate(start), end: toInputDate(end) };
  }
  if (periodType === "quarterly") {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    return {
      start: toInputDate(new Date(now.getFullYear(), quarterStart, 1)),
      end: toInputDate(new Date(now.getFullYear(), quarterStart + 3, 0)),
    };
  }
  if (periodType === "yearly") {
    return {
      start: `${now.getFullYear()}-01-01`,
      end: `${now.getFullYear()}-12-31`,
    };
  }
  return {
    start: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function formatGoalValue(value: number, unit: BusinessGoalRecord["unit"]) {
  if (unit === "currency") {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (unit === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("pt-BR");
}

export default function BusinessGoalsDialog({ onChanged }: { onChanged: () => void }) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const canManage = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin" || user?.userFunction === "administrador";
  const { data: users } = useListTenantUsers(tenantId);
  const sellers = useMemo(
    () => (users ?? []).filter((member) => member.active && member.userFunction === "vendedor"),
    [users],
  );
  const sellerMap = useMemo(() => new Map((users ?? []).map((member) => [member.id, member.name ?? member.email])), [users]);

  const initialRange = rangeFor("monthly");
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState<BusinessGoalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<"company" | "seller">("company");
  const [sellerId, setSellerId] = useState("");
  const [metricKey, setMetricKey] = useState("sold_revenue");
  const [targetValue, setTargetValue] = useState("");
  const [periodType, setPeriodType] = useState("monthly");
  const [startsAt, setStartsAt] = useState(initialRange.start);
  const [endsAt, setEndsAt] = useState(initialRange.end);

  const metric = METRICS.find((item) => item.key === metricKey) ?? METRICS[0];

  async function loadGoals() {
    if (!tenantId || !token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/business-goals`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível carregar as metas");
      setGoals(await response.json());
    } catch (error) {
      toast({
        title: "Erro ao carregar metas",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadGoals();
  }, [open]);

  function handlePeriodChange(value: string) {
    setPeriodType(value);
    if (value !== "custom") {
      const range = rangeFor(value);
      setStartsAt(range.start);
      setEndsAt(range.end);
    }
  }

  async function createGoal() {
    if (!tenantId || !token) return;
    const numericTarget = Number(targetValue.replace(",", "."));
    if (!Number.isFinite(numericTarget) || numericTarget < 0) {
      toast({ title: "Meta inválida", description: "Informe um valor de meta válido.", variant: "destructive" });
      return;
    }
    if (scope === "seller" && !sellerId) {
      toast({ title: "Selecione o vendedor", description: "A meta individual precisa de um responsável.", variant: "destructive" });
      return;
    }
    if (!startsAt || !endsAt || new Date(endsAt) < new Date(startsAt)) {
      toast({ title: "Período inválido", description: "Confira as datas da meta.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const scopeLabel = scope === "company" ? "Empresa" : sellerMap.get(sellerId) ?? "Vendedor";
      const response = await fetch(`/api/tenants/${tenantId}/business-goals`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metricKey: metric.key,
          label: `${metric.label} · ${scopeLabel}`,
          targetValue: numericTarget,
          unit: metric.unit,
          periodType,
          startsAt: `${startsAt}T00:00:00`,
          endsAt: `${endsAt}T23:59:59`,
          responsibleId: scope === "seller" ? sellerId : null,
          teamKey: null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Não foi possível criar a meta");
      toast({ title: "Meta criada", description: scope === "company" ? "Meta global da empresa configurada." : "Meta individual do vendedor configurada." });
      setTargetValue("");
      await loadGoals();
      onChanged();
    } catch (error) {
      toast({
        title: "Erro ao criar meta",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deactivateGoal(id: string) {
    if (!tenantId || !token) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/business-goals/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) throw new Error("Não foi possível desativar a meta");
      await loadGoals();
      onChanged();
    } catch (error) {
      toast({
        title: "Erro ao desativar meta",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  if (!canManage) return null;

  const activeGoals = goals.filter((goal) => goal.active);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Target className="h-4 w-4" /> Configurar metas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Metas e desempenho</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-sm font-semibold">Nova meta</h3>
              <p className="mt-1 text-xs text-muted-foreground">Defina uma meta global da empresa ou individual por vendedor.</p>
            </div>

            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select value={scope} onValueChange={(value) => setScope(value as "company" | "seller")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Empresa inteira</SelectItem>
                  <SelectItem value="seller">Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "seller" ? (
              <div className="space-y-2">
                <Label>Vendedor</Label>
                <Select value={sellerId} onValueChange={setSellerId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                  <SelectContent>
                    {sellers.map((seller) => (
                      <SelectItem key={seller.id} value={seller.id}>{seller.name ?? seller.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Indicador</Label>
              <Select value={metricKey} onValueChange={setMetricKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRICS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor da meta {metric.unit === "currency" ? "(R$)" : metric.unit === "percent" ? "(%)" : ""}</Label>
              <Input type="number" min="0" step={metric.unit === "currency" ? "0.01" : metric.unit === "percent" ? "0.1" : "1"} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder={metric.unit === "currency" ? "500000" : metric.unit === "percent" ? "20" : "100"} />
            </div>

            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <Select value={periodType} onValueChange={handlePeriodChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                  <SelectItem value="custom">Personalizada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Início</Label><Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
              <div className="space-y-2"><Label>Fim</Label><Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
            </div>

            <Button className="w-full" onClick={createGoal} disabled={saving}>{saving ? "Salvando..." : "Criar meta"}</Button>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Metas ativas</h3>
              <p className="mt-1 text-xs text-muted-foreground">Metas individuais não são somadas automaticamente à meta global.</p>
            </div>
            {loading ? <p className="text-sm text-muted-foreground">Carregando metas...</p> : null}
            {!loading && activeGoals.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhuma meta ativa configurada.</div>
            ) : null}
            <div className="space-y-2">
              {activeGoals.map((goal) => {
                const target = Number(goal.target_value ?? 0);
                const sellerName = goal.responsible_id ? sellerMap.get(goal.responsible_id) : null;
                return (
                  <div key={goal.id} className="rounded-xl border p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{goal.label}</p>
                          <Badge variant="secondary">{sellerName ? sellerName : "Empresa"}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(goal.starts_at).toLocaleDateString("pt-BR")} a {new Date(goal.ends_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deactivateGoal(goal.id)} title="Desativar meta"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">Meta</span><strong>{formatGoalValue(target, goal.unit)}</strong></div>
                    <Progress value={0} className="mt-2 h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
