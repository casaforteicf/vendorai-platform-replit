import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="flex w-full flex-wrap gap-2 rounded-xl border bg-card p-2" data-testid="pipeline-selector">
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
    </div>
  );
}
