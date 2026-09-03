import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { customFetch, getListPipelineStagesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const BUILTIN_FUNCTIONS = [
  { value: "builtin:vendedor", label: "Vendedor" },
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
};

type Props = {
  tenantId: string;
  pipeline: string;
  stageId?: string | null;
  value?: string[] | null;
  disabled?: boolean;
  className?: string;
};

export function PipelineStageFunctionAccess({
  tenantId,
  pipeline,
  stageId,
  value,
  disabled = false,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>(Array.isArray(value) ? value : []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(Array.isArray(value) ? value : []);
  }, [stageId, value]);

  const { data: customFunctions = [] } = useQuery({
    queryKey: ["tenant-user-functions", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () =>
      customFetch<TenantUserFunction[]>(`/api/tenants/${tenantId}/user-functions`, {
        responseType: "json",
      }),
  });

  const options = useMemo(
    () => [
      ...BUILTIN_FUNCTIONS,
      ...customFunctions.map((fn) => ({ value: `custom:${fn.id}`, label: fn.name })),
    ],
    [customFunctions],
  );

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

  async function persist(next: string[]) {
    if (!stageId) return;
    const previous = selected;
    setSelected(next);
    setSaving(true);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({ responsaveisFuncoes: next }),
        responseType: "json",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pipeline-stages", tenantId, pipeline] }),
        queryClient.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) }),
      ]);
    } catch (error) {
      setSelected(previous);
      console.error("Falha ao salvar funções responsáveis da etapa", error);
    } finally {
      setSaving(false);
    }
  }

  function toggle(valueToToggle: string, checked: boolean) {
    const next = checked
      ? [...new Set([...selected, valueToToggle])]
      : selected.filter((item) => item !== valueToToggle);
    void persist(next);
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
      <PopoverContent align="end" className="w-80 p-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Funções responsáveis</p>
          <p className="text-xs text-muted-foreground">
            Defina quais funções podem executar esta etapa. Não é necessário escolher uma pessoa.
          </p>
        </div>

        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
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

        <div className="mt-3 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            disabled={saving || selected.length === 0}
            onClick={() => void persist([])}
          >
            Liberar para todas as funções
          </Button>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            Sem seleção = etapa sem restrição por função.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
