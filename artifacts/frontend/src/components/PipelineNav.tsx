import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Settings2, ShieldCheck } from "lucide-react";
import { useListPipelineStages } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PipelineStageFunctionAccess } from "@/components/PipelineStageFunctionAccess";

export type PipelineTab = "comercial" | "execucao" | "suporte" | "aquecimento" | "parceiros" | "scout";

const TABS: Array<{ key: PipelineTab; label: string; href: string }> = [
  { key: "comercial", label: "Comercial", href: "/deals" },
  { key: "execucao", label: "Execução / Pedidos", href: "/pipeline-operacional/execucao" },
  { key: "suporte", label: "Suporte / Assistência", href: "/pipeline-operacional/suporte" },
  { key: "aquecimento", label: "Aquecimento", href: "/pipeline-relacionamento/aquecimento" },
  { key: "parceiros", label: "Parceiros", href: "/pipeline-relacionamento/parceiros" },
  { key: "scout", label: "Scout", href: "/scout/pipeline" },
];

export const PIPELINE_COLUMN_CLASS = "flex w-80 shrink-0 flex-col rounded-xl border bg-muted/20 min-h-0";
export const PIPELINE_COLUMN_HEADER_CLASS = "flex min-h-11 items-center justify-between border-b px-3 py-2.5";
export const PIPELINE_CARD_CLASS = "cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition hover:shadow-md";

export function PipelineNav({ active }: { active: PipelineTab }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin";
  const [responsibilityOpen, setResponsibilityOpen] = useState(false);

  const { data: stages = [] } = useListPipelineStages(tenantId);

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [stages],
  );

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border bg-card p-2" data-testid="pipeline-selector">
      {TABS.map((tab) => (
        <Button
          key={tab.key}
          type="button"
          size="sm"
          variant={active === tab.key ? "default" : "ghost"}
          onClick={() => navigate(tab.href)}
          data-testid={`pipeline-tab-${tab.key}`}
        >
          {tab.label}
        </Button>
      ))}

      {isAdmin && tenantId && (
        <Dialog open={responsibilityOpen} onOpenChange={setResponsibilityOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="ml-auto gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              Responsáveis por etapa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Responsáveis pelas etapas da pipeline
              </DialogTitle>
              <DialogDescription>
                Cadastre a função responsável pela execução de cada etapa. A configuração é por função, nunca por pessoa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              {orderedStages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Carregando etapas...</p>
              ) : (
                orderedStages.map((stage) => {
                  const responsaveis = ((stage as any).responsaveisFuncoes ?? []) as string[];
                  return (
                    <div
                      key={stage.id}
                      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{stage.label}</p>
                          {stage.isSystem && <Badge variant="secondary" className="text-[10px]">Sistema</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {responsaveis.length === 0
                            ? "Sem restrição: qualquer função com acesso à pipeline pode atuar."
                            : `${responsaveis.length} função(ões) responsável(is).`}
                        </p>
                      </div>
                      <PipelineStageFunctionAccess
                        tenantId={tenantId}
                        stageId={stage.id}
                        value={responsaveis}
                        className="w-full sm:w-48"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
