import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function CompleteBudgetPrint({ id, open, onOpenChange }: {
  id: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !id) return;
    const controller = new AbortController();
    setLoading(true);
    setReady(false);
    setHtml("");
    setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/propostas/${encodeURIComponent(id)}/print-document`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` },
          credentials: "include",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok) throw new Error("Não foi possível preparar o orçamento completo.");
        const body = await response.json();
        if (typeof body.html !== "string" || !body.html.trim()) throw new Error("Documento indisponível.");
        if (!controller.signal.aborted) setHtml(body.html);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha ao carregar documento.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id, open, attempt]);

  function printDocument() {
    const target = frameRef.current?.contentWindow;
    if (!ready || !target) return;
    target.focus();
    target.print();
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/propostas/${encodeURIComponent(id)}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` },
        credentials: "include",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error("O gerador de PDF está indisponível. Use Imprimir e selecione Salvar como PDF.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Orcamento_${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      toast({ title: "Não foi possível baixar o PDF", description: cause instanceof Error ? cause.message : "Use Imprimir e selecione Salvar como PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[96vw] !max-w-[1400px] h-[94vh] flex flex-col gap-3 overflow-hidden">
        <DialogHeader><DialogTitle>Orçamento completo · impressão e PDF</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={printDocument} disabled={!ready}><Printer className="mr-2 h-4 w-4" />Imprimir / Salvar como PDF</Button>
          <Button variant="outline" onClick={() => void downloadPdf()} disabled={!ready || downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Baixar PDF completo
          </Button>
          <span className="text-xs text-muted-foreground">Inclui os dados e o cronograma salvos no orçamento.</span>
        </div>
        {loading && <div role="status" className="flex flex-1 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Preparando documento completo…</div>}
        {error && <div role="alert" className="space-y-3"><p>{error}</p><Button onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button></div>}
        {html && <iframe ref={frameRef} title="Orçamento completo para impressão" srcDoc={html}
          sandbox="allow-same-origin allow-modals" className="min-h-0 w-full flex-1 rounded border bg-white"
          onLoad={() => setReady(true)} />}
      </DialogContent>
    </Dialog>
  );
}
