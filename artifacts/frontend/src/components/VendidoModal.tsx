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
import { useUpdateDeal } from "@workspace/api-client-react";
import { CheckCircle2, ChevronLeft, Package } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-600 border-gray-200",
  enviada: "bg-blue-100 text-blue-700 border-blue-200",
  aceita: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejeitada: "bg-red-100 text-red-600 border-red-200",
  expirada: "bg-orange-100 text-orange-700 border-orange-200",
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
  const updateDeal = useUpdateDeal();

  const activeDeal = deals.find((d) => d.etapa !== "ganho" && d.etapa !== "perdido") ?? deals[0] ?? null;

  const [step, setStep] = useState<"select" | "confirm">(
    propostas.length > 0 ? "select" : "confirm"
  );
  const [selectedProposta, setSelectedProposta] = useState<PropostaLike | null>(null);

  const initFromProposta = (p: PropostaLike | null) => ({
    valorFinal: p ? String(propostaTotal(p).toFixed(2)) : String(activeDeal?.valor ?? ""),
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
      setFields(initFromProposta(null));
    }
    onOpenChange(v);
  }

  function handleConfirm() {
    if (!activeDeal) {
      toast({ title: "Nenhum negócio encontrado para este lead.", variant: "destructive" });
      return;
    }
    const valorNum = parseFloat(fields.valorFinal.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({ title: "Informe um valor final válido.", variant: "destructive" });
      return;
    }
    if (!fields.planoContratado.trim()) {
      toast({ title: "Informe o plano contratado.", variant: "destructive" });
      return;
    }

    updateDeal.mutate(
      {
        id: activeDeal.id,
        data: {
          etapa: "ganho",
          valor: valorNum,
          planoContratado: fields.planoContratado.trim(),
          ...(fields.condPagamento ? {} : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ title: `🎉 Venda confirmada para ${leadNome}!` });
          handleClose(false);
          onSuccess();
        },
        onError: (err: any) => {
          const msg = err?.data?.message ?? err?.message ?? "Erro ao confirmar fechamento";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

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
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Selecione o orçamento que será vinculado ao fechamento:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {propostas
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((p) => {
                  const total = propostaTotal(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProposta(p)}
                      className="w-full text-left rounded-lg border border-border p-3 hover:border-emerald-400 hover:bg-emerald-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {p.numero && (
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {p.numero}
                              </span>
                            )}
                            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>
                              {STATUS_LABELS[p.status] ?? p.status}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium mt-1 truncate">{p.titulo}</p>
                          {p.condPagamento && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.condPagamento}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold font-mono text-emerald-700">{fmt(total)}</p>
                          {p.numParcelas && p.numParcelas > 1 && (
                            <p className="text-xs text-muted-foreground">{p.numParcelas}x</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground text-center pt-1">
              Ou{" "}
              <button
                onClick={() => {
                  setSelectedProposta(null);
                  setFields(initFromProposta(null));
                  setStep("confirm");
                }}
                className="underline hover:text-foreground"
              >
                prosseguir sem selecionar um orçamento
              </button>
            </p>
          </div>
        )}

        {/* ── Step 2: Preview + editable fields ────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-4 pt-1">
            {/* Proposta preview */}
            {selectedProposta && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                    Orçamento selecionado
                  </span>
                  {selectedProposta.numero && (
                    <span className="text-xs font-mono text-muted-foreground bg-white border px-1.5 py-0.5 rounded">
                      {selectedProposta.numero}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold">{selectedProposta.titulo}</p>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Valor total</span>
                  <span className="font-mono font-semibold text-emerald-700 text-right">
                    {fmt(propostaTotal(selectedProposta))}
                  </span>

                  {selectedProposta.numParcelas && selectedProposta.numParcelas > 1 && (
                    <>
                      <span>Parcelas</span>
                      <span className="text-right">{selectedProposta.numParcelas}x</span>
                    </>
                  )}
                  {selectedProposta.condPagamento && (
                    <>
                      <span>Pagamento</span>
                      <span className="text-right">{selectedProposta.condPagamento}</span>
                    </>
                  )}
                  {selectedProposta.prazoEntrega && (
                    <>
                      <span>Prazo</span>
                      <span className="text-right">{selectedProposta.prazoEntrega}</span>
                    </>
                  )}
                  {selectedProposta.recorrente && selectedProposta.valorMensal && (
                    <>
                      <span>Mensalidade</span>
                      <span className="text-right font-mono">
                        {fmt(parseFloat(selectedProposta.valorMensal))}/mês
                        {selectedProposta.prazoContratoMeses ? ` · ${selectedProposta.prazoContratoMeses} meses` : ""}
                      </span>
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
                          <span className="font-mono shrink-0">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vd-valor" className="text-xs">
                    Valor final <span className="text-red-500">*</span>
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
              onClick={handleConfirm}
              disabled={updateDeal.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              {updateDeal.isPending ? "Confirmando..." : "Confirmar Fechamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
