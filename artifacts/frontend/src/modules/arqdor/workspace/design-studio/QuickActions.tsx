import React from "react";

export type QuickAction = {
  id: string;
  label: string;
  prompt: string;
};

const defaultActions: QuickAction[] = [
  {
    id: "improve",
    label: "Melhorar imagem",
    prompt: "Melhore a qualidade da imagem mantendo o conceito aprovado.",
  },
  {
    id: "materials",
    label: "Trocar materiais",
    prompt: "Sugira alternativas de materiais para este ambiente.",
  },
  {
    id: "lighting",
    label: "Ajustar iluminação",
    prompt: "Crie uma versão com iluminação mais aconchegante.",
  },
  {
    id: "decor",
    label: "Adicionar decoração",
    prompt: "Adicione decoração elegante sem poluir o ambiente.",
  },
];

type QuickActionsProps = {
  actions?: QuickAction[];
  onSelect?: (prompt: string) => void;
};

export function QuickActions({ actions = defaultActions, onSelect }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onSelect?.(action.prompt)}
          className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-left text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
