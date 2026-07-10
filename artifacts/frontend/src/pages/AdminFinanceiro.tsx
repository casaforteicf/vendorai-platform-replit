import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  RefreshCw, Loader2, TrendingUp, DollarSign, AlertTriangle,
  Users, BarChart3, Activity,
} from "lucide-react";

interface PlanBreakdown {
  planId: string;
  planNome: string;
  count: number;
  mrr: number;
}

interface InadimplenteTenant {
  id: string;
  name: string;
  mrr: number;
  planNome: string | null;
  suspendedReason: string | null;
  planStartedAt: string | null;
  custoIaMes: number;
}

interface MargemTenant {
  id: string;
  name: string;
  mrr: number;
  custoIaMes: number;
  margemMes: number;
  margemPercent: number | null;
  planNome: string | null;
}

interface FinancialSummary {
  geradoEm: string;
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
    tenants: InadimplenteTenant[];
  };
  ia: {
    custoTotalMes: number;
    margemTotalMes: number;
    rankingMargem: MargemTenant[];
  };
}

function fmt(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtUsd(val: number): string {
  return `$ ${val.toFixed(4)} USD`;
}

function fmtPct(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(1)}%`;
}

export default function AdminFinanceiro() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/financial-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch {
      toast({ title: "Erro ao carregar painel financeiro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold">Painel Financeiro da Plataforma</h1>
            <p className="text-sm text-muted-foreground">
              {data
                ? `Atualizado em ${new Date(data.geradoEm).toLocaleString("pt-BR")}`
                : "Saúde financeira do SaaS — visão super_admin"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Calculando métricas financeiras...</span>
        </div>
      ) : data ? (
        <>
          {/* ─── Bloco 1: MRR / ARR ─────────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              MRR / ARR
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-emerald-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">MRR</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{fmt(data.mrr.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">mensal recorrente</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">ARR</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{fmt(data.mrr.arr)}</p>
                  <p className="text-xs text-muted-foreground mt-1">= MRR × 12</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground">Tenants Ativos</span>
                  </div>
                  <p className="text-2xl font-bold">{data.mrr.tenantsAtivos}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.mrr.tenantsDemo} demo · {data.mrr.tenantsSemPlano} sem plano
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-violet-500" />
                    <span className="text-xs text-muted-foreground">Margem IA (mês)</span>
                  </div>
                  <p className={`text-2xl font-bold ${data.ia.margemTotalMes >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmt(data.ia.margemTotalMes)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    custo IA: {fmtUsd(data.ia.custoTotalMes)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ─── Bloco 2: Receita por plano ─────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Receita por Plano
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.planBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">Nenhum plano com tenants ativos.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Tenants</TableHead>
                        <TableHead className="text-right">MRR</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.planBreakdown.map((p) => (
                        <TableRow key={p.planId}>
                          <TableCell className="font-medium">{p.planNome}</TableCell>
                          <TableCell className="text-right">{p.count}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(p.mrr)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {data.mrr.total > 0
                              ? `${((p.mrr / data.mrr.total) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{data.mrr.tenantsAtivos}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(data.mrr.total)}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* ─── Bloco 3: Inadimplência ──────────────────────────────────── */}
            <Card className={data.inadimplencia.total > 0 ? "border-orange-200" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${data.inadimplencia.total > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
                  Inadimplência / Suspensos
                  {data.inadimplencia.total > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {data.inadimplencia.total}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.inadimplencia.total === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhum tenant suspenso — tudo em dia!
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border-b">
                      <p className="text-xs text-orange-700 dark:text-orange-400">
                        MRR em risco: <strong>{fmt(data.inadimplencia.mrrEmRisco)}</strong>
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tenant</TableHead>
                          <TableHead className="text-right">MRR</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.inadimplencia.tenants.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{t.name}</p>
                                {t.planNome && (
                                  <p className="text-xs text-muted-foreground">{t.planNome}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {t.mrr > 0 ? fmt(t.mrr) : "—"}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-orange-600 bg-orange-100 dark:bg-orange-950/40 px-2 py-0.5 rounded">
                                {t.suspendedReason ?? "Suspenso"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Bloco 4: Ranking de margem por tenant (IA vs Receita) ─────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-violet-500" />
                Custo IA vs Receita — Ranking por Margem
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (piores primeiro — risco de prejuízo)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.ia.rankingMargem.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">Nenhum tenant ativo com dados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead className="text-right">Custo IA (mês)</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                      <TableHead className="text-right">% Margem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ia.rankingMargem.map((t, i) => {
                      const isNeg = t.margemMes < 0;
                      const isLow = t.margemPercent !== null && t.margemPercent < 30 && t.margemPercent >= 0;
                      return (
                        <TableRow key={t.id} className={isNeg ? "bg-red-50 dark:bg-red-950/10" : ""}>
                          <TableCell className="text-muted-foreground text-sm w-8">{i + 1}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{t.name}</p>
                              {t.planNome && (
                                <p className="text-xs text-muted-foreground">{t.planNome}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {t.mrr > 0 ? fmt(t.mrr) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-orange-600">
                            {t.custoIaMes > 0 ? fmtUsd(t.custoIaMes) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span className={isNeg ? "text-red-600 font-semibold" : isLow ? "text-orange-500" : "text-emerald-600"}>
                              {t.mrr > 0 ? fmt(t.margemMes) : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {t.mrr > 0 ? (
                              <Badge
                                variant="secondary"
                                className={
                                  isNeg
                                    ? "bg-red-100 text-red-700"
                                    : isLow
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }
                              >
                                {fmtPct(t.margemPercent)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">sem plano</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
