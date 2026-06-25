import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  X,
  Loader2,
  Download,
  Eye,
  Sparkles,
  Palette,
  Image,
  Trash2,
  ChevronDown,
  ChevronUp,
  Package,
  Upload,
  Globe,
  ImagePlus,
  Receipt,
  ExternalLink,
  Clock,
  MessageCircle,
} from "lucide-react";
import {
  useListLeadProposals,
  useListLeadProducts,
  useGenerateLeadProposal,
  useCreateLeadProduct,
  useDeleteLeadProduct,
  useRequestUploadUrl,
  useListPropostas,
  useUpdatePropostaStatus,
} from "@workspace/api-client-react";
import type { Proposta } from "@workspace/api-client-react";

interface LeadPropostaTabProps {
  leadId: string;
  tenantId: string;
  lead: any;
}

const BASE = typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/$/, "")
  : "";

function api(path: string) {
  return `${BASE}${path}`;
}

export default function LeadPropostaTab({ leadId, tenantId, lead }: LeadPropostaTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("vendorai_token") ?? "";

  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [selectedOrcamentoId, setSelectedOrcamentoId] = useState<string>("__none__");

  // Lead editable fields
  const [mercadoSegmento, setMercadoSegmento] = useState(lead?.mercadoSegmento ?? "");
  const [logoUrl, setLogoUrl] = useState(lead?.logoUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(lead?.websiteUrl ?? "");
  const [corDestaque, setCorDestaque] = useState(lead?.corDestaque ?? "#A78BFA");
  const [corSecundaria, setCorSecundaria] = useState(lead?.corSecundaria ?? "");
  const [savingLead, setSavingLead] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const requestUploadUrl = useRequestUploadUrl();

  // Imagens da proposta
  const [proposalImages, setProposalImages] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Product form
  const [newProductNome, setNewProductNome] = useState("");
  const [newProductImagem, setNewProductImagem] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const [changingLabel, setChangingLabel] = useState<string | null>(null);
  const updatePropostaStatus = useUpdatePropostaStatus({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const ORCAMENTO_LABELS = [
    { value: "em_analise", label: "Em Análise", color: "bg-blue-50 text-blue-700 border-blue-200",   targetStatus: "enviada" },
    { value: "aprovado",   label: "Aprovado",   color: "bg-green-50 text-green-700 border-green-200", targetStatus: "aceita" },
    { value: "descartado", label: "Descartado", color: "bg-red-50 text-red-600 border-red-200",       targetStatus: "rejeitada" },
    { value: "finalizado", label: "Finalizado", color: "bg-gray-100 text-gray-600 border-gray-200",   targetStatus: "expirada" },
  ] as const;
  type OrcLabel = (typeof ORCAMENTO_LABELS)[number]["value"];

  function getOrcLabel(status: string): OrcLabel {
    if (status === "aceita")    return "aprovado";
    if (status === "rejeitada") return "descartado";
    if (status === "expirada")  return "finalizado";
    return "em_analise";
  }

  function isTerminalStatus(status: string) {
    return status === "aceita" || status === "rejeitada" || status === "expirada";
  }

  async function handleChangeLabel(orcId: string, currentStatus: string, newLabel: string) {
    const cfg = ORCAMENTO_LABELS.find(l => l.value === newLabel);
    if (!cfg || getOrcLabel(currentStatus) === newLabel) return;
    setChangingLabel(orcId);
    try {
      await updatePropostaStatus.mutateAsync({ id: orcId, data: { status: cfg.targetStatus } });
      queryClient.invalidateQueries({ queryKey: ["listPropostas", tenantId] });
      toast({ title: `Orçamento marcado como "${cfg.label}"` });
    } catch (e: any) {
      toast({ title: "Não foi possível alterar etiqueta", description: e?.error || e?.message, variant: "destructive" });
    } finally {
      setChangingLabel(null);
    }
  }

  async function downloadOrcamentoPdf(orcId: string, titulo: string) {
    try {
      const res = await fetch(`/api/propostas/${orcId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Orcamento_${orcId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao gerar PDF", variant: "destructive" });
    }
  }

  // React Query hooks
  const {
    data: proposals = [],
    isLoading: loadingProposals,
  } = useListLeadProposals(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const {
    data: orcamentos = [],
    isLoading: loadingOrcamentos,
  } = useListPropostas(tenantId, { leadId }, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const {
    data: products = [],
    isLoading: loadingProducts,
  } = useListLeadProducts(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const generateMutation = useGenerateLeadProposal({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const createProductMutation = useCreateLeadProduct({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const deleteProductMutation = useDeleteLeadProduct({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  useEffect(() => {
    // Sync lead fields when lead prop changes
    setMercadoSegmento(lead?.mercadoSegmento ?? "");
    setLogoUrl(lead?.logoUrl ?? "");
    setWebsiteUrl(lead?.websiteUrl ?? "");
    setCorDestaque(lead?.corDestaque ?? "#A78BFA");
    setCorSecundaria(lead?.corSecundaria ?? "");
  }, [lead]);

  async function uploadImageFile(file: File): Promise<string> {
    const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
      requestUploadUrl.mutate(
        { data: { name: file.name, size: file.size, contentType: file.type || "image/jpeg" } },
        { onSuccess: resolve, onError: reject },
      );
    });
    const uploadRes = await fetch(result.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "image/jpeg" },
    });
    if (!uploadRes.ok) throw new Error("Upload falhou");
    return `/api/storage/public-objects/${result.objectPath}`;
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem (PNG, JPG, SVG...)", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload falhou");
      setLogoUrl(result.objectPath);
      toast({ title: "Logo carregada com sucesso!" });
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleProposalImageUpload(files: FileList) {
    setImageUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: `${file.name} excede 10MB`, variant: "destructive" });
          continue;
        }
        const url = await uploadImageFile(file);
        uploaded.push(url);
      }
      if (uploaded.length) {
        setProposalImages((prev) => [...prev, ...uploaded]);
        toast({ title: `${uploaded.length} imagem(ns) adicionada(s)` });
      }
    } catch {
      toast({ title: "Erro no upload de imagem", variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  }

  async function saveLeadFields() {
    if (!leadId || !token) return;
    setSavingLead(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          mercadoSegmento: mercadoSegmento || null,
          logoUrl: logoUrl || null,
          websiteUrl: websiteUrl || null,
          corDestaque: corDestaque || null,
          corSecundaria: corSecundaria || null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast({ title: "Dados do lead salvos" });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingLead(false);
    }
  }

  async function generateProposal() {
    if (!leadId || !token) return;
    setGenerating(true);
    try {
      const created = await generateMutation.mutateAsync({
        leadId,
        data: {
          segmento: mercadoSegmento || undefined,
          logoUrl: logoUrl || undefined,
          websiteUrl: websiteUrl || undefined,
          corDestaque: corDestaque || undefined,
          corSecundaria: corSecundaria || undefined,
          imagens: proposalImages.length > 0 ? proposalImages : undefined,
          objetivo: lead?.objetivo || undefined,
          propostaId: selectedOrcamentoId !== "__none__" ? selectedOrcamentoId : undefined,
        } as any,
      });
      toast({ title: `Proposta v${created.version} gerada com sucesso` });
      queryClient.invalidateQueries({ queryKey: ["listLeadProposals", leadId] });
      setActiveVersion(created.version);
      // Auto preview — use htmlContent from response directly (avoids extra round-trip)
      if (created.htmlContent) {
        setPreviewHtml(created.htmlContent);
        setPreviewOpen(true);
      } else {
        await previewProposal(created.version);
      }
    } catch (e: any) {
      const msg = e?.error || e?.message || "Erro ao gerar proposta";
      toast({ title: "Erro na geração", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function previewProposal(version: number) {
    if (!leadId || !token) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/proposals/${version}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPreviewHtml(data.htmlContent);
      setActiveVersion(version);
      setPreviewOpen(true);
    } catch {
      /* ignore */
    }
  }

  function openWhatsAppProposal(version: number) {
    const raw = lead?.telefone ?? "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      toast({ title: "Lead sem telefone cadastrado", variant: "destructive" });
      return;
    }
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    const nome = lead?.nome ? ` ${lead.nome.split(" ")[0]}` : "";
    const msg = encodeURIComponent(
      `Olá${nome}! Preparei a proposta v${version} do projeto para você. Posso compartilhar os detalhes e avançarmos juntos?`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener");
  }

  function downloadProposal(version: number, format: "html" | "pdf" = "html") {
    if (!leadId || !token) return;
    const url = `/api/leads/${leadId}/proposals/${version}/${format === "pdf" ? "pdf" : "download"}`;
    const clientName = (lead?.empresa || lead?.nome || "cliente")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "_").toLowerCase();
    const filename = `proposta_${clientName}_v${version}.${format === "pdf" ? "pdf" : "html"}`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Falha no download");
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch((e: any) => {
        toast({ title: "Erro no download", description: e.message, variant: "destructive" });
      });
  }

  async function addProduct() {
    if (!newProductNome.trim() || !leadId || !token) return;
    setAddingProduct(true);
    try {
      await createProductMutation.mutateAsync({
        leadId,
        data: { nome: newProductNome.trim(), imagemUrl: newProductImagem || null },
      });
      toast({ title: "Produto adicionado" });
      setNewProductNome("");
      setNewProductImagem("");
      queryClient.invalidateQueries({ queryKey: ["listLeadProducts", leadId] });
    } catch (e: any) {
      const msg = e?.error || e?.message || "Falha ao adicionar produto";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setAddingProduct(false);
    }
  }


  function formatCurrency(value?: string | null) {
    if (!value) return "—";
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  async function removeProduct(productId: string) {
    if (!leadId || !token) return;
    if (!confirm("Remover este produto?")) return;
    try {
      await deleteProductMutation.mutateAsync({ leadId, productId });
      toast({ title: "Produto removido" });
      queryClient.invalidateQueries({ queryKey: ["listLeadProducts", leadId] });
    } catch (e: any) {
      const msg = e?.error || e?.message || "Falha ao remover";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Dados da Proposta */}
      <Card data-testid="card-proposta-config">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Dados da Proposta
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={saveLeadFields}
              disabled={savingLead}
            >
              {savingLead ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Salvar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Segmento de Mercado</label>
              <Input
                value={mercadoSegmento}
                onChange={(e) => setMercadoSegmento(e.target.value)}
                placeholder="Ex: Varejo, Construção, SaaS..."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Logo do Cliente</label>
              <div className="flex items-center gap-2">
                {logoUrl && (
                  <img
                    src={logoUrl.startsWith("/objects/") ? `/api/storage${logoUrl}` : logoUrl}
                    alt="Logo"
                    className="h-8 w-8 object-contain rounded border bg-white"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://... ou faça upload →"
                  className="h-8 text-sm flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 shrink-0"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                </Button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">URL do Site do Cliente</label>
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.cliente.com.br"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cor Destaque (primária)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corDestaque}
                  onChange={(e) => setCorDestaque(e.target.value)}
                  className="h-8 w-10 rounded border cursor-pointer"
                />
                <Input
                  value={corDestaque}
                  onChange={(e) => setCorDestaque(e.target.value)}
                  placeholder="#A78BFA"
                  className="h-8 text-sm flex-1"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cor Secundária</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corSecundaria || "#ffffff"}
                  onChange={(e) => setCorSecundaria(e.target.value)}
                  className="h-8 w-10 rounded border cursor-pointer"
                />
                <Input
                  value={corSecundaria}
                  onChange={(e) => setCorSecundaria(e.target.value)}
                  placeholder="Opcional"
                  className="h-8 text-sm flex-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Imagens da Proposta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ImagePlus className="h-4 w-4" />
            Imagens da Proposta
            {proposalImages.length > 0 && (
              <Badge variant="outline" className="text-xs ml-1">{proposalImages.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Adicione imagens que aparecerão em uma galeria visual na proposta gerada.
          </p>

          {/* Grid de imagens adicionadas */}
          {proposalImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {proposalImages.map((url, idx) => (
                <div key={idx} className="relative group rounded-lg overflow-hidden border aspect-video bg-muted">
                  <img
                    src={url}
                    alt={`Imagem ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
                  />
                  <button
                    onClick={() => setProposalImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleProposalImageUpload(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-2"
            disabled={imageUploading}
            onClick={() => imageInputRef.current?.click()}
          >
            {imageUploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {imageUploading ? "Enviando..." : "Adicionar imagens"}
          </Button>
        </CardContent>
      </Card>

      {/* Produtos do Cliente */}
      <Card data-testid="card-proposta-produtos">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos do Cliente
              {products.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{products.length}</Badge>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => setShowProducts((s) => !s)}
            >
              {showProducts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showProducts ? "Ocultar" : "Gerenciar"}
            </Button>
          </CardTitle>
        </CardHeader>
        {showProducts && (
          <CardContent className="space-y-3">
            {loadingProducts ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.imagemUrl ? (
                          <img
                            src={p.imagemUrl.startsWith("/objects/") ? `/api/storage${p.imagemUrl}` : p.imagemUrl}
                            alt=""
                            className="h-6 w-6 rounded object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <Image className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm truncate">{p.nome}</span>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeProduct(p.id)}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {products.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum produto cadastrado.</p>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={newProductNome}
                      onChange={(e) => setNewProductNome(e.target.value)}
                      placeholder="Nome do produto"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Input
                    value={newProductImagem}
                    onChange={(e) => setNewProductImagem(e.target.value)}
                    placeholder="URL imagem (opcional)"
                    className="h-8 text-sm flex-1"
                  />
                  <Button size="sm" className="h-8 gap-1" onClick={addProduct} disabled={addingProduct || !newProductNome.trim()}>
                    {addingProduct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Adicionar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Orçamentos vinculados */}
      <Card data-testid="card-orcamentos-lead">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Orçamentos
              {orcamentos.length > 0 && (
                <Badge variant="outline" className="text-xs">{orcamentos.length}</Badge>
              )}
            </span>
            <a href="/propostas" className="text-xs font-normal text-muted-foreground hover:text-foreground underline underline-offset-2">
              + Novo orçamento
            </a>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOrcamentos ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
            </div>
          ) : orcamentos.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              Nenhum orçamento criado para este lead.{" "}
              <a href="/propostas" className="underline underline-offset-2 hover:text-foreground">
                Criar orçamento
              </a>
            </p>
          ) : (
            <div className="space-y-2">
              {orcamentos.map((orc) => {
                const currentLabel = getOrcLabel(orc.status);
                const labelCfg = ORCAMENTO_LABELS.find(l => l.value === currentLabel)!;
                const terminal = isTerminalStatus(orc.status);
                const isChanging = changingLabel === orc.id;
                const expirou = orc.validadeAte && new Date(orc.validadeAte) < new Date();
                return (
                  <div
                    key={orc.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-medium truncate">{orc.titulo}</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="font-semibold text-foreground">{formatCurrency(orc.valorTotal)}</span>
                        {orc.numero && <span className="font-mono">{orc.numero}</span>}
                        {orc.validadeAte && (
                          <span className={`flex items-center gap-1 ${expirou ? "text-orange-500" : ""}`}>
                            <Clock className="h-3 w-3" />
                            {new Date(orc.validadeAte).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {terminal ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${labelCfg.color}`}>
                          {labelCfg.label}
                        </span>
                      ) : (
                        <Select
                          value={currentLabel}
                          onValueChange={(v) => handleChangeLabel(orc.id, orc.status, v)}
                          disabled={isChanging}
                        >
                          <SelectTrigger className={`h-7 text-[10px] w-32 border font-medium focus:ring-0 ${labelCfg.color}`}>
                            {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                          </SelectTrigger>
                          <SelectContent>
                            {ORCAMENTO_LABELS.map(l => (
                              <SelectItem key={l.value} value={l.value} className="text-xs">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${l.color}`}>
                                  {l.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <a href={`/propostas/${orc.id}/print`} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver orçamento">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Baixar PDF"
                        onClick={() => downloadOrcamentoPdf(orc.id, orc.titulo)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Propostas Geradas */}
      <Card data-testid="card-propostas-geradas">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Propostas Geradas
              {proposals.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{proposals.length}</Badge>
              )}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={generateProposal}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {generating ? "Gerando..." : "Gerar Proposta"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Seletor de orçamento a incluir */}
          {orcamentos.length > 0 && (
            <div className="mb-4 space-y-1 pb-4 border-b">
              <label className="text-xs text-muted-foreground font-medium">
                Orçamento a incluir na proposta
              </label>
              <Select
                value={selectedOrcamentoId}
                onValueChange={setSelectedOrcamentoId}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Nenhum orçamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum orçamento</SelectItem>
                  {orcamentos.map((orc) => {
                    const total = orc.valorTotal
                      ? parseFloat(orc.valorTotal as string).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : null;
                    return (
                      <SelectItem key={orc.id} value={orc.id}>
                        {orc.titulo}{total ? ` — ${total}` : ""}
                        {orc.numero ? ` (Nº ${orc.numero})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedOrcamentoId !== "__none__" && (
                <p className="text-xs text-muted-foreground mt-1">
                  O orçamento selecionado será embutido como seção de precificação na proposta gerada.
                </p>
              )}
            </div>
          )}

          {loadingProposals ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !proposals.length ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhuma proposta gerada ainda.
              </p>
              <Button
                size="sm"
                className="gap-1"
                onClick={generateProposal}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Gerar primeira proposta
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...proposals]
                .sort((a, b) => b.version - a.version)
                .map((p) => (
                  <div key={p.id} className="py-3 px-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        v{p.version}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {p.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Visualizar"
                        onClick={() => previewProposal(p.version)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Download HTML"
                        onClick={() => downloadProposal(p.version, "html")}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Download PDF"
                        onClick={() => downloadProposal(p.version, "pdf")}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Avançar no projeto via WhatsApp"
                        onClick={() => openWhatsAppProposal(p.version)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Pré-visualização — Proposta v{activeVersion}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded border overflow-hidden">
            {previewHtml ? (
              <iframe
                title="Preview"
                srcDoc={previewHtml}
                className="w-full h-full"
                sandbox="allow-same-origin allow-scripts"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Carregando...
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => activeVersion && downloadProposal(activeVersion, "html")}
            >
              <Download className="h-3.5 w-3.5" />
              Download HTML
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => activeVersion && downloadProposal(activeVersion, "pdf")}
            >
              <FileText className="h-3.5 w-3.5" />
              Download PDF
            </Button>
            <Button size="sm" onClick={() => setPreviewOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
