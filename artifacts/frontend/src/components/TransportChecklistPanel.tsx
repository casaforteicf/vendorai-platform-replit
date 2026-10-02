import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type TransportChecklist = {
  schemaVersion: number;
  tipo: string;
  status: "pendente" | "em_andamento" | "concluido" | "com_divergencia";
  totalCampos: number;
  concluidos: number;
  divergencias: number;
  campos: Array<{
    id: string;
    key: string;
    label: string;
    status: "pendente" | "ok" | "divergencia" | "na";
    observacao?: string;
  }>;
  itens?: Array<{
    id: string;
    produtoId?: string | null;
    sku?: string | null;
    nome: string;
    quantidadePrevista: number;
    quantidadeCarregada?: number | null;
    quantidadeRecebida?: number | null;
    ocorrencia?: string;
  }>;
  saida?: {
    veiculo?: string;
    placa?: string;
    motorista?: string;
    horarioSaida?: string | null;
    destino?: string;
    lacre?: string;
  };
  recebimento?: {
    recebidoPor?: string;
    recebidoEm?: string | null;
    observacoes?: string;
  };
};

export function TransportChecklistPanel({
  checklist,
  disabled,
  onChange,
}: {
  checklist: TransportChecklist;
  disabled?: boolean;
  onChange: (checklist: TransportChecklist) => void;
}) {
  function recompute(campos: TransportChecklist["campos"]) {
    const concluidos = campos.filter((field) => field.status !== "pendente").length;
    const divergencias = campos.filter((field) => field.status === "divergencia").length;
    const fullyChecked = campos.length > 0 && concluidos === campos.length;
    return {
      concluidos,
      divergencias,
      status: divergencias > 0
        ? "com_divergencia" as const
        : fullyChecked ? "concluido" as const
        : concluidos > 0 ? "em_andamento" as const : "pendente" as const,
    };
  }

  function setStatus(index: number, status: TransportChecklist["campos"][number]["status"]) {
    const campos = checklist.campos.map((field, i) => i === index ? { ...field, status } : field);
    onChange({ ...checklist, campos, ...recompute(campos) });
  }

  function setObservation(index: number, observacao: string) {
    const campos = checklist.campos.map((field, i) => i === index ? { ...field, observacao } : field);
    onChange({ ...checklist, campos });
  }

  function setDeparture(field: keyof NonNullable<TransportChecklist["saida"]>, value: string) {
    onChange({ ...checklist, saida: { ...(checklist.saida ?? {}), [field]: value } });
  }

  function setItemQuantity(index: number, field: "quantidadeCarregada" | "quantidadeRecebida", value: string) {
    const parsed = value.trim() ? Number(value.replace(",", ".")) : null;
    const itens = (checklist.itens ?? []).map((item, i) => i !== index ? item : {
      ...item,
      [field]: typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null,
    });
    onChange({ ...checklist, itens });
  }

  function setItemOccurrence(index: number, ocorrencia: string) {
    const itens = (checklist.itens ?? []).map((item, i) => i !== index ? item : { ...item, ocorrencia });
    onChange({ ...checklist, itens });
  }

  function setReceipt(field: keyof NonNullable<TransportChecklist["recebimento"]>, value: string) {
    onChange({ ...checklist, recebimento: { ...(checklist.recebimento ?? {}), [field]: value } });
  }

  const quantityDivergences = (checklist.itens ?? []).filter((item) => {
    if (item.quantidadeCarregada == null || item.quantidadeRecebida == null) return false;
    return Number(item.quantidadeCarregada) !== Number(item.quantidadeRecebida);
  });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Checklist de transporte</h3>
          <p className="mt-1 text-xs text-muted-foreground">Conferência da carga e dos dados da viagem após a liberação da expedição.</p>
        </div>
        <Badge variant={checklist.divergencias > 0 ? "destructive" : checklist.status === "concluido" ? "default" : "secondary"}>
          {checklist.concluidos}/{checklist.totalCampos}
        </Badge>
      </div>

      <div className="divide-y rounded-lg border">
        {checklist.campos.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm">{field.label}</span>
            <div className="flex gap-1">
              <Button disabled={disabled} size="sm" variant={field.status === "ok" ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setStatus(index, "ok")}>OK</Button>
              <Button disabled={disabled} size="sm" variant={field.status === "divergencia" ? "destructive" : "outline"} className="h-7 px-2 text-xs" onClick={() => setStatus(index, "divergencia")}>Divergência</Button>
              <Button disabled={disabled} size="sm" variant={field.status === "na" ? "secondary" : "outline"} className="h-7 px-2 text-xs" onClick={() => setStatus(index, "na")}>N/A</Button>
            </div>
            {field.status === "divergencia" && (
              <Textarea disabled={disabled} className="w-full basis-full" rows={2} placeholder="Descreva a ocorrência." defaultValue={field.observacao ?? ""} onBlur={(e) => setObservation(index, e.currentTarget.value)} />
            )}
          </div>
        ))}
      </div>

      {(checklist.itens?.length ?? 0) > 0 && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Carregado × recebido</h4>
            {quantityDivergences.length > 0 && <Badge variant="destructive">{quantityDivergences.length} divergência(s)</Badge>}
          </div>
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_78px_92px_92px] gap-2 bg-muted/50 px-3 py-2 text-[11px] font-medium">
              <span>Item</span><span>Previsto</span><span>Carregado</span><span>Recebido</span>
            </div>
            {(checklist.itens ?? []).map((item, index) => {
              const differs = item.quantidadeCarregada != null && item.quantidadeRecebida != null
                && Number(item.quantidadeCarregada) !== Number(item.quantidadeRecebida);
              return (
                <div key={item.id} className={`grid grid-cols-[1fr_78px_92px_92px] items-center gap-2 border-t px-3 py-2 text-sm ${differs ? "bg-destructive/5" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.nome}</p>
                    {item.sku && <p className="text-[10px] text-muted-foreground">SKU {item.sku}</p>}
                  </div>
                  <span>{item.quantidadePrevista}</span>
                  <Input disabled={disabled} type="number" min={0} step="any" defaultValue={item.quantidadeCarregada ?? ""} onBlur={(e) => setItemQuantity(index, "quantidadeCarregada", e.currentTarget.value)} />
                  <Input disabled={disabled} type="number" min={0} step="any" defaultValue={item.quantidadeRecebida ?? ""} onBlur={(e) => setItemQuantity(index, "quantidadeRecebida", e.currentTarget.value)} />
                  {differs && (
                    <div className="col-span-4">
                      <Textarea disabled={disabled} rows={2} placeholder="Descreva falta, avaria ou diferença no recebimento." defaultValue={item.ocorrencia ?? ""} onBlur={(e) => setItemOccurrence(index, e.currentTarget.value)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <Input disabled={disabled} placeholder="Veículo" defaultValue={checklist.saida?.veiculo ?? ""} onBlur={(e) => setDeparture("veiculo", e.currentTarget.value)} />
        <Input disabled={disabled} placeholder="Placa" defaultValue={checklist.saida?.placa ?? ""} onBlur={(e) => setDeparture("placa", e.currentTarget.value)} />
        <Input disabled={disabled} placeholder="Motorista" defaultValue={checklist.saida?.motorista ?? ""} onBlur={(e) => setDeparture("motorista", e.currentTarget.value)} />
        <Input disabled={disabled} placeholder="Lacre" defaultValue={checklist.saida?.lacre ?? ""} onBlur={(e) => setDeparture("lacre", e.currentTarget.value)} />
        <Input disabled={disabled} className="sm:col-span-2" placeholder="Destino" defaultValue={checklist.saida?.destino ?? ""} onBlur={(e) => setDeparture("destino", e.currentTarget.value)} />
      </div>

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <Input disabled={disabled} placeholder="Recebido por" defaultValue={checklist.recebimento?.recebidoPor ?? ""} onBlur={(e) => setReceipt("recebidoPor", e.currentTarget.value)} />
        <Input disabled={disabled} type="datetime-local" defaultValue={checklist.recebimento?.recebidoEm ? checklist.recebimento.recebidoEm.slice(0, 16) : ""} onBlur={(e) => setReceipt("recebidoEm", e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : "")} />
        <Textarea disabled={disabled} className="sm:col-span-2" rows={2} placeholder="Observações do recebimento" defaultValue={checklist.recebimento?.observacoes ?? ""} onBlur={(e) => setReceipt("observacoes", e.currentTarget.value)} />
      </div>
    </div>
  );
}