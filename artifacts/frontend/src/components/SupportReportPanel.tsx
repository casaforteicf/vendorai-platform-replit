import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2, FileText, Printer, Send, MessageSquarePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type SupportReportDraft = {
  problemaRelatado: string;
  diagnostico: string;
  servicoExecutado: string;
  materiaisUtilizados: string[];
  situacaoFinal: "resolvido" | "parcial" | "nao_resolvido" | "aguardando_peca" | "aguardando_retorno";
  clienteAcompanhou: boolean | null;
  recomendacoes: string;
  observacoes: string;
};

export function SupportReportPanel({ card, token, onChanged }: {
  card: { id: string; pipeline: string; etapa: string; metadata?: Record<string, unknown> | null };
  token: string;
  onChanged?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const existing = (card.metadata?.supportReportDraft ?? card.metadata?.supportReport) as SupportReportDraft | undefined;
  const confirmed = Boolean(card.metadata?.supportReportConfirmed);
  const [draft, setDraft] = useState<SupportReportDraft | null>(existing ?? null);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [orderVisibility, setOrderVisibility] = useState<"interno" | "cliente">("interno");
  const [orderKind, setOrderKind] = useState("atualizacao");

  useEffect(() => {
    const next = (card.metadata?.supportReportDraft ?? card.metadata?.supportReport) as SupportReportDraft | undefined;
    setDraft(next ?? null);
  }, [card.id, card.metadata]);

  if (card.pipeline !== "suporte") return null;

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/work-cards/${card.id}/support-report/draft`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha ao gerar relatório");
      setDraft(body.draft);
      toast({ title: "Rascunho do relatório gerado pela IA", description: "Revise antes de confirmar." });
      await onChanged?.();
    } catch (error) {
      toast({ title: "Não foi possível gerar o relatório", description: String(error), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function confirm() {
    if (!draft || !draft.problemaRelatado.trim()) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/work-cards/${card.id}/support-report/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha ao confirmar relatório");
      toast({
        title: "Relatório confirmado",
        description: body.feedbackRequested
          ? "O cliente recebeu a solicitação de feedback e o chamado avançou para Feedback Cliente."
          : "A assistência ainda não foi marcada como resolvida; o card voltou para Execução da Assistência para continuidade.",
      });
      await onChanged?.();
    } catch (error) {
      toast({ title: "Erro ao confirmar relatório", description: String(error), variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }


  async function addOrderUpdate() {
    if (!orderText.trim()) return;
    setUpdatingOrder(true);
    try {
      const res = await fetch(`/api/work-cards/${card.id}/support-order/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: orderText.trim(), visibility: orderVisibility, kind: orderKind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha ao registrar atualização");
      setOrderText("");
      toast({
        title: orderVisibility === "cliente" ? "Atualização registrada e enviada ao cliente" : "Atualização interna registrada",
      });
      await onChanged?.();
    } catch (error) {
      toast({ title: "Não foi possível registrar a atualização", description: String(error), variant: "destructive" });
    } finally {
      setUpdatingOrder(false);
    }
  }

  async function openPrintableOrder() {
    try {
      const res = await fetch(`/api/work-cards/${card.id}/support-order/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Falha ao gerar a Ordem de Serviço");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({ title: "Não foi possível abrir a Ordem de Serviço", description: String(error), variant: "destructive" });
    }
  }

  async function finalizeOrder() {
    if (!draft || !draft.problemaRelatado.trim()) {
      toast({ title: "Gere ou preencha o relatório antes de finalizar", variant: "destructive" });
      return;
    }
    setFinalizing(true);
    try {
      const res = await fetch(`/api/work-cards/${card.id}/support-order/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha ao finalizar a assistência");
      toast({
        title: "Assistência finalizada",
        description: "A OS final foi gerada, anexada ao cliente e compartilhada com cliente e responsável.",
      });
      await onChanged?.();
    } catch (error) {
      toast({ title: "Não foi possível finalizar a assistência", description: String(error), variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  }

  const workOrder = card.metadata?.supportWorkOrder as {
    status?: string;
    timeline?: Array<{ at?: string; userName?: string; text?: string; visibility?: string; kind?: string }>;
  } | undefined;
  const orderFinalized = Boolean(card.metadata?.supportOrderFinalizedAt) || workOrder?.status === "finalizada";
  const timeline = Array.isArray(workOrder?.timeline) ? workOrder!.timeline! : [];

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Ordem de Serviço digital</p>
          <p className="text-xs text-muted-foreground">Documento vivo: acompanhe a execução, registre evidências e gere a versão de impressão a qualquer momento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orderFinalized ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Finalizada</Badge> : <Badge variant="outline">Em andamento</Badge>}
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => void openPrintableOrder()}>
            <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      {!orderFinalized && (
        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            <p className="text-sm font-semibold">Registrar andamento</p>
          </div>
          <Textarea
            rows={3}
            value={orderText}
            onChange={(event) => setOrderText(event.target.value)}
            placeholder="Descreva o que foi executado, situação encontrada, orientação, pendência, material necessário..."
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={orderKind} onValueChange={setOrderKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="atualizacao">Atualização</SelectItem>
                <SelectItem value="execucao">Execução realizada</SelectItem>
                <SelectItem value="pendencia">Pendência</SelectItem>
                <SelectItem value="material">Material / peça</SelectItem>
                <SelectItem value="observacao">Observação</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orderVisibility} onValueChange={(value) => setOrderVisibility(value as "interno" | "cliente")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="interno">Somente empresa</SelectItem>
                <SelectItem value="cliente">Compartilhar com cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" className="gap-2" disabled={updatingOrder || !orderText.trim()} onClick={() => void addOrderUpdate()}>
            {updatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Registrar atualização
          </Button>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Acompanhamento</p>
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border p-2">
            {[...timeline].reverse().map((entry, index) => (
              <div key={`${entry.at || index}-${index}`} className="rounded-md bg-muted/30 p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{entry.userName || "Equipe"} · {entry.kind?.replaceAll("_", " ") || "atualização"}</span>
                  <span>{entry.at ? new Date(entry.at).toLocaleString("pt-BR") : ""}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{entry.text}</p>
                <Badge variant="outline" className="mt-2">{entry.visibility === "cliente" ? "Cliente acompanha" : "Interno"}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {!draft ? (
        <Button variant="outline" className="gap-2" disabled={generating} onClick={() => void generate()}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Gerar relatório com IA
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1"><label className="text-xs font-medium">Problema relatado</label><Textarea rows={3} value={draft.problemaRelatado} disabled={confirmed} onChange={(e) => setDraft({ ...draft, problemaRelatado: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-xs font-medium">Diagnóstico</label><Textarea rows={3} value={draft.diagnostico} disabled={confirmed} onChange={(e) => setDraft({ ...draft, diagnostico: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-xs font-medium">Serviço executado</label><Textarea rows={3} value={draft.servicoExecutado} disabled={confirmed} onChange={(e) => setDraft({ ...draft, servicoExecutado: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-xs font-medium">Materiais utilizados</label><Input value={draft.materiaisUtilizados.join(", ")} disabled={confirmed} onChange={(e) => setDraft({ ...draft, materiaisUtilizados: e.target.value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean) })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><label className="text-xs font-medium">Situação final</label><Select disabled={confirmed} value={draft.situacaoFinal} onValueChange={(v) => setDraft({ ...draft, situacaoFinal: v as SupportReportDraft["situacaoFinal"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="resolvido">Resolvido</SelectItem><SelectItem value="parcial">Parcial</SelectItem><SelectItem value="nao_resolvido">Não resolvido</SelectItem><SelectItem value="aguardando_peca">Aguardando peça</SelectItem><SelectItem value="aguardando_retorno">Aguardando retorno</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Cliente acompanhou</label><Select disabled={confirmed} value={draft.clienteAcompanhou === null ? "nao_informado" : draft.clienteAcompanhou ? "sim" : "nao"} onValueChange={(v) => setDraft({ ...draft, clienteAcompanhou: v === "nao_informado" ? null : v === "sim" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao_informado">Não informado</SelectItem><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-1"><label className="text-xs font-medium">Recomendações</label><Textarea rows={2} value={draft.recomendacoes} disabled={confirmed} onChange={(e) => setDraft({ ...draft, recomendacoes: e.target.value })} /></div>
          <div className="space-y-1"><label className="text-xs font-medium">Observações</label><Textarea rows={2} value={draft.observacoes} disabled={confirmed} onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })} /></div>
          {!orderFinalized && (
            <div className="flex flex-wrap gap-2">
              {!confirmed && <Button variant="outline" disabled={generating} onClick={() => void generate()}>{generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar novamente</Button>}
              <Button className="gap-2" disabled={finalizing} onClick={() => void finalizeOrder()}>
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Finalizar assistência e enviar OS
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
