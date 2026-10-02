import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { customFetch, getListPipelineStagesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PipelineStageFunctionAccess } from "@/components/PipelineStageFunctionAccess";
import "./pipeline-layout.css";

export type PipelineTab = "comercial" | "execucao" | "suporte" | "aquecimento" | "parceiros" | "scout";

type PipelineStageSummary = {
  id: string;
  key?: string;
  label: string;
  ordem: number;
  isSystem: boolean;
  slaMinutos?: number | null;
  responsaveisFuncoes?: string[] | null;
  responsavelAgenteKey?: string | null;
  atividadePadraoTitulo?: string | null;
  atividadePadraoDescricao?: string | null;
  atividadePadraoPrazoMinutos?: number | null;
};

const TABS: Array<{ key: PipelineTab; label: string; href: string }> = [
  { key: "comercial", label: "Comercial", href: "/deals" },
  { key: "execucao", label: "Execução / Pedidos", href: "/pipeline-operacional/execucao" },
  { key: "suporte", label: "Suporte / Assistência", href: "/pipeline-operacional/suporte" },
  { key: "aquecimento", label: "Aquecimento", href: "/pipeline-relacionamento/aquecimento" },
  { key: "parceiros", label: "Parceiros", href: "/pipeline-relacionamento/parceiros" },
  { key: "scout", label: "Scout", href: "/scout/pipeline" },
];

export const PIPELINE_COLUMN_CLASS = "pipeline-column flex w-80 shrink-0 flex-col rounded-xl border bg-muted/20 min-h-0";
export const PIPELINE_COLUMN_HEADER_CLASS = "pipeline-column-header flex min-h-11 items-center justify-between border-b px-3 py-2.5";
export const PIPELINE_CARD_CLASS = "pipeline-card cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition hover:shadow-md";

export function PipelineNav({ active }: { active: PipelineTab }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const isAdmin = user?.platformRole === "super_admin"
    || user?.platformRole === "tenant_admin"
    || user?.userFunction === "administrador";
  const [stagesOpen, setStagesOpen] = useState(false);

  const { data: stages = [] } = useQuery<PipelineStageSummary[]>({
    queryKey: ["pipeline-stages", tenantId, active],
    enabled: Boolean(tenantId),
    queryFn: () => customFetch<PipelineStageSummary[]>(
      `/api/tenants/${tenantId}/pipeline-stages?pipeline=${encodeURIComponent(active)}`,
      { responseType: "json" },
    ),
  });

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [stages],
  );

  return (
    <div className="pipeline-nav" data-testid="pipeline-selector">
      <div className="pipeline-nav-tabs" role="navigation" aria-label="Áreas da pipeline">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="sm"
            variant={active === tab.key ? "default" : "ghost"}
            className="pipeline-nav-tab"
            onClick={() => navigate(tab.href)}
            data-testid={`pipeline-tab-${tab.key}`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isAdmin && tenantId && (
        <div className="pipeline-nav-admin flex items-center gap-2">
          <Dialog open={stagesOpen} onOpenChange={setStagesOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="gap-1.5">
                <Settings2 className="h-4 w-4" />
                Configurar etapas
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Etapas — {TABS.find((tab) => tab.key === active)?.label ?? "Pipeline"}
                </DialogTitle>
                <DialogDescription>
                  Crie, renomeie, ordene, defina SLA, atividade padrão e escolha os responsáveis de cada etapa — incluindo Agentes IA. Esta é a única configuração oficial das etapas da pipeline.
                </DialogDescription>
              </DialogHeader>
              <PipelineStageManager
                tenantId={tenantId}
                pipeline={active}
                stages={orderedStages}
              />
            </DialogContent>
          </Dialog>

        </div>
      )}
    </div>
  );
}

function PipelineStageManager({
  tenantId,
  pipeline,
  stages,
}: {
  tenantId: string;
  pipeline: PipelineTab;
  stages: PipelineStageSummary[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [newSla, setNewSla] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSla, setEditSla] = useState("");
  const [editActivityTitle, setEditActivityTitle] = useState("");
  const [editActivityDescription, setEditActivityDescription] = useState("");
  const [editActivityDueMinutes, setEditActivityDueMinutes] = useState("");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", tenantId, pipeline] }),
      queryClient.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) }),
    ]);
  };

  async function createStage() {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    try {
      await customFetch(
        `/api/tenants/${tenantId}/pipeline-stages?pipeline=${encodeURIComponent(pipeline)}`,
        {
          method: "POST",
          body: JSON.stringify({
            label,
            slaMinutos: newSla.trim() ? Number(newSla) : null,
          }),
          responseType: "json",
        },
      );
      setNewLabel("");
      setNewSla("");
      await invalidate();
      toast({ title: "Etapa criada." });
    } catch (error) {
      toast({
        title: "Não foi possível criar a etapa",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(stage: PipelineStageSummary) {
    setEditingId(stage.id);
    setEditLabel(stage.label);
    setEditSla(stage.slaMinutos == null ? "" : String(stage.slaMinutos));
    setEditActivityTitle(stage.atividadePadraoTitulo ?? "");
    setEditActivityDescription(stage.atividadePadraoDescricao ?? "");
    setEditActivityDueMinutes(stage.atividadePadraoPrazoMinutos == null ? "" : String(stage.atividadePadraoPrazoMinutos));
  }

  async function saveEdit(stage: PipelineStageSummary) {
    const label = editLabel.trim();
    if (!label) return;
    setSaving(stage.id);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label,
          slaMinutos: editSla.trim() ? Number(editSla) : null,
          atividadePadraoTitulo: editActivityTitle.trim() || null,
          atividadePadraoDescricao: editActivityDescription.trim() || null,
          atividadePadraoPrazoMinutos: editActivityDueMinutes.trim() ? Number(editActivityDueMinutes) : null,
        }),
        responseType: "json",
      });
      setEditingId(null);
      await invalidate();
      toast({ title: "Etapa atualizada." });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar a etapa",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  async function move(stage: PipelineStageSummary, direction: -1 | 1) {
    const index = stages.findIndex((item) => item.id === stage.id);
    const other = stages[index + direction];
    if (!other) return;

    setSaving(stage.id);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stage.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ordem: other.ordem }),
        responseType: "json",
      });
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${other.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ordem: stage.ordem }),
        responseType: "json",
      });
      await invalidate();
    } catch (error) {
      toast({
        title: "Não foi possível reordenar",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  async function remove(stage: PipelineStageSummary) {
    if (stage.isSystem) {
      toast({
        title: "Etapa padrão do sistema",
        description: "Ela pode ser renomeada, reordenada e configurada, mas não excluída.",
      });
      return;
    }
    if (!window.confirm(`Excluir a etapa “${stage.label}”?`)) return;

    setSaving(stage.id);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stage.id}`, {
        method: "DELETE",
        responseType: "json",
      });
      await invalidate();
      toast({ title: "Etapa excluída." });
    } catch (error) {
      toast({
        title: "Não foi possível excluir a etapa",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Nome da nova etapa"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createStage();
              }
            }}
          />
          <Input
            value={newSla}
            onChange={(event) => setNewSla(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="SLA em minutos"
          />
          <Button type="button" onClick={() => void createStage()} disabled={creating || !newLabel.trim()}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          O SLA é opcional. As novas etapas ficam somente nesta pipeline e neste tenant.
        </p>
      </div>

      <div className="space-y-2">
        {stages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma etapa encontrada.</p>
        ) : (
          stages.map((stage, index) => {
            const isEditing = editingId === stage.id;
            const isSaving = saving === stage.id;
            return (
              <div key={stage.id} className="rounded-lg border p-3">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                      <Input
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        autoFocus
                      />
                      <Input
                        value={editSla}
                        onChange={(event) => setEditSla(event.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        placeholder="SLA em minutos"
                      />
                    </div>
                    <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
                      <p className="text-xs font-medium">Atividade padrão ao entrar na etapa</p>
                      <Input
                        value={editActivityTitle}
                        onChange={(event) => setEditActivityTitle(event.target.value)}
                        placeholder="Ex.: Preparar solução e proposta"
                      />
                      <Input
                        value={editActivityDescription}
                        onChange={(event) => setEditActivityDescription(event.target.value)}
                        placeholder="Orientações da atividade (opcional)"
                      />
                      <Input
                        value={editActivityDueMinutes}
                        onChange={(event) => setEditActivityDueMinutes(event.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        placeholder="Prazo da atividade em minutos (opcional)"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Se o título ficar vazio, a Central usa o padrão do sistema e permite ajuste manual na passagem.
                      </p>
                    </div>
                    <DialogFooter className="gap-2 sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                      <Button type="button" onClick={() => void saveEdit(stage)} disabled={isSaving || !editLabel.trim()}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                        <p className="truncate text-sm font-medium">{stage.label}</p>
                        {stage.isSystem && <Badge variant="secondary" className="text-[10px]">Sistema</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stage.slaMinutos ? `SLA: ${stage.slaMinutos} min` : "Sem SLA definido"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stage.atividadePadraoTitulo
                          ? `Atividade padrão: ${stage.atividadePadraoTitulo}${stage.atividadePadraoPrazoMinutos ? ` · prazo ${stage.atividadePadraoPrazoMinutos} min` : ""}`
                          : "Atividade padrão: usar sugestão do sistema / definir manualmente"}
                      </p>
                      <div className="mt-2">
                        <PipelineStageFunctionAccess
                          tenantId={tenantId}
                          pipeline={pipeline}
                          stageId={stage.id}
                          value={stage.responsaveisFuncoes ?? []}
                          agentValue={stage.responsavelAgenteKey ?? null}
                          className="w-full sm:w-64"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Mover para cima"
                        disabled={index === 0 || Boolean(saving)}
                        onClick={() => void move(stage, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Mover para baixo"
                        disabled={index === stages.length - 1 || Boolean(saving)}
                        onClick={() => void move(stage, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Editar etapa"
                        disabled={Boolean(saving)}
                        onClick={() => beginEdit(stage)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title={stage.isSystem ? "Etapa padrão não pode ser excluída" : "Excluir etapa"}
                        disabled={Boolean(saving)}
                        onClick={() => void remove(stage)}
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}