import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, TrendingUp, DollarSign, Hash, Target } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useListDeals,
  getListDealsQueryKey,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function RelatorioGanhosMes() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, navigate] = useLocation();

  const hoje = new Date();
  const mesAtual = format(hoje, "MMMM yyyy", { locale: ptBR });
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  const { data: deals = [] } = useListDeals(tenantId, undefined, {
    query: { queryKey: getListDealsQueryKey(tenantId), enabled: !!tenantId },
  });

  const { data: leads = [] } = useListTenantLeads(tenantId, undefined, {
    query: { queryKey: getListTenantLeadsQueryKey(tenantId), enabled: !!tenantId },
  });
  const leadMap = new Map(leads.map((l) => [l.id, l.nome]));

  const ganhos = deals.filter((d) => d.etapa === "ganho" && d.valor);
  const ganhosMes = ganhos.filter((d) => {
    const updated = d.updatedAt ? new Date(d.updatedAt) : null;
    return updated && updated >= primeiroDia && updated <= ultimoDia;
  });

  const totalGanho = ganhosMes.reduce((s, d) => s + parseFloat(String(d.valor ?? "0")), 0);
  const qtdDeals = ganhosMes.length;
  const ticketMedio = qtdDeals > 0 ? totalGanho / qtdDeals : 0;
  const dealsMovimentadosMes = deals.filter((d) => {
    const updated = d.updatedAt ? new Date(d.updatedAt) : null;
    return updated && updated >= primeiroDia && updated <= ultimoDia;
  });
  const taxaGanho = dealsMovimentadosMes.length > 0 ? (qtdDeals / dealsMovimentadosMes.length) * 100 : 0;

  // Semanas do mes
  const semanas: Record<string, number> = {};
  for (let i = 0; i < 5; i++) semanas[`Semana ${i + 1}`] = 0;
  for (const d of ganhosMes) {
    const date = d.updatedAt ? new Date(d.updatedAt) : new Date();
    const semana = Math.min(4, Math.floor((date.getDate() - 1) / 7));
    semanas[`Semana ${semana + 1}`] += parseFloat(String(d.valor ?? "0"));
  }
  const chartData = Object.entries(semanas).map(([name, value]) => ({ name, value }));

  function exportCSV() {
    const rows = ganhosMes.map((d) => ({
      Lead: leadMap.get(d.leadId ?? "") ?? "—",
      Valor: d.valor ?? "—",
      Data: d.updatedAt ? format(new Date(d.updatedAt), "dd/MM/yyyy") : "—",
      Etapa: d.etapa,
    }));
    const csv = [
      "Lead,Valor,Data,Etapa",
      ...rows.map((r) => `"${r.Lead}","${r.Valor}","${r.Data}","${r.Etapa}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ganhos-${format(hoje, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ganhos — {mesAtual}</h1>
        <p className="text-sm text-muted-foreground mt-1">Negócios fechados no mês atual</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Ganho</CardTitle>
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalGanho.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deals Fechados</CardTitle>
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Hash className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{qtdDeals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ticket Médio</CardTitle>
            <div className="p-1.5 rounded-md bg-violet-500/10">
              <TrendingUp className="h-4 w-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Taxa de ganho</CardTitle>
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Target className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{dealsMovimentadosMes.length > 0 ? `${taxaGanho.toFixed(1)}%` : "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">ganhos ÷ negócios movimentados no mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Ganhos por Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => [value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Valor"]} />
              <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Detalhamento</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {ganhosMes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum negócio fechado este mês.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {ganhosMes.map((d) => (
                  <div key={d.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{leadMap.get(d.leadId ?? "") ?? "—"}</p>
                      <p className="font-mono text-sm font-medium shrink-0">
                        {parseFloat(String(d.valor ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{d.updatedAt ? format(new Date(d.updatedAt), "dd/MM/yyyy") : "—"}</p>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">Ganho</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Lead</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Valor</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Data Fechamento</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Etapa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ganhosMes.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{leadMap.get(d.leadId ?? "") ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {parseFloat(String(d.valor ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.updatedAt ? format(new Date(d.updatedAt), "dd/MM/yyyy") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                            Ganho
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
