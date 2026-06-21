import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Eye,
  Sparkles,
  Send,
  AlertTriangle,
  Globe,
  Package,
} from "lucide-react";
import {
  useListProductPresentations,
  useGenerateProductPresentation,
  useSendProductPresentation,
} from "@workspace/api-client-react";
import {
  getListProductPresentationsQueryKey,
  getGetProductPresentationQueryKey,
} from "@workspace/api-client-react";

interface LeadProductPresentationTabProps {
  leadId: string;
  tenantId: string;
  lead: any;
}

const BASE = typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/$/, "")
  : "";

export default function LeadProductPresentationTab({ leadId, tenantId, lead }: LeadProductPresentationTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("vendorai_token") ?? "";

  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSources, setPreviewSources] = useState<{ url: string; title: string; snippet: string }[] | null>(null);
  const [productName, setProductName] = useState("");
  const [sending, setSending] = useState(false);

  const {
    data: presentations = [],
    isLoading: loadingPresentations,
  } = useListProductPresentations(leadId, { request: { headers: { Authorization: `Bearer ${token}` } } });

  const generateMutation = useGenerateProductPresentation({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const sendMutation = useSendProductPresentation({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  async function generate() {
    if (!productName.trim()) {
      toast({ title: "Informe o nome do produto", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const created = await generateMutation.mutateAsync({
        leadId,
        data: {
          productName: productName.trim(),
          corDestaque: lead?.corDestaque || undefined,
          logoUrl: lead?.logoUrl || undefined,
        },
      });
      toast({ title: "Apresentação gerada!" });
      queryClient.invalidateQueries({ queryKey: getListProductPresentationsQueryKey(leadId) });
      // Auto-open preview
      setPreviewHtml(created.htmlContent);
      setPreviewSources((created.webSources || []).filter((s: any): s is { url: string; title: string; snippet: string } => !!s.url));
      setPreviewOpen(true);
      setProductName("");
    } catch (e: any) {
      toast({
        title: "Erro ao gerar",
        description: e?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function sendPresentation(presentationId: string) {
    setSending(true);
    try {
      await sendMutation.mutateAsync({ presentationId });
      toast({ title: "Apresentação enviada!" });
      queryClient.invalidateQueries({ queryKey: getListProductPresentationsQueryKey(leadId) });
      queryClient.invalidateQueries({ queryKey: getGetProductPresentationQueryKey(presentationId) });
    } catch (e: any) {
      toast({
        title: "Erro ao enviar",
        description: e?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  function openPreview(p: any) {
    setPreviewHtml(p.htmlContent);
    setPreviewSources((p.webSources || []).filter((s: any) => !!s.url));
    setPreviewOpen(true);
  }

  return (
    <Card data-testid="card-product-presentations">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Apresentações de Produto
            {presentations.length > 0 && (
              <Badge variant="outline" className="text-xs ml-1">{presentations.length}</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Generate form */}
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Nome do produto..."
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="flex-1"
            disabled={generating}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
          />
          <Button
            size="sm"
            onClick={generate}
            disabled={generating || !productName.trim()}
            className="gap-1"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Gerar
          </Button>
        </div>

        {loadingPresentations ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : !presentations.length ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma apresentação de produto gerada.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...presentations]
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {p.productName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-4 px-1 ${
                            p.status === "sent"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-amber-50 text-amber-600 border-amber-200"
                          }`}
                        >
                          {p.status === "sent" ? "Enviado" : "Rascunho"}
                        </Badge>
                        {p.webSources && p.webSources.length > 0 && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
                            <Globe className="h-2.5 w-2.5" />
                            {p.webSources.length} fonte{p.webSources.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openPreview(p)}
                      title="Visualizar"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {p.status !== "sent" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-emerald-600"
                        onClick={() => sendPresentation(p.id)}
                        disabled={sending}
                        title="Enviar"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Pré-visualização da Apresentação
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {previewSources && previewSources.length > 0 && (
              <div className="px-6 py-2 bg-amber-50 border-y border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                <strong>Fontes da pesquisa web:</strong>{" "}
                {previewSources.map((s, i) => (
                  <span key={i}>
                    <a href={s.url} target="_blank" rel="noopener" className="underline text-amber-700">
                      {s.title || s.url}
                    </a>
                    {i < previewSources.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-auto">
              {previewHtml && (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                  title="Preview"
                />
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
