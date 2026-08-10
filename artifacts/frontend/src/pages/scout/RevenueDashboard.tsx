import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, Send, CheckCircle2, Percent, DollarSign, Plus, ArrowRight, ArrowUpRight, Play, Loader2,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TIPO_LABELS: Record<string, string> = {
  recompra:    "Recompra",
  cross_sell:  "Cross-sell",
  reativacao:  "Reativação",
  upgrade:     "Upgrade",
  aniversario: "Aniversário",
  follow_up: "Follow-up",
  renovacao: "Renovação",
  manutencao: "Manutenção",
  sequencia_produto: "Próxima etapa",
};
const TIPO_COLORS: Record<string, string> = {
  recompra:    "#3b82f6",
  cross_sell:  "#6366f1",
  reativacao:  "#f59e0b",
  upgrade:     "#22c55e",
  aniversario: "#ec4899",
  follow_up: "#06b6d4",
  renovacao: "#8b5cf6",
  manutencao: "#14b8a6",
  sequencia_produto: "#0ea5e9",
};
const STATUS_COLORS: Record<string, string> = {
  pendente:  "bg-slate-100 text-slate-600 border-slate-200",
  enviado:   "bg-blue-100 text-blue-700 border-blue-200",
  respondeu: "bg-amber-100 text-amber-700 border-amber-200",
  converteu: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ignorado:  "bg-red-100 text-red-600 border-red-200",
  pendente_aprovacao: "bg-violet-100 text-violet-700 border-violet-200",
  aprovado: "bg-cyan-100 text-cyan-700 border-cyan-200",
  adiado: "bg-orange-100 text-orange-700 border-orange-200",
};
const STATUS_LABELS: Record<string, string> = {
  pendente:  "Pendente",
  enviado:   "Enviado",
  respondeu: "Respondeu",
  converteu: "Convertido",
  ignorado:  "Ignorado",
  pendente_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  adiado: "Adiado",
};

export default function RevenueDashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const runScout = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/scout/run`, {
        method: "POST",
        headers: authHeaders(),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Erro ao rodar o scout");
        return data as { clientesAnalisados: number; oportunidadesGeradas: number };
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["scout-dashboard", tenantId] });
      qc.invalidateQueries({ queryKey: ["scout-oportunidades", tenantId] });
      toast({
        title: "Scout concluído!",
        description: `${data.clientesAnalisados} leads analisados · ${data.oportunidadesGeradas} nova(s) oportunidade(s) gerada(s).`,
      });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const { data: dash, isLoading: loadingDash } = useQuery<any>({
    queryKey: ["scout-dashboard", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/scout/dashboard`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: oportunidades = [], isLoading: loadingOps } = useQuery<any[]>({
    queryKey: ["scout-oportunidades", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/scout/oportunidades`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const ops = Array.isArray(oportunidades) ? oportunidades : [];

  // Bar chart: group por tipo nos últimos 30 dias
  const cutoff = subDays(new Date(), 30);
  const recent30 = ops.filter((o) => {
    try { return new Date(o.createdAt) >= cutoff; } catch { return false; }
  });
  const tipoCount: Record<string, number> = {};
  for (const tipo of Object.keys(TIPO_LABELS)) tipoCount[tipo] = 0;
  for (const o of recent30) { if (o.tipo && tipoCount[o.tipo] !== undefined) tipoCount[o.tipo]++; }
  const chartData = Object.entries(tipoCount)
    .map(([tipo, count]) => ({ tipo: TIPO_LABELS[tipo] ?? tipo, count, key: tipo }))
    .filter((d) => d.count > 0 || true);

  // 10 mais recentes
  const top10 = [...ops].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 10);

  const kpis = [
    {
      label: "Oportunidades",
      value: dash?.totalOportunidades ?? 0,
      icon: TrendingUp,
      color: "text-blue-500",
    },
    {
      label: "Enviadas",
      value: dash?.enviadas ?? 0,
      icon: Send,
      color: "text-indigo-500",
    },
    {
      label: "Convertidas",
      value: dash?.convertidas ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-500",
    },
    {
      label: "Taxa de Conversão",
      value: `${dash?.taxaConversao ?? 0}%`,
      icon: Percent,
      color: "text-amber-500",
    },
    {
      label: "Receita Gerada",
      value: fmt(dash?.receitaGerada ?? 0),
      icon: DollarSign,
      color: "text-violet-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Revenue Scout
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inteligência de retenção e expansão de receita
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Link href="/scout/regras">
            <Button variant="outline" size="sm">Gerenciar Regras</Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            disabled={runScout.isPending}
            onClick={() => runScout.mutate()}
          >
            {runScout.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Analisando...</>
              : <><Play className="h-3.5 w-3.5 mr-1" /> Rodar Scout</>
            }
          </Button>
          <Link href="/scout/oportunidades">
            <Button size="sm">Ver Oportunidades <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
          </Link>
          <Link href="/scout/pipeline">
            <Button size="sm" variant="secondary">Pipeline Scout <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
          </Link>
        </div>
      </div>

      {dash?.verticalProfile && (
        <Card className="p-4 border-emerald-200 bg-emerald-50/40">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-700 hover:bg-emerald-700">{dash.verticalProfile.label}</Badge>
                <span className="text-xs text-muted-foreground">Scout especializado por vertical</span>
              </div>
              <p className="font-semibold mt-2">Foco: {dash.verticalProfile.focus}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ciclo sugerido: {dash.verticalProfile.cycleDays} dias · Reativação: {dash.verticalProfile.dormantDays} dias · contato somente após aprovação humana
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-xl">
              {dash.verticalProfile.signals.map((signal: string) => (
                <Badge key={signal} variant="outline" className="bg-white">{signal}</Badge>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
                {loadingDash
                  ? <Skeleton className="h-7 w-20 mt-1" />
                  : <p className="text-xl font-bold mt-1">{k.value}</p>
                }
              </div>
              <k.icon className={`h-5 w-5 shrink-0 mt-0.5 ${k.color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* Bar chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-sm">Oportunidades por Tipo</p>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
          </div>
        </div>
        {loadingOps ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: any) => [v, "Oportunidades"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.key} fill={TIPO_COLORS[d.key] ?? "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Últimas 10 */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <p className="font-semibold text-sm">Oportunidades Recentes</p>
          <Link href="/scout/oportunidades">
            <Button variant="ghost" size="sm">Ver todas →</Button>
          </Link>
        </div>
        {loadingOps ? (
          <div className="p-5 space-y-2">
            {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : top10.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma oportunidade ainda.</p>
            <p className="text-xs mt-1">Configure regras para o scout identificar oportunidades.</p>
          </div>
        ) : (
          <div className="divide-y">
            {top10.map((o: any) => (
              <div key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {o.clienteId ? (
                      <Link
                        href={`/leads/${o.clienteId}`}
                        className="group/client inline-flex min-w-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
                        aria-label={`Abrir cliente ${o.clienteNome ?? o.clienteId}`}
                      >
                        <span className="truncate">
                          {o.clienteNome ?? o.clienteId.slice(0, 8)}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover/client:opacity-100" />
                      </Link>
                    ) : (
                      <p className="text-sm font-medium truncate">—</p>
                    )}
                    <Badge variant="outline"
                      className={`text-[10px] shrink-0 ${
                        o.tipo === "recompra"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                        o.tipo === "cross_sell"  ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                        o.tipo === "reativacao"  ? "bg-amber-50 text-amber-700 border-amber-200" :
                        o.tipo === "upgrade"     ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        "bg-pink-50 text-pink-700 border-pink-200"
                      }`}>
                      {TIPO_LABELS[o.tipo] ?? o.tipo}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{o.descricao ?? "—"}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  {o.valorEstimado && (
                    <p className="text-sm font-medium">{fmt(Number(o.valorEstimado))}</p>
                  )}
                  <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[o.status] ?? ""}`}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
