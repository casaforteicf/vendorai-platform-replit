import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Loader2, ShieldCheck } from "lucide-react";
import { customFetch, getListPipelineStagesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const BUILTIN_FUNCTIONS = [
  { value: "builtin:vendedor", label: "Vendedor" },
  { value: "builtin:representante_comercial", label: "Representante Comercial" },
  { value: "builtin:financeiro", label: "Financeiro" },
  { value: "builtin:suporte", label: "Suporte" },
  { value: "builtin:entrega", label: "Entrega" },
  { value: "builtin:administrador", label: "Administrador" },
  { value: "builtin:outro", label: "Outro" },
] as const;

type TenantUserFunction = {
  id: string;
  tenantId: string;
  name: string;
  permissions: string[];
  systemKey?: string | null;
};

type AgentOption = {
  agentKey: string;
  nome: string;
  ativo: boolean;
};

type Props = {
  tenantId: string;
  pipeline: string;
  stageId?: string | null;
  value?: string[] | null;
  agentValue?: string | null;
  disabled?: boolean;
  className?: string;
};

export function PipelineStageFunctionAccess({
  tenantId,
  pipeline,
  stageId,
  value,
  agentValue,
  disabled = false,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const initialFunctions = Array.isArray(value) ? value : [];
  const [selected, setSelected] = useState<string[]>(initialFunctions);
  const [savedSelected, setSavedSelected] = useState<string[]>(initialFunctions);
  const [functionsDirty, setFunctionsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(agentValue ?? null);

  useEffect(() => {
    const next = Array.isArray(value) ? value : [];
    setSelected(next);
    setSavedSelected(next);
    setFunctionsDirty(false);
  }, [stageId]);

  useEffect(() => {
    if (functionsDirty) return;
    const next = Array.isArray(value) ? value : [];
    setSelected(next);
    setSavedSelected(next);
  }, [value, functionsDirty]);

  useEffect(() => {
    setSelectedAgent(agentValue ?? null);
  }, [stageId, agentValue]);

  const { data: customFunctions = [] } = useQuery({
    queryKey: ["tenant-user-functions", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () =>
      customFetch<TenantUserFunction[]>(`/api/tenants/${tenantId}/user-functions`, {
        responseType: "json",
      }),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agent-configs", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () =>
      customFetch<AgentOption[]>("/api/agent-configs", {
        responseType: "json",
      }),
  });

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      }),
    [agents],
  );

  const options = useMemo(() => {
    const overrides = new Map(
      customFunctions
        .filter((fn) => Boolean(fn.systemKey))
        .map((fn) => [fn.systemKey as string, fn.name]),
    );
    return [
      ...BUILTIN_FUNCTIONS.map((fn) => ({
        ...fn,
        label: overrides.get(fn.value.replace("builtin:", "")) ?? fn.label,
      })),
      ...customFunctions
        .filter((fn) => !fn.systemKey)
        .map((fn) => ({ value: `custom:${fn.id}`, label: fn.name })),
    ];
  }, [customFunctions]);

  const selectedLabels = useMemo(
    () => options.filter((option) => selected.includes(option.value)).map((option) => option.label),
    [options, selected],
  );

  const buttonLabel =
    selected.length === 0
      ? "Todas as funções"
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selected.length} funções`;

  async function persistAgent(next: string | null) {
    if (!stageId) return;
    const previous = selectedAgent;
    setSelectedAgent(next);
    setSaving(true);
    try {
      const selectedOption = next ? agents.find((agent) => agent.agentKey === next) : null;

      if (selectedOption && !selectedOption.ativo) {
        await customFetch(`/api/agent-configs/${selectedOption.agentKey}/activate`, {
          method: "POST",
          responseType: "json",
        });
      }

      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({ responsavelAgenteKey: next }),
        responseType: "json",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pipeline-stages", tenantId, pipeline] }),
        queryClient.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) }),
        queryClient.invalidateQueries({ queryKey: ["agent-configs", tenantId] }),
      ]);
    } catch (error) {
      setSelectedAgent(previous);
      console.error("Falha ao salvar Agente de IA da etapa", error);
    } finally {
      setSaving(false);
    }
  }

  async function persistFunctions() {
    if (!stageId || !functionsDirty) return;
    const previous = savedSelected;
    setSaving(true);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({ responsaveisFuncoes: selected }),
        responseType: "json",
      });
      setSavedSelected(selected);
      setFunctionsDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pipeline-stages", tenantId, pipeline] }),
        queryClient.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) }),
      ]);
    } catch (error) {
      setSelected(previous);
      setFunctionsDirty(false);
      console.error("Falha ao salvar funções responsáveis da etapa", error);
    } finally {
      setSaving(false);
    }
  }

  function toggle(valueToToggle: string, checked: boolean) {
    const next = checked
      ? [...new Set([...selected, valueToToggle])]
      : selected.filter((item) => item !== valueToToggle);
    setSelected(next);
    setFunctionsDirty(
      next.length !== savedSelected.length || next.some((item) => !savedSelected.includes(item)),
    );
  }

  function clearFunctions() {
    setSelected([]);
    setFunctionsDirty(savedSelected.length > 0);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !stageId || saving}
          title="Funções responsáveis por executar esta etapa"
          className={cn("h-9 w-36 justify-start gap-1.5 px-2 text-xs font-normal", className)}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{buttonLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-80 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain p-3"
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold">Funções responsáveis</p>
          <p className="text-xs text-muted-foreground">
            Selecione uma ou várias funções que podem executar esta etapa. Depois clique em Salvar funções.
          </p>
        </div>

        <div className="mt-3 rounded-md border p-2">
          <div className="mb-2 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-semibold">Agente de IA</p>
              <p className="text-[11px] text-muted-foreground">Executa automaticamente o trabalho operacional desta etapa.</p>
            </div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistAgent(null)}
              className={cn(
                "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                selectedAgent === null && "bg-muted font-medium",
              )}
            >
              <span>Sem agente de IA</span>
              {selectedAgent === null && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
            {sortedAgents.map((agent) => (
              <button
                key={agent.agentKey}
                type="button"
                disabled={saving}
                onClick={() => void persistAgent(agent.agentKey)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                  selectedAgent === agent.agentKey && "bg-muted font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{agent.nome}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {!agent.ativo && (
                    <span className="text-[10px] text-muted-foreground">ativa ao selecionar</span>
                  )}
                  {selectedAgent === agent.agentKey && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
              </button>
            ))}
          </div>
          {sortedAgents.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              Nenhum agente de IA disponível para este tenant.
            </p>
          )}
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold">Funções humanas / supervisão</p>
          <p className="text-[11px] text-muted-foreground">
            Defina quem pode acompanhar ou executar a etapa junto com a IA.
          </p>
        </div>

        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  disabled={saving}
                  onCheckedChange={(next) => toggle(option.value, next === true)}
                />
                <span className="flex-1 truncate">{option.label}</span>
                {checked && <Check className="h-3.5 w-3.5 text-primary" />}
              </label>
            );
          })}
        </div>

        <div className="mt-3 space-y-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            className="w-full justify-center text-xs"
            disabled={saving || !functionsDirty}
            onClick={() => void persistFunctions()}
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
            Salvar funções{selected.length > 0 ? ` (${selected.length})` : ""}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            disabled={saving || selected.length === 0}
            onClick={clearFunctions}
          >
            Liberar para todas as funções
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Você pode marcar várias funções. Sem seleção = etapa sem restrição por função.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
