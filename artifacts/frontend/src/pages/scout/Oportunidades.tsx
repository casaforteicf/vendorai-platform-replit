import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, CheckCircle2, Filter, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TIPO_OPTS = [
  { value: "todos",       label: "Todos os tipos" },
  { value: "recompra",    label: "Recompra" },
  { value: "cross_sell",  label: "Cross-sell" },
  { value: "reativacao",  label: "Reativação" },
  { value: "upgrade",     label: "Upgrade" },
  { value: "aniversario", label: "Aniversário" },
];
const STATUS_OPTS = [
  { value: "todos",      label: "Todos os status" },
  { value: "pendente",   label: "Pendente" },
  { value: "enviado",    label: "Enviado" },
  { value: "respondeu",  label: "Respondeu" },
  { value: "converteu",  label: "Convertido" },
  { value: "ignorado",   label: "Ignorado" },
];
const TIPO_BADGE: Record<string, string> = {
  recompra:    "bg-blue-50 text-blue-700 border-blue-200",
  cross_sell:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  reativacao:  "bg-amber-50 text-amber-700 border-amber-200",
  upgrade:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  aniversario: "bg-pink-50 text-pink-700 border-pink-200",
};
const TIPO_LABELS: Record<string, string> = {
  recompra:    "Recompra",
  cross_sell:  "Cross-sell",
  reativacao:  "Reativação",
  upgrade:     "Upgrade",
  aniversario: "Aniversário",
};
const STATUS_BADGE: Record<string, string> = {
  pendente:  "bg-slate-100 text-slate-600 border-slate-200",
  enviado:   "bg-blue-100 text-blue-700 border-blue-200",
  respondeu: "bg-amber-100 text-amber-700 border-amber-200",
  converteu: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ignorado:  "bg-red-100 text-red-600 border-red-200",
};
const STATUS_LABELS: Record<string, string> = {
  pendente:  "Pendente",
  enviado:   "Enviado",
  respondeu: "Respondeu",
  converteu: "Convertido",
  ignorado:  "Ignorado",
};

export default function Oportunidades() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tipoFiltro, setTipoFiltro]     = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("todos");

  const qs = new URLSearchParams();
  if (tipoFiltro !== "todos")   qs.set("tipo",   tipoFiltro);
  if (statusFiltro !== "todos") qs.set("status", statusFiltro);

  const QK = ["scout-oportunidades", tenantId, tipoFiltro, statusFiltro];

  const { data: oportunidades = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/scout/oportunidades?${qs}`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const converter = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/converter`, {
        method: "POST", headers: authHeaders(),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scout-oportunidades", tenantId] });
      qc.invalidateQueries({ queryKey: ["scout-dashboard", tenantId] });
      toast({ title: "Oportunidade marcada como convertida!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const ops = Array.isArray(oportunidades) ? oportunidades : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Oportunidades
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ops.length} oportunidade(s) encontrada(s)
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPO_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFiltro} onValueChange={setStatusFiltro}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(tipoFiltro !== "todos" || statusFiltro !== "todos") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setTipoFiltro("todos"); setStatusFiltro("todos"); }}>
            Limpar
          </Button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Cliente</th>
              <th className="px-4 py-3 text-left font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold">Descrição</th>
              <th className="px-4 py-3 text-right font-semibold">Valor Est.</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Enviado em</th>
              <th className="px-4 py-3 text-center font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : ops.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma oportunidade encontrada.</p>
                  {(tipoFiltro !== "todos" || statusFiltro !== "todos") && (
                    <p className="text-xs mt-1">Tente remover os filtros.</p>
                  )}
                </td>
              </tr>
            ) : (
              ops.map((o: any) => (
                <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                  {/* Cliente */}
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="font-medium truncate">
                      {o.clienteNome ?? o.clienteId?.slice(0, 8) ?? "—"}
                    </p>
                  </td>
                  {/* Tipo */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant="outline" className={`text-xs ${TIPO_BADGE[o.tipo] ?? ""}`}>
                      {TIPO_LABELS[o.tipo] ?? o.tipo ?? "—"}
                    </Badge>
                  </td>
                  {/* Descrição */}
                  <td className="px-4 py-3 max-w-[240px]">
                    <p className="text-sm text-muted-foreground truncate">{o.descricao ?? "—"}</p>
                  </td>
                  {/* Valor estimado */}
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                    {o.valorEstimado ? fmt(Number(o.valorEstimado)) : "—"}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant="outline" className={`text-xs ${STATUS_BADGE[o.status] ?? ""}`}>
                      {STATUS_LABELS[o.status] ?? o.status ?? "—"}
                    </Badge>
                  </td>
                  {/* Enviado em */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {o.enviadoEm
                      ? format(new Date(o.enviadoEm), "dd/MM/yy HH:mm", { locale: ptBR })
                      : "—"
                    }
                  </td>
                  {/* Ações */}
                  <td className="px-4 py-3 text-center">
                    {o.status === "enviado" ? (
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        disabled={converter.isPending}
                        onClick={() => converter.mutate(o.id)}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Convertido
                      </Button>
                    ) : o.status === "converteu" ? (
                      <span className="text-xs text-emerald-600 flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Convertido
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
