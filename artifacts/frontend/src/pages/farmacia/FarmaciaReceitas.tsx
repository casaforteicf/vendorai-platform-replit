import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Loader2, AlertTriangle, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Receita {
  id: string;
  clienteId: string;
  medicamentoNome: string;
  tipo: "comum" | "controlado";
  medico: string | null;
  crm: string | null;
  dataEmissao: string;
  dataValidade: string;
  quantidadeCaixas: number | null;
  status: "ativa" | "vencida" | "utilizada" | "renovada";
  observacoes: string | null;
}

const STATUS_LABEL: Record<string, string> = { ativa: "Ativa", vencida: "Vencida", utilizada: "Utilizada", renovada: "Renovada" };

interface FormState {
  clienteId: string; clienteNome: string;
  medicamentoNome: string; tipo: string; medico: string; crm: string;
  dataEmissao: string; dataValidade: string; quantidadeCaixas: string; observacoes: string;
}
const EMPTY_FORM: FormState = {
  clienteId: "", clienteNome: "",
  medicamentoNome: "", tipo: "comum", medico: "", crm: "",
  dataEmissao: "", dataValidade: "", quantidadeCaixas: "", observacoes: "",
};

export default function FarmaciaReceitas() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ativa");
  const [clienteSearch, setClienteSearch] = useState("");
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  const { data: receitas = [], isLoading } = useQuery<Receita[]>({
    queryKey: ["farmacia-receitas", tenantId, statusFilter],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/farmacia/receitas?status=${statusFilter}`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: allLeads = [] } = useQuery<Array<{ id: string; nome: string | null }>>({
    queryKey: ["leads-all", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : [])),
    enabled: !!tenantId && open,
  });
  const leads = clienteSearch.length >= 2
    ? allLeads.filter((l) => l.nome?.toLowerCase().includes(clienteSearch.toLowerCase())).slice(0, 8)
    : [];

  const createMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/farmacia/receitas`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          clienteId: form.clienteId,
          medicamentoNome: form.medicamentoNome,
          tipo: form.tipo,
          medico: form.medico || null,
          crm: form.crm || null,
          dataEmissao: form.dataEmissao,
          dataValidade: form.dataValidade,
          quantidadeCaixas: form.quantidadeCaixas ? Number(form.quantidadeCaixas) : null,
          observacoes: form.observacoes || null,
        }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmacia-receitas"] });
      toast({ title: "Receita cadastrada!" });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      setClienteSearch("");
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const marcarUtilizada = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/farmacia/receitas/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status: "utilizada" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farmacia-receitas"] }); toast({ title: "Marcada como utilizada" }); },
  });

  const remover = useMutation({
    mutationFn: (id: string) => fetch(`/api/farmacia/receitas/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farmacia-receitas"] }); toast({ title: "Removida" }); },
  });

  function diasParaVencer(dataValidade: string) {
    return Math.ceil((new Date(dataValidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5" /> Receitas Médicas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Controle de validade — o Scout avisa antes de vencer.</p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Receita
        </Button>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : receitas.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma receita {STATUS_LABEL[statusFilter]?.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {receitas.map((r) => {
            const dias = diasParaVencer(r.dataValidade);
            const vencendoLogo = r.status === "ativa" && dias <= 5;
            return (
              <Card key={r.id} className={vencendoLogo ? "border-amber-300" : ""}>
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{r.medicamentoNome}</p>
                      {r.tipo === "controlado" && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Controlado</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{STATUS_LABEL[r.status]}</Badge>
                      {vencendoLogo && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {dias <= 0 ? "Vencida" : `Vence em ${dias}d`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.medico ? `Dr(a). ${r.medico}${r.crm ? ` — CRM ${r.crm}` : ""}` : "Médico não informado"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Emitida {format(new Date(r.dataEmissao), "dd/MM/yyyy", { locale: ptBR })} · Válida até {format(new Date(r.dataValidade), "dd/MM/yyyy", { locale: ptBR })}
                      {r.quantidadeCaixas ? ` · ${r.quantidadeCaixas} caixa(s)` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.status === "ativa" && (
                      <Button size="sm" variant="outline" onClick={() => marcarUtilizada.mutate(r.id)} disabled={marcarUtilizada.isPending}>
                        Marcar utilizada
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remover.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Receita</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cliente <span className="text-destructive">*</span></Label>
              {form.clienteId ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
                  <span className="text-sm font-medium">{form.clienteNome}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setForm((f) => ({ ...f, clienteId: "", clienteNome: "" }))}>×</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Buscar cliente por nome..." value={clienteSearch} onChange={(e) => setClienteSearch(e.target.value)} />
                  </div>
                  {leads.length > 0 && (
                    <ul className="border rounded-md max-h-32 overflow-y-auto divide-y">
                      {leads.map((l) => (
                        <li key={l.id}>
                          <button type="button" onClick={() => { setForm((f) => ({ ...f, clienteId: l.id, clienteNome: l.nome ?? "Sem nome" })); setClienteSearch(""); }}
                            className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm">{l.nome ?? "Sem nome"}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Medicamento <span className="text-destructive">*</span></Label>
              <Input value={form.medicamentoNome} onChange={(e) => setForm((f) => ({ ...f, medicamentoNome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comum">Comum</SelectItem>
                  <SelectItem value="controlado">Controlado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Médico</Label>
                <Input value={form.medico} onChange={(e) => setForm((f) => ({ ...f, medico: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CRM</Label>
                <Input value={form.crm} onChange={(e) => setForm((f) => ({ ...f, crm: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Data de emissão <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.dataEmissao} onChange={(e) => setForm((f) => ({ ...f, dataEmissao: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Válida até <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.dataValidade} onChange={(e) => setForm((f) => ({ ...f, dataValidade: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade de caixas</Label>
              <Input type="number" min={1} value={form.quantidadeCaixas} onChange={(e) => setForm((f) => ({ ...f, quantidadeCaixas: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={createMutation.isPending || !form.clienteId || !form.medicamentoNome || !form.dataEmissao || !form.dataValidade}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Cadastrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
