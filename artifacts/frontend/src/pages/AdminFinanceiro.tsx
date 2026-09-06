import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cloud,
  DollarSign,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";

interface PlanBreakdown {
  planId: string;
  planNome: string;
  count: number;
  mrr: number;
}

interface MargemTenant {
  id: string;
  name: string;
  mrr: number;
  custoIaMes: number;
  custoExternoDiretoUsd: number;
  custoCompartilhadoRateadoUsd: number;
  custoOperacionalUsd: number;
  custoOperacionalBrl: number;
  margemMes: number;
  margemPercent: number | null;
  planNome: string | null;
}

interface CostEntry {
  id: string;
  provider: string;
  category: string;
  amountUsd: number;
  periodStart: string;
  periodEnd: string;
  tenantId: string | null;
  tenantName: string | null;
  source: string;
  externalReference: string | null;
  note: string | null;
  createdAt: string;
}

interface FinancialSummary {
  geradoEm: string;
  periodo: { startDate: string; endDate: string };
  cambio: { usdToBrl: number; source: string };
  mrr: {
    total: number;
    arr: number;
    tenantsAtivos: number;
    tenantsDemo: number;
    tenantsSemPlano: number;
  };
  planBreakdown: PlanBreakdown[];
  inadimplencia: {
    total: number;
    mrrEmRisco: number;
    tenants: Array<{ id: string; name: string; mrr: number }>;
  };
  ia: {
    custoTotalMes: number;
    margemTotalMes: number;
    rankingMargem: MargemTenant[];
  };
  custos: {
    totalUsd: number;
    sharedUsd: number;
    aiTrackedUsd: number;
    operationalTotalUsd: number;
    operationalTotalBrl: number;
    byProvider: Array<{ provider: string; amountUsd: number }>;
    byCategory: Array<{ category: string; amountUsd: number }>;
    entries: CostEntry[];
    allocation: { method: string; sharedPerActiveTenantUsd: number };
    tracking: { ai: string; infrastructure: string };
  };
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function usd(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

const providers = ["Cloudflare", "Supabase", "Railway", "OpenAI", "Meta/WhatsApp", "Google", "E-mail/SMS", "Outro"];
const categories = ["Infraestrutura", "IA", "Comunicação", "Mídia", "Storage", "Observabilidade", "API externa", "Outro"];

export default function AdminFinanceiro() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("Cloudflare");
  const [category, setCategory] = useState("Infraestrutura");
  const [amountUsd, setAmountUsd] = useState("");
  const [tenantId, setTenantId] = useState("platform");
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/financial-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json());
    } catch (error) {
      toast({ title: "Erro ao carregar Gestão de Custos", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const operationalMargin = useMemo(() => {
    if (!data || data.mrr.total <= 0) return null;
    return ((data.mrr.total - data.custos.operationalTotalBrl) / data.mrr.total) * 100;
  }, [data]);

  async function addCost() {
    if (!data) return;
    const parsed = Number(amountUsd.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({ title: "Informe um valor válido em USD", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/platform-costs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          category,
          amountUsd: parsed,
          periodStart: data.periodo.startDate,
          periodEnd: data.periodo.endDate,
          tenantId: tenantId === "platform" ? null : tenantId,
          source: "manual",
          note: note || null,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setAmountUsd("");
      setNote("");
      setTenantId("platform");
      toast({ title: "Custo real registrado" });
      await load();
    } catch (error) {
      toast({ title: "Não foi possível registrar o custo", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function removeCost(id: string) {
    try {
      const response = await fetch(`/api/admin/platform-costs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch (error) {
      toast({ title: "Erro ao remover custo", description: String(error), variant: "destructive" });
    }
  }

  if (loading && !data) {
    return <div className="p-6 flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando custos reais...</div>;
  }
  if (!data) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold">Gestão de Custos & FinOps</h1>
            <p className="text-sm text-muted-foreground">Receita, custo real e margem por tenant · câmbio {data.cambio.usdToBrl.toFixed(2)} BRL/USD</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Metric icon={<DollarSign className="h-4 w-4" />} label="MRR" value={brl(data.mrr.total)} tone="emerald" />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="ARR" value={brl(data.mrr.arr)} tone="emerald" />
        <Metric icon={<Users className="h-4 w-4" />} label="Tenants ativos" value={String(data.mrr.tenantsAtivos)} />
        <Metric icon={<Activity className="h-4 w-4" />} label="IA rastreada" value={usd(data.custos.aiTrackedUsd)} tone="violet" />
        <Metric icon={<Cloud className="h-4 w-4" />} label="Custo operacional" value={brl(data.custos.operationalTotalBrl)} tone="orange" />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Margem operacional" value={operationalMargin == null ? "—" : pct(operationalMargin)} tone={operationalMargin != null && operationalMargin >= 70 ? "emerald" : "orange"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Custos reais por fornecedor</CardTitle></CardHeader>
          <CardContent>
            {data.custos.byProvider.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Ainda não há faturas externas registradas neste mês. A IA já é rastreada automaticamente.</div>
            ) : (
              <Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead className="text-right">Custo</TableHead></TableRow></TableHeader><TableBody>
                {data.custos.byProvider.map((row) => <TableRow key={row.provider}><TableCell className="font-medium">{row.provider}</TableCell><TableCell className="text-right font-mono">{usd(row.amountUsd)}</TableCell></TableRow>)}
              </TableBody></Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Registrar custo real</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Fornecedor"><Select value={provider} onValueChange={setProvider}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Categoria"><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Ratear / atribuir a"><Select value={tenantId} onValueChange={setTenantId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="platform">Plataforma (rateio)</SelectItem>{data.ia.rankingMargem.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Valor real (USD)"><Input inputMode="decimal" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="0.00" /></Field>
            <Field label="Observação"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: fatura setembro" /></Field>
            <Button className="w-full" onClick={() => void addCost()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Registrar</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Cloud className="h-4 w-4" /> Ledger do mês <Badge variant="secondary" className="ml-auto">{data.custos.entries.length} lançamentos</Badge></CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Origem</TableHead><TableHead>Tenant</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>
          {data.custos.entries.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum custo externo registrado.</TableCell></TableRow> : data.custos.entries.map((entry) => <TableRow key={entry.id}><TableCell className="font-medium">{entry.provider}</TableCell><TableCell>{entry.category}</TableCell><TableCell><Badge variant="outline">{entry.source}</Badge></TableCell><TableCell>{entry.tenantName ?? "Plataforma / rateio"}</TableCell><TableCell className="text-right font-mono">{usd(entry.amountUsd)}</TableCell><TableCell><Button size="icon" variant="ghost" onClick={() => void removeCost(entry.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}
        </TableBody></Table></CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Receita por plano</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Plano</TableHead><TableHead className="text-right">Tenants</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{data.planBreakdown.map((p) => <TableRow key={p.planId}><TableCell>{p.planNome}</TableCell><TableCell className="text-right">{p.count}</TableCell><TableCell className="text-right">{brl(p.mrr)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card className={data.inadimplencia.total > 0 ? "border-orange-300" : ""}><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risco financeiro</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Tenants suspensos</span><strong>{data.inadimplencia.total}</strong></div><div className="flex justify-between"><span>MRR em risco</span><strong>{brl(data.inadimplencia.mrrEmRisco)}</strong></div><div className="flex justify-between"><span>Tenants sem plano</span><strong>{data.mrr.tenantsSemPlano}</strong></div><div className="flex justify-between"><span>Custo compartilhado</span><strong>{usd(data.custos.sharedUsd)}</strong></div><div className="flex justify-between"><span>Rateio atual</span><Badge variant="outline">igual / tenants ativos</Badge></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Margem real por tenant</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead className="text-right">MRR</TableHead><TableHead className="text-right">IA</TableHead><TableHead className="text-right">Direto</TableHead><TableHead className="text-right">Rateio</TableHead><TableHead className="text-right">Custo total</TableHead><TableHead className="text-right">Margem</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader><TableBody>
          {data.ia.rankingMargem.map((t) => <TableRow key={t.id}><TableCell><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.planNome ?? "Sem plano"}</div></TableCell><TableCell className="text-right">{brl(t.mrr)}</TableCell><TableCell className="text-right font-mono">{usd(t.custoIaMes)}</TableCell><TableCell className="text-right font-mono">{usd(t.custoExternoDiretoUsd)}</TableCell><TableCell className="text-right font-mono">{usd(t.custoCompartilhadoRateadoUsd)}</TableCell><TableCell className="text-right font-medium">{brl(t.custoOperacionalBrl)}</TableCell><TableCell className="text-right">{brl(t.margemMes)}</TableCell><TableCell className="text-right"><Badge variant={t.margemPercent != null && t.margemPercent < 50 ? "destructive" : "secondary"}>{pct(t.margemPercent)}</Badge></TableCell></TableRow>)}
        </TableBody></Table></CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "emerald" | "violet" | "orange" }) {
  const toneClass = tone === "emerald" ? "text-emerald-600" : tone === "violet" ? "text-violet-600" : tone === "orange" ? "text-orange-600" : "";
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div><div className={`text-xl font-bold ${toneClass}`}>{value}</div></CardContent></Card>;
}
