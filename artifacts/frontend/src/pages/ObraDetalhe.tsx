import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetObra,
  useUpdateObra,
  useListObraEtapas,
  useCreateObraEtapa,
  useUpdateObraEtapa,
  useDeleteObraEtapa,
  useListObraEtapaMedicoes,
  useCreateObraEtapaMedicao,
  getListObraEtapaMedicoesQueryKey,
  useListObraDiario,
  useCreateObraDiario,
  useUpdateObraDiario,
  useDeleteObraDiario,
  useGetObraEstoque,
  useListObraCompras,
  useCreateObraCompra,
  useUpdateCompraObra,
  getGetObraQueryKey,
  getListObraEtapasQueryKey,
  getListObraDiarioQueryKey,
  getGetObraEstoqueQueryKey,
  getListObraComprasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  HardHat, ArrowLeft, Plus, Calendar, DollarSign,
  ClipboardList, Package, ShoppingCart, BarChart3,
  CheckCircle2, Clock, PauseCircle, Pencil, Trash2,
  ChevronDown, ChevronUp, BookOpen, User, Building2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ObraEtapa, ObraDiario, CompraObra } from "@workspace/api-client-react";

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  planejamento:  { label: "Planejamento",  color: "bg-slate-100 text-slate-700", icon: Clock },
  em_andamento:  { label: "Em andamento",  color: "bg-blue-100 text-blue-700",   icon: HardHat },
  pausada:       { label: "Pausada",       color: "bg-amber-100 text-amber-700", icon: PauseCircle },
  concluida:     { label: "Concluída",     color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelada:     { label: "Cancelada",     color: "bg-red-100 text-red-700",     icon: Clock },
};

const ETAPA_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:     { label: "Pendente",     color: "bg-slate-100 text-slate-600" },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-700" },
  concluida:    { label: "Concluída",    color: "bg-emerald-100 text-emerald-700" },
};

const COMPRA_STATUS: Record<string, { label: string; color: string }> = {
  pendente:  { label: "Pendente",  color: "bg-amber-100 text-amber-700" },
  aprovada:  { label: "Aprovada",  color: "bg-blue-100 text-blue-700" },
  efetuada:  { label: "Efetuada",  color: "bg-emerald-100 text-emerald-700" },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-700" },
};

const DIARIO_STATUS: Record<string, { label: string; color: string }> = {
  rascunho:           { label: "Rascunho",         color: "bg-slate-100 text-slate-600" },
  pendente_aprovacao: { label: "Pend. aprovação",   color: "bg-amber-100 text-amber-700" },
  aprovado:           { label: "Aprovado",          color: "bg-emerald-100 text-emerald-700" },
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

function fmtBRL(v?: string | number | null) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TABS = [
  { id: "visao-geral",  label: "Visão Geral",   icon: BarChart3 },
  { id: "cronograma",   label: "Cronograma",     icon: Calendar },
  { id: "medicoes",     label: "Medições",       icon: ClipboardList },
  { id: "diario",       label: "Diário de Obra", icon: BookOpen },
  { id: "estoque",      label: "Estoque",        icon: Package },
  { id: "compras",      label: "Compras",        icon: ShoppingCart },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function VisaoGeral({ obra, etapas }: { obra: any; etapas: ObraEtapa[] }) {
  const pctOrc = obra.orcamentoTotal
    ? Math.min(100, (parseFloat(obra.custoRealizado ?? "0") / parseFloat(obra.orcamentoTotal)) * 100)
    : null;

  const etapasConcluidas = etapas.filter((e) => e.status === "concluida").length;
  const pctEtapas = etapas.length > 0 ? (etapasConcluidas / etapas.length) * 100 : 0;

  const progressoMedio = etapas.length > 0
    ? etapas.reduce((s, e) => s + parseFloat(e.percentualExecutado ?? "0"), 0) / etapas.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Progresso médio", value: `${progressoMedio.toFixed(1)}%`, color: "text-blue-600" },
          { label: "Etapas concluídas", value: `${etapasConcluidas}/${etapas.length}`, color: "text-emerald-600" },
          { label: "Orçamento", value: fmtBRL(obra.orcamentoTotal), color: "text-slate-700" },
          { label: "Custo realizado", value: fmtBRL(obra.custoRealizado), color: pctOrc && pctOrc > 90 ? "text-red-600" : "text-slate-700" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Progresso das etapas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Progress value={pctEtapas} className="h-2" />
            <p className="text-xs text-muted-foreground">{etapasConcluidas} de {etapas.length} etapas concluídas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Consumo de orçamento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pctOrc !== null ? (
              <>
                <Progress value={pctOrc} className={`h-2 ${pctOrc > 100 ? "[&>div]:bg-red-500" : pctOrc > 80 ? "[&>div]:bg-amber-400" : ""}`} />
                <p className="text-xs text-muted-foreground">{pctOrc.toFixed(1)}% do orçamento utilizado</p>
              </>
            ) : <p className="text-xs text-muted-foreground">Orçamento não definido</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Dados da obra</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-2 text-sm">
          {[
            { label: "Cliente", value: obra.clienteNome },
            { label: "Contato", value: obra.clienteContato },
            { label: "Endereço", value: obra.endereco },
            { label: "Início", value: fmt(obra.dataInicio) },
            { label: "Prev. término", value: fmt(obra.dataFimPrevista) },
            { label: "Término real", value: fmt(obra.dataFimReal) },
          ].map((r) => (
            <div key={r.label} className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">{r.label}:</span>
              <span>{r.value ?? "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Cronograma({ tenantId, obraId, etapas }: { tenantId: string; obraId: string; etapas: ObraEtapa[] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editEtapa, setEditEtapa] = useState<ObraEtapa | null>(null);
  const [form, setForm] = useState({ nome: "", dataInicioPrevista: "", dataFimPrevista: "", responsavel: "", status: "pendente" });

  const { mutateAsync: createEtapa, isPending: isCreating } = useCreateObraEtapa();
  const { mutateAsync: updateEtapa } = useUpdateObraEtapa();
  const { mutateAsync: deleteEtapa } = useDeleteObraEtapa();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createEtapa({ tenantId, obraId, data: { ...form, ordem: etapas.length } as any });
    await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
    setAddOpen(false);
    setForm({ nome: "", dataInicioPrevista: "", dataFimPrevista: "", responsavel: "", status: "pendente" });
  }

  async function handleUpdate(etapaId: string, data: Partial<ObraEtapa>) {
    await updateEtapa({ tenantId, obraId, etapaId, data: data as any });
    await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
    setEditEtapa(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Adicionar etapa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova etapa</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Início previsto</Label>
                  <Input type="date" value={form.dataInicioPrevista} onChange={(e) => setForm((f) => ({ ...f, dataInicioPrevista: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Fim previsto</Label>
                  <Input type="date" value={form.dataFimPrevista} onChange={(e) => setForm((f) => ({ ...f, dataFimPrevista: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isCreating}>{isCreating ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {etapas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>Nenhuma etapa cadastrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {etapas.map((etapa, idx) => {
            const statusInfo = ETAPA_STATUS_MAP[etapa.status] ?? { label: etapa.status, color: "bg-muted" };
            const pct = parseFloat(etapa.percentualExecutado ?? "0");
            const isEditing = editEtapa?.id === etapa.id;

            return (
              <Card key={etapa.id}>
                <CardContent className="pt-4 pb-3">
                  {isEditing ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleUpdate(etapa.id, { nome: editEtapa!.nome, status: editEtapa!.status, responsavel: editEtapa!.responsavel ?? undefined, dataInicioReal: editEtapa!.dataInicioReal ?? undefined, dataFimReal: editEtapa!.dataFimReal ?? undefined }); }} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nome</Label>
                          <Input value={editEtapa!.nome} onChange={(e) => setEditEtapa((p) => p ? { ...p, nome: e.target.value } : p)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={editEtapa!.status} onChange={(e) => setEditEtapa((p) => p ? { ...p, status: e.target.value } : p)}>
                            {Object.entries(ETAPA_STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Início real</Label>
                          <Input type="date" value={editEtapa!.dataInicioReal ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, dataInicioReal: e.target.value } : p)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fim real</Label>
                          <Input type="date" value={editEtapa!.dataFimReal ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, dataFimReal: e.target.value } : p)} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditEtapa(null)}>Cancelar</Button>
                        <Button type="submit" size="sm">Salvar</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}.</span>
                          <span className="font-medium">{etapa.nome}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditEtapa(etapa)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Excluir etapa?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => { await deleteEtapa({ tenantId, obraId, etapaId: etapa.id }); qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) }); }}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Previsto: {fmt(etapa.dataInicioPrevista)} → {fmt(etapa.dataFimPrevista)}</span>
                        {etapa.dataInicioReal && <span>Real: {fmt(etapa.dataInicioReal)} → {fmt(etapa.dataFimReal)}</span>}
                        {etapa.responsavel && <span className="flex items-center gap-1"><User className="h-3 w-3" />{etapa.responsavel}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={pct} className={`h-2 flex-1 ${pct >= 100 ? "[&>div]:bg-emerald-500" : ""}`} />
                        <span className="text-xs font-mono w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Medicoes({ tenantId, obraId, etapas }: { tenantId: string; obraId: string; etapas: ObraEtapa[] }) {
  const qc = useQueryClient();
  const [selectedEtapa, setSelectedEtapa] = useState(etapas[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ data: format(new Date(), "yyyy-MM-dd"), percentualNovo: "", observacao: "" });

  const { data: medicoes = [] } = useListObraEtapaMedicoes(tenantId, obraId, selectedEtapa, {
    query: { enabled: !!selectedEtapa, queryKey: getListObraEtapaMedicoesQueryKey(tenantId, obraId, selectedEtapa) },
  });
  const { mutateAsync: createMedicao, isPending } = useCreateObraEtapaMedicao();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createMedicao({ tenantId, obraId, etapaId: selectedEtapa, data: form as any });
    await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
    setAddOpen(false);
    setForm({ data: format(new Date(), "yyyy-MM-dd"), percentualNovo: "", observacao: "" });
  }

  const currentEtapa = etapas.find((e) => e.id === selectedEtapa);

  return (
    <div className="space-y-4">
      {etapas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>Cadastre etapas para registrar medições</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm min-w-48" value={selectedEtapa} onChange={(e) => setSelectedEtapa(e.target.value)}>
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome} — {parseFloat(e.percentualExecutado).toFixed(1)}%</option>)}
            </select>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2" disabled={!selectedEtapa}><Plus className="h-4 w-4" />Registrar medição</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova medição — {currentEtapa?.nome}</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    Progresso atual: <strong>{parseFloat(currentEtapa?.percentualExecutado ?? "0").toFixed(1)}%</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Data *</Label>
                      <Input type="date" required value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Novo % executado *</Label>
                      <Input type="number" required min="0" max="100" step="0.1" value={form.percentualNovo} onChange={(e) => setForm((f) => ({ ...f, percentualNovo: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea rows={3} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Registrar"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {medicoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma medição registrada para esta etapa</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Anterior</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Novo</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Variação</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicoes.map((m) => {
                      const delta = parseFloat(m.percentualNovo) - parseFloat(m.percentualAnterior);
                      return (
                        <tr key={m.id} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-3">{fmt(m.data)}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">{parseFloat(m.percentualAnterior).toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">{parseFloat(m.percentualNovo).toFixed(1)}%</td>
                          <td className={`px-4 py-3 text-right font-mono text-xs ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{m.observacao ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DiarioDeObra({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ data: format(new Date(), "yyyy-MM-dd"), conteudo: "", responsavelNome: "", climaTempo: "", maoDeObra: "", observacoes: "" });

  const { data: entradas = [], isLoading } = useListObraDiario(tenantId, obraId, {
    query: { enabled: !!obraId, queryKey: getListObraDiarioQueryKey(tenantId, obraId) },
  });
  const { mutateAsync: createEntry, isPending } = useCreateObraDiario();
  const { mutateAsync: updateEntry } = useUpdateObraDiario();
  const { mutateAsync: deleteEntry } = useDeleteObraDiario();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (form.maoDeObra) payload.maoDeObra = parseInt(form.maoDeObra);
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    await createEntry({ tenantId, obraId, data: payload as any });
    await qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) });
    setAddOpen(false);
    setForm({ data: format(new Date(), "yyyy-MM-dd"), conteudo: "", responsavelNome: "", climaTempo: "", maoDeObra: "", observacoes: "" });
  }

  async function handleApprove(entry: ObraDiario) {
    await updateEntry({ tenantId, obraId, diarioId: entry.id, data: { status: "aprovado" } as any });
    await qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova entrada</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Diário de obra — nova entrada</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" required value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Input value={form.responsavelNome} onChange={(e) => setForm((f) => ({ ...f, responsavelNome: e.target.value }))} placeholder="Nome do encarregado" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Relatório do dia *</Label>
                <Textarea required rows={5} value={form.conteudo} onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} placeholder="Descreva as atividades realizadas hoje..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Clima/Tempo</Label>
                  <Input value={form.climaTempo} onChange={(e) => setForm((f) => ({ ...f, climaTempo: e.target.value }))} placeholder="Ex: Ensolarado" />
                </div>
                <div className="space-y-2">
                  <Label>Mão de obra (pessoas)</Label>
                  <Input type="number" min="0" value={form.maoDeObra} onChange={(e) => setForm((f) => ({ ...f, maoDeObra: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="h-40 bg-muted animate-pulse rounded-xl" /> :
       entradas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>Nenhuma entrada no diário</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entradas.map((entry) => {
            const statusInfo = DIARIO_STATUS[entry.status] ?? { label: entry.status, color: "bg-muted" };
            const isExpanded = expandedId === entry.id;
            return (
              <Card key={entry.id}>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{fmt(entry.data)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                      {entry.responsavelNome && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{entry.responsavelNome}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {entry.status === "rascunho" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-amber-600 border-amber-200" onClick={() => updateEntry({ tenantId, obraId, diarioId: entry.id, data: { status: "pendente_aprovacao" } as any }).then(() => qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) }))}>
                          Enviar p/ aprovação
                        </Button>
                      )}
                      {entry.status === "pendente_aprovacao" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200" onClick={() => handleApprove(entry)}>
                          Aprovar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir entrada?</AlertDialogTitle></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => { await deleteEntry({ tenantId, obraId, diarioId: entry.id }); qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) }); }}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {(isExpanded || !isExpanded) && (
                    <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${!isExpanded ? "line-clamp-2" : ""}`}>{entry.conteudo}</p>
                  )}
                  {isExpanded && (
                    <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                      {entry.climaTempo && <span>🌤 {entry.climaTempo}</span>}
                      {entry.maoDeObra != null && <span>👷 {entry.maoDeObra} pessoas</span>}
                      {entry.observacoes && <span>📝 {entry.observacoes}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EstoqueObra({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const { data: itens = [], isLoading } = useGetObraEstoque(tenantId, obraId, {
    query: { enabled: !!obraId, queryKey: getGetObraEstoqueQueryKey(tenantId, obraId) },
  });

  return isLoading ? <div className="h-40 bg-muted animate-pulse rounded-xl" /> :
    itens.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
        <p>Nenhum material em estoque nesta obra</p>
        <p className="text-xs mt-1">Use movimentações de estoque para alocar materiais</p>
      </div>
    ) : (
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Material</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unidade</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Quantidade atual</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd. mínima</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const baixo = parseFloat(item.quantidadeAtual) <= parseFloat(item.quantidadeMinima);
                return (
                  <tr key={item.id} className={`border-b hover:bg-muted/20 ${baixo ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{(item as any).insumo?.nome ?? "—"}</div>
                      {(item as any).insumo?.categoria && <div className="text-xs text-muted-foreground">{(item as any).insumo.categoria}</div>}
                    </td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{(item as any).insumo?.unidade ?? "—"}</span></td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${baixo ? "text-red-600" : ""}`}>
                      {parseFloat(item.quantidadeAtual).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{parseFloat(item.quantidadeMinima).toLocaleString("pt-BR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    );
}

function Compras({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ descricao: "", fornecedor: "", quantidade: "", valorUnitario: "", valorTotal: "", dataPrevista: "", observacoes: "" });

  const { data: compras = [], isLoading } = useListObraCompras(tenantId, obraId, {
    query: { enabled: !!obraId, queryKey: getListObraComprasQueryKey(tenantId, obraId) },
  });
  const { mutateAsync: createCompra, isPending } = useCreateObraCompra();
  const { mutateAsync: updateCompra } = useUpdateCompraObra();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    await createCompra({ tenantId, obraId, data: payload as any });
    await qc.invalidateQueries({ queryKey: getListObraComprasQueryKey(tenantId, obraId) });
    setAddOpen(false);
    setForm({ descricao: "", fornecedor: "", quantidade: "", valorUnitario: "", valorTotal: "", dataPrevista: "", observacoes: "" });
  }

  async function changeStatus(compraId: string, status: string) {
    await updateCompra({ tenantId, compraId, data: { status, ...(status === "efetuada" ? { dataEfetuada: format(new Date(), "yyyy-MM-dd") } : {}) } as any });
    await qc.invalidateQueries({ queryKey: getListObraComprasQueryKey(tenantId, obraId) });
  }

  const pendentes = compras.filter((c) => c.status === "pendente").length;
  const totalPrevisto = compras.filter((c) => c.status !== "cancelada").reduce((s, c) => s + parseFloat(c.valorTotal ?? "0"), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="text-muted-foreground">{pendentes} pendentes</span>
          <span className="font-medium">Total previsto: {fmtBRL(String(totalPrevisto))}</span>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova compra</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar compra</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Input required value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Input value={form.fornecedor} onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Data prevista</Label>
                  <Input type="date" value={form.dataPrevista} onChange={(e) => setForm((f) => ({ ...f, dataPrevista: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input type="number" step="0.001" value={form.quantidade} onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Valor unitário (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorUnitario} onChange={(e) => setForm((f) => ({ ...f, valorUnitario: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Valor total (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorTotal} onChange={(e) => setForm((f) => ({ ...f, valorTotal: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Registrar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="h-40 bg-muted animate-pulse rounded-xl" /> :
       compras.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>Nenhuma compra registrada</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fornecedor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor total</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c) => {
                    const sInfo = COMPRA_STATUS[c.status] ?? { label: c.status, color: "bg-muted" };
                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{c.descricao}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.fornecedor ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sInfo.color}`}>{sInfo.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmtBRL(c.valorTotal)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{c.dataPrevista ? fmt(c.dataPrevista) : "—"}</td>
                        <td className="px-4 py-3">
                          <select className="text-xs border rounded px-1.5 py-1 bg-transparent" value={c.status} onChange={(e) => changeStatus(c.id, e.target.value)}>
                            {Object.entries(COMPRA_STATUS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ObraDetalhe() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, params] = useRoute("/obras/:obraId");
  const obraId = params?.obraId ?? "";
  const [activeTab, setActiveTab] = useState("visao-geral");
  const qc = useQueryClient();

  const { data: obra, isLoading } = useGetObra(tenantId, obraId, {
    query: { enabled: !!obraId && !!tenantId, queryKey: getGetObraQueryKey(tenantId, obraId) },
  });

  const { data: etapas = [] } = useListObraEtapas(tenantId, obraId, {
    query: { enabled: !!obraId && !!tenantId, queryKey: getListObraEtapasQueryKey(tenantId, obraId) },
  });

  if (isLoading) {
    return <div className="h-40 bg-muted animate-pulse rounded-xl" />;
  }

  if (!obra) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Obra não encontrada</p>
        <Link href="/obras"><Button variant="link">← Voltar</Button></Link>
      </div>
    );
  }

  const statusInfo = (obra as any) ? (
    { label: obra.status, color: "bg-muted" }
  ) : { label: obra.status, color: "bg-muted" };

  const obraStatus = {
    planejamento:  { label: "Planejamento",  color: "bg-slate-100 text-slate-700" },
    em_andamento:  { label: "Em andamento",  color: "bg-blue-100 text-blue-700" },
    pausada:       { label: "Pausada",       color: "bg-amber-100 text-amber-700" },
    concluida:     { label: "Concluída",     color: "bg-emerald-100 text-emerald-700" },
    cancelada:     { label: "Cancelada",     color: "bg-red-100 text-red-700" },
  }[obra.status] ?? { label: obra.status, color: "bg-muted text-muted-foreground" };

  const progressoMedio = etapas.length > 0
    ? etapas.reduce((s, e) => s + parseFloat(e.percentualExecutado ?? "0"), 0) / etapas.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link href="/obras">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Obras
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HardHat className="h-6 w-6 text-amber-500" />
              {obra.nome}
            </h1>
            {obra.clienteNome && <p className="text-sm text-muted-foreground mt-0.5">{obra.clienteNome}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${obraStatus.color}`}>{obraStatus.label}</span>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Progress value={progressoMedio} className="w-24 h-1.5" />
            <span className="font-medium">{progressoMedio.toFixed(1)}%</span>
          </div>
          {obra.dataFimPrevista && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>Prev: {fmt(obra.dataFimPrevista)}</span>
            </div>
          )}
          {obra.orcamentoTotal && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Orç: {fmtBRL(obra.orcamentoTotal)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "visao-geral"  && <VisaoGeral obra={obra} etapas={etapas} />}
        {activeTab === "cronograma"   && <Cronograma tenantId={tenantId} obraId={obraId} etapas={etapas} />}
        {activeTab === "medicoes"     && <Medicoes tenantId={tenantId} obraId={obraId} etapas={etapas} />}
        {activeTab === "diario"       && <DiarioDeObra tenantId={tenantId} obraId={obraId} />}
        {activeTab === "estoque"      && <EstoqueObra tenantId={tenantId} obraId={obraId} />}
        {activeTab === "compras"      && <Compras tenantId={tenantId} obraId={obraId} />}
      </div>
    </div>
  );
}
