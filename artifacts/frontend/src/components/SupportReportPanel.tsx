import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";
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
      toast({ title: "Relatório confirmado", description: "O cliente recebeu a solicitação de feedback e o chamado avançou para Feedback Cliente." });
      await onChanged?.();
    } catch (error) {
      toast({ title: "Erro ao confirmar relatório", description: String(error), variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Relatório da assistência</p>
          <p className="text-xs text-muted-foreground">A IA usa relato, timeline, transcrições e anexos. O técnico/responsável confirma antes do feedback ao cliente.</p>
        </div>
        {confirmed ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Confirmado</Badge> : null}
      </div>

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
          {!confirmed && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={confirming} onClick={() => void confirm()}>{confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar relatório e pedir feedback</Button>
              <Button variant="outline" disabled={generating} onClick={() => void generate()}>{generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar novamente</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
