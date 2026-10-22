import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target } from "lucide-react";
import { useLocation } from "wouter";
import {
  useListCustomerIntelligence,
  getListCustomerIntelligenceQueryKey,
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

export default function RelatorioDores() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, navigate] = useLocation();

  const { data: ciList = [] } = useListCustomerIntelligence(tenantId, {
    query: { queryKey: getListCustomerIntelligenceQueryKey(tenantId), enabled: !!tenantId },
  });
  const { data: leads = [] } = useListTenantLeads(tenantId, undefined, {
    query: { queryKey: getListTenantLeadsQueryKey(tenantId), enabled: !!tenantId },
  });

  // O relatório usa a mesma base ativa da tela de Leads. Registros de
  // inteligência órfãos, excluídos ou classificados como não-lead não entram.
  const activeLeadIds = new Set(
    leads
      .filter((lead) => !lead.excluidoEm && !lead.naoLeadTipo)
      .map((lead) => lead.id),
  );
  const activeCiList = ciList.filter((ci) => activeLeadIds.has(ci.leadId));

  // Contar dores
  const dorCounts: Record<string, number> = {};
  for (const ci of activeCiList) {
    const reasons = ci.churnReasons;
    if (Array.isArray(reasons)) {
      for (const r of reasons) {
        const reasonText = typeof r === "string" ? r : (r as Record<string, unknown>)?.reason as string ?? "";
        if (reasonText) {
          dorCounts[reasonText] = (dorCounts[reasonText] ?? 0) + 1;
        }
      }
    }
  }

  const sortedDores = Object.entries(dorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const total = sortedDores.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dores Principais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dores mapeadas nos leads ativos via Inteligência de Clientes · {activeCiList.length} lead(s) analisado(s)
        </p>
      </div>

      {/* KPI */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dores Identificadas</CardTitle>
            <div className="p-1.5 rounded-md bg-rose-500/10">
              <Target className="h-4 w-4 text-rose-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sortedDores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ocorrências</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Ranking de Dores</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(200, sortedDores.length * 40)}>
            <BarChart data={sortedDores} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => [`${value} ocorrências`, "Frequência"]} />
              <Bar dataKey="value" fill="#EF4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Detalhamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedDores.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma dor identificada ainda.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {sortedDores.map((d) => (
                  <div key={d.name} className="px-4 py-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/30" onClick={() => navigate("/leads")}>
                    <p className="font-medium text-sm">{d.name}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{d.value}×</p>
                      <p className="text-xs text-muted-foreground">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Dor</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Frequência</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">% do Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedDores.map((d) => (
                      <tr key={d.name} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate("/leads")}>
                        <td className="px-4 py-3 font-medium">{d.name}</td>
                        <td className="px-4 py-3 text-right">{d.value}</td>
                        <td className="px-4 py-3 text-right">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</td>
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
