import { useEffect, useMemo, useState } from "react";
import { useListPropostas } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Balance = {
  indice: number; nome: string; unidade: string | null;
  etapaId: string | null; faseId: string | null;
  quantidadeOriginal: number; quantidadeEnviada: number; quantidadeDisponivel: number;
};
type Summary = { propostaId: string; status: string; itens: Balance[]; lotes: Array<{id: string}> };
type Stage = { key: string; label: string; ordem?: number };

export function PartialExecutionDialog({ dealId, tenantId }: { dealId: string; tenantId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: propostas = [] } = useListPropostas(tenantId, undefined, {
    request: { headers: { Authorization: "Bearer " + (token ?? "") } },
    query: { enabled: Boolean(tenantId && token) },
  });
  const accepted = useMemo(() => propostas.filter(p => p.dealId === dealId && p.status === "aceita"), [propostas, dealId]);
  const [open, setOpen] = useState(false);
  const [propostaId, setPropostaId] = useState("");
  const [stageKey, setStageKey] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPropostaId(current => accepted.some(p => p.id === current) ? current : (accepted[0]?.id ?? ""));
  }, [open, accepted]);

  useEffect(() => {
    if (!open || !token || !tenantId) return;
    let live = true;
    fetch(`/api/tenants/${tenantId}/pipeline-stages?pipeline=execucao`, {
      headers: { Authorization: "Bearer " + token },
    }).then(async r => { if (!r.ok) throw Error("Erro ao consultar etapas de execução"); return r.json(); })
      .then((rows: Stage[]) => { if (live) {
        const ordered = [...rows].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
        setStages(ordered);
        setStageKey(v => ordered.some(s => s.key === v) ? v : (ordered[0]?.key ?? ""));
      }}).catch(e => { if (live) toast({ title: String(e), variant: "destructive" }); });
    return () => { live = false; };
  }, [open, tenantId, token, toast]);

  async function loadBalance(proposal: string) {
    if (!proposal || !token) { setSummary(null); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/deals/${dealId}/execution-batches?propostaId=${encodeURIComponent(proposal)}`, {
        headers: { Authorization: "Bearer " + token },
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Falha ao consultar saldo da proposta");
      setSummary(body as Summary);
    } catch (err) {
      setSummary(null);
      toast({ title: err instanceof Error ? err.message : "Erro ao consultar saldos", variant: "destructive" });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open || !propostaId) { setSummary(null); return; }
    setAmounts({});
    void loadBalance(propostaId);
    // The balance is refreshed after every submission. Proposal changes invalidate local amounts.
  }, [open, propostaId, dealId, token]);

  async function sendBatch() {
    if (!summary || busy || !stageKey || reason.trim().length < 5) {
      toast({ title: "Selecione a etapa e informe a justificativa (mínimo 5 caracteres).", variant: "destructive" });
      return;
    }
    const items = summary.itens.flatMap(item => {
      const raw = amounts[item.indice];
      if (raw === undefined || !raw.trim()) return [];
      const quantity = Number(raw.replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > item.quantidadeDisponivel) return [{ indice: item.indice, quantidade: NaN }];
      return [{ indice: item.indice, quantidade: quantity }];
    });
    if (!items.length || items.some(item => !Number.isFinite(item.quantidade))) {
      toast({ title: "Informe quantidades válidas dentro dos saldos disponíveis.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/deals/${dealId}/execution-batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token ?? "") },
        body: JSON.stringify({ propostaId, etapa: stageKey, justificativa: reason.trim(), itens: items }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Não foi possível criar o lote");
      toast({ title: "Lote de execução criado", description: "As quantidades foram vinculadas à proposta original." });
      setAmounts({});
      setReason("");
      await loadBalance(propostaId);
      await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "execucao"] });
    } catch (err) {
      toast({ title: "Não foi possível enviar à execução", description: err instanceof Error ? err.message : "", variant: "destructive" });
      await loadBalance(propostaId);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" className="w-full">Enviar itens para execução</Button></DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Execução parcial do negócio</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Selecione apenas as quantidades deste lote. O orçamento e os lotes anteriores permanecem preservados.</p>
        <label className="text-sm font-medium" htmlFor="exec-proposta">Proposta aceita</label>
        <select id="exec-proposta" value={propostaId} onChange={e => setPropostaId(e.target.value)} className="w-full rounded-md border p-2 text-sm">
          {accepted.length === 0 && <option value="">Nenhuma proposta aceita</option>}
          {accepted.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
        <label className="text-sm font-medium" htmlFor="exec-stage">Etapa de execução</label>
        <select id="exec-stage" value={stageKey} onChange={e => setStageKey(e.target.value)} className="w-full rounded-md border p-2 text-sm">
          {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {loading && <p className="text-sm">Consultando saldos…</p>}
        {summary?.itens.map(item => (
          <div key={item.indice} className="flex items-center justify-between gap-3 border-b py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.nome}</p>
              <p className="text-xs text-muted-foreground">Disponível: {item.quantidadeDisponivel} {item.unidade ?? ""} · Enviado: {item.quantidadeEnviada}/{item.quantidadeOriginal}</p>
            </div>
            <Input type="number" min={0} max={item.quantidadeDisponivel} step="any" disabled={item.quantidadeDisponivel <= 0 || busy} className="w-28" aria-label={`Quantidade de ${item.nome}`} value={amounts[item.indice] ?? ""} onChange={e => setAmounts(v => ({...v, [item.indice]: e.target.value}))} />
          </div>
        ))}
        <label className="text-sm font-medium" htmlFor="exec-reason">Justificativa do envio</label>
        <Input id="exec-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: Primeira etapa da instalação" />
        <Button type="button" onClick={() => void sendBatch()} disabled={!summary || !stageKey || busy || loading}> {busy ? "Criando lote..." : "Criar lote de execução"} </Button>
      </DialogContent>
    </Dialog>
  );
}
