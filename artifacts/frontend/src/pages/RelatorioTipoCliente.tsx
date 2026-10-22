import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import { useLocation } from "wouter";
import {
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useListDeals,
  getListDealsQueryKey,
} from "@workspace/api-client-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const PIE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export default function RelatorioTipoCliente() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, navigate] = useLocation();

  const { data: leads = [] } = useListTenantLeads(tenantId, undefined, {
    query: { queryKey: getListTenantLeadsQueryKey(tenantId), enabled: !!tenantId },
  });

  const { data: deals = [] } = useListDeals(tenantId, undefined, {
    query: { queryKey: getListDealsQueryKey(tenantId), enabled: !!tenantId },
  });

  // Tipo de cliente: B2B vs B2C (heuristic: empresa field)
  const tipoCounts = { B2B: 0, B2C: 0 };
  for (const l of leads) {
    if (l.empresa && l.empresa.trim().length > 0) tipoCounts.B2B++;
    else tipoCounts.B2C++;
  }

  const pieData = [
    { name: "B2B", value: tipoCounts.B2B },
    { name: "B2C", value: tipoCounts.B2C },
  ].filter((d) => d.value > 0);

  // Receita por tipo
  const receitaB2B = deals
    .filter((d) => d.etapa === "ganho" && d.valor)
    .filter((d) => {
      const lead = leads.find((l) => l.id === d.leadId);
      return lead?.empresa && lead.empresa.trim().length > 0;
    })
    .reduce((s, d) => s + parseFloat(String(d.valor ?? "0")), 0);

  const receitaB2C = deals
    .filter((d) => d.etapa === "ganho" && d.valor)
    .filter((d) => {
      const lead = leads.find((l) => l.id === d.leadId);
      return !lead?.empresa || lead.empresa.trim().length === 0;
    })
    .reduce((s, d) => s + parseFloat(String(d.valor ?? "0")), 0);

  const barData = [
    { name: "B2B", value: receitaB2B },
    { name: "B2C", value: receitaB2C },
  ];

  // Tabela resumo
  const totalLeads = leads.length;
  const totalDeals = deals.filter((d) => d.etapa === "ganho").length;
  const ticketMedioB2B = tipoCounts.B2B > 0 ? receitaB2B / Math.max(1, deals.filter((d) => d.etapa === "ganho" && leads.find((l) => l.id === d.leadId)?.empresa).length) : 0;
  const ticketMedioB2C = tipoCounts.B2C > 0 ? receitaB2C / Math.max(1, deals.filter((d) => d.etapa === "ganho" && !leads.find((l) => l.id === d.leadId)?.empresa).length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tipo de Cliente</h1>
        <p className="text-sm text-muted-foreground mt-1">Segmentação e receita por perfil</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Leads</CardTitle>
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalLeads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">B2B</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{tipoCounts.B2B}</p>
            <p className="text-xs text-muted-foreground">{totalLeads > 0 ? Math.round((tipoCounts.B2B / totalLeads) * 100) : 0}% dos leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">B2C</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{tipoCounts.B2C}</p>
            <p className="text-xs text-muted-foreground">{totalLeads > 0 ? Math.round((tipoCounts.B2C / totalLeads) * 100) : 0}% dos leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deals Fechados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalDeals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Distribuição por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value} leads`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span>{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Receita por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => [value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Receita"]} />
                <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Resumo por Segmento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {[
              { label: "B2B", leads: tipoCounts.B2B, ticket: ticketMedioB2B, receita: receitaB2B },
              { label: "B2C", leads: tipoCounts.B2C, ticket: ticketMedioB2C, receita: receitaB2C },
            ].map((row) => (
              <div key={row.label} className="px-4 py-3 space-y-1">
                <p className="font-medium text-sm">{row.label}</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">{row.leads}</p>
                    <p>Leads</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground font-mono">{row.ticket.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                    <p>Ticket Médio</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground font-mono">{row.receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                    <p>Receita</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Segmento</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Leads</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Ticket Médio</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">B2B</td>
                  <td className="px-4 py-3 text-right">{tipoCounts.B2B}</td>
                  <td className="px-4 py-3 text-right font-mono">{ticketMedioB2B.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-4 py-3 text-right font-mono">{receitaB2B.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">B2C</td>
                  <td className="px-4 py-3 text-right">{tipoCounts.B2C}</td>
                  <td className="px-4 py-3 text-right font-mono">{ticketMedioB2C.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-4 py-3 text-right font-mono">{receitaB2C.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
