import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  useListLeadProposals,
  useListLeadProducts,
  useGenerateLeadProposal,
  useCreateLeadProduct,
  useDeleteLeadProduct,
} from "@workspace/api-client-react";

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

  // Lead editable fields
  const [mercadoSegmento, setMercadoSegmento] = useState(lead?.mercadoSegmento ?? "");
  const [logoUrl, setLogoUrl] = useState(lead?.logoUrl ?? "");
  const [corDestaque, setCorDestaque] = useState(lead?.corDestaque ?? "#A78BFA");
  const [corSecundaria, setCorSecundaria] = useState(lead?.corSecundaria ?? "");
  const [savingLead, setSavingLead] = useState(false);

  // Product form
  const [newProductNome, setNewProductNome] = useState("");
  const [newProductImagem, setNewProductImagem] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // React Query hooks
  const {
    data: proposals = [],
    isLoading: loadingProposals,
  } = useListLeadProposals(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

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
    setCorDestaque(lead?.corDestaque ?? "#A78BFA");
    setCorSecundaria(lead?.corSecundaria ?? "");
  }, [lead]);

  async function saveLeadFields() {
    if (!leadId || !token) return;
    setSavingLead(true);
    try {
      const res = await fetch(api(`/leads/${leadId}`), {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          mercadoSegmento: mercadoSegmento || null,
          logoUrl: logoUrl || null,
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
          corDestaque: corDestaque || undefined,
          corSecundaria: corSecundaria || undefined,
        },
      });
      toast({ title: `Proposta v${created.version} gerada com sucesso` });
      queryClient.invalidateQueries({ queryKey: ["listLeadProposals", leadId] });
      setActiveVersion(created.version);
      // Auto preview
      await previewProposal(created.version);
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
      const res = await fetch(api(`/leads/${leadId}/proposals/${version}`), {
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

  function downloadProposal(version: number, format: "html" | "pdf" = "html") {
    if (!leadId || !token) return;
    const url = api(`/leads/${leadId}/proposals/${version}/${format === "pdf" ? "pdf" : "download"}`);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Falha no download");
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        a.href = blobUrl;
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
              <label className="text-xs text-muted-foreground">URL do Logo do Cliente</label>
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm"
              />
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
                          <img src={p.imagemUrl} alt="" className="h-6 w-6 rounded object-cover" />
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
                sandbox="allow-same-origin"
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
