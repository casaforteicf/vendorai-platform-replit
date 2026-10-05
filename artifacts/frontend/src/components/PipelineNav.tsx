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
import { PipelineStageFollowupConfig, type ConfiguracaoAcompanhamento } from "@/components/PipelineStageFollowupConfig";
import { PipelineStageAIConfig, type PipelineAIConfig } from "@/components/PipelineStageAIConfig";
import "./pipeline-layout.css";

export type PipelineTab = "comercial" | "execucao" | "suporte" | "aquecimento" | "parceiros" | "scout";

type StageActivityTemplate = {
  id: string;
  titulo: string;
  descricao?: string | null;
  objetivo?: string | null;
  resultadoEsperado?: string | null;
  tipo?: "ligacao" | "whatsapp" | "email" | "visita" | "tarefa" | "reuniao";
  categoria: "obrigatoria" | "sugerida" | "automatica";
  prazoMinutos?: number | null;
  responsavel?: "deal_owner" | "stage_agent" | "unassigned";
  prioridade?: "baixa" | "normal" | "alta" | "urgente";
  bloqueiaAvanco?: boolean;
  condicao?: "sempre" | "sem_resposta_cliente" | "sem_atividade_aberta";
};

type PipelineStageSummary = {
  id: string;
  key?: string;
  label: string;
  ordem: number;
  isSystem: boolean;
  slaMinutos?: number | null;
  responsaveisFuncoes?: string[] | null;
  responsavelAgenteKey?: string | null;
  acompanhamentoConfig?: ConfiguracaoAcompanhamento | null;
  aiConfig?: PipelineAIConfig | null;
  atividadePadraoTitulo?: string | null;
  atividadePadraoDescricao?: string | null;
  atividadePadraoPrazoMinutos?: number | null;
  atividadesPadrao?: StageActivityTemplate[] | null;
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
                  Crie, renomeie, ordene, defina SLA, atividade padrão, responsáveis, acompanhamento inteligente e autonomia da IA por etapa — incluindo ações permitidas, aprovações, critérios, canais e cadência. Esta é a única configuração oficial das etapas da pipeline.
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
  const [editActivities, setEditActivities] = useState<StageActivityTemplate[]>([]);

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
    setEditActivities(
      stage.atividadesPadrao?.length
        ? stage.atividadesPadrao
        : stage.atividadePadraoTitulo
          ? [{
              id: "legacy-default",
              titulo: stage.atividadePadraoTitulo,
              descricao: stage.atividadePadraoDescricao ?? null,
              categoria: "sugerida",
              prazoMinutos: stage.atividadePadraoPrazoMinutos ?? 1440,
              responsavel: "deal_owner",
              prioridade: "normal",
              bloqueiaAvanco: false,
              condicao: "sempre",
              tipo: "tarefa",
            }]
          : [],
    );
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
          atividadesPadrao: editActivities
            .filter((item) => item.titulo.trim())
            .map((item) => ({ ...item, titulo: item.titulo.trim() })),
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
                    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium">Atividades padrão ao entrar na etapa</p>
                          <p className="text-[11px] text-muted-foreground">Obrigatórias podem bloquear o avanço; automáticas ficam destinadas ao Agente IA da etapa.</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditActivities((items) => [...items, {
                            id: crypto.randomUUID(),
                            titulo: "",
                            categoria: "sugerida",
                            prazoMinutos: 1440,
                            responsavel: "deal_owner",
                            prioridade: "normal",
                            bloqueiaAvanco: false,
                            condicao: "sempre",
                            tipo: "tarefa",
                          }])}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Atividade
                        </Button>
                      </div>
                      {editActivities.length === 0 && (
                        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                          Nenhuma atividade configurada. O sistema continuará usando o padrão legado da etapa quando existir.
                        </p>
                      )}
                      {editActivities.map((item, activityIndex) => (
                        <div key={item.id} className="space-y-2 rounded-md border bg-background p-3">
                          <div className="flex gap-2">
                            <Input
                              value={item.titulo}
                              onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, titulo: event.target.value } : row))}
                              placeholder="Ex.: Confirmar recebimento da proposta"
                            />
                            <Button type="button" size="icon" variant="ghost" onClick={() => setEditActivities((items) => items.filter((_, index) => index !== activityIndex))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <select
                              className="h-10 rounded-md border bg-background px-3 text-sm"
                              value={item.categoria}
                              onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, categoria: event.target.value as StageActivityTemplate["categoria"], bloqueiaAvanco: event.target.value === "obrigatoria" ? true : row.bloqueiaAvanco } : row))}
                            >
                              <option value="sugerida">Sugerida</option>
                              <option value="obrigatoria">Obrigatória</option>
                              <option value="automatica">Automática / IA</option>
                            </select>
                            <select
                              className="h-10 rounded-md border bg-background px-3 text-sm"
                              value={item.responsavel ?? "deal_owner"}
                              onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, responsavel: event.target.value as StageActivityTemplate["responsavel"] } : row))}
                            >
                              <option value="deal_owner">Responsável do negócio</option>
                              <option value="stage_agent">Agente IA da etapa</option>
                              <option value="unassigned">Sem responsável</option>
                            </select>
                            <Input
                              value={item.prazoMinutos ?? ""}
                              inputMode="numeric"
                              onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, prazoMinutos: event.target.value ? Number(event.target.value.replace(/\D/g, "")) : null } : row))}
                              placeholder="Prazo (min)"
                            />
                          </div>
                          <Input
                            value={item.objetivo ?? ""}
                            onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, objetivo: event.target.value } : row))}
                            placeholder="Objetivo da atividade"
                          />
                          <Input
                            value={item.resultadoEsperado ?? ""}
                            onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, resultadoEsperado: event.target.value } : row))}
                            placeholder="Resultado esperado"
                          />
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(item.bloqueiaAvanco)}
                                onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, bloqueiaAvanco: event.target.checked } : row))}
                              />
                              Bloquear avanço enquanto pendente
                            </label>
                            <select
                              className="h-8 rounded-md border bg-background px-2"
                              value={item.condicao ?? "sempre"}
                              onChange={(event) => setEditActivities((items) => items.map((row, index) => index === activityIndex ? { ...row, condicao: event.target.value as StageActivityTemplate["condicao"] } : row))}
                            >
                              <option value="sempre">Sempre</option>
                              <option value="sem_atividade_aberta">Se não houver atividade aberta</option>
                              <option value="sem_resposta_cliente">Se cliente ainda não respondeu</option>
                            </select>
                          </div>
                        </div>
                      ))}
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
                        {stage.atividadesPadrao?.length
                          ? `${stage.atividadesPadrao.length} atividade(s) padrão configurada(s)`
                          : stage.atividadePadraoTitulo
                            ? `Atividade padrão: ${stage.atividadePadraoTitulo}${stage.atividadePadraoPrazoMinutos ? ` · prazo ${stage.atividadePadraoPrazoMinutos} min` : ""}`
                            : "Atividades padrão: usar sugestão do sistema / definir manualmente"}
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
                      <div className="mt-2">
                        <PipelineStageFollowupConfig
                          tenantId={tenantId}
                          pipeline={pipeline}
                          stageId={stage.id}
                          stageLabel={stage.label}
                          value={stage.acompanhamentoConfig ?? null}
                        />
                      </div>
                      <div className="mt-2">
                        <PipelineStageAIConfig
                          tenantId={tenantId}
                          stageId={stage.id}
                          stageLabel={stage.label}
                          value={stage.aiConfig ?? null}
                          onSaved={invalidate}
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
