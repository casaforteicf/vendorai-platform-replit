import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ActiveProcess = {
  pipeline: string;
  etapa: string;
  label: string;
  id: string;
  codigo?: string;
};

export type ActiveWorkCard = {
  id: string;
  leadId?: string | null;
  dealId?: string | null;
  dealTitle?: string | null;
  codigo?: string | null;
  pipeline: string;
  etapa: string;
};

type ProcessGroup = {
  key: string;
  dealId?: string;
  dealTitle?: string;
  processes: ActiveProcess[];
};

const PROCESS_LABELS: Record<string, string> = {
  comercial: "COMERCIAL",
  execucao: "EXECUÇÃO",
  suporte: "SUPORTE",
  aquecimento: "AQUECIMENTO",
  parceiros: "PARCEIROS",
};

const PROCESS_PRIORITY: Record<string, number> = {
  suporte: 0,
  execucao: 1,
  comercial: 2,
  aquecimento: 3,
  parceiros: 4,
};

const DEAL_PIPELINES = new Set(["comercial", "aquecimento", "parceiros"]);

function pipelineLabel(pipeline: string) {
  return PROCESS_LABELS[pipeline] || pipeline.toUpperCase();
}

function buildGroups(processes: ActiveProcess[], workCards: ActiveWorkCard[]): ProcessGroup[] {
  const workCardById = new Map(workCards.map((card) => [card.id, card]));
  const groups = new Map<string, ProcessGroup>();

  for (const process of processes) {
    const workCard = workCardById.get(process.id);
    const dealId = workCard?.dealId || (DEAL_PIPELINES.has(process.pipeline) ? process.id : undefined);
    const key = dealId ? `deal:${dealId}` : `process:${process.pipeline}:${process.id}`;
    const current = groups.get(key);

    if (current) {
      current.processes.push(process);
      if (!current.dealTitle && workCard?.dealTitle) current.dealTitle = workCard.dealTitle;
      continue;
    }

    groups.set(key, {
      key,
      dealId,
      dealTitle: workCard?.dealTitle || undefined,
      processes: [process],
    });
  }

  return [...groups.values()].sort((a, b) => {
    const pa = Math.min(...a.processes.map((p) => PROCESS_PRIORITY[p.pipeline] ?? 99));
    const pb = Math.min(...b.processes.map((p) => PROCESS_PRIORITY[p.pipeline] ?? 99));
    return pa - pb;
  });
}

function primaryProcess(group: ProcessGroup) {
  return [...group.processes].sort(
    (a, b) => (PROCESS_PRIORITY[a.pipeline] ?? 99) - (PROCESS_PRIORITY[b.pipeline] ?? 99),
  )[0]!;
}

function GroupTooltip({ group }: { group: ProcessGroup }) {
  return (
    <div className="max-w-[320px] space-y-1">
      <p className="font-semibold">{group.dealTitle || "Processo ativo"}</p>
      {group.processes.map((process) => (
        <p key={`${process.pipeline}-${process.id}`} className="text-xs">
          {pipelineLabel(process.pipeline)} · {process.label}
          {process.codigo ? ` · ${process.codigo}` : ""}
        </p>
      ))}
      {group.dealId && <p className="pt-1 text-[11px] opacity-80">Clique para abrir este negócio.</p>}
    </div>
  );
}

function ProcessGroupBadge({
  group,
  onOpenDeal,
}: {
  group: ProcessGroup;
  onOpenDeal?: (dealId: string) => void;
}) {
  const primary = primaryProcess(group);
  const content = (
    <Badge variant="outline" className="h-auto max-w-[290px] gap-1 py-1 text-[10px] font-medium">
      {group.dealTitle && (
        <>
          <span className="max-w-[125px] truncate font-semibold">{group.dealTitle}</span>
          <span className="text-muted-foreground">·</span>
        </>
      )}
      <span className="font-semibold">{pipelineLabel(primary.pipeline)}</span>
      <span className="text-muted-foreground">·</span>
      <span className="max-w-[120px] truncate">{primary.label}</span>
      {group.processes.length > 1 && (
        <span className="ml-0.5 whitespace-nowrap text-muted-foreground">+{group.processes.length - 1} proc.</span>
      )}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {group.dealId && onOpenDeal ? (
          <button
            type="button"
            className="max-w-full text-left"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDeal(group.dealId!);
            }}
          >
            {content}
          </button>
        ) : (
          <span className="inline-flex max-w-full">{content}</span>
        )}
      </TooltipTrigger>
      <TooltipContent><GroupTooltip group={group} /></TooltipContent>
    </Tooltip>
  );
}

export function ActiveLeadProcesses({
  processes,
  workCards,
  onOpenDeal,
}: {
  processes: ActiveProcess[] | undefined;
  workCards: ActiveWorkCard[];
  onOpenDeal?: (dealId: string) => void;
}) {
  if (!processes?.length) return <span className="text-xs text-muted-foreground">—</span>;

  const groups = buildGroups(processes, workCards);
  const visible = groups.slice(0, 2);
  const hidden = groups.slice(2);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-wrap gap-1">
        {visible.map((group) => (
          <ProcessGroupBadge key={group.key} group={group} onOpenDeal={onOpenDeal} />
        ))}
        {hidden.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="secondary" className="text-[10px]">+{hidden.length} ativos</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[320px] space-y-1">
              <p className="font-semibold">Outros negócios/processos ativos</p>
              {hidden.map((group) => {
                const primary = primaryProcess(group);
                return (
                  <p key={group.key} className="text-xs">
                    {group.dealTitle ? `${group.dealTitle} · ` : ""}
                    {pipelineLabel(primary.pipeline)} · {primary.label}
                  </p>
                );
              })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
