import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import {
  usePartnerCommissions,
  usePartnerCommissionsSummary,
} from "@/lib/partnerApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";

function formatBRL(v: string | null | undefined) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_BADGE: Record<string, string> = {
  pendente:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  aprovada:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  paga:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelada: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "pendente", label: "Pendente" },
  { value: "aprovada", label: "Aprovada" },
  { value: "paga", label: "Paga" },
  { value: "cancelada", label: "Cancelada" },
];

function downloadCsv(data: any[], mes: string, status: string) {
  const headers = ["ID", "Tenant ID", "Tipo", "Valor Base", "%", "Comissão (R$)", "Mês Ref.", "Status"];
  const rows = data.map((c) => [
    c.id,
    c.tenantId,
    c.tipo ?? "",
    c.valorBase ?? "",
    c.percentual ?? "",
    c.valor ?? "",
    c.dataReferencia ?? "",
    c.status,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const suffix = [mes !== "" ? mes : "", status !== "all" ? status : ""]
    .filter(Boolean)
    .join("_");
  a.download = `comissoes${suffix ? `_${suffix}` : ""}.csv`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PartnerCommissions() {
  const { user } = useAuth();
  const partnerId = (user as any)?.partnerId as string | undefined;

  const [mes, setMes] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filters = useMemo(
    () => ({
      mes: mes || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }),
    [mes, statusFilter]
  );

  const { data: commissions, isLoading, isError } = usePartnerCommissions(
    partnerId,
    filters
  );
  const { data: summary, isLoading: summaryLoading } =
    usePartnerCommissionsSummary();

  const totalPago = useMemo(() => {
    const row = (summary ?? []).find((r) => r.status === "paga");
    return row ? Number(row.total) : 0;
  }, [summary]);

  const totalPendente = useMemo(() => {
    const row = (summary ?? []).find((r) => r.status === "pendente");
    return row ? Number(row.total) : 0;
  }, [summary]);

  return (
    <PartnerLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Comissões</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Histórico e status das suas comissões
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!commissions || commissions.length === 0}
            onClick={() => downloadCsv(commissions ?? [], mes, statusFilter)}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p className="text-3xl font-bold text-emerald-600">
                  {totalPago.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendente de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p className="text-3xl font-bold text-amber-600">
                  {totalPendente.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="mes" className="text-xs">Mês</Label>
            <Input
              id="mes"
              type="month"
              className="w-40"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(mes || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setMes(""); setStatusFilter("all"); }}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Tabela */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente (Tenant)</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor Base</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Mês Ref.</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-destructive py-8">
                    Erro ao carregar comissões.
                  </TableCell>
                </TableRow>
              ) : !commissions || commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma comissão encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.tenantId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="capitalize">{c.tipo ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatBRL(c.valorBase)}</TableCell>
                    <TableCell className="text-right">
                      {c.percentual ? `${c.percentual}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {formatBRL(c.valor)}
                    </TableCell>
                    <TableCell>{c.dataReferencia ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={`${STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground"} border-0 font-medium`}
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && !isError && commissions && (
          <p className="text-xs text-muted-foreground">
            {commissions.length} registro(s)
          </p>
        )}
      </div>
    </PartnerLayout>
  );
}
