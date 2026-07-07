import React from "react";
import { useUXAlignment, type WorkflowStage } from "./UXAlignmentContext";

const stages: Array<{ id: WorkflowStage; label: string }> = [
  { id: "design", label: "Design" },
  { id: "documentacao", label: "Documentação" },
  { id: "producao", label: "Produção" },
  { id: "orcamento", label: "Orçamento" },
  { id: "cliente", label: "Cliente" },
];

export function WorkflowNavigator() {
  const { stage, setStage } = useUXAlignment();

  return (
    <nav className="flex flex-wrap gap-2 rounded-[24px] border border-slate-100 bg-white p-2 shadow-sm">
      {stages.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setStage(item.id)}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-semibold transition",
            stage === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
