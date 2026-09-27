import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Home, Loader2, Bed, Bath, Car, Ruler } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TIPOS = [
  { value: "casa", label: "Casa" },
  { value: "apartamento", label: "Apartamento" },
  { value: "terreno", label: "Terreno" },
  { value: "comercial", label: "Comercial" },
  { value: "rural", label: "Rural" },
  { value: "sala_comercial", label: "Sala Comercial" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido", alugado: "Alugado", inativo: "Inativo",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reservado: "bg-amber-50 text-amber-700 border-amber-200",
  vendido: "bg-blue-50 text-blue-700 border-blue-200",
  alugado: "bg-violet-50 text-violet-700 border-violet-200",
  inativo: "bg-slate-50 text-slate-500 border-slate-200",
};

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const EMPTY_FORM = {
  titulo: "", descricao: "", tipo: "casa" as string, finalidade: "venda" as string,
  endereco: "", bairro: "", cidade: "", cep: "",
  areaM2: "", quartos: "", banheiros: "", vagas: "",
  valor: "", valorCondominio: "", valorIptu: "", destaque: false, vendeNoPracaAi: false,
};

export default function ImoveisPropriedades() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const QK = ["imoveis-propriedades", tenantId, statusFilter];

  const { data: propriedades = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/imoveis/propriedades?status=${statusFilter === "all" ? "" : statusFilter}`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/imoveis/propriedades/${editing.id}`
        : `/api/tenants/${tenantId}/imoveis/propriedades`;
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
      qc.invalidateQueries({ queryKey: ["imoveis-propriedades", tenantId] });
      toast({ title: editing ? "Propriedade atualizada!" : "Propriedade cadastrada!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/imoveis/propriedades/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Não foi possível alterar o status do imóvel.");
        return body;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["imoveis-propriedades", tenantId] }),
    onError: (error: Error) => toast({ title: "Erro ao alterar imóvel", description: error.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }
  function openEdit(p: any) {
    setEditing(p);
    setForm({
      titulo: p.titulo ?? "", descricao: p.descricao ?? "", tipo: p.tipo ?? "casa", finalidade: p.finalidade ?? "venda",
      endereco: p.endereco ?? "", bairro: p.bairro ?? "", cidade: p.cidade ?? "", cep: p.cep ?? "",
      areaM2: p.areaM2 != null ? String(p.areaM2) : "", quartos: p.quartos != null ? String(p.quartos) : "",
      banheiros: p.banheiros != null ? String(p.banheiros) : "", vagas: p.vagas != null ? String(p.vagas) : "",
      valor: p.valor != null ? String(p.valor) : "", valorCondominio: p.valorCondominio != null ? String(p.valorCondominio) : "",
      valorIptu: p.valorIptu != null ? String(p.valorIptu) : "", destaque: !!p.destaque,
      vendeNoPracaAi: !!p.vendeNoPracaAi,
    });
    setDialogOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo || !form.valor) {
      toast({ title: "Título e valor são obrigatórios", variant: "destructive" });
      return;
    }
    save.mutate({
      ...form,
      areaM2: form.areaM2 || undefined,
      quartos: form.quartos ? Number(form.quartos) : undefined,
      banheiros: form.banheiros ? Number(form.banheiros) : undefined,
      vagas: form.vagas ? Number(form.vagas) : undefined,
      valorCondominio: form.valorCondominio || undefined,
      valorIptu: form.valorIptu || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Home className="h-5 w-5" /> Propriedades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {Array.isArray(propriedades) ? propriedades.length : 0} propriedade(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Nova Propriedade
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : propriedades.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma propriedade cadastrada ainda.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {propriedades.map((p: any) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-tight">{p.titulo}</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {TIPOS.find((t) => t.value === p.tipo)?.label ?? p.tipo} · {p.finalidade === "venda" ? "Venda" : "Aluguel"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{[p.bairro, p.cidade].filter(Boolean).join(", ") || "sem endereço"}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {p.areaM2 && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{p.areaM2}m²</span>}
                  {p.quartos != null && <span className="flex items-center gap-1"><Bed className="h-3 w-3" />{p.quartos}</span>}
                  {p.banheiros != null && <span className="flex items-center gap-1"><Bath className="h-3 w-3" />{p.banheiros}</span>}
                  {p.vagas != null && <span className="flex items-center gap-1"><Car className="h-3 w-3" />{p.vagas}</span>}
                </div>
                <p className="font-semibold text-sm">{fmt(p.valor)}</p>
                {p.status === "disponivel" && (
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => changeStatus.mutate({ id: p.id, status: "reservado" })}>
                      Reservar
                    </Button>
                  </div>
                )}
                {p.status === "reservado" && (
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => changeStatus.mutate({ id: p.id, status: p.finalidade === "venda" ? "vendido" : "alugado" })}>
                      Confirmar {p.finalidade === "venda" ? "venda" : "aluguel"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Propriedade" : "Nova Propriedade"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="ex: Casa 3 quartos no Centro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Finalidade</Label>
                <Select value={form.finalidade} onValueChange={(v) => setForm((f) => ({ ...f, finalidade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venda">Venda</SelectItem>
                    <SelectItem value="aluguel">Aluguel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Área (m²)</Label>
                <Input type="number" value={form.areaM2} onChange={(e) => setForm((f) => ({ ...f, areaM2: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Quartos</Label>
                <Input type="number" min={0} value={form.quartos} onChange={(e) => setForm((f) => ({ ...f, quartos: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Banheiros</Label>
                <Input type="number" min={0} value={form.banheiros} onChange={(e) => setForm((f) => ({ ...f, banheiros: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Vagas</Label>
                <Input type="number" min={0} value={form.vagas} onChange={(e) => setForm((f) => ({ ...f, vagas: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} step={0.01} value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Condomínio</Label>
                <Input type="number" min={0} step={0.01} value={form.valorCondominio} onChange={(e) => setForm((f) => ({ ...f, valorCondominio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>IPTU</Label>
                <Input type="number" min={0} step={0.01} value={form.valorIptu} onChange={(e) => setForm((f) => ({ ...f, valorIptu: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.destaque} onCheckedChange={(v) => setForm((f) => ({ ...f, destaque: v }))} />
              <Label>Destacar anúncio</Label>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <Switch checked={form.vendeNoPracaAi} onCheckedChange={(v) => setForm((f) => ({ ...f, vendeNoPracaAi: v }))} />
              <div>
                <Label>Publicar no Praça.ai</Label>
                <p className="text-xs text-muted-foreground">Fotos, valor, localização e características deste cadastro serão exibidos no marketplace.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
