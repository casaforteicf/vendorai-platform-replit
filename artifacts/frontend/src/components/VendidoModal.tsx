import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle2,
  ChevronLeft,
  Package,
  ExternalLink,
  AlertTriangle,
  Loader2,
  FileCheck2,
  CreditCard,
  PartyPopper,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PropostaLike = {
  id: string;
  titulo: string;
  numero?: string | null;
  valorTotal?: string | null;
  itens: Array<{ nome?: string; quantidade: number; valorUnitario: number }>;
  condPagamento?: string | null;
  prazoEntrega?: string | null;
  observacoes?: string | null;
  numParcelas?: number | null;
  recorrente?: boolean | null;
  valorMensal?: string | null;
  prazoContratoMeses?: number | null;
  status: string;
  createdAt: string;
};

type DealLike = {
  id: string;
  etapa: string;
  planoContratado?: string | null;
  valor?: number | string | null;
};

type ClosureResult = {
  ganho?: boolean;
  signUrl?: string | null;
  chargeLinks?: string[];
  errors?: string[];
  pendingApproval?: boolean;
  agentTaskId?: string;
  divergence?: {
    valorProposta?: number;
    valorCatalogo?: number;
    diferenca?: number;
  };
};

interface VendidoModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadNome: string;
  propostas: PropostaLike[];
  deals: DealLike[];
  onSuccess: () => void;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function propostaTotal(p: PropostaLike): number {
  if (p.valorTotal) return parseFloat(p.valorTotal);
  return p.itens.reduce((s: number, i: { quantidade: number; valorUnitario: number }) => s + i.quantidade * i.valorUnitario, 0);
}

function propostaServicos(p: PropostaLike): string {
  if (p.itens.length === 0) return p.titulo;
  return p.itens.map((i) => `${i.nome ?? "Item"} (${i.quantidade}x)`).join(", ");
}

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-600 border-gray-200",
  enviada: "bg-blue-100 text-blue-700 border-blue-200",
  aceita: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejeitada: "bg-red-100 text-red-600 border-red-200",
  expirada: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita",
  rejeitada: "Rejeitada", expirada: "Expirada", pendente: "Pendente",
};

export function VendidoModal({
  open,
  onOpenChange,
  leadNome,
  propostas,
  deals,
  onSuccess,
}: VendidoModalProps) {
  const { toast } = useToast();
  const { token } = useAuth();

  const activeDeal = deals.find((d) => d.etapa !== "ganho" && d.etapa !== "perdido") ?? deals[0] ?? null;

  const [step, setStep] = useState<"select" | "confirm" | "resultado">(
    propostas.length > 0 ? "select" : "confirm"
  );
  const [selectedProposta, setSelectedProposta] = useState<PropostaLike | null>(null);
  const [closureResult, setClosureResult] = useState<ClosureResult | null>(null);

  const initFromProposta = (p: PropostaLike | null) => ({
    valorFinal: p ? String(propostaTotal(p).toFixed(2)) : String(activeDeal?.valor ?? ""),
    valorImplantacao: "",
    valorMensalidade: p?.valorMensal ? String(parseFloat(p.valorMensal).toFixed(2)) : "",
    condPagamento: p?.condPagamento ?? "",
    prazoEntrega: p?.prazoEntrega ?? "",
    planoContratado: activeDeal?.planoContratado ?? "padrao",
    observacoes: p?.observacoes ?? "",
  });

  const [fields, setFields] = useState(initFromProposta(null));

  function handleSelectProposta(p: PropostaLike) {
    setSelectedProposta(p);
    setFields(initFromProposta(p));
    setStep("confirm");
  }

  function handleBack() {
    setStep("select");
  }

  function handleClose(v: boolean) {
    if (!v) {
      setStep(propostas.length > 0 ? "select" : "confirm");
      setSelectedProposta(null);
      setClosureResult(null);
      setFields(initFromProposta(null));
    }
    onOpenChange(v);
  }

  // ── Confirm closure mutation ───────────────────────────────────────────────
  const closureMutation = useMutation({
    mutationFn: async () => {
      if (!activeDeal) throw new Error("Nenhum negócio encontrado para este lead.");
      const valorNum = parseFloat(fields.valorFinal.replace(",", "."));
      if (isNaN(valorNum) || valorNum <= 0) throw new Error("Informe um valor final válido.");
      if (!fields.planoContratado.trim()) throw new Error("Informe o plano contratado.");

      const servicos = selectedProposta ? propostaServicos(selectedProposta) : undefined;
      const numParcelas = selectedProposta?.numParcelas ?? 1;
      const valorImplantacaoNum = fields.valorImplantacao ? parseFloat(fields.valorImplantacao.replace(",", ".")) : undefined;
      const valorMensalidadeNum = fields.valorMensalidade ? parseFloat(fields.valorMensalidade.replace(",", ".")) : undefined;

      const res = await fetch(`/api/deals/${activeDeal.id}/confirm-closure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          valor: valorNum,
          valorImplantacao: valorImplantacaoNum && !isNaN(valorImplantacaoNum) ? valorImplantacaoNum : undefined,
          valorMensalidade: valorMensalidadeNum && !isNaN(valorMensalidadeNum) ? valorMensalidadeNum : undefined,
          planoContratado: fields.planoContratado.trim(),
          condPagamento: fields.condPagamento || undefined,
          prazoEntrega: fields.prazoEntrega || undefined,
          observacoes: fields.observacoes || undefined,
          numParcelas,
          servicos,
        }),
      });

      const data = await res.json() as ClosureResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      return data;
    },
    onSuccess: (data) => {
      setClosureResult(data);
      setStep("resultado");
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            Confirmar Venda — {leadNome}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Select proposta ────────────────────────────────────── */}
        {step === "select" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecione o orçamento que foi aceito ou pule para confirmar manualmente.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {[...propostas]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProposta(p)}
                    className="w-full text-left rounded-lg border bg-card hover:border-emerald-500 hover:shadow-sm transition-all p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{p.titulo}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${STATUS_COLORS[p.status] ?? ""}`}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </div>
                    {p.condPagamento && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.condPagamento}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                      <div className="flex items-center gap-2">
                        {p.numParcelas && p.numParcelas > 1 && (
                          <p className="text-xs text-muted-foreground">{p.numParcelas}x</p>
                        )}
                        <span className="font-semibold text-sm text-emerald-700">
                          {fmt(propostaTotal(p))}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setStep("confirm")}
            >
              Pular — confirmar manualmente
            </Button>
          </div>
        )}

        {/* ── Step 2: Preview + editable fields ─────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-4">
            {/* Proposta preview */}
            {selectedProposta && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  {selectedProposta.titulo}
                  {selectedProposta.numero && (
                    <span className="font-normal text-emerald-600">#{selectedProposta.numero}</span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-x-4 text-xs text-emerald-700">
                  <span className="text-emerald-600">Total</span>
                  <span className="text-right font-semibold">{fmt(propostaTotal(selectedProposta))}</span>
                  {selectedProposta.numParcelas && selectedProposta.numParcelas > 1 && (
                    <>
                      <span className="text-emerald-600">Parcelas</span>
                      <span className="text-right">{selectedProposta.numParcelas}x</span>
                    </>
                  )}
                  {selectedProposta.condPagamento && (
                    <>
                      <span className="text-emerald-600">Pagamento</span>
                      <span className="text-right">{selectedProposta.condPagamento}</span>
                    </>
                  )}
                  {selectedProposta.prazoEntrega && (
                    <>
                      <span className="text-emerald-600">Prazo</span>
                      <span className="text-right">{selectedProposta.prazoEntrega}</span>
                    </>
                  )}
                </div>
                {selectedProposta.itens.length > 0 && (
                  <div className="pt-1 border-t border-emerald-200/70">
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Serviços / Itens
                    </p>
                    <ul className="space-y-0.5">
                      {selectedProposta.itens.map((item: { nome?: string; quantidade: number; valorUnitario: number }, i: number) => (
                        <li key={i} className="text-xs flex justify-between">
                          <span className="truncate pr-2">
                            {item.nome ?? `Item ${i + 1}`}
                            {item.quantidade > 1 && (
                              <span className="text-muted-foreground"> ×{item.quantidade}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-emerald-700 font-medium">
                            {fmt(item.quantidade * item.valorUnitario)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Editable fields */}
            <div className="space-y-3">
              {/* Valores principais */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vd-impl" className="text-xs">
                    Valor licença / implantação
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input
                      id="vd-impl"
                      type="number"
                      min="0"
                      step="0.01"
                      className="pl-8"
                      placeholder="0,00"
                      value={fields.valorImplantacao}
                      onChange={(e) => setFields((f) => ({ ...f, valorImplantacao: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vd-mrr" className="text-xs">
                    Valor mensalidade
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input
                      id="vd-mrr"
                      type="number"
                      min="0"
                      step="0.01"
                      className="pl-8"
                      placeholder="0,00"
                      value={fields.valorMensalidade}
                      onChange={(e) => setFields((f) => ({ ...f, valorMensalidade: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vd-valor" className="text-xs">
                    Valor total <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input
                      id="vd-valor"
                      type="number"
                      min="0"
                      step="0.01"
                      className="pl-8"
                      value={fields.valorFinal}
                      onChange={(e) => setFields((f) => ({ ...f, valorFinal: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vd-plano" className="text-xs">
                    Plano contratado <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="vd-plano"
                    placeholder="ex: padrao, pro, enterprise"
                    value={fields.planoContratado}
                    onChange={(e) => setFields((f) => ({ ...f, planoContratado: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vd-cond" className="text-xs">Condição de pagamento</Label>
                  <Input
                    id="vd-cond"
                    placeholder="ex: 30/60/90 dias, à vista"
                    value={fields.condPagamento}
                    onChange={(e) => setFields((f) => ({ ...f, condPagamento: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vd-prazo" className="text-xs">Prazo de entrega</Label>
                  <Input
                    id="vd-prazo"
                    placeholder="ex: 7 dias úteis"
                    value={fields.prazoEntrega}
                    onChange={(e) => setFields((f) => ({ ...f, prazoEntrega: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vd-obs" className="text-xs">Observações</Label>
                <Textarea
                  id="vd-obs"
                  rows={2}
                  placeholder="Condições especiais, detalhes do fechamento..."
                  value={fields.observacoes}
                  onChange={(e) => setFields((f) => ({ ...f, observacoes: e.target.value }))}
                  className="resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Resultado ──────────────────────────────────────────── */}
        {step === "resultado" && closureResult?.pendingApproval && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="rounded-full bg-amber-100 p-3">
                <AlertTriangle className="h-7 w-7 text-amber-600" />
              </div>
              <p className="text-base font-semibold text-amber-700">Aguardando aprovação</p>
              <p className="text-sm text-muted-foreground text-center">
                O valor informado diverge do preço de catálogo. O fechamento de {leadNome} foi
                enviado para aprovação manual e só será concluído após revisão.
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Divergência de valor
              </p>
              {closureResult.divergence && (
                <div className="grid grid-cols-2 gap-x-4 text-xs text-amber-700">
                  {closureResult.divergence.valorProposta !== undefined && (
                    <>
                      <span>Valor da proposta</span>
                      <span className="text-right font-medium">{fmt(closureResult.divergence.valorProposta)}</span>
                    </>
                  )}
                  {closureResult.divergence.valorCatalogo !== undefined && (
                    <>
                      <span>Preço de catálogo</span>
                      <span className="text-right font-medium">{fmt(closureResult.divergence.valorCatalogo)}</span>
                    </>
                  )}
                  {closureResult.divergence.diferenca !== undefined && (
                    <>
                      <span>Diferença</span>
                      <span className="text-right font-medium">{fmt(closureResult.divergence.diferenca)}</span>
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-amber-700 pt-1">
                Um operador foi notificado e pode aprovar o fechamento em Tarefas do Agente.
              </p>
            </div>
          </div>
        )}

        {step === "resultado" && closureResult && !closureResult.pendingApproval && (
          <div className="space-y-4">
            {/* Success header */}
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="rounded-full bg-emerald-100 p-3">
                <PartyPopper className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-base font-semibold text-emerald-700">Venda confirmada! 🎉</p>
              <p className="text-sm text-muted-foreground text-center">
                {leadNome} foi movido para <strong>Ganho</strong>.
              </p>
            </div>

            {/* Contract / ZapSign */}
            <div className={`rounded-lg border p-3 space-y-1 ${closureResult.signUrl ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-muted/30"}`}>
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <FileCheck2 className={`h-4 w-4 ${closureResult.signUrl ? "text-blue-600" : "text-muted-foreground"}`} />
                {closureResult.signUrl ? "Contrato enviado para assinatura" : "Contrato"}
              </p>
              {closureResult.signUrl ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-blue-700">
                    Documento ZapSign criado e link enviado via WhatsApp ao cliente.
                  </p>
                  <a
                    href={closureResult.signUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 underline underline-offset-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir link de assinatura
                  </a>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {(closureResult.errors ?? []).find((e) => e.startsWith("Contrato:"))
                    ?? "ZapSign não configurado — contrato não gerado automaticamente."}
                </p>
              )}
            </div>

            {/* Asaas billing */}
            {closureResult.chargeLinks && closureResult.chargeLinks.length > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                <p className="text-xs font-semibold flex items-center gap-1.5 text-emerald-700">
                  <CreditCard className="h-4 w-4" />
                  {closureResult.chargeLinks.length === 1 ? "Boleto gerado" : `${closureResult.chargeLinks.length} boletos gerados`}
                </p>
                <p className="text-xs text-emerald-700">Links enviados via WhatsApp ao cliente.</p>
                <div className="space-y-1">
                  {closureResult.chargeLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 underline underline-offset-2 block"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {closureResult.chargeLinks!.length > 1 ? `Parcela ${i + 1}` : "Ver boleto"}
                    </a>
                  ))}
                </div>
              </div>
            ) : !(closureResult.errors ?? []).find((e) => e.startsWith("Cobrança:")) ? (
              <div className="rounded-lg border border-gray-200 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4" />
                  Asaas não configurado — cobrança não gerada automaticamente.
                </p>
              </div>
            ) : null}

            {/* Errors */}
            {(closureResult.errors ?? []).length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Atenção — alguns passos falharam
                </p>
                <ul className="space-y-0.5">
                  {(closureResult.errors ?? []).map((e, i) => (
                    <li key={i} className="text-xs text-red-700">• {e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-row justify-between sm:justify-between pt-2">
          {step === "confirm" && propostas.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
          ) : (
            <div />
          )}

          {step === "confirm" && (
            <Button
              onClick={() => closureMutation.mutate()}
              disabled={closureMutation.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {closureMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar Fechamento
                </>
              )}
            </Button>
          )}

          {step === "resultado" && (
            <Button
              onClick={() => handleClose(false)}
              className={
                closureResult?.pendingApproval
                  ? "gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  : "gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              }
            >
              {closureResult?.pendingApproval ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
