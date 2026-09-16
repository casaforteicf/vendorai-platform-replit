import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, BarChart3, Loader2, Pencil, Percent, RefreshCw, ShieldCheck, TrendingUp, Users } from "lucide-react";

interface PlanBreakdown { planId: string; planNome: string; count: number; mrr: number }
interface InadimplenteTenant { id: string; name: string; mrr: number; planNome: string | null; custoIaMes: number }
interface MargemTenant {
  id: string;
  name: string;
  mrr: number;
  custoIaMes: number;
  margemMes: number;
  margemPercent: number | null;
  planId: string | null;
  planNome: string | null;
  billingCycle: "monthly" | "annual" | null;
  planStartedAt: string | null;
  mensalidadeValor: number | null;
  descontoPercentual: number | null;
  formaPagamento: "pix" | "boleto" | "cartao" | "transferencia" | "outro" | null;
  statusPagamento: "pago" | "pendente" | "atrasado" | "isento" | null;
  diaVencimento: number | null;
  contratoInicioEm: string | null;
}
interface FinancialSummary {
  geradoEm: string;
  mrr: { total: number; arr: number; tenantsAtivos: number; tenantsDemo: number; tenantsSemPlano: number };
  planBreakdown: PlanBreakdown[];
  inadimplencia: { total: number; mrrEmRisco: number; tenants: InadimplenteTenant[] };
  ia: { custoTotalMes: number; margemTotalMes: number; rankingMargem: MargemTenant[] };
}
interface AdminPlan { id: string; name: string; slug: string; monthlyPriceCents?: number | null }

type BillingForm = {
  planId: string;
  billingCycle: "monthly" | "annual";
  mensalidadeValor: string;
  descontoPercentual: string;
  formaPagamento: "" | "pix" | "boleto" | "cartao" | "transferencia" | "outro";
  statusPagamento: "" | "pago" | "pendente" | "atrasado" | "isento";
  diaVencimento: string;
  contratoInicioEm: string;
};

const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
const safePct = (part: number, total: number) => total > 0 ? (part / total) * 100 : 0;
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function toInputDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toIsoDate(value: string): string | null {
  return value ? `${value}T12:00:00.000Z` : null;
}

function optionalMoney(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : null;
}

function paymentStatusLabel(status: MargemTenant["statusPagamento"]) {
  if (status === "pago") return "Em dia";
  if (status === "pendente") return "Pendente";
  if (status === "atrasado") return "Atrasado";
  if (status === "isento") return "Isento";
  return "Não definido";
}

function paymentStatusClass(status: MargemTenant["statusPagamento"]) {
  if (status === "pago") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pendente") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "atrasado") return "border-red-200 bg-red-50 text-red-700";
  if (status === "isento") return "border-slate-200 bg-slate-50 text-slate-700";
  return "";
}

export default function AdminFinanceiro() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MargemTenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BillingForm>({
    planId: "",
    billingCycle: "monthly",
    mensalidadeValor: "",
    descontoPercentual: "",
    formaPagamento: "",
    statusPagamento: "",
    diaVencimento: "",
    contratoInicioEm: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [summaryRes, plansRes] = await Promise.all([
        fetch("/api/admin/financial-summary", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/plans", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!summaryRes.ok) throw new Error(await summaryRes.text());
      setData(await summaryRes.json());
      if (plansRes.ok) setPlans(await plansRes.json());
    } catch {
      toast({ title: "Erro ao carregar painel financeiro", variant: "destructive" });
    } finally { setLoading(false); }
  }

  useEffect(() => { if (token) load(); }, [token]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const totalTenants = data.mrr.tenantsAtivos + data.mrr.tenantsDemo + data.mrr.tenantsSemPlano;
    const activeShare = safePct(data.mrr.tenantsAtivos, totalTenants);
    const defaultShare = safePct(data.inadimplencia.total, Math.max(data.mrr.tenantsAtivos, 1));
    const aiShare = data.mrr.total > 0 ? safePct(data.ia.custoTotalMes, data.mrr.total) : 0;
    const portfolioMargin = data.mrr.total > 0 ? safePct(data.ia.margemTotalMes, data.mrr.total) : 0;
    return { activeShare, defaultShare, aiShare, portfolioMargin };
  }, [data]);

  function openBillingEditor(tenant: MargemTenant) {
    setEditing(tenant);
    setForm({
      planId: tenant.planId ?? "",
      billingCycle: tenant.billingCycle ?? "monthly",
      mensalidadeValor: tenant.mensalidadeValor == null ? "" : String(tenant.mensalidadeValor),
      descontoPercentual: tenant.descontoPercentual == null ? "" : String(tenant.descontoPercentual),
      formaPagamento: tenant.formaPagamento ?? "",
      statusPagamento: tenant.statusPagamento ?? "",
      diaVencimento: tenant.diaVencimento ? String(tenant.diaVencimento) : "",
      contratoInicioEm: toInputDate(tenant.contratoInicioEm),
    });
  }

  async function saveBilling() {
    if (!editing) return;
    const dueDay = form.diaVencimento ? Number(form.diaVencimento) : null;
    const discount = form.descontoPercentual ? Number(form.descontoPercentual.replace(",", ".")) : null;
    const customMonthly = optionalMoney(form.mensalidadeValor);

    if (form.mensalidadeValor.trim() && customMonthly == null) {
      toast({ title: "Informe uma mensalidade válida", variant: "destructive" });
      return;
    }
    if (dueDay != null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
      toast({ title: "Dia de vencimento deve estar entre 1 e 31", variant: "destructive" });
      return;
    }
    if (discount != null && (!Number.isFinite(discount) || discount < 0 || discount > 100)) {
      toast({ title: "Desconto deve estar entre 0% e 100%", variant: "destructive" });
      return;
    }

    const payload: Record<string, unknown> = {
      planId: form.planId || null,
      billingCycle: form.billingCycle,
      mensalidadeValor: customMonthly,
      descontoPercentual: discount == null ? null : discount.toFixed(2),
      formaPagamento: form.formaPagamento || null,
      statusPagamento: form.statusPagamento || null,
      diaVencimento: dueDay,
      contratoInicioEm: toIsoDate(form.contratoInicioEm),
    };
    if (form.planId !== (editing.planId ?? "")) {
      payload.planStartedAt = form.planId ? new Date().toISOString() : null;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${editing.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Não foi possível atualizar a mensalidade");
      toast({ title: "Mensalidade e cobrança atualizadas" });
      setEditing(null);
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao atualizar mensalidade", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <BarChart3 className="h-7 w-7 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold">Saúde Financeira da Plataforma</h1>
            <p className="text-sm text-muted-foreground">Visão comparativa e gestão das mensalidades dos tenants</p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </div>

      {loading && !data ? (
        <div className="h-64 grid place-items-center text-muted-foreground"><div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/>Calculando indicadores...</div></div>
      ) : data && kpis ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi icon={TrendingUp} label="Margem da carteira" value={pct(kpis.portfolioMargin)} hint="resultado relativo à receita recorrente" />
            <Kpi icon={Activity} label="Custo IA" value={pct(kpis.aiShare)} hint="participação relativa no período" />
            <Kpi icon={AlertTriangle} label="Inadimplência" value={pct(kpis.defaultShare)} hint="tenants em risco sobre ativos" />
            <Kpi icon={Users} label="Tenants ativos" value={pct(kpis.activeShare)} hint="participação da base ativa" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Percent className="h-4 w-4"/>Participação por plano</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Plano</TableHead><TableHead className="text-right">Base %</TableHead><TableHead className="text-right">Receita %</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.planBreakdown.map((p) => (
                      <TableRow key={p.planId}><TableCell className="font-medium">{p.planNome}</TableCell><TableCell className="text-right">{pct(safePct(p.count, Math.max(data.mrr.tenantsAtivos, 1)))}</TableCell><TableCell className="text-right font-semibold">{pct(safePct(p.mrr, data.mrr.total))}</TableCell></TableRow>
                    ))}
                    {!data.planBreakdown.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sem dados de plano.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className={data.inadimplencia.total > 0 ? "border-orange-200" : ""}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4"/>Risco e inadimplência <Badge variant="secondary" className="ml-auto">{pct(kpis.defaultShare)}</Badge></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.inadimplencia.tenants.length ? data.inadimplencia.tenants.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0"><p className="font-medium truncate">{t.name}</p><p className="text-xs text-muted-foreground">{t.planNome ?? "Sem plano"}</p></div>
                    <Badge variant="outline">{pct(safePct(t.mrr, data.inadimplencia.mrrEmRisco))} do risco</Badge>
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center py-8">Nenhum tenant em risco.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-violet-500"/>Eficiência por tenant</CardTitle>
              <p className="text-xs text-muted-foreground">Mensalidade, vencimento e situação de cobrança podem ser editados diretamente aqui.</p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Mensalidade</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">IA %</TableHead>
                    <TableHead className="text-right">Margem %</TableHead>
                    <TableHead className="text-right">Participação %</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ia.rankingMargem.map((t) => {
                    const aiPct = t.mrr > 0 ? safePct(t.custoIaMes, t.mrr) : 0;
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.planNome ?? "Sem plano"}{t.billingCycle === "annual" ? " · anual" : ""}</p>
                        </TableCell>
                        <TableCell className="font-medium">{money(t.mrr)}</TableCell>
                        <TableCell>{t.diaVencimento ? `Dia ${t.diaVencimento}` : "—"}</TableCell>
                        <TableCell><Badge variant="outline" className={paymentStatusClass(t.statusPagamento)}>{paymentStatusLabel(t.statusPagamento)}</Badge></TableCell>
                        <TableCell className="text-right">{pct(aiPct)}</TableCell>
                        <TableCell className="text-right"><Badge variant="secondary">{pct(t.margemPercent)}</Badge></TableCell>
                        <TableCell className="text-right">{pct(safePct(t.mrr, data.mrr.total))}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openBillingEditor(t)} aria-label={`Editar mensalidade de ${t.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar mensalidade e cobrança</DialogTitle>
            <DialogDescription>{editing ? editing.name : "Tenant"} · alterações disponíveis somente para o Super Admin.</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="finance-plan">Plano</Label>
                  <select id="finance-plan" value={form.planId} onChange={(e) => setForm((current) => ({ ...current, planId: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Sem plano</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finance-cycle">Ciclo de cobrança</Label>
                  <select id="finance-cycle" value={form.billingCycle} onChange={(e) => setForm((current) => ({ ...current, billingCycle: e.target.value as BillingForm["billingCycle"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="monthly">Mensal</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="finance-monthly">Mensalidade personalizada</Label>
                  <Input id="finance-monthly" type="number" min="0" step="0.01" value={form.mensalidadeValor} onChange={(e) => setForm((current) => ({ ...current, mensalidadeValor: e.target.value }))} placeholder={money(editing.mrr)} />
                  <p className="text-[11px] text-muted-foreground">Em branco, o sistema usa o valor padrão do plano. Valor efetivo atual: {money(editing.mrr)}.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finance-discount">Desconto (%)</Label>
                  <Input id="finance-discount" type="number" min="0" max="100" step="0.01" value={form.descontoPercentual} onChange={(e) => setForm((current) => ({ ...current, descontoPercentual: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="finance-due">Dia de vencimento</Label>
                  <Input id="finance-due" type="number" min="1" max="31" value={form.diaVencimento} onChange={(e) => setForm((current) => ({ ...current, diaVencimento: e.target.value }))} placeholder="Ex.: 10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finance-method">Forma de pagamento</Label>
                  <select id="finance-method" value={form.formaPagamento} onChange={(e) => setForm((current) => ({ ...current, formaPagamento: e.target.value as BillingForm["formaPagamento"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Não definida</option>
                    <option value="pix">Pix</option>
                    <option value="boleto">Boleto</option>
                    <option value="cartao">Cartão</option>
                    <option value="transferencia">Transferência</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finance-status">Status</Label>
                  <select id="finance-status" value={form.statusPagamento} onChange={(e) => setForm((current) => ({ ...current, statusPagamento: e.target.value as BillingForm["statusPagamento"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Não definido</option>
                    <option value="pago">Em dia</option>
                    <option value="pendente">Pendente</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="isento">Isento</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finance-start">Início da cobrança / contrato</Label>
                <Input id="finance-start" type="date" value={form.contratoInicioEm} onChange={(e) => setForm((current) => ({ ...current, contratoInicioEm: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
                <Button onClick={saveBilling} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-4 md:p-5"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4"/><span className="text-xs">{label}</span></div><p className="text-2xl font-bold mt-2">{value}</p><p className="text-[11px] text-muted-foreground mt-1">{hint}</p></CardContent></Card>;
}
