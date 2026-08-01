import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Coins, TrendingUp, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

type CommissionStatus = "pendente" | "aprovado" | "pago" | "cancelado";

interface Commission {
  id: string;
  sellerUserId: string;
  sellerName: string | null;
  sellerEmail: string | null;
  clienteTenantId: string | null;
  dealId: string | null;
  planSlug: string | null;
  clienteNome: string | null;
  valorImplantacaoCents: number;
  percentual: number | string;
  valorComissaoCents: number;
  detalhes: Array<{
    produtoId: string | null;
    sku: string | null;
    nome: string;
    quantidade: number;
    valorUnitarioCents: number;
    valorBaseCents: number;
    percentual: number;
    valorComissaoCents: number;
    promocional: boolean;
  }>;
  status: CommissionStatus;
  observacoes: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Summary {
  totalPendente: number;
  totalAprovado: number;
  totalPago: number;
  totalGeral: number;
  count: number;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<CommissionStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_VARIANTS: Record<CommissionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "secondary",
  aprovado: "default",
  pago: "default",
  cancelado: "destructive",
};

function StatusBadge({ status }: { status: CommissionStatus }) {
  const colors: Record<CommissionStatus, string> = {
    pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
    aprovado: "bg-blue-100 text-blue-800 border-blue-200",
    pago: "bg-green-100 text-green-800 border-green-200",
    cancelado: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function ComissoesVendedor({ embedded = false }: { embedded?: boolean }) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<CommissionStatus>("pendente");
  const [editObs, setEditObs] = useState("");

  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin" || user?.userFunction === "administrador";
  const tenantId = user?.tenantId;

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: commissions = [], isLoading } = useQuery<Commission[]>({
    queryKey: ["seller-commissions", tenantId],
    enabled: !!tenantId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/seller-commissions`, { headers });
      if (!r.ok) throw new Error("Erro ao carregar comissões");
      return r.json();
    },
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["seller-commissions-summary", tenantId],
    enabled: !!tenantId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/seller-commissions/summary`, { headers });
      if (!r.ok) throw new Error("Erro ao carregar resumo");
      return r.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, observacoes }: { id: string; status: CommissionStatus; observacoes: string }) => {
      const r = await fetch(`/api/tenants/${tenantId}/seller-commissions/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status, observacoes }),
      });
      if (!r.ok) throw new Error("Erro ao atualizar comissão");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-commissions", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["seller-commissions-summary", tenantId] });
      setEditingId(null);
    },
  });

  function openEdit(c: Commission) {
    setEditingId(c.id);
    setEditStatus(c.status);
    setEditObs(c.observacoes ?? "");
  }

  const cards = [
    {
      label: "Total Pendente",
      value: formatCurrency(summary?.totalPendente ?? 0),
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50 border-yellow-100",
    },
    {
      label: "Total Aprovado",
      value: formatCurrency(summary?.totalAprovado ?? 0),
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-100",
    },
    {
      label: "Total Pago",
      value: formatCurrency(summary?.totalPago ?? 0),
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 border-green-100",
    },
    {
      label: "Total Geral",
      value: formatCurrency(summary?.totalGeral ?? 0),
      icon: Coins,
      color: "text-purple-600",
      bg: "bg-purple-50 border-purple-100",
    },
  ];

  const content = (
      <div className={embedded ? "space-y-6" : "p-6 max-w-6xl mx-auto space-y-6"}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Coins className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isAdmin ? "Comissões de Vendedores" : "Minhas Comissões"}
            </h1>
            <p className="text-sm text-gray-500">
              Regras definidas por produto ou linha para os vendedores deste tenant
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {commissions.length} comissão{commissions.length !== 1 ? "ões" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : commissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <Coins className="h-10 w-10" />
              <p className="text-sm">Nenhuma comissão registrada ainda.</p>
              <p className="text-xs text-gray-300">Comissões são geradas automaticamente quando um deal é ganho.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  {isAdmin && <TableHead className="text-xs">Vendedor</TableHead>}
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Produtos / linha</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs text-right">Base vendida</TableHead>
                  <TableHead className="text-xs text-right">Comissão</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  {isAdmin && <TableHead className="text-xs"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((c) => (
                  <TableRow key={c.id} className="hover:bg-gray-50">
                    {isAdmin && (
                      <TableCell className="text-sm">
                        <div>
                          <p className="font-medium">{c.sellerName ?? "—"}</p>
                          <p className="text-xs text-gray-400">{c.sellerEmail ?? ""}</p>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-sm font-medium">
                      {c.clienteNome ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[260px]">
                      {c.detalhes?.length ? c.detalhes.map((item) => (
                        <div key={`${item.produtoId ?? item.sku ?? item.nome}-${item.percentual}`} className="flex flex-wrap items-center gap-x-1">
                          <span>{item.quantidade}× {item.nome}</span>
                          <span className="text-xs text-gray-400">({Number(item.percentual).toLocaleString("pt-BR")}%{item.promocional ? ", promoção" : ""})</span>
                        </div>
                      )) : (c.planSlug ?? "—")}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {formatCurrency(c.valorImplantacaoCents)}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono font-semibold text-green-700">
                      {formatCurrency(c.valorComissaoCents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                      {c.paidAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(c.paidAt)}
                        </p>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => openEdit(c)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
  );

  const dialog = (
    <>
      {/* Admin edit dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as CommissionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Observações</label>
              <textarea
                className="w-full text-sm border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={3}
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
                placeholder="Notas sobre o pagamento..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={updateMutation.isPending}
                onClick={() => {
                  if (editingId) {
                    updateMutation.mutate({ id: editingId, status: editStatus, observacoes: editObs });
                  }
                }}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return <>{content}{dialog}</>;
  return <SidebarLayout>{content}{dialog}</SidebarLayout>;
}
