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
  saida?: {
    veiculo?: string;
    placa?: string;
    motorista?: string;
    horarioSaida?: string | null;
    destino?: string;
    lacre?: string;
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

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <Input disabled={disabled} placeholder="Veículo" defaultValue={checklist.saida?.veiculo ?? ""} onBlur={(e) => setDeparture("veiculo", e.currentTarget.value)} />
        <Input disabled={disabled} placeholder="Placa" defaultValue={checklist.saida?.placa ?? ""} onBlur={(e) => setDeparture("placa", e.currentTarget.value)} />
        <Input disabled={disabled} placeholder="Motorista" defaultValue={checklist.saida?.motorista ?? ""} onBlur={(e) => setDeparture("motorista", e.currentTarget.value)} />
        <Input disabled={disabled} placeholder="Lacre" defaultValue={checklist.saida?.lacre ?? ""} onBlur={(e) => setDeparture("lacre", e.currentTarget.value)} />
        <Input disabled={disabled} className="sm:col-span-2" placeholder="Destino" defaultValue={checklist.saida?.destino ?? ""} onBlur={(e) => setDeparture("destino", e.currentTarget.value)} />
      </div>
    </div>
  );
}
