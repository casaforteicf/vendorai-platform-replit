import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ChecklistStatus = "pendente" | "ok" | "divergencia" | "na";

export type ExpeditionChecklist = {
  schemaVersion: number;
  tipo: string;
  etapa: string;
  status: "pendente" | "em_andamento" | "concluido" | "com_divergencia";
  contexto?: { segmento?: string | null; vertical?: string | null };
  totalCampos: number;
  concluidos: number;
  divergencias: number;
  itens: Array<{
    propostaItemIndex?: number | null;
    produtoId?: string | null;
    sku?: string | null;
    nome: string;
    quantidade: number;
    contexto?: { categoria?: string | null; nicho?: string | null };
    campos: Array<{
      id: string;
      key: string;
      label: string;
      status: ChecklistStatus;
      obrigatorio?: boolean;
      observacao?: string;
    }>;
  }>;
  verificacaoFinal?: {
    totalVolumes?: number | null;
    pesoTotalKg?: number | null;
    nomeVerificador?: string;
    data?: string | null;
    observacoes?: string;
  };
};

export function ExpeditionChecklistPanel({
  checklist,
  disabled,
  onChange,
}: {
  checklist: ExpeditionChecklist;
  disabled?: boolean;
  onChange: (checklist: ExpeditionChecklist) => void;
}) {
  function setField(itemIndex: number, fieldIndex: number, status: ChecklistStatus) {
    const itens = checklist.itens.map((item, i) => i !== itemIndex ? item : {
      ...item,
      campos: item.campos.map((field, j) => j !== fieldIndex ? field : { ...field, status }),
    });
    const fields = itens.flatMap((item) => item.campos);
    const concluidos = fields.filter((field) => field.status !== "pendente").length;
    const divergencias = fields.filter((field) => field.status === "divergencia").length;
    onChange({
      ...checklist,
      itens,
      concluidos,
      divergencias,
      status: divergencias > 0
        ? "com_divergencia"
        : concluidos === fields.length && fields.length > 0
          ? "concluido"
          : concluidos > 0 ? "em_andamento" : "pendente",
    });
  }

  function setFinal(field: "totalVolumes" | "pesoTotalKg" | "nomeVerificador" | "observacoes", value: string) {
    const numeric = field === "totalVolumes" || field === "pesoTotalKg";
    const parsed = numeric ? (value.trim() ? Number(value.replace(",", ".")) : null) : value;
    onChange({
      ...checklist,
      verificacaoFinal: {
        ...(checklist.verificacaoFinal ?? {}),
        [field]: numeric && typeof parsed === "number" && !Number.isFinite(parsed) ? null : parsed,
      },
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4" /> Checklist de expedição / transporte
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Gerado conforme produto e contexto do tenant
            {checklist.contexto?.segmento ? ` • ${checklist.contexto.segmento}` : ""}
            {checklist.contexto?.vertical ? ` • ${checklist.contexto.vertical}` : ""}.
          </p>
        </div>
        <Badge variant={checklist.divergencias > 0 ? "destructive" : checklist.status === "concluido" ? "default" : "secondary"}>
          {checklist.concluidos}/{checklist.totalCampos}
        </Badge>
      </div>

      <div className="space-y-3">
        {checklist.itens.map((item, itemIndex) => (
          <div key={`${item.propostaItemIndex ?? itemIndex}-${item.sku ?? item.nome}`} className="rounded-lg border">
            <div className="bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">{item.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                {item.quantidade} un.
                {item.sku ? ` • SKU ${item.sku}` : ""}
                {item.contexto?.nicho ? ` • ${item.contexto.nicho}` : ""}
                {item.contexto?.categoria ? ` • ${item.contexto.categoria}` : ""}
              </p>
            </div>
            <div className="divide-y">
              {item.campos.map((field, fieldIndex) => (
                <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm">{field.label}</span>
                  <div className="flex gap-1">
                    <Button disabled={disabled} size="sm" variant={field.status === "ok" ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(itemIndex, fieldIndex, "ok")}>OK</Button>
                    <Button disabled={disabled} size="sm" variant={field.status === "divergencia" ? "destructive" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(itemIndex, fieldIndex, "divergencia")}>Divergência</Button>
                    <Button disabled={disabled} size="sm" variant={field.status === "na" ? "secondary" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(itemIndex, fieldIndex, "na")}>N/A</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Total de volumes</label>
          <Input disabled={disabled} type="number" min={0} defaultValue={checklist.verificacaoFinal?.totalVolumes ?? ""} onBlur={(e) => setFinal("totalVolumes", e.currentTarget.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Peso total (kg)</label>
          <Input disabled={disabled} type="number" min={0} step="any" defaultValue={checklist.verificacaoFinal?.pesoTotalKg ?? ""} onBlur={(e) => setFinal("pesoTotalKg", e.currentTarget.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium">Verificador final</label>
          <Input disabled={disabled} defaultValue={checklist.verificacaoFinal?.nomeVerificador ?? ""} onBlur={(e) => setFinal("nomeVerificador", e.currentTarget.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium">Observações da expedição</label>
          <Textarea disabled={disabled} rows={3} defaultValue={checklist.verificacaoFinal?.observacoes ?? ""} onBlur={(e) => setFinal("observacoes", e.currentTarget.value)} />
        </div>
      </div>

      {checklist.divergencias > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>Existem {checklist.divergencias} divergência(s). Revise o lote antes da saída para transporte.</span>
        </div>
      )}
    </div>
  );
}
