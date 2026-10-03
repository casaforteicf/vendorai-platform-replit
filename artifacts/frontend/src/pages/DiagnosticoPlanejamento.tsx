import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { useRef, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  FileText,
  Link2,
  Megaphone,
  RefreshCw,
  Rocket,
  Target,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessPlanPanel } from "@/components/business-plan/BusinessPlanPanel";

type Diagnostic = {
  percentual: number;
  nivel: string;
  lacunas: Array<{ id: string; titulo: string; acao: string }>;
};

type BusinessPlanSnapshot = {
  plan: { version: number; sections: Record<string, { approved?: unknown[] }> };
  sources: { profile?: Record<string, unknown> | null };
};

type GrowthScenario = {
  id: string;
  label: string;
  projectedMonthlyRevenue: number;
  projectedSales: number;
  leadsNeeded: number | null;
  projectedMarketingInvestment: number;
  projectedCAC: number | null;
  projectedROAS: number | null;
};

type GrowthData = {
  confidence: "alta" | "media" | "baixa";
  source: string;
  sample: { months: number; orders: number; leads: number; liveDeals: number; liveWon: number };
  baseline: {
    avgMonthlyRevenue: number;
    avgMonthlyOrders: number;
    avgTicket: number;
    conversionPercent: number;
    avgMonthlyMarketingSpend: number;
    cpl: number | null;
    cac: number | null;
  };
  scenarios: GrowthScenario[];
  planVsExecution: Array<{ metric_key: string; label: string; target_value: string; unit: string; starts_at: string; ends_at: string }>;
  valueGenerated: { trackedRevenue: number; trackedOrders: number; trackedMarketingSpend: number; trackedMonths: number; source: string };
  recommendations: Array<{ priority: "alta" | "media" | "baixa"; title: string; action: string; reason: string }>;
  assumptions: string[];
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("vendorai_token");
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || "Não foi possível concluir a operação.");
  }
  return response.json() as Promise<T>;
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pctTone(value: number) {
  if (value >= 85) return "text-emerald-700";
  if (value >= 65) return "text-blue-700";
  if (value >= 40) return "text-amber-700";
  return "text-muted-foreground";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")
    : raw.replace(/[^0-9.-]/g, "");
  return Number(normalized) || 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 1000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  return raw;
}

function keyOf(row: Record<string, unknown>, candidates: string[]) {
  const keys = Object.keys(row);
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = keys.find((key) => candidates.some((candidate) => normalized(key).includes(normalized(candidate))));
  return found ? row[found] : undefined;
}

export default function DiagnosticoPlanejamento() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [publicLink, setPublicLink] = useState("");

  const snapshot = useQuery<BusinessPlanSnapshot>({
    queryKey: ["diagnostico-planejamento", "business-plan", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    queryFn: () => apiJson(`/api/tenants/${tenantId}/business-plan`),
  });

  const diagnostic = useQuery<Diagnostic>({
    queryKey: ["diagnostico-planejamento", "diagnostico", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    queryFn: () => apiJson(`/api/tenants/${tenantId}/business-plan/diagnostico-inteligencia`),
  });

  const growth = useQuery<GrowthData>({
    queryKey: ["diagnostico-planejamento", "growth", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    queryFn: () => apiJson(`/api/tenants/${tenantId}/diagnostico-planejamento/growth-scenarios`),
  });

  const profile = snapshot.data?.sources?.profile ?? {};
  const companyName = String(profile?.["nome_fantasia"] || profile?.["razao_social"] || "Sua empresa");
  const score = diagnostic.data?.percentual ?? 0;
  const approvedSections = snapshot.data
    ? Object.values(snapshot.data.plan.sections ?? {}).filter((section) => (section.approved?.length ?? 0) > 0).length
    : 0;

  async function generateLink() {
    setBusy("link");
    try {
      const result = await apiJson<{ path: string }>(`/api/tenants/${tenantId}/diagnostico-planejamento/public-link`, { method: "POST" });
      const url = `${window.location.origin}${result.path}`;
      setPublicLink(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  async function importHistory(file: File) {
    setBusy("history");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("Planilha sem dados.");
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows = rawRows.map((row) => ({
        date: dateValue(keyOf(row, ["data", "mes", "month", "date"])),
        revenue: numberValue(keyOf(row, ["faturamento", "receita", "revenue", "valor", "vendasr"])),
        orders: numberValue(keyOf(row, ["pedidos", "vendas", "orders", "quantidade"])),
        leads: numberValue(keyOf(row, ["leads", "oportunidades", "contatos"])),
        marketingSpend: numberValue(keyOf(row, ["investimento", "midia", "marketing", "spend"])),
        channel: String(keyOf(row, ["canal", "channel", "origem"]) ?? "").trim() || undefined,
        product: String(keyOf(row, ["produto", "servico", "product"]) ?? "").trim() || undefined,
      })).filter((row) => row.date && (row.revenue > 0 || row.orders > 0 || row.leads > 0 || row.marketingSpend > 0));
      if (!rows.length) throw new Error("Não encontrei linhas válidas. Use colunas como Data, Faturamento/Receita, Vendas/Pedidos, Leads e Investimento.");
      await apiJson(`/api/tenants/${tenantId}/diagnostico-planejamento/sales-history`, {
        method: "POST",
        body: JSON.stringify({ rows, sourceName: file.name }),
      });
      await growth.refetch();
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const refresh = () => {
    void snapshot.refetch();
    void diagnostic.refetch();
    void growth.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><BrainCircuit className="h-4 w-4" />Diagnóstico & Planejamento</div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{companyName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Entrada única para Perfil Mestre, Plano de Negócios, histórico, diagnóstico, projeções, investimento em marketing e plano de ação.</p>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-2xl border bg-muted/30 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prontidão da inteligência</span>
            <strong className={`text-4xl ${pctTone(score)}`}>{diagnostic.isLoading ? "—" : `${score}%`}</strong>
            <span className="text-xs text-muted-foreground">{approvedSections} bloco(s) estratégicos aprovados · versão {snapshot.data?.plan.version ?? "—"}</span>
            <Button variant="outline" size="sm" className="mt-1 gap-2" onClick={refresh}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Link de preenchimento</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Envie um link seguro para o cliente completar o mesmo Perfil Mestre sem precisar entrar no sistema.</p><Button variant="outline" size="sm" onClick={generateLink} disabled={busy==="link"}>{busy==="link" ? "Gerando..." : "Gerar e copiar link"}</Button>{publicLink && <button className="flex w-full items-center gap-2 truncate text-left text-xs text-foreground" onClick={()=>navigator.clipboard?.writeText(publicLink)}><Copy className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{publicLink}</span></button>}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-4 w-4" /> Histórico de vendas</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Importe CSV/XLS/XLSX com data, faturamento, vendas, leads e investimento. O sistema usa o histórico nos cenários.</p><input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e)=>{const file=e.target.files?.[0]; if(file) void importHistory(file);}}/><Button variant="outline" size="sm" onClick={()=>fileRef.current?.click()} disabled={busy==="history"}>{busy==="history" ? "Importando..." : "Importar histórico"}</Button></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" /> BI e metas</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Dados reais do CRM e metas oficiais alimentam a leitura; o BI existente continua sendo a fonte analítica.</p><Button variant="outline" size="sm" onClick={() => navigate("/analytics")}>Abrir Analytics</Button></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4" /> Marketing e execução</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Os cenários orientam orçamento; campanha e gasto continuam sujeitos às aprovações e limites existentes.</p><Button variant="outline" size="sm" onClick={() => navigate("/content?tab=planejamento")}>Abrir Planejamento de Mídia</Button></CardContent></Card>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Cenários de crescimento</h2><p className="mt-1 text-sm text-muted-foreground">Projeções condicionadas ao histórico disponível. Confiança atual: <strong>{growth.data?.confidence ?? "—"}</strong>.</p></div>
          <span className="text-xs text-muted-foreground">{growth.data?.source === "imported_sales_history" ? "Histórico importado" : "Negócios ganhos no CRM"}</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {(growth.data?.scenarios ?? []).map((scenario) => (
            <Card key={scenario.id}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{scenario.label}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><p className="text-xs text-muted-foreground">Receita mensal projetada</p><p className="text-2xl font-semibold">{money(scenario.projectedMonthlyRevenue)}</p></div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Vendas" value={scenario.projectedSales.toLocaleString("pt-BR",{maximumFractionDigits:1})} />
                  <Metric label="Leads necessários" value={scenario.leadsNeeded?.toLocaleString("pt-BR") ?? "Sem base"} />
                  <Metric label="Investimento MKT" value={money(scenario.projectedMarketingInvestment)} />
                  <Metric label="CAC projetado" value={money(scenario.projectedCAC)} />
                  <Metric label="ROAS projetado" value={scenario.projectedROAS ? `${scenario.projectedROAS.toFixed(2)}x` : "—"} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Base observada</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Faturamento médio/mês" value={money(growth.data?.baseline.avgMonthlyRevenue)} />
            <Metric label="Ticket médio" value={money(growth.data?.baseline.avgTicket)} />
            <Metric label="Conversão" value={growth.data ? `${growth.data.baseline.conversionPercent.toFixed(2)}%` : "—"} />
            <Metric label="Mídia média/mês" value={money(growth.data?.baseline.avgMonthlyMarketingSpend)} />
            <Metric label="CPL observado" value={money(growth.data?.baseline.cpl)} />
            <Metric label="CAC observado" value={money(growth.data?.baseline.cac)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Rocket className="h-5 w-5" /> Plano de ação recomendado</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(growth.data?.recommendations ?? []).map((item) => (
              <div key={item.title} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{item.title}</p><span className="text-[10px] uppercase text-muted-foreground">{item.priority}</span></div>
                <p className="mt-1 text-sm">{item.action}</p><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => navigate("/trabalho")}>Executar na Central de Trabalho</Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader><CardTitle>PN x execução / metas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(growth.data?.planVsExecution ?? []).length ? growth.data!.planVsExecution.map((goal) => (
              <div key={`${goal.metric_key}-${goal.ends_at}`} className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
                <div><p className="font-medium">{goal.label}</p><p className="text-xs text-muted-foreground">{goal.metric_key} · até {new Date(goal.ends_at).toLocaleDateString("pt-BR")}</p></div>
                <strong>{Number(goal.target_value).toLocaleString("pt-BR")} {goal.unit}</strong>
              </div>
            )) : <p className="text-sm text-muted-foreground">Ainda não há metas oficiais ativas. Cadastre metas no BI para comparar plano x execução.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Valor acompanhado</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Receita rastreada" value={money(growth.data?.valueGenerated.trackedRevenue)} />
            <Metric label="Vendas rastreadas" value={growth.data?.valueGenerated.trackedOrders.toLocaleString("pt-BR") ?? "—"} />
            <Metric label="Mídia rastreada" value={money(growth.data?.valueGenerated.trackedMarketingSpend)} />
            <Metric label="Meses de histórico" value={growth.data?.valueGenerated.trackedMonths.toLocaleString("pt-BR") ?? "—"} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card><CardHeader><CardTitle>Diagnóstico do Perfil Mestre</CardTitle></CardHeader><CardContent>{diagnostic.data?.lacunas?.length ? <div className="space-y-3">{diagnostic.data.lacunas.slice(0,8).map((item,index)=><div key={item.id} className="flex gap-3 rounded-xl border p-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index+1}</div><div><p className="text-sm font-semibold">{item.titulo}</p><p className="mt-1 text-sm text-muted-foreground">{item.acao}</p></div></div>)}</div> : <div className="flex gap-3 rounded-xl border p-4"><CheckCircle2 className="h-5 w-5 text-emerald-700"/><p className="text-sm">Base essencial consistente.</p></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Fonte única</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{["CRM e vendas alimentam histórico real.","Agentes usam contexto aprovado.","Marketing consome público, oferta e restrições.","BI mede execução e metas.","PN, manual e apresentação devem ser derivados desta mesma base."].map(text=><div key={text} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><span>{text}</span></div>)}</CardContent></Card>
      </section>

      <section id="perfil-mestre" className="scroll-mt-6">
        <div className="mb-4"><h2 className="text-xl font-semibold">Perfil Mestre & Plano do Negócio</h2><p className="mt-1 text-sm text-muted-foreground">Única entrada estratégica. Documentos, PN e inteligência ficam consolidados aqui.</p></div>
        <BusinessPlanPanel />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
