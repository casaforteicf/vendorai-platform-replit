import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListVarejoFidelidade,
  useUpsertVarejoFidelidade,
  getListVarejoFidelidadeQueryKey,
} from "@workspace/api-client-react";
import type { VarejoFidelidade } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heart, Search, Star, Pencil, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NIVEIS = ["bronze", "prata", "ouro", "diamante"] as const;
const NIVEL_LABELS: Record<string,string> = { bronze:"Bronze", prata:"Prata", ouro:"Ouro", diamante:"Diamante" };
const NIVEL_COLORS: Record<string,string> = {
  bronze:"bg-amber-700/10 text-amber-700",
  prata:"bg-gray-400/10 text-gray-600",
  ouro:"bg-yellow-400/10 text-yellow-700",
  diamante:"bg-cyan-400/10 text-cyan-700",
};
const NIVEL_ICONS: Record<string, React.ReactNode> = {
  bronze: <Star className="h-3.5 w-3.5" />,
  prata: <Star className="h-3.5 w-3.5" />,
  ouro: <Crown className="h-3.5 w-3.5" />,
  diamante: <Crown className="h-3.5 w-3.5" />,
};

function FidelidadeForm({
  initial,
  leadId,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<VarejoFidelidade>;
  leadId: string;
  onSave: (d: Record<string,unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    pontos: String(initial?.pontos ?? 0),
    totalGasto: initial?.totalGasto ?? "0",
    nivel: initial?.nivel ?? "bronze",
    ultimaCompra: initial?.ultimaCompra ?? "",
    observacoes: initial?.observacoes ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...form, pontos: Number(form.pontos) });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Pontos</Label>
          <Input type="number" min="0" value={form.pontos} onChange={(e) => setForm((f) => ({ ...f, pontos: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Total Gasto (R$)</Label>
          <Input type="number" step="0.01" min="0" value={form.totalGasto} onChange={(e) => setForm((f) => ({ ...f, totalGasto: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Nível</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.nivel} onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value as typeof f.nivel }))}>
            {NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABELS[n]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Última Compra</Label>
          <Input type="date" value={form.ultimaCompra} onChange={(e) => setForm((f) => ({ ...f, ultimaCompra: e.target.value }))} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Observações</Label>
          <Input value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

export default function VarejoFidelidadePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();

  const [filters, setFilters] = useState({ nivel: "", search: "" });
  const { data: clientes = [], isLoading } = useListVarejoFidelidade(tenantId, {
    nivel: filters.nivel || undefined,
    search: filters.search || undefined,
  });
  const upsertMut = useUpsertVarejoFidelidade();

  const [editing, setEditing] = useState<VarejoFidelidade | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoFidelidadeQueryKey(tenantId) });
  }

  function handleSave(data: Record<string,unknown>) {
    if (!editing) return;
    upsertMut.mutate({ tenantId, leadId: editing.leadId, data: data as any }, {
      onSuccess: () => { setEditing(null); invalidate(); },
      onError: (error: unknown) => toast({ title: "Não foi possível atualizar a fidelidade", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }),
    });
  }

  const totalPontos = clientes.reduce((s, c) => s + c.pontos, 0);
  const nivelCount = NIVEIS.reduce((acc, n) => ({ ...acc, [n]: clientes.filter((c) => c.nivel === n).length }), {} as Record<string,number>);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Programa de Fidelidade</h1>
        <p className="text-muted-foreground text-sm">Gerencie pontos e níveis dos seus clientes</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {NIVEIS.map((n) => (
          <Card key={n}>
            <CardContent className="p-4">
              <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${NIVEL_COLORS[n]}`}>
                {NIVEL_ICONS[n]}{NIVEL_LABELS[n]}
              </div>
              <p className="text-2xl font-bold">{nivelCount[n] ?? 0}</p>
              <p className="text-xs text-muted-foreground">clientes</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-48" placeholder="Nome ou telefone..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filters.nivel} onChange={(e) => setFilters((f) => ({ ...f, nivel: e.target.value }))}>
          <option value="">Todos os níveis</option>
          {NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABELS[n]}</option>)}
        </select>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Fidelidade — {editing?.leadNome}</DialogTitle></DialogHeader>
          {editing && (
            <FidelidadeForm
              initial={editing}
              leadId={editing.leadId}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
              isPending={upsertMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : clientes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Heart className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum cliente no programa de fidelidade ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Registre compras e adicione clientes pelo CRM (Leads).</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clientes.map((c) => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${NIVEL_COLORS[c.nivel]}`}>
                      {NIVEL_ICONS[c.nivel]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.leadNome ?? "—"}</p>
                      {c.leadTelefone && <p className="text-xs text-muted-foreground">{c.leadTelefone}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-sm">{c.pontos} pts</p>
                      <p className="text-xs text-muted-foreground">R$ {Number(c.totalGasto).toFixed(2)}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${NIVEL_COLORS[c.nivel]}`}>
                      {NIVEL_LABELS[c.nivel]}
                    </span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {c.ultimaCompra && (
                  <p className="text-xs text-muted-foreground mt-1 ml-12">Última compra: {c.ultimaCompra}</p>
                )}
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-2">
            Total de pontos distribuídos: <strong>{totalPontos}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
