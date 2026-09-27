import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListObras,
  useCreateObra,
  getListObrasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  HardHat,
  Plus,
  Calendar,
  MapPin,
  DollarSign,
  ChevronRight,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planejamento:  { label: "Planejamento",  color: "bg-slate-100 text-slate-700" },
  em_andamento:  { label: "Em andamento",  color: "bg-blue-100 text-blue-700" },
  pausada:       { label: "Pausada",       color: "bg-amber-100 text-amber-700" },
  concluida:     { label: "Concluída",     color: "bg-emerald-100 text-emerald-700" },
  cancelada:     { label: "Cancelada",     color: "bg-red-100 text-red-700" },
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
}

function fmtBRL(v?: string | null) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function NovaObraDialog({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    clienteNome: "",
    endereco: "",
    dataInicio: "",
    dataFimPrevista: "",
    orcamentoTotal: "",
    descricao: "",
  });

  const { mutateAsync, isPending } = useCreateObra();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    try {
      await mutateAsync({ tenantId, data: payload as any });
      await qc.invalidateQueries({ queryKey: getListObrasQueryKey(tenantId) });
      setOpen(false);
      setForm({ nome: "", clienteNome: "", endereco: "", dataInicio: "", dataFimPrevista: "", orcamentoTotal: "", descricao: "" });
      toast({ title: "Obra criada com sucesso." });
    } catch (error) {
      toast({ title: "Não foi possível criar a obra", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Nova obra
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova obra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da obra *</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nome do cliente</Label>
              <Input value={form.clienteNome} onChange={(e) => setForm((f) => ({ ...f, clienteNome: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Orçamento total (R$)</Label>
              <Input type="number" step="0.01" value={form.orcamentoTotal} onChange={(e) => setForm((f) => ({ ...f, orcamentoTotal: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input value={form.endereco} onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data de início</Label>
              <Input type="date" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Previsão de término</Label>
              <Input type="date" value={form.dataFimPrevista} onChange={(e) => setForm((f) => ({ ...f, dataFimPrevista: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Criar obra"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Obras() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: obras = [], isLoading } = useListObras(tenantId, {
    ...(filterStatus !== "all" ? { status: filterStatus } : {}),
  }, {
    query: { enabled: !!tenantId, queryKey: getListObrasQueryKey(tenantId) },
  });

  const filtered = filterStatus === "all" ? obras : obras.filter((o) => o.status === filterStatus);

  const totalOrcamento = obras.reduce((s, o) => s + parseFloat(o.orcamentoTotal ?? "0"), 0);
  const totalGasto = obras.reduce((s, o) => s + parseFloat(o.custoRealizado ?? "0"), 0);
  const emAndamento = obras.filter((o) => o.status === "em_andamento").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardHat className="h-6 w-6 text-amber-500" />
            Obras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de projetos de construção civil</p>
        </div>
        <NovaObraDialog tenantId={tenantId} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total de obras", value: obras.length, icon: Building2, color: "text-blue-500" },
          { label: "Em andamento", value: emAndamento, icon: HardHat, color: "text-amber-500" },
          { label: "Orçado (total)", value: fmtBRL(String(totalOrcamento)), icon: DollarSign, color: "text-emerald-500" },
          { label: "Gasto (total)", value: fmtBRL(String(totalGasto)), icon: DollarSign, color: "text-rose-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                {kpi.label}
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Status:</span>
        <div className="flex flex-wrap gap-2">
          {[{ value: "all", label: "Todos" }, ...Object.entries(STATUS_MAP).map(([value, { label }]) => ({ value, label }))].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterStatus === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Obras list */}
      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <HardHat className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhuma obra encontrada</p>
          <p className="text-sm">Clique em "Nova obra" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((obra) => {
            const statusInfo = STATUS_MAP[obra.status] ?? { label: obra.status, color: "bg-muted text-muted-foreground" };
            const pct = obra.orcamentoTotal ? Math.min(100, (parseFloat(obra.custoRealizado) / parseFloat(obra.orcamentoTotal)) * 100) : null;
            return (
              <Link key={obra.id} href={`/obras/${obra.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{obra.nome}</CardTitle>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    {obra.clienteNome && (
                      <p className="text-xs text-muted-foreground">{obra.clienteNome}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {obra.endereco && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{obra.endereco}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="flex flex-wrap gap-x-1">
                        <span>{fmt(obra.dataInicio)}</span>
                        <span>→</span>
                        <span>{fmt(obra.dataFimPrevista)}</span>
                      </span>
                    </div>
                    {obra.orcamentoTotal && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Orçado</span>
                          <span className="font-medium">{fmtBRL(obra.orcamentoTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Gasto</span>
                          <span className={parseFloat(obra.custoRealizado) > parseFloat(obra.orcamentoTotal) ? "text-red-600 font-semibold" : "font-medium"}>
                            {fmtBRL(obra.custoRealizado)}
                          </span>
                        </div>
                        {pct !== null && (
                          <Progress value={pct} className={`h-1.5 ${pct > 100 ? "[&>div]:bg-red-500" : pct > 80 ? "[&>div]:bg-amber-400" : ""}`} />
                        )}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
