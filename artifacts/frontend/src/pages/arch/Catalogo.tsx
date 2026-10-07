import { useState, useEffect, useCallback, useRef } from "react";
import "./planner5d-reference.css";
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
import { useAuth } from "@/contexts/AuthContext";
import { ordenarArvoreCategorias } from "@/lib/categoriaTree";
import { useListCategoriasProduto, getListCategoriasProdutoQueryKey } from "@workspace/api-client-react";
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
  precoPromocional: string | null;
  promocaoAtivaAte: string | null;
  unidade: string | null;
  imagens: string[] | null;
  especificacoes: {
    model3dUrl?: string;
    modelSurfaces?: Array<{
      key: string;
      label: string;
      nodeName?: string;
      materialName?: string;
      meshCount?: number;
    }>;
    modelSurfacesDetectedAt?: string;
    [key: string]: unknown;
  } | null;
  ativo: boolean;
  createdAt: string;
  sourceTenantId?: string | null;
  sourceTenantName?: string | null;
  ownedByTenant?: boolean;
  canEdit?: boolean;
  marketplaceAvailable?: boolean;
};

type Material = {
  id: string;
  nome: string;
  fabricante: string;
  linha: string;
  referencia: string | null;
  categoria: string;
};

type ProdutoMaterial = {
  id: string;
  materialId: string;
  grupo: string | null;
  surfaceKey: string | null;
  isDefault: boolean;
  precoAdicional: string | null;
  material: Material | null;
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

function promocaoAtiva(produto: Pick<Produto, "precoPromocional" | "promocaoAtivaAte">) {
  if (!produto.precoPromocional || Number(produto.precoPromocional) <= 0) return false;
  if (!produto.promocaoAtivaAte) return false;
  return new Date(produto.promocaoAtivaAte).getTime() >= Date.now();
}

function descontoPercentual(precoBase: string | null, precoPromocional: string | null) {
  const base = Number(precoBase);
  const promo = Number(precoPromocional);
  if (!(base > 0) || !(promo > 0) || promo >= base) return null;
  return Math.round((1 - promo / base) * 100);
}

const EMPTY_FORM = {
  nome: "",
  descricao: "",
  categoria: "__none__",
  subcategoria: "",
  fornecedor: "",
  precoBase: "",
  promocaoAtiva: false,
  precoPromocional: "",
  promocaoAtivaAte: "",
  unidade: "un",
  publicarMarketplace: false,
};

// ── Main Component ─────────────────────────────────────────────────────────
export default function Catalogo() {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  // ── List state
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const [categoria, setCategoria] = useState("__all__");
  const { data: categoriasProduto = [] } = useListCategoriasProduto(tenantId, {
    query: {
      queryKey: getListCategoriasProdutoQueryKey(tenantId),
      enabled: !!tenantId,
      staleTime: 300_000,
    },
  });
  const categoriasOrdenadas = ordenarArvoreCategorias(categoriasProduto);

  // ── Dialog state
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Produto | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);

  // ── Product material options
  const [materials, setMaterials] = useState<Material[]>([]);
  const [productMaterials, setProductMaterials] = useState<ProdutoMaterial[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [materialGroup, setMaterialGroup] = useState("Revestimento");
  const [surfaceKey, setSurfaceKey] = useState("");
  const [materialPriceDelta, setMaterialPriceDelta] = useState("");
  const [materialDefault, setMaterialDefault] = useState(true);
  const [linkingMaterial, setLinkingMaterial] = useState(false);

  const modelSurfaces = editing?.especificacoes?.modelSurfaces ?? [];

  // ── Image upload state
  const [files, setFiles]                   = useState<File[]>([]);
  const [previews, setPreviews]             = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200", scope: catalogScope });
    if (busca)                    params.set("busca", busca);
    if (categoria !== "__all__")  params.set("categoria", categoria);
    const res = await fetch(`/api/arch/catalogo?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setProdutos(await res.json());
    setLoading(false);
  }, [busca, categoria, catalogScope]);

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
  function resetMaterialLinkState() {
    setMaterials([]);
    setProductMaterials([]);
    setMaterialId("");
    setMaterialGroup("Revestimento");
    setSurfaceKey("");
    setMaterialPriceDelta("");
    setMaterialDefault(true);
  }

  async function loadProductMaterials(productId: string) {
    const headers = { Authorization: `Bearer ${getToken()}` };
    const [materialsRes, linkedRes] = await Promise.all([
      fetch("/api/arch/materials?limit=200", { headers }),
      fetch(`/api/arch/catalogo/${productId}/materials`, { headers }),
    ]);
    if (materialsRes.ok) setMaterials(await materialsRes.json());
    if (linkedRes.ok) setProductMaterials(await linkedRes.json());
  }

  async function linkMaterial() {
    if (!editing || !materialId) return;
    setLinkingMaterial(true);
    try {
      const res = await fetch(`/api/arch/catalogo/${editing.id}/materials`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          materialId,
          grupo: materialGroup || undefined,
          surfaceKey: surfaceKey.trim() || undefined,
          precoAdicional: materialPriceDelta ? Number(materialPriceDelta) : undefined,
          isDefault: materialDefault,
        }),
      });
      if (!res.ok) throw new Error("Não foi possível vincular o material ao produto.");
      await loadProductMaterials(editing.id);
      setMaterialId("");
      setSurfaceKey("");
      setMaterialPriceDelta("");
      setMaterialDefault(true);
      toast({ title: "Material disponível adicionado ao produto." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLinkingMaterial(false);
    }
  }

  async function unlinkMaterial(linkId: string) {
    if (!editing) return;
    const res = await fetch(`/api/arch/catalogo/${editing.id}/materials/${linkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      await loadProductMaterials(editing.id);
      toast({ title: "Material removido do produto." });
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFiles([]);
    setPreviews([]);
    resetMaterialLinkState();
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
      promocaoAtiva:      promocaoAtiva(p),
      precoPromocional:   p.precoPromocional ?? "",
      promocaoAtivaAte:   p.promocaoAtivaAte ? new Date(p.promocaoAtivaAte).toISOString().slice(0, 10) : "",
      unidade:            p.unidade ?? "un",
      publicarMarketplace: false,
    });
    setFiles([]);
    setPreviews([]);
    resetMaterialLinkState();
    setOpen(true);
    void loadProductMaterials(p.id);
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
        const res = await fetch(`/api/arch/catalogo/${editing.id}`, {
          method: "PATCH",
          headers: authH(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao atualizar produto.");
        produto = await res.json();
      } else {
        const res = await fetch(`/api/arch/catalogo`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao criar produto.");
        produto = await res.json();
      }

      // Promoção fica separada do preço base e usa a API comercial central.
      if (form.promocaoAtiva) {
        const base = Number(form.precoBase);
        const promo = Number(form.precoPromocional);
        if (!(promo > 0) || !(base > 0) || promo >= base) {
          throw new Error("O preço promocional deve ser maior que zero e menor que o preço base.");
        }
        if (!form.promocaoAtivaAte) {
          throw new Error("Informe a data final da promoção.");
        }
        const promoRes = await fetch(`/api/produtos-catalogo/${produto.id}/promocao`, {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({
            precoPromocional: promo,
            ativaAte: new Date(`${form.promocaoAtivaAte}T23:59:59`).toISOString(),
          }),
        });
        if (!promoRes.ok) {
          const payload = await promoRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao salvar a promoção.");
        }
      } else if (editing?.precoPromocional) {
        const promoRes = await fetch(`/api/produtos-catalogo/${produto.id}/promocao`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!promoRes.ok) {
          const payload = await promoRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao remover a promoção.");
        }
      }

      // Upload images if any
      if (files.length > 0) {
        setUploadingImages(true);
        const fd = new FormData();
        files.forEach(f => fd.append("imagens", f));
        const imgRes = await fetch(`/api/arch/catalogo/${produto.id}/imagens`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        if (!imgRes.ok) toast({ title: "Aviso", description: "Produto salvo mas falha no upload das imagens.", variant: "destructive" });
        setUploadingImages(false);
      }

      // Publish to marketplace if toggled
      if (form.publicarMarketplace && !editing) {
        await fetch(`/api/arch/marketplace`, {
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
    const res = await fetch(`/api/arch/catalogo/${id}`, {
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
    <div className="arqdor-reference-ui max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca de Projeto</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo integrado do ecossistema Arqdor: seus produtos e os catálogos ativos dos demais clientes Arqdor, sem duplicar produtos.</p>
        </div>
        <Button onClick={() => window.location.assign("/catalogo")}>
          <Plus className="h-4 w-4 mr-2" /> Cadastrar no Catálogo
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
        <Select value={catalogScope} onValueChange={(v) => setCatalogScope(v as "ecosystem" | "tenant")}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Origem do catálogo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ecosystem">Todos os catálogos Arqdor</SelectItem>
            <SelectItem value="tenant">Meu catálogo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as categorias</SelectItem>
            {categoriasOrdenadas.map(({ categoria: c, profundidade }) => (
              <SelectItem key={c.id} value={c.nome}>
                {"　".repeat(profundidade)}{profundidade > 0 ? "↳ " : ""}{c.nome}
              </SelectItem>
            ))}
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
          <p className="text-xs text-muted-foreground mt-1">Adicione mobiliário, iluminação, objetos e demais produtos usados nos projetos.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.assign("/catalogo")}>
            <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {produtos.map(p => {
            const thumb = p.imagens?.[0];
            const isPromo = promocaoAtiva(p);
            const desconto = isPromo ? descontoPercentual(p.precoBase, p.precoPromocional) : null;
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
                  {isPromo && (
                    <Badge className="absolute top-2 left-2 bg-red-600 text-white border-0 shadow-sm">
                      {desconto ? `PROMOÇÃO · ${desconto}% OFF` : "PROMOÇÃO"}
                    </Badge>
                  )}
                  {/* Hover actions: catálogo de outro tenant é somente leitura */}
                  {(p.canEdit ?? p.ownedByTenant ?? true) && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon" variant="secondary" className="h-7 w-7"
                      onClick={() => window.location.assign("/catalogo")}
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
                  )}
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <p className="font-medium text-sm leading-tight truncate">{p.nome}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.sourceTenantName && !p.ownedByTenant && (
                      <Badge variant="outline" className="text-xs">{p.sourceTenantName}</Badge>
                    )}
                    {p.marketplaceAvailable && !p.ownedByTenant && (
                      <Badge variant="secondary" className="text-xs">Disponível no Arqdor</Badge>
                    )}
                    {p.categoria && (
                      <Badge variant="secondary" className="text-xs">{p.categoria}</Badge>
                    )}
                  </div>
                  {p.fornecedor && (
                    <p className="text-xs text-muted-foreground truncate">{p.fornecedor}</p>
                  )}
                  {p.precoBase && Number(p.precoBase) > 0 && (
                    isPromo ? (
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground line-through">{fmt(Number(p.precoBase))}</span>
                        <span className="text-sm font-semibold text-red-600">{fmt(Number(p.precoPromocional))}</span>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-green-700">{fmt(Number(p.precoBase))}</p>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Adicionar / Editar Produto ────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    {categoriasOrdenadas.map(({ categoria: c, profundidade }) => (
                      <SelectItem key={c.id} value={c.nome}>
                        {"　".repeat(profundidade)}{profundidade > 0 ? "↳ " : ""}{c.nome}
                      </SelectItem>
                    ))}
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

            {/* Promoção */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Promoção</p>
                  <p className="text-xs text-muted-foreground">Mostra o preço promocional sobre o produto enquanto a oferta estiver vigente.</p>
                </div>
                <Switch
                  checked={form.promocaoAtiva}
                  onCheckedChange={v => setForm(f => ({ ...f, promocaoAtiva: v }))}
                />
              </div>
              {form.promocaoAtiva && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Preço promocional (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={form.precoPromocional}
                      onChange={e => setForm(f => ({ ...f, precoPromocional: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Válida até</Label>
                    <Input
                      type="date"
                      value={form.promocaoAtivaAte}
                      onChange={e => setForm(f => ({ ...f, promocaoAtivaAte: e.target.value }))}
                    />
                  </div>
                  {Number(form.precoBase) > 0 && Number(form.precoPromocional) > 0 && Number(form.precoPromocional) < Number(form.precoBase) && (
                    <div className="col-span-2 rounded-md bg-muted px-3 py-2 text-xs">
                      Oferta: <span className="font-semibold">{fmt(Number(form.precoPromocional))}</span>
                      <span className="ml-2 text-muted-foreground line-through">{fmt(Number(form.precoBase))}</span>
                      <Badge variant="secondary" className="ml-2">
                        {descontoPercentual(form.precoBase, form.precoPromocional)}% OFF
                      </Badge>
                    </div>
                  )}
                </div>
              )}
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

            {editing && (
              <div className="rounded-lg border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Materiais e acabamentos disponíveis</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Vincule materiais da Biblioteca sem duplicar texturas. Ex.: Estofado Asti → tecidos permitidos.
                  </p>
                </div>

                {editing?.especificacoes?.model3dUrl && (
                  <div className="rounded-md border bg-muted/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium">Partes editáveis do modelo 3D</p>
                        <p className="text-[11px] text-muted-foreground">
                          {modelSurfaces.length > 0
                            ? `${modelSurfaces.length} superfície(s) detectada(s) automaticamente no GLB.`
                            : "As partes serão identificadas automaticamente quando este modelo for carregado no 3D."}
                        </p>
                      </div>
                      {modelSurfaces.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">GLB analisado</Badge>
                      )}
                    </div>
                    {modelSurfaces.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {modelSurfaces.map(surface => (
                          <Badge key={surface.key} variant="outline" className="text-[10px]">
                            {surface.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {productMaterials.length > 0 && (
                  <div className="space-y-2">
                    {productMaterials.map(link => (
                      <div key={link.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {link.material?.nome ?? "Material"}{link.material?.fabricante ? ` · ${link.material.fabricante}` : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {link.grupo ?? "Material"}{link.surfaceKey ? ` · superfície: ${link.surfaceKey}` : " · produto inteiro"}
                            {link.isDefault ? " · padrão" : ""}
                            {link.precoAdicional && Number(link.precoAdicional) > 0 ? ` · + ${fmt(Number(link.precoAdicional))}` : ""}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void unlinkMaterial(link.id)}>
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Adicionar material da biblioteca</Label>
                    <Select value={materialId} onValueChange={setMaterialId}>
                      <SelectTrigger><SelectValue placeholder="Selecione o material" /></SelectTrigger>
                      <SelectContent>
                        {materials.map(material => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.fabricante} · {material.linha} · {material.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Grupo / parte do produto</Label>
                    <Input value={materialGroup} onChange={e => setMaterialGroup(e.target.value)} placeholder="Ex: Tecido, Pés, Estrutura" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Superfície 3D</Label>
                    {modelSurfaces.length > 0 ? (
                      <Select value={surfaceKey || "__all__"} onValueChange={value => setSurfaceKey(value === "__all__" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Selecione a parte do GLB" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Produto inteiro</SelectItem>
                          {modelSurfaces.map(surface => (
                            <SelectItem key={surface.key} value={surface.key}>
                              {surface.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={surfaceKey} onChange={e => setSurfaceKey(e.target.value)} placeholder="Será detectada automaticamente no 3D" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Acréscimo de preço (R$)</Label>
                    <Input type="number" min="0" step="0.01" value={materialPriceDelta} onChange={e => setMaterialPriceDelta(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Uso inicial no 3D</Label>
                    <div className="flex h-10 items-center justify-between rounded-md border px-3">
                      <span className="text-xs text-muted-foreground">Material padrão</span>
                      <Switch checked={materialDefault} onCheckedChange={setMaterialDefault} />
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button type="button" variant="outline" onClick={() => void linkMaterial()} disabled={!materialId || linkingMaterial}>
                      {linkingMaterial ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Vinculando…</> : "Adicionar material"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

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
