import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Pill, Loader2, ShieldAlert } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const CATEGORIAS = [
  { value: "medicamento_generico", label: "Medicamento genérico" },
  { value: "medicamento_referencia", label: "Medicamento referência" },
  { value: "medicamento_similar", label: "Medicamento similar" },
  { value: "perfumaria", label: "Perfumaria" },
  { value: "higiene_pessoal", label: "Higiene pessoal" },
  { value: "dermocosmeticos", label: "Dermocosméticos" },
  { value: "infantil", label: "Infantil" },
  { value: "ortopedicos", label: "Ortopédicos" },
  { value: "suplementos", label: "Suplementos" },
  { value: "outros", label: "Outros" },
] as const;

function fmt(v: number | string) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const EMPTY_FORM = {
  nome: "", principioAtivo: "", descricao: "", categoria: "outros" as string,
  exigeReceita: false, unidade: "un", precoVenda: "", precoPromocional: "",
  estoque: 0, ativo: true, destaqueWhatsapp: false,
  posologiaFonteUrl: "", posologiaRevisadaPor: "", posologiaAprovada: false,
  posologia: {
    concentracao: "", formaFarmaceutica: "", viaAdministracao: "", faixaEtaria: "",
    pesoMinimoKg: "", pesoMaximoKg: "", dosePorAdministracao: "", intervaloMinimo: "",
    duracaoMaxima: "", doseMaximaDiaria: "", modoDeUsar: "", contraindicacoes: "",
    interacoes: "", alertas: "",
  },
};

export default function FarmaciaProdutos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const QK = ["farmacia-produtos", tenantId, search, catFilter];

  const { data: produtos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (catFilter !== "todos") params.set("categoria", catFilter);
      return fetch(`/api/tenants/${tenantId}/farmacia/produtos?${params}`, { headers: authHeaders() }).then((r) => r.json());
    },
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/farmacia/produtos/${editing.id}`
        : `/api/tenants/${tenantId}/farmacia/produtos`;
      return fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmacia-produtos"] });
      toast({ title: editing ? "Produto atualizado." : "Produto criado." });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/farmacia/produtos/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmacia-produtos"] });
      toast({ title: "Produto removido." });
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }
  function openEdit(p: any) {
    setEditing(p);
    setForm({
      nome: p.nome ?? "", principioAtivo: p.principioAtivo ?? "", descricao: p.descricao ?? "",
      categoria: p.categoria ?? "outros", exigeReceita: !!p.exigeReceita, unidade: p.unidade ?? "un",
      precoVenda: String(p.precoVenda ?? ""), precoPromocional: p.precoPromocional != null ? String(p.precoPromocional) : "",
      estoque: p.estoque ?? 0, ativo: p.ativo !== false, destaqueWhatsapp: !!p.destaqueWhatsapp,
      posologiaFonteUrl: p.posologiaFonteUrl ?? "", posologiaRevisadaPor: p.posologiaRevisadaPor ?? "",
      posologiaAprovada: !!p.posologiaAprovada,
      posologia: { ...EMPTY_FORM.posologia, ...(p.posologia ?? {}), pesoMinimoKg: p.posologia?.pesoMinimoKg ?? "", pesoMaximoKg: p.posologia?.pesoMaximoKg ?? "" },
    });
    setDialogOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.precoVenda) {
      toast({ title: "Nome e preço são obrigatórios", variant: "destructive" });
      return;
    }
    save.mutate({
      ...form,
      estoque: Number(form.estoque),
      precoPromocional: form.precoPromocional || null,
      posologiaFonteUrl: form.posologiaFonteUrl || null,
      posologiaRevisadaPor: form.posologiaRevisadaPor || null,
      posologia: {
        ...form.posologia,
        pesoMinimoKg: form.posologia.pesoMinimoKg === "" ? undefined : Number(form.posologia.pesoMinimoKg),
        pesoMaximoKg: form.posologia.pesoMaximoKg === "" ? undefined : Number(form.posologia.pesoMaximoKg),
      },
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Pill className="h-5 w-5" /> Catálogo de Produtos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{produtos.length} produto{produtos.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Produto
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Pill className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produtos.map((p: any) => (
            <Card key={p.id} className={`relative ${!p.ativo ? "opacity-50" : ""}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{p.nome}</p>
                    {p.principioAtivo && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.principioAtivo}</p>
                    )}
                  </div>
                  {p.exigeReceita && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 shrink-0 gap-0.5">
                      <ShieldAlert className="h-3 w-3" /> Receita
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {p.precoPromocional ? (
                    <>
                      <span className="text-xs line-through text-muted-foreground">{fmt(p.precoVenda)}</span>
                      <span className="text-sm font-bold text-emerald-600">{fmt(p.precoPromocional)}</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold">{fmt(p.precoVenda)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">/{p.unidade}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Estoque: {p.estoque}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Princípio ativo</Label>
              <Input value={form.principioAtivo} onChange={(e) => setForm((f) => ({ ...f, principioAtivo: e.target.value }))} placeholder="ex: Paracetamol" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço (R$) <span className="text-destructive">*</span></Label>
                <Input value={form.precoVenda} onChange={(e) => setForm((f) => ({ ...f, precoVenda: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Promoção (R$)</Label>
                <Input value={form.precoPromocional} onChange={(e) => setForm((f) => ({ ...f, precoPromocional: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estoque</Label>
              <Input type="number" min={0} value={form.estoque} onChange={(e) => setForm((f) => ({ ...f, estoque: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.exigeReceita} onCheckedChange={(v) => setForm((f) => ({ ...f, exigeReceita: v }))} />
              <Label>Exige receita médica (produto controlado)</Label>
            </div>
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Posologia oficial da apresentação</h3>
                <p className="text-xs text-muted-foreground">Copie os dados da bula desta concentração e forma farmacêutica. A IA não fará cálculos nem adaptações.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Concentração</Label><Input value={form.posologia.concentracao} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, concentracao: e.target.value } }))} placeholder="ex: 500 mg" /></div>
                <div className="space-y-1.5"><Label>Forma farmacêutica</Label><Input value={form.posologia.formaFarmaceutica} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, formaFarmaceutica: e.target.value } }))} placeholder="ex: comprimido" /></div>
                <div className="space-y-1.5"><Label>Via</Label><Input value={form.posologia.viaAdministracao} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, viaAdministracao: e.target.value } }))} placeholder="ex: oral" /></div>
                <div className="space-y-1.5"><Label>Faixa etária</Label><Input value={form.posologia.faixaEtaria} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, faixaEtaria: e.target.value } }))} placeholder="ex: adultos e maiores de 12 anos" /></div>
                <div className="space-y-1.5"><Label>Peso mínimo (kg)</Label><Input type="number" min={0} value={form.posologia.pesoMinimoKg} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, pesoMinimoKg: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Peso máximo (kg)</Label><Input type="number" min={0} value={form.posologia.pesoMaximoKg} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, pesoMaximoKg: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Dose por administração</Label><Input value={form.posologia.dosePorAdministracao} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, dosePorAdministracao: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Intervalo mínimo</Label><Input value={form.posologia.intervaloMinimo} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, intervaloMinimo: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Duração máxima</Label><Input value={form.posologia.duracaoMaxima} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, duracaoMaxima: e.target.value } }))} /></div>
                <div className="space-y-1.5 sm:col-span-3"><Label>Dose máxima diária</Label><Input value={form.posologia.doseMaximaDiaria} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, doseMaximaDiaria: e.target.value } }))} /></div>
              </div>
              {(["modoDeUsar", "contraindicacoes", "interacoes", "alertas"] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label>{{ modoDeUsar: "Modo de usar", contraindicacoes: "Contraindicações", interacoes: "Interações", alertas: "Alertas" }[field]}</Label>
                  <Textarea value={form.posologia[field]} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, [field]: e.target.value } }))} rows={2} />
                </div>
              ))}
              <div className="space-y-1.5"><Label>URL da bula oficial</Label><Input type="url" value={form.posologiaFonteUrl} onChange={(e) => setForm((f) => ({ ...f, posologiaFonteUrl: e.target.value }))} placeholder="Bulário Eletrônico da Anvisa" /></div>
              <div className="space-y-1.5"><Label>Revisada por (farmacêutico/CRF)</Label><Input value={form.posologiaRevisadaPor} onChange={(e) => setForm((f) => ({ ...f, posologiaRevisadaPor: e.target.value }))} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.posologiaAprovada} onCheckedChange={(v) => setForm((f) => ({ ...f, posologiaAprovada: v }))} />
                <Label>Liberar esta posologia para o agente após revisão farmacêutica</Label>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
                <Label className="font-normal">Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.destaqueWhatsapp} onCheckedChange={(v) => setForm((f) => ({ ...f, destaqueWhatsapp: v }))} />
                <Label className="font-normal">Destaque WhatsApp</Label>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Salvar" : "Criar Produto"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover "{deleteTarget?.nome}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => remove.mutate(deleteTarget.id)} disabled={remove.isPending}>Remover</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
