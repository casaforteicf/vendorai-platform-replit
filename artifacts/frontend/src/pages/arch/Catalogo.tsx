import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Image, X, Upload, Loader2, Package,
  Pencil, Trash2, Store,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  subcategoria: string | null;
  fornecedor: string | null;
  precoBase: string | null;
  unidade: string | null;
  imagens: string[] | null;
  ativo: boolean;
  createdAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function authH(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CATEGORIAS = [
  "Móveis", "Iluminação", "Revestimentos", "Elétrica", "Hidráulica",
  "Marcenaria", "Acessórios", "Pintura", "Metais", "Cerâmica", "Outros",
];

const EMPTY_FORM = {
  nome: "",
  descricao: "",
  categoria: "__none__",
  subcategoria: "",
  fornecedor: "",
  precoBase: "",
  unidade: "un",
  publicarMarketplace: false,
};

// ── Main Component ─────────────────────────────────────────────────────────
export default function Catalogo() {
  const { toast } = useToast();

  // ── List state
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const [categoria, setCategoria] = useState("__all__");

  // ── Dialog state
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Produto | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);

  // ── Image upload state
  const [files, setFiles]                   = useState<File[]>([]);
  const [previews, setPreviews]             = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (busca)                    params.set("busca", busca);
    if (categoria !== "__all__")  params.set("categoria", categoria);
    const res = await fetch(`${getBase()}/api/arch/catalogo?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setProdutos(await res.json());
    setLoading(false);
  }, [busca, categoria]);

  useEffect(() => { load(); }, [load]);

  // ── Image helpers ──────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).slice(0, 5 - files.length);
    const newPreviews = selected.map(f => URL.createObjectURL(f));
    setFiles(prev => [...prev, ...selected].slice(0, 5));
    setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
    e.target.value = "";
  }

  function removeFile(idx: number) {
    URL.revokeObjectURL(previews[idx]);
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Open dialog ────────────────────────────────────────────────────────
  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFiles([]);
    setPreviews([]);
    setOpen(true);
  }

  function openEdit(p: Produto) {
    setEditing(p);
    setForm({
      nome:               p.nome,
      descricao:          p.descricao ?? "",
      categoria:          p.categoria ?? "__none__",
      subcategoria:       p.subcategoria ?? "",
      fornecedor:         p.fornecedor ?? "",
      precoBase:          p.precoBase ?? "",
      unidade:            p.unidade ?? "un",
      publicarMarketplace: false,
    });
    setFiles([]);
    setPreviews([]);
    setOpen(true);
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const body = {
        nome:        form.nome,
        descricao:   form.descricao || undefined,
        categoria:   form.categoria !== "__none__" ? form.categoria : undefined,
        subcategoria: form.subcategoria || undefined,
        fornecedor:  form.fornecedor || undefined,
        precoBase:   form.precoBase ? Number(form.precoBase) : undefined,
        unidade:     form.unidade || undefined,
      };

      let produto: Produto;

      if (editing) {
        const res = await fetch(`${getBase()}/api/arch/catalogo/${editing.id}`, {
          method: "PATCH",
          headers: authH(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao atualizar produto.");
        produto = await res.json();
      } else {
        const res = await fetch(`${getBase()}/api/arch/catalogo`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao criar produto.");
        produto = await res.json();
      }

      // Upload images if any
      if (files.length > 0) {
        setUploadingImages(true);
        const fd = new FormData();
        files.forEach(f => fd.append("imagens", f));
        const imgRes = await fetch(`${getBase()}/api/arch/catalogo/${produto.id}/imagens`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        if (!imgRes.ok) toast({ title: "Aviso", description: "Produto salvo mas falha no upload das imagens.", variant: "destructive" });
        setUploadingImages(false);
      }

      // Publish to marketplace if toggled
      if (form.publicarMarketplace && !editing) {
        await fetch(`${getBase()}/api/arch/marketplace`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({
            nome:     body.nome,
            descricao: body.descricao,
            categoria: body.categoria,
            preco:    body.precoBase ?? 0,
          }),
        });
        toast({ title: "Publicado no marketplace!" });
      }

      setOpen(false);
      await load();
      toast({ title: editing ? "Produto atualizado!" : "Produto adicionado!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setUploadingImages(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const res = await fetch(`${getBase()}/api/arch/catalogo/${id}`, {
      method: "PATCH",
      headers: authH(),
      body: JSON.stringify({ ativo: false }),
    });
    if (res.ok) {
      await load();
      toast({ title: "Produto removido do catálogo." });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie seus produtos e materiais de design</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" /> Adicionar produto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar produto..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as categorias</SelectItem>
            {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : produtos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium text-sm">Nenhum produto no catálogo</p>
          <p className="text-xs text-muted-foreground mt-1">Adicione móveis, materiais e produtos que você usa nos projetos.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {produtos.map(p => {
            const thumb = p.imagens?.[0];
            return (
              <Card key={p.id} className="overflow-hidden group">
                {/* Image */}
                <div className="relative h-40 bg-muted flex items-center justify-center">
                  {thumb ? (
                    <img
                      src={`${getBase()}${thumb}`}
                      alt={p.nome}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Image className="h-10 w-10 text-muted-foreground/20" />
                  )}
                  {/* Hover actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon" variant="secondary" className="h-7 w-7"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="destructive" className="h-7 w-7">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover produto?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{p.nome}" será marcado como inativo e não aparecerá mais no catálogo.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(p.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <p className="font-medium text-sm leading-tight truncate">{p.nome}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.categoria && (
                      <Badge variant="secondary" className="text-xs">{p.categoria}</Badge>
                    )}
                  </div>
                  {p.fornecedor && (
                    <p className="text-xs text-muted-foreground truncate">{p.fornecedor}</p>
                  )}
                  {p.precoBase && Number(p.precoBase) > 0 && (
                    <p className="text-sm font-semibold text-green-700">{fmt(Number(p.precoBase))}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Adicionar / Editar Produto ────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Adicionar Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                required
                placeholder="Ex: Sofá de 3 lugares"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva o produto..."
                rows={2}
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>

            {/* Categoria + Subcategoria */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subcategoria</Label>
                <Input
                  placeholder="Ex: Estofados"
                  value={form.subcategoria}
                  onChange={e => setForm(f => ({ ...f, subcategoria: e.target.value }))}
                />
              </div>
            </div>

            {/* Fornecedor */}
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Input
                placeholder="Ex: Tok&Stok"
                value={form.fornecedor}
                onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
              />
            </div>

            {/* Preço + Unidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço base (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={form.precoBase}
                  onChange={e => setForm(f => ({ ...f, precoBase: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Input
                  placeholder="un, m², m, kg"
                  value={form.unidade}
                  onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                />
              </div>
            </div>

            {/* Imagens dropzone */}
            <div className="space-y-1.5">
              <Label>Imagens <span className="text-muted-foreground text-xs">(máx. 5)</span></Label>
              {previews.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {previews.map((src, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border">
                      <img src={src} className="w-full h-full object-cover" alt={`preview-${idx}`} />
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {files.length < 5 && (
                <div
                  className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1" />
                  <p className="text-xs text-muted-foreground">Clique ou arraste imagens aqui</p>
                  <p className="text-xs text-muted-foreground/60">{5 - files.length} restante(s) — JPG, PNG, WebP</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Publicar no marketplace */}
            {!editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-medium">Publicar no Marketplace</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Disponível para outros arquitetos comprarem (10% de comissão VendorAI)</p>
                </div>
                <Switch
                  checked={form.publicarMarketplace}
                  onCheckedChange={v => setForm(f => ({ ...f, publicarMarketplace: v }))}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || uploadingImages}>
                {(saving || uploadingImages) ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{uploadingImages ? "Enviando imagens…" : "Salvando…"}</>
                ) : (
                  editing ? "Salvar" : "Adicionar"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
