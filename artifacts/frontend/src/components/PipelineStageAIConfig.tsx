import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Plus, Trash2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export type PipelineAIAction =
  | "create_activity"
  | "send_message"
  | "advance_stage"
  | "change_owner"
  | "generate_proposal"
  | "schedule_meeting"
  | "create_checkout"
  | "handoff_agent"
  | "move_to_warming";

export type PipelineAICriterion = {
  field: string;
  operator: "exists" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  value?: unknown;
  required?: boolean;
};

export type PipelineAIConfig = {
  mode: "desativada" | "assistida" | "autonoma";
  allowedActions: PipelineAIAction[];
  approvalRequiredActions: PipelineAIAction[];
  entryCriteria: PipelineAICriterion[];
  exitCriteria: PipelineAICriterion[];
  nextBestActionEnabled: boolean;
  instructions?: string | null;
};

const DEFAULT_CONFIG: PipelineAIConfig = {
  mode: "desativada",
  allowedActions: [],
  approvalRequiredActions: [],
  entryCriteria: [],
  exitCriteria: [],
  nextBestActionEnabled: true,
  instructions: "",
};

const ACTIONS: Array<{ key: PipelineAIAction; label: string; sensitive?: boolean }> = [
  { key: "create_activity", label: "Criar atividades" },
  { key: "send_message", label: "Enviar mensagens" },
  { key: "advance_stage", label: "Avançar etapa" },
  { key: "change_owner", label: "Alterar responsável", sensitive: true },
  { key: "generate_proposal", label: "Gerar proposta" },
  { key: "schedule_meeting", label: "Agendar reunião" },
  { key: "create_checkout", label: "Criar checkout", sensitive: true },
  { key: "handoff_agent", label: "Transferir para outro agente" },
  { key: "move_to_warming", label: "Mover para Aquecimento / Não Lead", sensitive: true },
];

function normalize(value?: PipelineAIConfig | null): PipelineAIConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(value ?? {}),
    allowedActions: value?.allowedActions ?? [],
    approvalRequiredActions: value?.approvalRequiredActions ?? [],
    entryCriteria: value?.entryCriteria ?? [],
    exitCriteria: value?.exitCriteria ?? [],
  };
}

export function PipelineStageAIConfig({
  tenantId,
  stageId,
  stageLabel,
  value,
  onSaved,
}: {
  tenantId: string;
  stageId: string;
  stageLabel: string;
  value?: PipelineAIConfig | null;
  onSaved?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PipelineAIConfig>(() => normalize(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => setConfig(normalize(value)), [value]);

  const modeLabel = useMemo(() => ({
    desativada: "IA desativada",
    assistida: "IA assistida",
    autonoma: "IA autônoma",
  }[config.mode]), [config.mode]);

  function toggleAction(action: PipelineAIAction, checked: boolean) {
    setConfig((current) => {
      const allowedActions = checked
        ? Array.from(new Set([...current.allowedActions, action]))
        : current.allowedActions.filter((item) => item !== action);
      const approvalRequiredActions = checked
        ? current.approvalRequiredActions
        : current.approvalRequiredActions.filter((item) => item !== action);
      return { ...current, allowedActions, approvalRequiredActions };
    });
  }

  function toggleApproval(action: PipelineAIAction, checked: boolean) {
    setConfig((current) => ({
      ...current,
      approvalRequiredActions: checked
        ? Array.from(new Set([...current.approvalRequiredActions, action]))
        : current.approvalRequiredActions.filter((item) => item !== action),
    }));
  }

  function updateCriterion(index: number, patch: Partial<PipelineAICriterion>) {
    setConfig((current) => ({
      ...current,
      exitCriteria: current.exitCriteria.map((criterion, i) => i === index ? { ...criterion, ...patch } : criterion),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({ aiConfig: config }),
        responseType: "json",
      });
      await onSaved?.();
      setOpen(false);
      toast({ title: "Autonomia da IA atualizada." });
    } catch (error) {
      toast({
        title: "Não foi possível salvar a autonomia da IA",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          {modeLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>IA na etapa — {stageLabel}</DialogTitle>
          <DialogDescription>
            Defina o nível de autonomia, as ações permitidas, quais exigem aprovação e os critérios objetivos para a IA avançar a pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Nível de autonomia</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["desativada", "assistida", "autonoma"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-lg border p-3 text-left text-sm ${config.mode === mode ? "border-primary bg-primary/5" : "bg-background"}`}
                  onClick={() => setConfig((current) => ({ ...current, mode }))}
                >
                  <strong>{mode === "desativada" ? "Desativada" : mode === "assistida" ? "Assistida" : "Autônoma"}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mode === "desativada" ? "Não interfere nesta etapa." : mode === "assistida" ? "Sugere e pede aprovação." : "Executa o que estiver autorizado."}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Ações permitidas</p>
              <p className="text-xs text-muted-foreground">A aprovação pode ser exigida individualmente, mesmo no modo autônomo.</p>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              {ACTIONS.map((action) => {
                const allowed = config.allowedActions.includes(action.key);
                const approval = config.approvalRequiredActions.includes(action.key);
                return (
                  <div key={action.key} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-0">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={allowed} onChange={(event) => toggleAction(action.key, event.target.checked)} />
                      {action.label}
                      {action.sensitive && <Badge variant="secondary" className="text-[10px]">sensível</Badge>}
                    </label>
                    {allowed && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={approval} onChange={(event) => toggleApproval(action.key, event.target.checked)} />
                        exigir aprovação
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Critérios para sair da etapa</p>
                <p className="text-xs text-muted-foreground">Sem critérios de saída, a IA nunca avança automaticamente — proteção contra movimentações indevidas.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfig((current) => ({
                  ...current,
                  exitCriteria: [...current.exitCriteria, { field: "", operator: "exists", required: true }],
                }))}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Critério
              </Button>
            </div>
            {config.exitCriteria.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nenhum critério configurado.</p>
            ) : config.exitCriteria.map((criterion, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_130px_1fr_auto]">
                <Input value={criterion.field} onChange={(event) => updateCriterion(index, { field: event.target.value })} placeholder="Ex.: deal.valor ou lead.status" />
                <select className="h-10 rounded-md border bg-background px-2 text-sm" value={criterion.operator} onChange={(event) => updateCriterion(index, { operator: event.target.value as PipelineAICriterion["operator"] })}>
                  <option value="exists">Existe</option>
                  <option value="eq">Igual</option>
                  <option value="neq">Diferente</option>
                  <option value="gt">Maior que</option>
                  <option value="gte">Maior/igual</option>
                  <option value="lt">Menor que</option>
                  <option value="lte">Menor/igual</option>
                  <option value="contains">Contém</option>
                </select>
                <Input
                  disabled={criterion.operator === "exists"}
                  value={criterion.value == null ? "" : String(criterion.value)}
                  onChange={(event) => updateCriterion(index, { value: event.target.value })}
                  placeholder="Valor esperado"
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => setConfig((current) => ({ ...current, exitCriteria: current.exitCriteria.filter((_, i) => i !== index) }))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.nextBestActionEnabled}
              onChange={(event) => setConfig((current) => ({ ...current, nextBestActionEnabled: event.target.checked }))}
            />
            Gerar Próxima Melhor Ação quando ainda não puder avançar
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">Orientações da etapa para a IA</p>
            <Textarea
              value={config.instructions ?? ""}
              onChange={(event) => setConfig((current) => ({ ...current, instructions: event.target.value }))}
              placeholder="Ex.: confirmar decisor, necessidade, prazo e orçamento antes de avançar."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar autonomia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
